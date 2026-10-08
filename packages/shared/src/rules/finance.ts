/**
 * Money rules shared by server (authoritative) and client (previews): income tax, pension and transfer fees.
 * Calibrated to Nigeria in 2026 — see docs/research/nigeria-economy-2026.md.
 */

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

export const TRANSFER_TIERS = [
  { tier: 1, label: 'Tier 1', dailyLimit: 30_000 },
  { tier: 2, label: 'Tier 2', dailyLimit: 200_000 },
  { tier: 3, label: 'Tier 3', dailyLimit: 5_000_000 },
] as const;
export type TransferTier = (typeof TRANSFER_TIERS)[number]['tier'];

export const MAX_SINGLE_TRANSFER = 5_000_000;
export const MIN_TRANSFER = 100;

/** Character age (in game days) needed for each transfer tier. Tier 3 also needs a verified email. */
export const TRANSFER_TIER_MIN_DAYS: Readonly<Record<TransferTier, number>> = { 1: 0, 2: 7, 3: 30 };

export function transferTierFor(characterAgeDays: number, emailVerified: boolean): TransferTier {
  if (emailVerified && characterAgeDays >= TRANSFER_TIER_MIN_DAYS[3]) return 3;
  if (characterAgeDays >= TRANSFER_TIER_MIN_DAYS[2]) return 2;
  return 1;
}

export function dailyTransferLimit(tier: TransferTier): number {
  return TRANSFER_TIERS.find((t) => t.tier === tier)?.dailyLimit ?? TRANSFER_TIERS[0].dailyLimit;
}

/** Lagos rent upfront: one year plus agency (10%), legal (10%) and a refundable caution deposit (10%). */
export function rentUpfront(annualRent: number): { rent: number; agency: number; legal: number; caution: number; total: number } {
  const agency = Math.round(annualRent * 0.1);
  const legal = Math.round(annualRent * 0.1);
  const caution = Math.round(annualRent * 0.1);
  return { rent: annualRent, agency, legal, caution, total: annualRent + agency + legal + caution };
}
