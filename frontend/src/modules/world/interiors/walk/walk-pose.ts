import type { HomeWalkRuntime } from './home-walk-runtime';

/**
 * Where the walking player stands, for scene content that reacts to it without owning the walker (the apron's boarding
 * door). The mounted walk layer registers its runtime; readers poll `walkerFoot()` from a frame loop (no React state).
 */
let active: HomeWalkRuntime | null = null;

export function setActiveWalkRuntime(runtime: HomeWalkRuntime | null): void {
  active = runtime;
}

/** The walker's [x, z] in room space, or null when nobody is walking. */
export function walkerFoot(): readonly [number, number] | null {
  return active ? [active.pose.x, active.pose.z] : null;
}
