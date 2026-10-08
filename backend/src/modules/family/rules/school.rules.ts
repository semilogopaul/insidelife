import {
  CHILD_SCHOOLS,
  DAYS_PER_MONTH,
  DAYS_PER_YEAR,
  SCHOOL_START_AGE,
  TERM_START_MONTHS,
  WAEC_AGE,
  type ChildSchoolTier,
  type Rng,
} from '@insidelife/shared';

/** Day of the game year each term starts on: 2nd term (Jan), 3rd term (May), 1st term (Sep). */
const TERM_START_DAYS: readonly number[] = TERM_START_MONTHS.map((month) => (month - 1) * DAYS_PER_MONTH);
export const TERMS_PER_YEAR = TERM_START_DAYS.length;

/** Index (from the calendar origin) of the school term in progress on `dayIndex`. */
export function termIndexOfDay(dayIndex: number): number {
  const year = Math.floor(dayIndex / DAYS_PER_YEAR);
  const dayOfYear = dayIndex - year * DAYS_PER_YEAR;
  let term = 0;
  TERM_START_DAYS.forEach((start, index) => {
    if (dayOfYear >= start) term = index;
  });
  return year * TERMS_PER_YEAR + term;
}

/** First day of a term. */
export function termStartDay(termIndex: number): number {
  const year = Math.floor(termIndex / TERMS_PER_YEAR);
  const term = termIndex - year * TERMS_PER_YEAR;
  return year * DAYS_PER_YEAR + (TERM_START_DAYS[term] ?? 0);
}

export function isTermStartDay(dayIndex: number): boolean {
  return termStartDay(termIndexOfDay(dayIndex)) === dayIndex;
}

export function nextTermStartDay(dayIndex: number): number {
  return termStartDay(termIndexOfDay(dayIndex) + 1);
}

/** Children attend school from 3 until they sit WAEC at 17. */
export function attendsSchool(ageYears: number): boolean {
  return ageYears >= SCHOOL_START_AGE && ageYears <= WAEC_AGE;
}

/** Fee for one term at a tier, with the world price index applied (rounded to ₦500). */
export function termFee(tier: ChildSchoolTier, priceIndex: number): number {
  const base = CHILD_SCHOOLS[tier].feePerTerm;
  if (base <= 0) return 0;
  return Math.max(500, Math.round((base * priceIndex) / 500) * 500);
}

/** School performance drifts a quarter of the way toward the tier's level each term (being sent home hurts). */
export function driftPerformance(current: number, tier: ChildSchoolTier, sentHome: boolean): number {
  const target = Math.max(0, CHILD_SCHOOLS[tier].performance - (sentHome ? 0.15 : 0));
  return Math.max(0, Math.min(1, current + (target - current) * 0.25));
}

/** WAEC credits out of 9 from school performance and luck. */
export function waecCredits(performance: number, rng: Rng): number {
  const mean = 1 + Math.max(0, Math.min(1, performance)) * 8;
  return Math.max(0, Math.min(9, Math.round(rng.normal(mean, 1.2))));
}
