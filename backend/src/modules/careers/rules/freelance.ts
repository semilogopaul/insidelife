import { boosted } from '@insidelife/shared';
/**
 * Freelance gigs: naira per hour, scaled by tech skill. Earned, bounded, never a jackpot. Hours here are effective hours
 * (`actionHours`: game hours × `ACTION_PACE`), so a gig pays the same per run whatever the clock speed.
 */

// Lagos boom: gig pay grows with job pay (INCOME_MULTIPLIER); these are the Lagos rates × the multiplier.
export const FREELANCE_BASE_RATE = boosted(1_500, 50);
export const FREELANCE_MAX_RATE = boosted(35_000, 50);
/** Chance a client disappears without paying ("client don ghost"). */
export const FREELANCE_GHOST_CHANCE = 0.08;

/** ₦ per effective hour at a given tech skill: (~₦2.9k at 20, ~₦11k at 60, capped at ₦35k for the very best) × INCOME_MULTIPLIER. */
export function freelanceHourlyRate(tech: number): number {
  const rate = FREELANCE_BASE_RATE * Math.exp(Math.max(0, Math.min(100, tech)) / 30);
  return Math.min(FREELANCE_MAX_RATE, Math.round(rate / 50) * 50);
}

/** Pay for one gig: effective hours × rate × mood (0.6-1.25) × client luck (0.75-1.25), rounded to ₦100. */
export function freelancePay(tech: number, hours: number, moodMultiplier: number, luck: number): number {
  const amount = freelanceHourlyRate(tech) * Math.max(0, hours) * moodMultiplier * luck;
  return Math.max(0, Math.round(amount / 100) * 100);
}
