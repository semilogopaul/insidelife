import { damp, dampAngle } from './math';
import type { MutablePoint } from './collision';
import type { Surface } from './surface';

/**
 * On-foot movement: camera-relative intent → velocity with smooth acceleration, turning towards travel, sliding
 * along water edges and pushed out of obstacles by the world. Pure (the world is injected), allocation-free.
 */

/** Brisk Lagos walk and a jog (both well under the server's 8 m/s anti-teleport cap). */
export const WALK_SPEED = 1.9;
export const JOG_SPEED = 3.7;
export const WALKER_RADIUS = 0.38;

export interface WalkerState {
  x: number;
  z: number;
  y: number;
  /** Facing (shared heading convention). */
  heading: number;
  vx: number;
  vz: number;
  /** Ground speed (m/s). */
  speed: number;
}

export interface WalkIntent {
  /** World-space direction scaled by stick magnitude (length 0–1). */
  dirX: number;
  dirZ: number;
  run: boolean;
}

export interface WalkWorld {
  surfaceAt(x: number, z: number): Surface;
  groundHeightAt(x: number, z: number): number;
  /** Push a circle out of obstacles (mutates `p`). */
  resolve(p: MutablePoint, radius: number): void;
}

export function createWalker(x: number, z: number, heading: number, y = 0.2): WalkerState {
  return { x, z, y, heading, vx: 0, vz: 0, speed: 0 };
}

const scratch: MutablePoint = { x: 0, z: 0 };

const solid = (world: WalkWorld, x: number, z: number): boolean => world.surfaceAt(x, z) === 'water';

/** Blocked if the circle's leading edge (in the direction of travel) is over water. */
function blocked(world: WalkWorld, x: number, z: number, dx: number, dz: number): boolean {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return solid(world, x, z);
  return solid(world, x + (dx / length) * WALKER_RADIUS, z + (dz / length) * WALKER_RADIUS) || solid(world, x, z);
}

export function stepWalker(state: WalkerState, intent: WalkIntent, dt: number, world: WalkWorld): void {
  const magnitude = Math.min(1, Math.hypot(intent.dirX, intent.dirZ));
  const top = intent.run ? JOG_SPEED : WALK_SPEED;
  const targetX = magnitude > 0.05 ? (intent.dirX / Math.max(magnitude, 1e-6)) * top * magnitude : 0;
  const targetZ = magnitude > 0.05 ? (intent.dirZ / Math.max(magnitude, 1e-6)) * top * magnitude : 0;
  const k = damp(magnitude > 0.05 ? 9 : 14, dt);
  state.vx += (targetX - state.vx) * k;
  state.vz += (targetZ - state.vz) * k;

  const dx = state.vx * dt;
  const dz = state.vz * dt;
  let nx = state.x + dx;
  let nz = state.z + dz;
  if (blocked(world, nx, nz, dx, dz)) {
    // Slide along the water's edge (city edges are axis-aligned).
    if (!blocked(world, state.x + dx, state.z, dx, 0)) {
      nz = state.z;
      state.vz = 0;
    } else if (!blocked(world, state.x, state.z + dz, 0, dz)) {
      nx = state.x;
      state.vx = 0;
    } else {
      nx = state.x;
      nz = state.z;
      state.vx = 0;
      state.vz = 0;
    }
  }
  scratch.x = nx;
  scratch.z = nz;
  world.resolve(scratch, WALKER_RADIUS);
  // Never get pushed into water by an obstacle.
  if (!solid(world, scratch.x, scratch.z)) {
    nx = scratch.x;
    nz = scratch.z;
  }
  const moved = dt > 0 ? Math.hypot(nx - state.x, nz - state.z) / dt : 0;
  state.x = nx;
  state.z = nz;
  state.speed = Math.min(moved, Math.hypot(state.vx, state.vz) + 0.5);
  if (magnitude > 0.05) state.heading = dampAngle(state.heading, Math.atan2(intent.dirZ, intent.dirX), 12, dt);
  state.y += (world.groundHeightAt(nx, nz) - state.y) * damp(18, dt);
}
