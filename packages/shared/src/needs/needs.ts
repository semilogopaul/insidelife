import { MINUTES_PER_HOUR, type GameMinute } from '../time/calendar.js';

/**
 * Needs model.
 *
 * Each need (0-100, higher is better) drifts linearly toward a *target* at a
 * *rate* (points per game hour). The current activity decides the targets:
 * sleeping pulls energy toward 100, a work shift pulls it toward ~20, idling at
 * home pulls everything toward the household's comfort equilibrium (set by
 * lifestyle and home quality).
 *
 * Because drift is piecewise linear with clamping, the value at any time has a
 * closed form. The server settles with it and the client renders smooth bars
 * between server updates with the exact same function — no ticking loops.
 */

export const NEED_KEYS = ['energy', 'hunger', 'hygiene', 'fun', 'social'] as const;
export type NeedKey = (typeof NEED_KEYS)[number];
export type Needs = Readonly<Record<NeedKey, number>>;

export interface NeedDrift {
  /** Value the need moves toward while this profile is active (0-100). */
  readonly target: number;
  /** Points per game hour. */
  readonly rate: number;
}
export type NeedProfile = Readonly<Record<NeedKey, NeedDrift>>;

export const NEED_MIN = 0;
export const NEED_MAX = 100;

export function clampNeed(value: number): number {
  return Math.min(NEED_MAX, Math.max(NEED_MIN, value));
}

/** Value of one need after `hours` of drift. */
export function driftNeed(value: number, drift: NeedDrift, hours: number): number {
  if (hours <= 0 || drift.rate <= 0) return clampNeed(value);
  const target = clampNeed(drift.target);
  const step = drift.rate * hours;
  const next = value > target ? Math.max(target, value - step) : Math.min(target, value + step);
  return clampNeed(next);
}

/** All needs after `hours` under a profile. */
export function projectNeeds(needs: Needs, profile: NeedProfile, hours: number): Needs {
  return {
    energy: driftNeed(needs.energy, profile.energy, hours),
    hunger: driftNeed(needs.hunger, profile.hunger, hours),
    hygiene: driftNeed(needs.hygiene, profile.hygiene, hours),
    fun: driftNeed(needs.fun, profile.fun, hours),
    social: driftNeed(needs.social, profile.social, hours),
  };
}

export function addNeeds(needs: Needs, delta: Partial<Record<NeedKey, number>>): Needs {
  return {
    energy: clampNeed(needs.energy + (delta.energy ?? 0)),
    hunger: clampNeed(needs.hunger + (delta.hunger ?? 0)),
    hygiene: clampNeed(needs.hygiene + (delta.hygiene ?? 0)),
    fun: clampNeed(needs.fun + (delta.fun ?? 0)),
    social: clampNeed(needs.social + (delta.social ?? 0)),
  };
}

/** A span of time with one constant need profile (one entry of a timeline). */
export interface NeedSegment {
  readonly startsAt: GameMinute;
  readonly endsAt: GameMinute;
  readonly profile: NeedProfile;
}

/**
 * Needs at time `t`, starting from `needs` known at `from` and walking a sorted
 * list of segments. Gaps between segments hold values steady. Instant effects
 * (eating a meal) are applied by the caller when a segment completes.
 */
export function needsAlongTimeline(
  needs: Needs,
  from: GameMinute,
  segments: readonly NeedSegment[],
  t: GameMinute,
): Needs {
  let current = needs;
  for (const segment of segments) {
    const start = Math.max(segment.startsAt, from);
    const end = Math.min(segment.endsAt, t);
    if (end <= start) continue;
    current = projectNeeds(current, segment.profile, (end - start) / MINUTES_PER_HOUR);
  }
  return current;
}

/** How much each need contributes to mood. Energy and hunger dominate, as in life. */
const MOOD_WEIGHTS: Readonly<Record<NeedKey, number>> = {
  energy: 0.25,
  hunger: 0.25,
  hygiene: 0.15,
  fun: 0.2,
  social: 0.15,
};

/**
 * Mood (0-100): a weighted average of needs, dragged down hard by any need in
 * the red, plus an external modifier (illness, recent life events, etc.).
 */
export function computeMood(needs: Needs, modifier = 0): number {
  let weighted = 0;
  let critical = 0;
  for (const key of NEED_KEYS) {
    const value = needs[key];
    weighted += value * MOOD_WEIGHTS[key];
    if (value < 15) critical += (15 - value) * 0.8;
  }
  return Math.round(clampNeed(weighted - critical + modifier));
}

export const MOOD_BANDS = [
  { min: 85, label: 'Thriving', emoji: '🤩' },
  { min: 70, label: 'Happy', emoji: '😊' },
  { min: 50, label: 'Fine', emoji: '🙂' },
  { min: 35, label: 'Stressed', emoji: '😕' },
  { min: 20, label: 'Miserable', emoji: '😣' },
  { min: 0, label: 'Breaking down', emoji: '😭' },
] as const;

export function moodBand(mood: number): (typeof MOOD_BANDS)[number] {
  return MOOD_BANDS.find((band) => mood >= band.min) ?? MOOD_BANDS[MOOD_BANDS.length - 1]!;
}

/**
 * Performance multiplier applied to work and study output from mood.
 * 0.6 when miserable, 1.0 at a fine mood, up to 1.25 when thriving.
 */
export function moodPerformanceMultiplier(mood: number): number {
  if (mood >= 50) return 1 + ((mood - 50) / 50) * 0.25;
  return 0.6 + (mood / 50) * 0.4;
}
