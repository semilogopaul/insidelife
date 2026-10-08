import { DAYS_PER_YEAR } from '@insidelife/shared';

/** Annual chance an NPC relative dies of natural causes (Gompertz-style, calibrated loosely to Nigerian adults). */
export function annualDeathChance(age: number): number {
  if (age < 40) return 0.002;
  return Math.min(0.6, 0.006 * Math.exp(0.09 * (age - 50)));
}

export function dailyDeathChance(age: number): number {
  return 1 - Math.pow(1 - annualDeathChance(age), 1 / DAYS_PER_YEAR);
}
