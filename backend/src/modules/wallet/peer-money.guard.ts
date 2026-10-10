import { Injectable } from '@nestjs/common';
import {
  DAILY_PEER_RECEIVE_LIMIT,
  PURCHASE_HOLD_HOURS,
  checkPeerMoney,
  debtOutstandingMessage,
  dailyTransferLimit,
  formatNaira,
  peerSendable,
  transferTierFor,
  type TransferTier,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { UsersService } from '../users/users.service.js';
import { WorldService } from '../world/world.service.js';
import { characterAgeDays } from './transfer-rules.js';

export interface PeerMoneyLimits {
  readonly tier: TransferTier;
  /** Daily send limit; null = none (Tier 3). */
  readonly dailyLimit: number | null;
  readonly sentToday: number;
  /** How much of your money may still go to players (starting money never can). */
  readonly sendable: number;
  readonly receivedToday: number;
  readonly receiveLimit: number;
  readonly characterAgeDays: number;
  readonly emailVerified: boolean;
  /** Bought coins on hold (left out of `sendable`) and when the last of them is freed; null when none. */
  readonly purchaseHold: { readonly amount: number; readonly releasesAt: Date } | null;
  /** Owed from a refunded top-up: nothing goes to players until it's repaid. */
  readonly debt: number;
}

export interface PeerRecipient {
  readonly id: string;
  readonly handle: string;
}

/** UTC calendar day, `YYYY-MM-DD`: player-to-player limits reset at 00:00 UTC (01:00 in Lagos). */
export function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * The one gate for money moving between players (bank transfers, owambe and club sprays, anything new). Checks the
 * sender's tier limit and sendable budget and the recipient's daily receive cap, then records the amount on both
 * sides in the caller's transaction, so a failed posting rolls the counters back too. Call `authorize` before posting
 * the ledger transfer, inside the sender's `CharacterSession`.
 */
@Injectable()
export class PeerMoneyGuard {
  constructor(
    private readonly users: UsersService,
    private readonly world: WorldService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Bought coins credited in the last 48 hours (net of claw-backs and debt repayments: every posting between this
   * character's cash and `system:topup`), and when the newest of them is released.
   */
  async heldPurchases(ctx: SimulationContext, now: Date = new Date()): Promise<{ readonly amount: number; readonly releasesAt: Date } | null> {
    const since = new Date(now.getTime() - PURCHASE_HOLD_HOURS * 3_600_000);
    const rows: Array<{ net: string | null; latest: Date | null }> = await ctx.manager.query(
      `SELECT SUM(mine.amount) AS net, MAX(t.created_at) FILTER (WHERE mine.amount > 0) AS latest
         FROM ledger_entries topup
         JOIN ledger_entries mine ON mine.transaction_id = topup.transaction_id AND mine.account_id = $2
         JOIN ledger_transactions t ON t.id = topup.transaction_id
        WHERE topup.account_id = $1 AND t.created_at >= $3`,
      [this.ledger.systemAccount('topup'), ctx.wallet.accounts.cash, since],
    );
    const net = Number(rows[0]?.net ?? 0);
    const latest = rows[0]?.latest ?? null;
    if (net <= 0 || !latest) return null;
    return { amount: net, releasesAt: new Date(new Date(latest).getTime() + PURCHASE_HOLD_HOURS * 3_600_000) };
  }

  async limitsFor(ctx: SimulationContext, now: Date = new Date()): Promise<PeerMoneyLimits> {
    const character = ctx.character;
    const user = await this.users.findById(character.userId);
    const emailVerified = Boolean(user?.emailVerifiedAt);
    const ageDays = characterAgeDays(this.world.now(character.createdAt.getTime()), ctx.time);
    const tier = transferTierFor(ageDays, emailVerified);
    const rows: Array<{ sent_today: string | null; received_today: string | null; sent_total: string | null }> = await ctx.manager.query(
      `SELECT SUM(sent) FILTER (WHERE day = $2) AS sent_today, SUM(received) FILTER (WHERE day = $2) AS received_today, SUM(sent) AS sent_total
         FROM peer_money_days WHERE character_id = $1`,
      [character.id, utcDayKey(now)],
    );
    const row = rows[0];
    const purchaseHold = await this.heldPurchases(ctx, now);
    return {
      tier,
      dailyLimit: dailyTransferLimit(tier),
      sentToday: Number(row?.sent_today ?? 0),
      sendable: peerSendable({
        earnedTotal: Number(character.earnedTotal),
        unearnedTotal: Number(character.unearnedTotal),
        lockedUnearned: Number(character.lockedUnearned),
        peerSentTotal: Number(row?.sent_total ?? 0),
        heldPurchases: purchaseHold?.amount ?? 0,
      }),
      receivedToday: Number(row?.received_today ?? 0),
      receiveLimit: DAILY_PEER_RECEIVE_LIMIT,
      characterAgeDays: ageDays,
      emailVerified,
      purchaseHold,
      debt: Number(character.debt),
    };
  }

  /** Check every player-to-player rule for `amount` to `recipient`, then count it. Throws a `GameRuleException`. */
  /**
   * Nothing goes to players while a refunded top-up is owed. Checked before "not enough cash" (also true then: what's
   * owed is taken from cash as soon as it arrives), so the player is told the real reason.
   */
  assertNoDebt(ctx: SimulationContext): void {
    const debt = Number(ctx.character.debt);
    if (debt > 0) throw new GameRuleException('DEBT_OUTSTANDING', debtOutstandingMessage(debt));
  }

  async authorize(ctx: SimulationContext, recipient: PeerRecipient, amount: number, now: Date = new Date()): Promise<void> {
    const day = utcDayKey(now);
    const limits = await this.limitsFor(ctx, now);
    const received: Array<{ received: string }> = await ctx.manager.query(`SELECT received FROM peer_money_days WHERE character_id = $1 AND day = $2`, [recipient.id, day]);
    const check = checkPeerMoney({
      amount,
      sentToday: limits.sentToday,
      dailyLimit: limits.dailyLimit,
      sendable: limits.sendable,
      receivedToday: Number(received[0]?.received ?? 0),
      recipientHandle: recipient.handle,
      heldPurchases: limits.purchaseHold?.amount ?? 0,
      debt: limits.debt,
    });
    if (!check.ok) throw new GameRuleException(check.code, check.message);

    await ctx.manager.query(
      `INSERT INTO peer_money_days (character_id, day, sent) VALUES ($1, $2, $3)
       ON CONFLICT (character_id, day) DO UPDATE SET sent = peer_money_days.sent + EXCLUDED.sent`,
      [ctx.character.id, day, amount],
    );
    // Conditional on the cap so two senders racing to the same recipient can't push them past it.
    const credited: unknown[] = await ctx.manager.query(
      `INSERT INTO peer_money_days (character_id, day, received) VALUES ($1, $2, $3)
       ON CONFLICT (character_id, day) DO UPDATE SET received = peer_money_days.received + EXCLUDED.received
         WHERE peer_money_days.received + EXCLUDED.received <= $4
       RETURNING received`,
      [recipient.id, day, amount, DAILY_PEER_RECEIVE_LIMIT],
    );
    if (credited.length === 0) {
      throw new GameRuleException('RECIPIENT_DAILY_LIMIT', `@${recipient.handle} has received all they can from players today (${formatNaira(DAILY_PEER_RECEIVE_LIMIT)} a day).`);
    }
  }
}
