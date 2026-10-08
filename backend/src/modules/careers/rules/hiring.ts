import type { JobDefinition, SkillKey } from '@insidelife/shared';
import { qualifyingDegrees, type CandidateProfile } from './requirements.js';

/** Odds never reach certainty either way: Lagos always has a surprise. */
export const MIN_HIRING_CHANCE = 0.03;
export const MAX_HIRING_CHANCE = 0.95;
/** Range of the interview card's effect on the odds. */
export const INTERVIEW_BONUS_RANGE = { min: -0.2, max: 0.25 } as const;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * 0-1 academic strength for this job: the best qualifying degree's CGPA (5-point scale) and institution prestige.
 * Neutral (0.5) when the job doesn't ask for a qualification.
 */
export function academicScore(job: JobDefinition, profile: CandidateProfile): number {
  const level = job.requirements.education;
  if (!level || level === 'none' || level === 'ssce') return 0.5;
  const degrees = qualifyingDegrees(job, profile.credentials);
  if (degrees.length === 0) return 0;
  return degrees.reduce((best, degree) => Math.max(best, clamp(degree.cgpa / 5, 0, 1) * 0.6 + clamp(degree.prestige / 100, 0, 1) * 0.4), 0);
}

/** 0-1 how far skills clear the job's skill bar (25 points above = maxed). Neutral (0.5) without skill requirements. */
export function skillMarginScore(job: JobDefinition, profile: CandidateProfile): number {
  const entries = Object.entries(job.requirements.skills ?? {}) as Array<[SkillKey, number]>;
  if (entries.length === 0) return 0.5;
  const total = entries.reduce((sum, [skill, minimum]) => sum + clamp((profile.skills[skill] - minimum) / 25, 0, 1), 0);
  return total / entries.length;
}

/**
 * Probability an eligible candidate gets the offer:
 * base (1 − selectivity) + academics + skill margin + connections ("man know man") + the interview card.
 */
export function hiringChance(job: JobDefinition, profile: CandidateProfile, interviewBonus = 0): number {
  const { selectivity, academicWeight, connectionWeight } = job.hiring;
  const chance =
    1 -
    selectivity +
    academicWeight * (academicScore(job, profile) - 0.5) +
    0.2 * (skillMarginScore(job, profile) - 0.5) +
    connectionWeight * clamp(profile.connections / 100, 0, 1) +
    clamp(interviewBonus, INTERVIEW_BONUS_RANGE.min, INTERVIEW_BONUS_RANGE.max);
  return clamp(chance, MIN_HIRING_CHANCE, MAX_HIRING_CHANCE);
}

/** Board estimate, rounded to 5% so players can't reverse-engineer the formula from decimals. */
export function displayChance(chance: number): number {
  return Math.round(chance * 20) / 20;
}
