import { Injectable } from '@nestjs/common';
import type { LedgerEntryDto, Paginated, SavingsTransferDirection, WalletDto } from '@insidelife/shared';
import { formatNaira } from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import { LedgerTransactionEntity } from '../ledger/entities/ledger-transaction.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { CharacterSession } from '../simulation/character-session.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { TransferLimitsService } from './transfer-limits.service.js';

/** The Bank app: balances, limits, statement and cash ↔ savings moves. */
@Injectable()
export class WalletService {
  constructor(
    private readonly session: CharacterSession,
    private readonly ledger: LedgerService,
    private readonly limits: TransferLimitsService,
  ) {}

  async wallet(ctx: SimulationContext): Promise<WalletDto> {
    const [balances, limits] = await Promise.all([this.ledger.balances(ctx.manager, ctx.character.id), this.limits.limitsFor(ctx)]);
    return {
      balance: balances.cash,
      savings: balances.savings,
      pension: balances.pension,
      usd: balances.usd,
      transferTier: limits.tier,
      dailyLimit: limits.dailyLimit,
      sentToday: limits.sentToday,
      earnedTotal: ctx.character.earnedTotal,
      purchasedTotal: ctx.character.purchasedTotal,
    };
  }

  /** Settle first (so pending salary/bills appear), then read the committed cash-account statement. */
  async statement(userId: string, cursor: string | null, limit: number): Promise<Paginated<LedgerEntryDto>> {
    const characterId = await this.session.run({ userId }, async (ctx) => ctx.character.id);
    return this.ledger.statement(characterId, cursor, limit);
  }

  /** Cash → savings (`deposit`) or savings → cash (`withdraw`). The ledger refuses overdrafts on either side. */
  async moveSavings(ctx: SimulationContext, direction: SavingsTransferDirection, amount: number, clientKey: string | undefined): Promise<WalletDto> {
    const key = `savings:${direction}:${clientKey ?? `${ctx.time}:${amount}`}`;
    if (direction === 'deposit') {
      await ctx.wallet.move('cash', 'savings', amount, 'investment', `Moved ${formatNaira(amount)} to savings`, key);
    } else {
      const { savings } = await this.ledger.balances(ctx.manager, ctx.character.id);
      const replay = await ctx.manager.exists(LedgerTransactionEntity, { where: { idempotencyKey: `${ctx.character.id}:${key}` } });
      if (!replay && savings < amount) {
        throw new GameRuleException('INSUFFICIENT_SAVINGS', `Your savings balance is ${formatNaira(savings)}`);
      }
      await ctx.wallet.move('savings', 'cash', amount, 'investment', `Withdrew ${formatNaira(amount)} from savings`, key);
    }
    ctx.invalidate('investments');
    return this.wallet(ctx);
  }
}
