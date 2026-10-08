import {
  MAX_SINGLE_TRANSFER,
  MINUTES_PER_DAY,
  MIN_TRANSFER,
  formatNaira,
  transferFee,
  type GameMinute,
  type TransferFee,
} from '@insidelife/shared';

/**
 * Pure transfer rules (amount bounds, daily tier limit, affordability). The daily limit counts everything a transfer
 * debits — amount plus fee and stamp duty — because that is what `LedgerService.sumOutflowSince('transfer')` sums;
 * clients preview with `dailyLimit − sentToday ≥ amount + transferFee(amount).total`.
 */

export interface TransferQuote extends TransferFee {
  readonly amount: number;
  /** Amount + fee + stamp duty: what leaves the sender's cash. */
  readonly totalDebit: number;
}

export type TransferViolationCode =
  | 'INVALID_AMOUNT'
  | 'TRANSFER_TOO_SMALL'
  | 'TRANSFER_TOO_LARGE'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'INSUFFICIENT_FUNDS';

export type TransferCheck =
  | { readonly ok: true; readonly quote: TransferQuote }
  | { readonly ok: false; readonly code: TransferViolationCode; readonly message: string };

export interface TransferCheckInput {
  readonly amount: number;
  readonly cash: number;
  readonly sentToday: number;
  readonly dailyLimit: number;
}

export function checkTransfer(input: TransferCheckInput): TransferCheck {
  const { amount, cash, sentToday, dailyLimit } = input;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT', message: 'Enter a whole naira amount' };
  }
  if (amount < MIN_TRANSFER) {
    return { ok: false, code: 'TRANSFER_TOO_SMALL', message: `The smallest transfer is ${formatNaira(MIN_TRANSFER)}` };
  }
  if (amount > MAX_SINGLE_TRANSFER) {
    return { ok: false, code: 'TRANSFER_TOO_LARGE', message: `You can send at most ${formatNaira(MAX_SINGLE_TRANSFER)} at once` };
  }
  const charges = transferFee(amount);
  const quote: TransferQuote = { ...charges, amount, totalDebit: amount + charges.total };
  if (sentToday + quote.totalDebit > dailyLimit) {
    const remaining = Math.max(0, dailyLimit - sentToday);
    return {
      ok: false,
      code: 'DAILY_LIMIT_EXCEEDED',
      message: `Daily limit reached: you can still move ${formatNaira(remaining)} today (charges included).`,
    };
  }
  if (cash < quote.totalDebit) {
    return {
      ok: false,
      code: 'INSUFFICIENT_FUNDS',
      message: `You need ${formatNaira(quote.totalDebit)} including ${formatNaira(charges.total)} charges`,
    };
  }
  return { ok: true, quote };
}

/**
 * Character age for transfer tiers, in whole game days since the character was created (real `createdAt` mapped onto
 * the world clock). Not `bornAt + 17y`: birthdays are jittered up to a year, which would hand fresh accounts Tier 3.
 */
export function characterAgeDays(createdAtGameMinute: GameMinute, now: GameMinute): number {
  return Math.max(0, Math.floor((now - createdAtGameMinute) / MINUTES_PER_DAY));
}

/** Free-text transfer note: single line, no control characters, max 80 chars. */
export function sanitizeNote(note: string | undefined): string | null {
  if (!note) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = note.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned.length > 0 ? cleaned : null;
}
