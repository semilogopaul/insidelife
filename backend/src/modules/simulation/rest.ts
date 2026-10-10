import { MINUTES_PER_DAY, MINUTES_PER_HOUR, type GameMinute } from '@insidelife/shared';
import type { ActivityState } from '../characters/entities/character.entity.js';
import type { Segment } from './interfaces/simulation-system.interface.js';

/**
 * The sleep clock. The autopilot never puts a player at the controls to bed, so the body has the last word: after ten
 * game days (four real hours at ×60) without a real sleep the character collapses wherever they are indoors and sleeps
 * it off.
 * Everything here is a pure function of persisted state (`lastSleptAt`, the running activity) and segment bounds, so
 * the outcome is the same however a settle is chunked.
 */

/** Ten game days without a real sleep and the body takes over. */
export const COLLAPSE_AFTER_MINUTES = 10 * MINUTES_PER_DAY;
/** A sleep counts once it has lasted this long (a full Sleep is 3 game hours; naps of up to an hour don't count). */
export const RESTFUL_SLEEP_MINUTES = 2 * MINUTES_PER_HOUR;
/** How long a collapse keeps you down (4 real minutes at ×60): longer than a chosen sleep. */
export const COLLAPSE_SLEEP_MINUTES = 4 * MINUTES_PER_HOUR;
/** The day-end warning goes out once, when the collapse is this close. */
export const SLEEP_DEBT_WARNING_MINUTES = 2 * MINUTES_PER_DAY;

/** When the body gives out if the character doesn't sleep before then. */
export function collapseDueAt(lastSleptAt: GameMinute): GameMinute {
  return lastSleptAt + COLLAPSE_AFTER_MINUTES;
}

/**
 * `lastSleptAt` after a segment: a sleep (autopilot, chosen or a collapse) that has lasted at least
 * `RESTFUL_SLEEP_MINUTES` by the segment's end moves it to that end, and so does any time in hospital or away on a
 * trip (you sleep there). `activity` is the activity running during the segment (null for routine blocks).
 */
export function restedThrough(segment: Pick<Segment, 'kind' | 'endsAt' | 'actionId'>, activity: Pick<ActivityState, 'actionId' | 'startedAt'> | null, lastSleptAt: GameMinute): GameMinute {
  if (segment.kind === 'hospital' || segment.kind === 'away') return Math.max(lastSleptAt, segment.endsAt);
  const sleeping = segment.kind === 'sleep' || segment.actionId === 'sleep';
  if (sleeping && activity?.actionId === 'sleep' && segment.endsAt - activity.startedAt >= RESTFUL_SLEEP_MINUTES) {
    return Math.max(lastSleptAt, segment.endsAt);
  }
  return lastSleptAt;
}

/** Whole days since the last real sleep at `t`. */
export function daysWithoutSleep(lastSleptAt: GameMinute, t: GameMinute): number {
  return Math.max(0, Math.floor((t - lastSleptAt) / MINUTES_PER_DAY));
}

/** True at exactly one day end per sleepless stretch: the first one within the warning window of the collapse. */
export function sleepDebtWarningDue(lastSleptAt: GameMinute, dayEnd: GameMinute): boolean {
  const left = collapseDueAt(lastSleptAt) - dayEnd;
  return left > 0 && left <= SLEEP_DEBT_WARNING_MINUTES && left + MINUTES_PER_DAY > SLEEP_DEBT_WARNING_MINUTES;
}
