import { realMsAt } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';

/** The player acted this recently (real time) before the simulated moment: they are watching and see warnings live. */
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

/** The player is watching right now (otherwise the character is on autopilot). */
export function isPlayerPresent(ctx: SimulationContext): boolean {
  return realMsSinceLastMove(ctx) <= PRESENT_WINDOW_MS;
}

export function isPlayerRecentlyActive(ctx: SimulationContext): boolean {
  return realMsSinceLastMove(ctx) <= ACTIVE_WINDOW_MS;
}
