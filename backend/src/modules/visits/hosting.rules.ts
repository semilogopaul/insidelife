import {
  HOSTING_RULES,
  MINUTES_PER_DAY,
  findHostTreat,
  type HostTreatDefinition,
  type HostTreatId,
} from '@insidelife/shared';

export interface TreatProblem {
  readonly code: string;
  readonly message: string;
}

export interface TreatCheckInput {
  readonly def: HostTreatDefinition;
  /** The host is in their own home. */
  readonly atHome: boolean;
  /** Guests on an accepted visit who are inside right now. */
  readonly guests: number;
  readonly hostAdult: boolean;
  readonly guestsAdult: boolean;
  readonly pantryMeals: number;
  /** Pantry meals this order needs. */
  readonly pantryNeeded: number;
  readonly cash: number;
  readonly total: number;
  /** This treat is still on the table. */
  readonly onTable: boolean;
}

/** Why a treat can't be served right now, or null. Pure. */
export function treatProblem(input: TreatCheckInput): TreatProblem | null {
  if (!input.atHome)
    return { code: 'NOT_HOME', message: 'You can only host in your own house — go home first' };
  if (input.guests === 0)
    return { code: 'NO_GUESTS', message: 'Nobody’s inside yet. Your guests have to come in first' };
  if (input.def.adultsOnly && !input.hostAdult)
    return { code: 'TOO_YOUNG', message: 'You must be 18+ to serve that' };
  if (input.def.adultsOnly && !input.guestsAdult)
    return { code: 'UNDER_18_GUEST', message: 'Not with an under-18 in the house — soft drinks instead' };
  if (input.onTable)
    return { code: 'STILL_ON_TABLE', message: 'It’s still on the table — let them finish first' };
  if (input.pantryNeeded > input.pantryMeals) {
    return {
      code: 'PANTRY_SHORT',
      message: `Your kitchen needs ${input.pantryNeeded} meals for this — buy foodstuff first`,
    };
  }
  if (input.cash < input.total) return { code: 'INSUFFICIENT_FUNDS', message: 'Not enough money for that' };
  return null;
}

export interface HostReward {
  /** The host feels it (social and a "good host" mood). */
  readonly rewarded: boolean;
  readonly clout: number;
}

/**
 * What the host gets for this treat after `earlier` treats served today (oldest first): social and mood for the first
 * few treats of the day, and clout from generous ones up to the daily cap, so hosting can't be farmed. Pure.
 */
export function hostReward(earlier: readonly HostTreatId[], next: HostTreatDefinition): HostReward {
  let clout = 0;
  earlier.slice(0, HOSTING_RULES.maxRewardedTreatsPerDay).forEach((id) => {
    clout += Math.min(findHostTreat(id)?.clout ?? 0, HOSTING_RULES.maxCloutPerDay - clout);
  });
  if (earlier.length >= HOSTING_RULES.maxRewardedTreatsPerDay) return { rewarded: false, clout: 0 };
  return { rewarded: true, clout: Math.max(0, Math.min(next.clout, HOSTING_RULES.maxCloutPerDay - clout)) };
}

/** Closeness a guest gains with a host from one treat, after what they gained from them today. Pure. */
export function closenessGain(treatCloseness: number, gainedToday: number): number {
  return Math.max(0, Math.min(treatCloseness, HOSTING_RULES.maxClosenessPerDay - gainedToday));
}

/** First game minute of the day `t` falls in. */
export const dayStart = (t: number): number => Math.floor(t / MINUTES_PER_DAY) * MINUTES_PER_DAY;
