import {
  MAX_SINGLE_TRANSFER,
  MIN_TRANSFER,
  PURCHASE_HOLD_HOURS,
  TRANSFER_TIERS,
  TRANSFER_TIER_MIN_DAYS,
  debtOutstandingMessage,
  formatNaira,
  transferFee,
  type TransferTier,
} from '@insidelife/shared';

/**
 * Client preview of a transfer, mirroring the server rules (backend wallet/transfer-rules.ts and the shared
 * `checkPeerMoney`): fee + stamp duty from the shared `transferFee`; the daily limit counts what reaches players
 * (charges not included); nothing goes out while a refunded top-up is owed; bought coins wait 48 hours; starting money
 * can't be sent. The recipient's daily cap is only known to the server. The
 * server stays authoritative.
 */

export type TransferProblem =
  | { readonly code: 'EMPTY' }
  | { readonly code: 'TOO_SMALL'; readonly message: string }
  | { readonly code: 'TOO_LARGE'; readonly message: string }
  | { readonly code: 'OVER_LIMIT'; readonly message: string; readonly remaining: number }
  | { readonly code: 'DEBT'; readonly message: string; readonly debt: number }
  | { readonly code: 'ON_HOLD'; readonly message: string; readonly sendable: number }
  | { readonly code: 'LOCKED'; readonly message: string; readonly sendable: number }
  | { readonly code: 'INSUFFICIENT'; readonly message: string; readonly shortfall: number };

export interface TransferPreview {
  readonly amount: number;
  readonly fee: number;
  readonly stampDuty: number;
  /** Amount + charges: what leaves your cash. */
  readonly totalDebit: number;
  /** Daily limit left before this transfer (Infinity when there's none). */
  readonly remainingToday: number;
  /** Daily limit left if this transfer goes through. */
  readonly remainingAfter: number;
  readonly problem: TransferProblem | null;
}

export interface TransferLimits {
  readonly cash: number;
  /** null = no daily limit (Tier 3). */
  readonly dailyLimit: number | null;
  readonly sentToday: number;
  /** How much of your money can go to players (starting money never can; bought coins on hold aren't counted). */
  readonly sendable: number;
  /** Coins bought in the last 48 hours: spendable, not sendable yet. */
  readonly held?: number;
  /** Owed from a refunded top-up: nothing can be sent until it's repaid. */
  readonly debt?: number;
}

const remainingOf = (limits: TransferLimits): number =>
  limits.dailyLimit === null ? Number.POSITIVE_INFINITY : Math.max(0, limits.dailyLimit - limits.sentToday);

export function previewTransfer(amount: number | null, limits: TransferLimits): TransferPreview {
  const value = amount ?? 0;
  const charges = value > 0 ? transferFee(value) : { fee: 0, stampDuty: 0, total: 0 };
  const totalDebit = value + charges.total;
  const remainingToday = remainingOf(limits);
  const base = {
    amount: value,
    fee: charges.fee,
    stampDuty: charges.stampDuty,
    totalDebit,
    remainingToday,
    remainingAfter: Math.max(0, remainingToday - value),
  };
  return { ...base, problem: transferProblem(value, totalDebit, remainingToday, limits) };
}

function transferProblem(
  amount: number,
  totalDebit: number,
  remainingToday: number,
  limits: TransferLimits,
): TransferProblem | null {
  if (amount <= 0) return { code: 'EMPTY' };
  if (amount < MIN_TRANSFER)
    return { code: 'TOO_SMALL', message: `The smallest transfer is ${formatNaira(MIN_TRANSFER)}.` };
  if (amount > MAX_SINGLE_TRANSFER)
    return {
      code: 'TOO_LARGE',
      message: `You can send at most ${formatNaira(MAX_SINGLE_TRANSFER)} at once.`,
    };
  if (amount > remainingToday) {
    return {
      code: 'OVER_LIMIT',
      remaining: remainingToday,
      message:
        remainingToday === 0
          ? 'You’ve used today’s limit for sending money to players. It resets at midnight (UTC).'
          : `That’s over today’s limit. You can still send ${formatNaira(remainingToday)} to players today.`,
    };
  }
  const debt = limits.debt ?? 0;
  if (debt > 0) return { code: 'DEBT', debt, message: debtMessage(debt) };
  const held = limits.held ?? 0;
  if (amount > limits.sendable && amount <= limits.sendable + held) {
    return {
      code: 'ON_HOLD',
      sendable: limits.sendable,
      message: `Coins you bought can be sent to players ${PURCHASE_HOLD_HOURS} hours after the top-up.${limits.sendable > 0 ? ` You can send ${formatNaira(limits.sendable)} now.` : ''}`,
    };
  }
  if (amount > limits.sendable) {
    return {
      code: 'LOCKED',
      sendable: limits.sendable,
      message:
        limits.sendable === 0
          ? 'Your starting money is for spending in Lagos — it can’t be sent to players. Earn or top up to send money.'
          : `You can send ${formatNaira(limits.sendable)}: your starting money can’t be passed on.`,
    };
  }
  if (limits.cash < totalDebit) {
    const shortfall = totalDebit - limits.cash;
    return {
      code: 'INSUFFICIENT',
      shortfall,
      message: `You’re ${formatNaira(shortfall)} short, charges included.`,
    };
  }
  return null;
}

/** Largest amount you can send right now (daily limit, sendable money and cash with charges). */
export function maxSendable(limits: TransferLimits): number {
  if ((limits.debt ?? 0) > 0) return 0;
  const ceiling = Math.min(remainingOf(limits), limits.sendable, MAX_SINGLE_TRANSFER);
  // Charges are a small step function of the amount (₦0, ₦10, ₦60 or ₦100 in total): try each step, largest amount first.
  for (const charges of [0, 10, 60, 100]) {
    const candidate = Math.floor(Math.min(ceiling, limits.cash - charges));
    if (candidate >= MIN_TRANSFER && candidate + transferFee(candidate).total <= limits.cash)
      return candidate;
  }
  return 0;
}

/** Why nothing can be sent while a refunded top-up is owed. */
export function debtMessage(debt: number): string {
  return debtOutstandingMessage(debt);
}

export function tierLabel(tier: TransferTier): string {
  return TRANSFER_TIERS.find((entry) => entry.tier === tier)?.label ?? `Tier ${tier}`;
}

/** A tier's daily limit in words. */
export function tierLimitLabel(dailyLimit: number | null): string {
  return dailyLimit === null ? 'no daily limit' : `${formatNaira(dailyLimit)} a day`;
}

/** How to reach the next tier, in plain words (null at the top tier). */
export function nextTierHint(tier: TransferTier): string | null {
  if (tier === 3) return null;
  const next = TRANSFER_TIERS.find((entry) => entry.tier === tier + 1);
  if (!next) return null;
  const days = TRANSFER_TIER_MIN_DAYS[next.tier];
  const condition = next.tier === 3 ? `${days} game days and a verified email` : `${days} game days`;
  return `${next.label} (${tierLimitLabel(next.dailyLimit)}) unlocks after ${condition}.`;
}
