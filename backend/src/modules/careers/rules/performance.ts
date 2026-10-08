import type { JobDefinition, SkillKey, Skills } from '@insidelife/shared';

/** Weight of one day in the rolling performance average. */
export const PERFORMANCE_DAILY_WEIGHT = 0.1;
/** A day with less than this attendance is a "missed day" (a strike). */
export const MISSED_DAY_THRESHOLD = 0.5;
/** Strikes that earn a query letter (and, after a warning, the sack). */
export const STRIKES_FOR_WARNING = 3;
/** A query letter is forgotten after this many clean days. */
export const WARNING_MEMORY_DAYS = 60;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * 0-1 how well skills fit the current level: the gates of the level you hold (or the entry requirements), each
 * capped at 1. Neutral 0.7 when the level has no skill gates.
 */
export function skillFit(job: JobDefinition, level: number, skills: Skills): number {
  const gates = job.levels[level]?.skills ?? (level === 0 ? job.requirements.skills : undefined);
  const entries = Object.entries(gates ?? {}) as Array<[SkillKey, number]>;
  if (entries.length === 0) return 0.7;
  return entries.reduce((sum, [skill, minimum]) => sum + clamp(skills[skill] / Math.max(1, minimum), 0, 1.2) / 1.2, 0) / entries.length;
}

/** One working day's score: attendance dominates, mood and skill fit colour it. */
export function dayPerformance(attendance: number, moodMultiplier: number, fit: number): number {
  const moodScore = clamp((moodMultiplier - 0.6) / (1.25 - 0.6), 0, 1);
  return clamp(0.6 * clamp(attendance, 0, 1) + 0.25 * moodScore + 0.15 * clamp(fit, 0, 1), 0, 1);
}

export function rollPerformance(current: number, day: number, goodwill = 0): number {
  return clamp(current * (1 - PERFORMANCE_DAILY_WEIGHT) + (day + goodwill * 0.2) * PERFORMANCE_DAILY_WEIGHT, 0, 1);
}

export type StrikeOutcome = 'none' | 'warning' | 'fired';

export interface StrikeState {
  readonly strikes: number;
  readonly warnings: number;
  readonly lastWarningAt: number | null;
}

/**
 * Discipline after a working day: missed days add a strike, full days slowly clear them. Three strikes earn a query
 * letter; three more while the query is fresh and you're sacked.
 */
export function applyAttendanceDiscipline(
  state: StrikeState,
  attendance: number,
  now: number,
  minutesPerDay: number,
): { readonly state: StrikeState; readonly outcome: StrikeOutcome } {
  const warningFresh = state.lastWarningAt !== null && now - state.lastWarningAt < WARNING_MEMORY_DAYS * minutesPerDay;
  const warnings = warningFresh ? state.warnings : 0;
  let strikes = state.strikes;
  if (attendance < MISSED_DAY_THRESHOLD) strikes += 1;
  else if (attendance >= 0.9) strikes = Math.max(0, strikes - 0.25);

  if (strikes < STRIKES_FOR_WARNING) return { state: { strikes, warnings, lastWarningAt: state.lastWarningAt }, outcome: 'none' };
  if (warnings === 0) return { state: { strikes: 0, warnings: 1, lastWarningAt: now }, outcome: 'warning' };
  return { state: { strikes, warnings, lastWarningAt: state.lastWarningAt }, outcome: 'fired' };
}
