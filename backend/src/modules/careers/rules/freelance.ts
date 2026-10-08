/** Freelance gigs: naira per hour, scaled by tech skill. Earned, bounded, never a jackpot. */

export const FREELANCE_BASE_RATE = 1_500;
export const FREELANCE_MAX_RATE = 35_000;
/** Chance a client disappears without paying ("client don ghost"). */
export const FREELANCE_GHOST_CHANCE = 0.08;

/** ₦/hour at a given tech skill: ~₦2.9k at 20, ~₦11k at 60, capped at ₦35k for the very best. */
export function freelanceHourlyRate(tech: number): number {
  const rate = FREELANCE_BASE_RATE * Math.exp(Math.max(0, Math.min(100, tech)) / 30);
  return Math.min(FREELANCE_MAX_RATE, Math.round(rate / 50) * 50);
}

/** Pay for one gig: hours × rate × mood (0.6-1.25) × client luck (0.75-1.25), rounded to ₦100. */
export function freelancePay(tech: number, hours: number, moodMultiplier: number, luck: number): number {
  const amount = freelanceHourlyRate(tech) * Math.max(0, hours) * moodMultiplier * luck;
  return Math.max(0, Math.round(amount / 100) * 100);
}
