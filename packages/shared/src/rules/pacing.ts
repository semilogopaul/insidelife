import { MINUTES_PER_HOUR } from '../time/calendar.js';

/**
 * Game pacing. The clock runs at ×60 (1 real second = 1 game minute, a game day = 24 real minutes), so venues stay
 * open long enough to enjoy. Two kinds of time:
 *
 * - **Routine life follows game days**: needs drifting while idle, working or in lectures, mealtimes, the autopilot's
 *   night, shifts, salaries, rent, bills, school terms, pregnancy, ageing and the world economy are all set per game
 *   hour/day and kept as they were (they simply take twice as long in real time).
 * - **What you do keeps its real-time feel**: timed actions and booked rides last about as long in real seconds as
 *   they did at ×120, so they take half the game minutes. Their effects per run are unchanged: every per-hour rate an
 *   action earns at (its own need drift, skill XP, fitness, study, freelance pay, management time, exercise) is
 *   multiplied by `ACTION_PACE`. Sleep is the exception the owner asked for: a full rest is 3 game hours.
 */

/** The clock speed the catalog is tuned for (game minutes per real minute). */
export const TUNED_TIME_SCALE = 60;

/** A game hour of an action (or a ride) does what two game hours of it did at ×120. */
export const ACTION_PACE = 2;

/** "Effective hours" an activity counted for: game hours × `ACTION_PACE`. Use for every per-hour reward of an action. */
export function actionHours(activity: { readonly startedAt: number; readonly endsAt: number }): number {
  return ((activity.endsAt - activity.startedAt) / MINUTES_PER_HOUR) * ACTION_PACE;
}

/** Game minutes of a ride: the map's distances at ×120 speed, halved so a ride lasts as many real seconds as before. */
export function pacedTripMinutes(minutes: number): number {
  return minutes / ACTION_PACE;
}
