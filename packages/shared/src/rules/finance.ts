/**
 * Money rules shared by server (authoritative) and client (previews): income tax, pension and transfer fees.
 * Calibrated to Nigeria in 2026 — see docs/research/nigeria-economy-2026.md.
 */

import { boosted } from '../money/income-multiplier.js';
import { formatNaira } from '../money/money.js';

/** Nigeria Tax Act 2025 personal income tax bands (annual, from 2026). */
export const PIT_BANDS: ReadonlyArray<{ readonly upTo: number; readonly rate: number }> = [
  { upTo: 800_000, rate: 0 },
  { upTo: 3_000_000, rate: 0.15 },
  { upTo: 12_000_000, rate: 0.18 },
  { upTo: 25_000_000, rate: 0.21 },
  { upTo: 50_000_000, rate: 0.23 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.25 },
];

/** Annual personal income tax on taxable income. */
export function annualIncomeTax(taxableIncome: number): number {
  let remaining = Math.max(0, taxableIncome);
  let lowerBound = 0;
  let tax = 0;
  for (const band of PIT_BANDS) {
    const width = band.upTo - lowerBound;
    const slice = Math.min(remaining, width);
    tax += slice * band.rate;
    remaining -= slice;
    lowerBound = band.upTo;
    if (remaining <= 0) break;
  }
  return Math.round(tax);
}

export const EMPLOYEE_PENSION_RATE = 0.08;
export const EMPLOYER_PENSION_RATE = 0.1;

export interface PayslipInput {
  /** Gross monthly salary for the period (after attendance adjustments). */
  readonly gross: number;
  /** Whether the employer runs a pension scheme (formal jobs). */
  readonly pension: boolean;
  /** Annual rent paid, for the 20% rent relief (capped at ₦500k). */
  readonly annualRent?: number;
  /** Informal pay isn't taxed through PAYE. */
  readonly paye: boolean;
}

export interface Payslip {
  readonly gross: number;
  readonly pensionEmployee: number;
  readonly pensionEmployer: number;
  readonly tax: number;
  readonly net: number;
}

/** Monthly payslip: PAYE computed on annualised income, then divided by 12. */
export function computePayslip(input: PayslipInput): Payslip {
  const gross = Math.max(0, Math.round(input.gross));
  const pensionEmployee = input.pension ? Math.round(gross * EMPLOYEE_PENSION_RATE) : 0;
  const pensionEmployer = input.pension ? Math.round(gross * EMPLOYER_PENSION_RATE) : 0;
  let tax = 0;
  if (input.paye) {
    const rentRelief = Math.min(500_000, Math.round((input.annualRent ?? 0) * 0.2));
    const annualTaxable = (gross - pensionEmployee) * 12 - rentRelief;
    tax = Math.round(annualIncomeTax(annualTaxable) / 12);
  }
  return {
    gross,
    pensionEmployee,
    pensionEmployer,
    tax,
    net: gross - pensionEmployee - tax,
  };
}

/** Withholding tax on interest and dividends. */
export const WITHHOLDING_TAX_RATE = 0.1;

/** Stamp duty on electronic transfers of ₦10,000 or more (paid by the sender). */
export const STAMP_DUTY = 50;
export const STAMP_DUTY_THRESHOLD = 10_000;

export interface TransferFee {
  readonly fee: number;
  readonly stampDuty: number;
  readonly total: number;
}

/** Interbank-style fee schedule applied to player-to-player transfers. */
export function transferFee(amount: number): TransferFee {
  const fee = amount < 5_000 ? 0 : amount <= 50_000 ? 10 : 50;
  const stampDuty = amount >= STAMP_DUTY_THRESHOLD ? STAMP_DUTY : 0;
  return { fee, stampDuty, total: fee + stampDuty };
}

/**
 * Daily limits on money SENT to other players (bank transfers, sprays and any other player-to-player money), counted
 * per real UTC day on the amounts that reach them (charges not included). `null` = no daily limit.
 */
export const TRANSFER_TIERS = [
  { tier: 1, label: 'Tier 1', dailyLimit: boosted(4_000_000) },
  { tier: 2, label: 'Tier 2', dailyLimit: boosted(10_000_000) },
  { tier: 3, label: 'Tier 3', dailyLimit: null },
] as const satisfies ReadonlyArray<{ readonly tier: number; readonly label: string; readonly dailyLimit: number | null }>;
export type TransferTier = (typeof TRANSFER_TIERS)[number]['tier'];

export const MAX_SINGLE_TRANSFER = boosted(5_000_000);
export const MIN_TRANSFER = 100;

/**
 * The most a player can RECEIVE from other players per real UTC day, across every player-to-player channel. Money from
 * work, businesses, investments, the game itself and top-ups is never capped. Stops many accounts feeding one.
 */
export const DAILY_PEER_RECEIVE_LIMIT = boosted(4_000_000);

/** Character age (in game days) needed for each transfer tier. Tier 3 also needs a verified email. */
export const TRANSFER_TIER_MIN_DAYS: Readonly<Record<TransferTier, number>> = { 1: 0, 2: 7, 3: 30 };

export function transferTierFor(characterAgeDays: number, emailVerified: boolean): TransferTier {
  if (emailVerified && characterAgeDays >= TRANSFER_TIER_MIN_DAYS[3]) return 3;
  if (characterAgeDays >= TRANSFER_TIER_MIN_DAYS[2]) return 2;
  return 1;
}

