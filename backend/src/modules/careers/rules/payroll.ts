import { computePayslip, type JobDefinition, type PayslipDto } from '@insidelife/shared';

/** Formal employers pay in full from 90% attendance; below that, "no work, no pay" pro-rata. */
export const FULL_PAY_ATTENDANCE = 0.9;
/** Volatile pay (tips, show money) never collapses below or explodes beyond these multiples. */
export const VOLATILITY_BOUNDS = { min: 0.25, max: 3.5 } as const;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export interface PayInput {
  readonly job: JobDefinition;
  readonly level: number;
  readonly monthIndex: number;
  /** Naira per dollar on payday (USD jobs). */
  readonly usdRate: number;
  /** 0-1 share of the month employed. */
  readonly proration: number;
  /** 0-1 share of scheduled work attended (1 when nothing was scheduled). */
  readonly attendance: number;
  /** Counter-offers / label deals (1 = catalog pay). */
  readonly payAdjustment: number;
  /** Standard-normal draw for this month's pay volatility. */
  readonly volatilityDraw: number;
  readonly dettyDecember: boolean;
}

/** Pay multiplier from attendance. Hustles pay strictly for days worked; formal jobs tolerate a little absence. */
export function attendancePayFactor(job: JobDefinition, attendance: number): number {
  const ratio = clamp(attendance, 0, 1);
  if (job.sector === 'informal' || job.sector === 'creative') return ratio;
  return Math.min(1, ratio / FULL_PAY_ATTENDANCE);
}

/** Mean-preserving log-normal multiplier for volatile pay. */
export function volatilityMultiplier(sigma: number, draw: number): number {
  if (sigma <= 0) return 1;
  return clamp(Math.exp(sigma * draw - (sigma * sigma) / 2), VOLATILITY_BOUNDS.min, VOLATILITY_BOUNDS.max);
}

/** Base monthly gross in the job's currency for a level (before attendance and luck). */
export function levelPay(job: JobDefinition, level: number, payAdjustment = 1): number {
  const definition = job.levels[Math.min(Math.max(0, level), job.levels.length - 1)];
  return (definition?.pay ?? 0) * payAdjustment;
}

/** Monthly gross in naira (USD jobs converted at the payday rate). */
export function monthlyGross(input: PayInput): { readonly gross: number; readonly grossUsd: number | null } {
  const base = levelPay(input.job, input.level, input.payAdjustment);
  const seasonal = input.dettyDecember ? (input.job.dettyDecemberPay ?? 1) : 1;
  const factor =
    clamp(input.proration, 0, 1) *
    attendancePayFactor(input.job, input.attendance) *
    volatilityMultiplier(input.job.payVolatility, input.volatilityDraw) *
    seasonal;
  if (input.job.currency === 'USD') {
    const grossUsd = Math.round(base * factor);
    return { gross: Math.round(grossUsd * input.usdRate), grossUsd };
  }
  return { gross: Math.round(base * factor), grossUsd: null };
}

/** The full payslip: gross → 8% pension → PAYE on annualised income (NTA 2025 bands) → net. */
export function payslipFor(input: PayInput): PayslipDto {
  const { gross, grossUsd } = monthlyGross(input);
  const slip = computePayslip({ gross, pension: input.job.perks.pension, paye: input.job.perks.paye });
  return {
    monthIndex: input.monthIndex,
    gross: slip.gross,
    grossUsd,
    tax: slip.tax,
    pensionEmployee: slip.pensionEmployee,
    pensionEmployer: slip.pensionEmployer,
    net: slip.net,
    attendance: Math.round(clamp(input.attendance, 0, 1) * 1000) / 1000,
    proration: Math.round(clamp(input.proration, 0, 1) * 1000) / 1000,
  };
}
