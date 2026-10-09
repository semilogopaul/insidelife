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
 * Pure bank-transfer rules (amount bounds, charges, affordability). The player-to-player limits — the sender's daily
 * tier limit, starting money that can't be sent and the recipient's daily receive cap — are shared with sprays and
 * live in `checkPeerMoney` (shared) / `PeerMoneyGuard`.
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
  | 'INSUFFICIENT_FUNDS';

export type TransferCheck =
  | { readonly ok: true; readonly quote: TransferQuote }
  | { readonly ok: false; readonly code: TransferViolationCode; readonly message: string };

export interface TransferCheckInput {
  readonly amount: number;
  readonly cash: number;
}

export function checkTransfer(input: TransferCheckInput): TransferCheck {
  const { amount, cash } = input;
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
