import { gameMinuteAt, realMsAt, type GameClockConfig, type GameMinute } from '@insidelife/shared';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { SimulationContext } from './simulation-context.js';

/**
 * "At the controls": the player made a move (any command with `touch: true`, or a `playing` report from the client,
 * which sends one while the tab is visible and being used) within this long (real time) before the simulated moment.
 * While present the autopilot leaves the character alone (no routine sleep, meals, habits or trips) and illness
 * warnings count as seen. Measured in real time so it holds at any game speed (120× in production, 10,000× in soak
 * tests), including offline catch-up settles. 5 real minutes = 10 game hours at ×120.
 */
export const PRESENT_WINDOW_MS = 5 * 60_000;
/** An untreated illness can only prove fatal within this long (real time) of the player's last move. */
export const ACTIVE_WINDOW_MS = 2 * 60 * 60_000;

/**
 * Real milliseconds between the player's last command and the moment being simulated. Measured in real time so the
 * safety net holds at any game speed (120× in production, 10,000× in soak tests), including offline catch-up settles.
 */
export function realMsSinceLastMove(ctx: SimulationContext): number {
  return realMsAt(ctx.world.clock, ctx.time) - ctx.character.lastActiveAt.getTime();
}

/**
 * The first game minute at which the player no longer counts as present (`t < presentUntil` ⇔ present at `t`).
 * A pure function of the persisted `lastActiveAt`, so every settle agrees on it however the timeline is chunked: a
 * settle always runs before a command touches `lastActiveAt`, so the past is never reinterpreted.
 */
export function presentUntil(character: Pick<CharacterEntity, 'lastActiveAt'>, clock: GameClockConfig): GameMinute {
  return Math.floor(gameMinuteAt(clock, character.lastActiveAt.getTime() + PRESENT_WINDOW_MS)) + 1;
}

/** The player is watching right now (otherwise the character is on autopilot). */
export function isPlayerPresent(ctx: SimulationContext): boolean {
  return ctx.time < presentUntil(ctx.character, ctx.world.clock);
}

export function isPlayerRecentlyActive(ctx: SimulationContext): boolean {
  return realMsSinceLastMove(ctx) <= ACTIVE_WINDOW_MS;
}

/**
 * The `lastActiveAt` to store when the player says they've left: just outside the window, so the autopilot takes over
 * from now on. Never moves it forward (a player who was already away stays away).
 */
export function awayStamp(lastActiveAt: Date, nowMs: number): Date {
  return new Date(Math.min(lastActiveAt.getTime(), nowMs - PRESENT_WINDOW_MS - 1_000));
}
