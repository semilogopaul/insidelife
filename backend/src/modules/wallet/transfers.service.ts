import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { formatNaira, type TransferRequest, type TransferResultDto } from '@insidelife/shared';
import {
  ConflictException,
  GameRuleException,
  InsufficientFundsException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import { LedgerEntryEntity } from '../ledger/entities/ledger-entry.entity.js';
import { LedgerTransactionEntity, type LedgerMetadata } from '../ledger/entities/ledger-transaction.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import { SocialGuard } from '../social/social-guard.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { TransferLimitsService } from './transfer-limits.service.js';
import { checkTransfer, sanitizeNote } from './transfer-rules.js';

/** Ledger metadata stored on every transfer posting (lets a retried request return the original receipt). */
interface TransferReceipt {
  readonly amount: number;
  readonly fee: number;
  readonly stampDuty: number;
  readonly recipientId: string;
  readonly recipientHandle: string;
  readonly recipientName: string;
}

const isReceipt = (metadata: LedgerMetadata): metadata is LedgerMetadata & TransferReceipt =>
  typeof metadata.amount === 'number' &&
  typeof metadata.fee === 'number' &&
  typeof metadata.stampDuty === 'number' &&
  typeof metadata.recipientId === 'string' &&
  typeof metadata.recipientHandle === 'string' &&
  typeof metadata.recipientName === 'string';

/**
 * Player-to-player transfers with Nigerian banking rules: fees + stamp duty to `system:fees`, tiered daily limits,
 * min/max per transfer, blocks (social `SocialGuard`). Runs in the sender's `CharacterSession`; one balanced posting
 * (sender −(amount+charges), recipient +amount, fees +charges) keyed `transfer:<senderId>:<clientKey>`, so a retried
 * request returns the original receipt instead of sending twice.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly session: CharacterSession,
    private readonly directory: CharacterDirectory,
    private readonly ledger: LedgerService,
    private readonly limits: TransferLimitsService,
    private readonly social: SocialGuard,
    private readonly notifications: NotificationsService,
    private readonly bus: RealtimeBus,
  ) {}

  async send(userId: string, request: TransferRequest): Promise<TransferResultDto> {
    const recipient = await this.directory.findByHandle(request.toHandle);
    if (!recipient || recipient.hiddenAt) throw new ResourceNotFoundException('Player');

    return this.session.run(
      { userId },
      async (ctx) => {
        const sender = ctx.character;
        const idempotencyKey = `transfer:${sender.id}:${request.idempotencyKey}`;
        const previous = await ctx.manager.findOne(LedgerTransactionEntity, { where: { idempotencyKey } });
        if (previous) return this.replay(ctx, previous, request, recipient);

        if (recipient.id === sender.id || recipient.userId === sender.userId) {
          throw new GameRuleException('SELF_TRANSFER', 'You can’t send money to yourself. Use savings instead.');
        }
        const current = await ctx.manager.findOne(CharacterEntity, { where: { id: recipient.id } });
        if (!current?.alive) throw new GameRuleException('RECIPIENT_DECEASED', `@${recipient.handle} has passed on`);
        // Blocks are symmetric and the 403 never reveals who blocked whom.
        await this.social.assertNotBlocked(sender.id, recipient.id, ctx.manager);

        const limits = await this.limits.limitsFor(ctx);
        const check = checkTransfer({ amount: request.amount, cash: ctx.wallet.cash, sentToday: limits.sentToday, dailyLimit: limits.dailyLimit });
        if (!check.ok) {
          if (check.code === 'INSUFFICIENT_FUNDS') throw new InsufficientFundsException(request.amount);
          throw new GameRuleException(check.code, check.message);
        }
        const { quote } = check;
        const note = sanitizeNote(request.note);
        const recipientName = `${current.firstName} ${current.lastName}`;
        const recipientAccounts = await this.ledger.characterAccounts(ctx.manager, recipient.id);
        const receipt: TransferReceipt = {
          amount: quote.amount,
          fee: quote.fee,
          stampDuty: quote.stampDuty,
          recipientId: recipient.id,
          recipientHandle: current.handle,
          recipientName,
        };

        const posting = await this.ledger.post(ctx.manager, {
          kind: 'transfer',
          idempotencyKey,
          memo: `Transfer @${sender.handle} → @${current.handle}${note ? `: ${note}` : ''}`,
          gameMinute: ctx.time,
          characterId: sender.id,
          counterpartyCharacterId: recipient.id,
          metadata: { ...receipt, note },
          legs: [
            { accountId: ctx.wallet.accounts.cash, amount: -quote.totalDebit },
            { accountId: recipientAccounts.cash, amount: quote.amount },
            { accountId: this.ledger.systemAccount('fees'), amount: quote.total },
          ],
        });
        ctx.wallet.sync(posting.balances);

        // Gifts from other players are unearned for the recipient's self-made rich list (atomic, same transaction).
        await ctx.manager.getRepository(CharacterEntity).increment({ id: recipient.id }, 'unearnedTotal', quote.amount);
        await this.notifyRecipient(ctx, recipient.id, sender, quote.amount, note);

        return {
          transferId: posting.transactionId,
          amount: quote.amount,
          fee: quote.fee,
          stampDuty: quote.stampDuty,
          balanceAfter: ctx.wallet.cash,
          recipient: { handle: current.handle, name: recipientName },
        };
      },
      { touch: true },
    );
  }

  private async notifyRecipient(ctx: SimulationContext, recipientId: string, sender: CharacterEntity, amount: number, note: string | null): Promise<void> {
    const created = await this.notifications.create(ctx.manager, recipientId, [
      {
        kind: 'money-received',
        title: `Alert! ${formatNaira(amount)} from @${sender.handle}`,
        body: note ? `${sender.firstName}: “${note}”` : `${sender.firstName} ${sender.lastName} sent you money.`,
        tone: 'good',
        amount,
        gameMinute: ctx.time,
      },
    ]);
    ctx.afterCommit(() => {
      this.notifications.push(recipientId, created);
      this.bus.toCharacter(recipientId, 'character:invalidate', { reason: 'transfer-received' });
    });
  }

  /** Same key again: return the original receipt, or refuse if the key is being reused for a different transfer. */
  private async replay(
    ctx: SimulationContext,
    previous: LedgerTransactionEntity,
    request: TransferRequest,
    recipient: CharacterEntity,
  ): Promise<TransferResultDto> {
    const receipt = previous.metadata;
    if (previous.kind !== 'transfer' || !isReceipt(receipt) || receipt.recipientId !== recipient.id || receipt.amount !== request.amount) {
      throw new ConflictException('IDEMPOTENCY_KEY_REUSED', 'That transfer key was already used for a different transfer');
    }
    return {
      transferId: previous.id,
      amount: receipt.amount,
      fee: receipt.fee,
      stampDuty: receipt.stampDuty,
      balanceAfter: await this.balanceAfter(ctx.manager, previous.id, ctx.wallet.accounts.cash, ctx.wallet.cash),
      recipient: { handle: receipt.recipientHandle, name: receipt.recipientName },
    };
  }

  private async balanceAfter(manager: EntityManager, transactionId: string, accountId: string, fallback: number): Promise<number> {
    const entry = await manager.findOne(LedgerEntryEntity, { where: { transactionId, accountId } });
    return entry?.balanceAfter ?? fallback;
  }
}
