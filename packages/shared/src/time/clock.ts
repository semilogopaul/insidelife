import type { GameMinute } from './calendar.js';

/**
 * Maps real wall-clock time onto the shared game clock.
 *
 * The server owns this configuration and publishes it via `GET /v1/world/clock`;
 * clients use it (plus a measured server offset) to render a smooth clock
 * without polling.
 */
export interface GameClockConfig {
  /** Real Unix time (ms) at which the game clock read {@link epochGameMinute}. */
  readonly epochRealMs: number;
  /** Game minute at {@link epochRealMs}. */
  readonly epochGameMinute: GameMinute;
  /** Game minutes that elapse per real minute (e.g. 120 => 2 game minutes per real second). */
  readonly scale: number;
}

const MS_PER_REAL_MINUTE = 60_000;

/** Fractional game minute for a real timestamp. */
export function gameMinuteAt(config: GameClockConfig, realMs: number): number {
  return config.epochGameMinute + ((realMs - config.epochRealMs) / MS_PER_REAL_MINUTE) * config.scale;
}

/** Whole game minute for a real timestamp (what the server persists). */
export function wholeGameMinuteAt(config: GameClockConfig, realMs: number): GameMinute {
  return Math.floor(gameMinuteAt(config, realMs));
}

/** Real timestamp (ms) at which the clock reaches a given game minute. */
export function realMsAt(config: GameClockConfig, t: GameMinute): number {
  return config.epochRealMs + ((t - config.epochGameMinute) / config.scale) * MS_PER_REAL_MINUTE;
}

/** Real milliseconds a span of game minutes takes. */
export function gameMinutesToRealMs(config: GameClockConfig, minutes: number): number {
  return (minutes / config.scale) * MS_PER_REAL_MINUTE;
}
