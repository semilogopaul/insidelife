import { MAX_SINGLE_TRANSFER, MIN_TRANSFER, TRANSFER_TIERS, TRANSFER_TIER_MIN_DAYS, formatNaira, transferFee, type TransferTier } from '@insidelife/shared';

/**
 * Client preview of a transfer, mirroring the server rules (backend wallet/transfer-rules.ts): fee + stamp duty from
 * the shared `transferFee`, and a daily limit that counts the charges too. The server stays authoritative.
 */

export type TransferProblem =
  | { readonly code: 'EMPTY' }
  | { readonly code: 'TOO_SMALL'; readonly message: string }
  | { readonly code: 'TOO_LARGE'; readonly message: string }
  | { readonly code: 'OVER_LIMIT'; readonly message: string; readonly remaining: number }
  | { readonly code: 'INSUFFICIENT'; readonly message: string; readonly shortfall: number };

export interface TransferPreview {
  readonly amount: number;
  readonly fee: number;
  readonly stampDuty: number;
  /** Amount + charges: what leaves your cash. */
  readonly totalDebit: number;
  /** Limit left today before this transfer. */
  readonly remainingToday: number;
  /** Limit left today if this transfer goes through. */
  readonly remainingAfter: number;
  readonly problem: TransferProblem | null;
}

export interface TransferLimits {
  readonly cash: number;
  readonly dailyLimit: number;
  readonly sentToday: number;
}

export function previewTransfer(amount: number | null, limits: TransferLimits): TransferPreview {
  const value = amount ?? 0;
  const charges = value > 0 ? transferFee(value) : { fee: 0, stampDuty: 0, total: 0 };
  const totalDebit = value + charges.total;
  const remainingToday = Math.max(0, limits.dailyLimit - limits.sentToday);
  const base = { amount: value, fee: charges.fee, stampDuty: charges.stampDuty, totalDebit, remainingToday, remainingAfter: Math.max(0, remainingToday - totalDebit) };
  return { ...base, problem: transferProblem(value, totalDebit, remainingToday, limits.cash) };
}

function transferProblem(amount: number, totalDebit: number, remainingToday: number, cash: number): TransferProblem | null {
  if (amount <= 0) return { code: 'EMPTY' };
  if (amount < MIN_TRANSFER) return { code: 'TOO_SMALL', message: `The smallest transfer is ${formatNaira(MIN_TRANSFER)}.` };
  if (amount > MAX_SINGLE_TRANSFER) return { code: 'TOO_LARGE', message: `You can send at most ${formatNaira(MAX_SINGLE_TRANSFER)} at once.` };
  if (totalDebit > remainingToday) {
    return {
      code: 'OVER_LIMIT',
      remaining: remainingToday,
      message:
        remainingToday === 0
          ? 'You’ve used today’s transfer limit. It resets at midnight.'
          : `That’s over today’s limit. You can still move ${formatNaira(remainingToday)} today, charges included.`,
    };
  }
  if (cash < totalDebit) {
    const shortfall = totalDebit - cash;
    return { code: 'INSUFFICIENT', shortfall, message: `You’re ${formatNaira(shortfall)} short, charges included.` };
  }
  return null;
}

/** Largest amount you can send right now (limit and cash, charges included). */
export function maxSendable(limits: TransferLimits): number {
  const budget = Math.max(0, Math.min(limits.cash, limits.dailyLimit - limits.sentToday));
  // Charges are a small step function of the amount (₦0, ₦10, ₦60 or ₦100 in total): try each step, largest amount first.
  for (const charges of [0, 10, 60, 100]) {
    const candidate = Math.min(budget - charges, MAX_SINGLE_TRANSFER);
    if (candidate >= MIN_TRANSFER && candidate + transferFee(candidate).total <= budget) return candidate;
  }
  return 0;
}

export function tierLabel(tier: TransferTier): string {
  return TRANSFER_TIERS.find((entry) => entry.tier === tier)?.label ?? `Tier ${tier}`;
}

/** How to reach the next tier, in plain words (null at the top tier). */
export function nextTierHint(tier: TransferTier): string | null {
  if (tier === 3) return null;
  const next = TRANSFER_TIERS.find((entry) => entry.tier === tier + 1);
  if (!next) return null;
  const days = TRANSFER_TIER_MIN_DAYS[next.tier];
  const condition = next.tier === 3 ? `${days} game days and a verified email` : `${days} game days`;
  return `${next.label} (${formatNaira(next.dailyLimit)} a day) unlocks after ${condition}.`;
}
