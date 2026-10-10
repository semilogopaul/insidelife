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
  /** Game minutes that elapse per real minute (e.g. 60 => 1 game minute per real second). */
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

/**
 * A change of game speed at a real moment. The clock stays continuous: at `atRealMs` it re-anchors to the game minute
 * the previous speed had reached and runs at `scale` from there, so no instance, settle or client sees time jump.
 */
export interface ClockRescale {
  readonly atRealMs: number;
  readonly scale: number;
}

/**
 * The clock running at `realMs`: `base` (the speed since the epoch), re-anchored at every rescale that has happened by
 * then. Rescales must be in time order (see `parseClockRescales`).
 */
export function clockAt(base: GameClockConfig, rescales: readonly ClockRescale[], realMs: number): GameClockConfig {
  let clock = base;
  for (const rescale of rescales) {
    if (rescale.atRealMs > realMs) break;
    clock = { epochRealMs: rescale.atRealMs, epochGameMinute: gameMinuteAt(clock, rescale.atRealMs), scale: rescale.scale };
  }
  return clock;
}

/** The next speed change after `realMs`, or null. */
export function nextRescaleAfter(rescales: readonly ClockRescale[], realMs: number): ClockRescale | null {
  return rescales.find((rescale) => rescale.atRealMs > realMs) ?? null;
}

/**
 * Parse `GAME_TIME_RESCALES`: comma-separated `<ISO-8601 real time>@<game minutes per real minute>`, e.g.
 * `2026-10-12T09:00:00Z@60`. Throws on a malformed entry, a scale outside 1–10,000, or entries out of order.
 */
export function parseClockRescales(text: string | undefined): ClockRescale[] {
  const entries = (text ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const rescales: ClockRescale[] = [];
  for (const entry of entries) {
    const at = entry.lastIndexOf('@');
    const atRealMs = Date.parse(entry.slice(0, at));
    const scale = Number(entry.slice(at + 1));
    if (at <= 0 || !Number.isFinite(atRealMs) || !Number.isFinite(scale) || scale < 1 || scale > 10_000) {
      throw new RangeError(`Bad clock rescale "${entry}" (expected <ISO time>@<scale>)`);
    }
    const previous = rescales[rescales.length - 1];
    if (previous && atRealMs <= previous.atRealMs) throw new RangeError(`Clock rescales must be in time order ("${entry}")`);
    rescales.push({ atRealMs, scale });
  }
  return rescales;
}
