/**
 * The world is always drawn in the morning: no dark nights (owner's call). Only what you see and hear changes; the
 * game clock, opening hours, needs and schedules keep real game time. Flip this to bring back the full day/night cycle.
 */
export const ALWAYS_DAYLIGHT = true;

/** The morning the sky moves through: full daylight, sun still low enough for long shadows. */
export const MORNING_HOURS = { from: 8.5, to: 11.5 } as const;

/**
 * The hour to draw (and hear) for a game hour. With the daylight lock the game day swings through the morning band and
 * back (08:30 at midnight, 11:30 at noon), so the sun keeps moving and never jumps.
 */
export function sceneHour(hour: number, alwaysDaylight: boolean = ALWAYS_DAYLIGHT): number {
  if (!alwaysDaylight) return hour;
  const dayFraction = (((hour % 24) + 24) % 24) / 24;
  return MORNING_HOURS.from + (MORNING_HOURS.to - MORNING_HOURS.from) * (1 - Math.abs(2 * dayFraction - 1));
}