/** The tier's daily send limit, or null when it has none. */
export function dailyTransferLimit(tier: TransferTier): number | null {
  const entry = TRANSFER_TIERS.find((t) => t.tier === tier) ?? TRANSFER_TIERS[0];
  return entry.dailyLimit;
}

/**
 * Bought coins (top-ups) can be spent at once but only sent to other players this long after the top-up: a card
 * payment refunded or charged back in the meantime can't have been passed on already.
 */
export const PURCHASE_HOLD_HOURS = 48;

/** Why nothing can go to players while a refunded top-up is owed. */
export function debtOutstandingMessage(debt: number): string {
  return `You owe ${formatNaira(debt)} from a refunded top-up. It comes out of money you receive; you can send money to players again once it’s repaid.`;
}

export interface PeerSendableInput {
  readonly earnedTotal: number;
  /** Includes the starting money, free assets, top-ups and everything other players sent you. */
  readonly unearnedTotal: number;
  /** The part of unearned that can never go to players: starting money and the value of free assets. */
  readonly lockedUnearned: number;
  /** Everything this character ever sent to other players. */
  readonly peerSentTotal: number;
  /** Bought coins credited in the last `PURCHASE_HOLD_HOURS` (net of claw-backs): on hold, not sendable yet. */
  readonly heldPurchases?: number;
}

/**
 * How much of a character's money may go to other players: what they earned, bought or were sent, minus what they've
 * already sent and minus coins bought in the last 48 hours. Starting money (and free assets like a starter car) can be
 * spent in the game but never passed on, so new accounts can't be farmed for it.
 */
export function peerSendable(input: PeerSendableInput): number {
  return Math.max(0, input.earnedTotal + input.unearnedTotal - input.lockedUnearned - input.peerSentTotal - Math.max(0, input.heldPurchases ?? 0));
}

export interface PeerMoneyCheckInput {
  readonly amount: number;
  /** Sender: sent to players today, the tier limit (null = none) and the sendable budget. */
  readonly sentToday: number;
  readonly dailyLimit: number | null;
  readonly sendable: number;
  /** Recipient: received from players today. */
  readonly receivedToday: number;
  readonly recipientHandle: string;
  /** Sender: bought coins still on hold (already left out of `sendable`), to explain a refusal. */
  readonly heldPurchases?: number;
  /** Sender: what they still owe from a refunded top-up. Nothing goes to players until it's repaid. */
  readonly debt?: number;
}

export type PeerMoneyViolation = 'DAILY_LIMIT_EXCEEDED' | 'DEBT_OUTSTANDING' | 'PURCHASE_ON_HOLD' | 'STARTER_MONEY_LOCKED' | 'RECIPIENT_DAILY_LIMIT';

export type PeerMoneyCheck = { readonly ok: true } | { readonly ok: false; readonly code: PeerMoneyViolation; readonly message: string };

/** Player-to-player money rules shared by transfers and sprays. Pure. */
export function checkPeerMoney(input: PeerMoneyCheckInput): PeerMoneyCheck {
  const { amount, sentToday, dailyLimit, sendable, receivedToday, recipientHandle } = input;
  if (dailyLimit !== null && sentToday + amount > dailyLimit) {
    const left = Math.max(0, dailyLimit - sentToday);
    return {
      ok: false,
      code: 'DAILY_LIMIT_EXCEEDED',
      message: left === 0 ? 'You’ve used today’s limit for sending money to players. It resets at midnight (UTC).' : `Daily limit: you can still send ${formatNaira(left)} to players today.`,
    };
  }
  if ((input.debt ?? 0) > 0) {
    return {
      ok: false,
      code: 'DEBT_OUTSTANDING',
      message: debtOutstandingMessage(input.debt ?? 0),
    };
  }
  const held = Math.max(0, input.heldPurchases ?? 0);
  if (amount > sendable && amount <= sendable + held) {
    return {
      ok: false,
      code: 'PURCHASE_ON_HOLD',
      message: `Coins you bought can be sent to players ${PURCHASE_HOLD_HOURS} hours after the top-up.${sendable > 0 ? ` You can send ${formatNaira(sendable)} now.` : ''}`,
    };
  }
  if (amount > sendable) {
    return {
      ok: false,
      code: 'STARTER_MONEY_LOCKED',
      message:
        sendable === 0
          ? 'Your starting money is for you to spend in Lagos — it can’t be sent to other players. Earn or top up to send money.'
          : `You can send ${formatNaira(sendable)} to players: your starting money can’t be passed on.`,
    };
  }
  if (receivedToday + amount > DAILY_PEER_RECEIVE_LIMIT) {
    const room = Math.max(0, DAILY_PEER_RECEIVE_LIMIT - receivedToday);
    return {
      ok: false,
      code: 'RECIPIENT_DAILY_LIMIT',
      message:
        room === 0
          ? `@${recipientHandle} has received all they can from players today (${formatNaira(DAILY_PEER_RECEIVE_LIMIT)} a day).`
          : `@${recipientHandle} can only receive ${formatNaira(room)} more from players today.`,
    };
  }
  return { ok: true };
}

/** Lagos rent upfront: one year plus agency (10%), legal (10%) and a refundable caution deposit (10%). */
export function rentUpfront(annualRent: number): { rent: number; agency: number; legal: number; caution: number; total: number } {
  const agency = Math.round(annualRent * 0.1);
  const legal = Math.round(annualRent * 0.1);
  const caution = Math.round(annualRent * 0.1);
  return { rent: annualRent, agency, legal, caution, total: annualRent + agency + legal + caution };
}
