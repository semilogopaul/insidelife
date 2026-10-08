import { MINUTES_PER_DAY, MINUTES_PER_YEAR, type GameMinute, type JobDefinition, type JobLevelDefinition } from '@insidelife/shared';
import { allMet, levelGateChecks, type CandidateProfile, type RequirementCheck } from './requirements.js';

/** Bosses don't promote people who don't show up. */
export const PROMOTION_MIN_PERFORMANCE = 0.55;
/** After a "next appraisal, insha Allah", wait this long before asking again. */
export const PROMOTION_COOLDOWN_DAYS = 30;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export interface PromotionState {
  readonly level: number;
  readonly levelStartedAt: GameMinute;
  readonly performance: number;
  readonly goodwill: number;
  readonly lastPromotionRequestAt: GameMinute | null;
}

export interface PromotionOutlook {
  readonly next: JobLevelDefinition | null;
  readonly eligibleFrom: GameMinute | null;
  readonly gates: readonly RequirementCheck[];
  readonly breakout: boolean;
  /** Why a request would be turned down right now (null = go ahead). */
  readonly blockedReason: string | null;
  readonly chance: number;
}

/** Odds a review goes your way: performance, the boss's goodwill and who you know. */
export function promotionChance(performance: number, goodwill: number, connections: number): number {
  return clamp(0.3 + (performance - PROMOTION_MIN_PERFORMANCE) * 1.6 + goodwill + clamp(connections, 0, 100) / 400, 0.1, 0.95);
}

export function promotionOutlook(job: JobDefinition, state: PromotionState, profile: CandidateProfile, now: GameMinute): PromotionOutlook {
  const current = job.levels[state.level];
  const next = job.levels[state.level + 1] ?? null;
  if (!current || !next) {
    return { next: null, eligibleFrom: null, gates: [], breakout: false, blockedReason: 'You’re at the top of this ladder', chance: 0 };
  }
  const eligibleFrom = state.levelStartedAt + Math.round(current.minYears * MINUTES_PER_YEAR);
  const gates = levelGateChecks(next, profile);
  const chance = promotionChance(state.performance, state.goodwill, profile.connections);
  const cooldownEnds = state.lastPromotionRequestAt === null ? null : state.lastPromotionRequestAt + PROMOTION_COOLDOWN_DAYS * MINUTES_PER_DAY;

  let blockedReason: string | null = null;
  if (next.breakout) blockedReason = 'Only a breakout moment can take you there — keep creating';
  else if (now < eligibleFrom) blockedReason = 'You haven’t spent enough time at this level yet';
  else if (!allMet(gates)) blockedReason = 'You don’t meet the requirements for the next level yet';
  else if (state.performance < PROMOTION_MIN_PERFORMANCE) blockedReason = 'Your performance is too low — show up and do the work';
  else if (cooldownEnds !== null && now < cooldownEnds) blockedReason = 'Your oga said “next appraisal”. Give it some time';

  return { next, eligibleFrom, gates, breakout: next.breakout === true, blockedReason, chance };
}
