import type { VehiclePerformance } from '@insidelife/shared';
import { VEHICLE_SCALE } from '../../city/layout/placements';
import type { MutablePoint, PushResult } from './collision';
import { clamp, damp, lerp, wrapAngle } from './math';
import { drivable, type Surface } from './surface';

/**
 * Arcade-but-grounded car: throttle/brake/reverse, bicycle-model steering whose lock narrows with speed, a light
 * drift (velocity keeps some momentum when the nose turns; the handbrake loosens grip), a ~60 km/h city cap,
 * crawling over kerbs and sand, solid lot ground and water, and collisions that stop or slide on obstacles.
 * Pure: the world (surfaces, obstacles) is injected; per-frame code allocates nothing.
 */

/** City speed cap: 60 km/h. */
export const CITY_SPEED_CAP = 60 / 3.6;
/** Off the asphalt (pavements, sand) the car crawls. */
export const ROUGH_SPEED_CAP = 4.2;

export interface VehicleSpec {
  /** Forward cap (m/s). */
  readonly maxSpeed: number;
  /** Launch acceleration (m/s²), tapering towards `maxSpeed`. */
  readonly accel: number;
  /** Braking deceleration (m/s²). */
  readonly brake: number;
  readonly reverseSpeed: number;
  readonly reverseAccel: number;
  readonly wheelBase: number;
  /** Steering lock (rad) at standstill and at the cap — it narrows with speed. */
  readonly lockLow: number;
  readonly lockHigh: number;
  /** How fast the wheel turns (rad/s). */
  readonly steerRate: number;
  /** Lateral grip (1/s): how quickly sideways slip dies away. */
  readonly grip: number;
  readonly halfLength: number;
  readonly halfWidth: number;
}

export interface VehicleState {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  /** Signed forward speed (m/s; negative when reversing). */
  speed: number;
  /** Current road-wheel angle (rad; positive turns right = increasing heading). */
  steer: number;
  yawRate: number;
  /** Sideways slip (m/s) — drift amount for effects. */
  slip: number;
  /** Speed lost against an obstacle this step (m/s). */
  impact: number;
  /** Share of the car's footprint off the asphalt (0–1). */
  rough: number;
}

export interface DriveIntent {
  /** 0–1 */
  throttle: number;
  /** 0–1 (also reverse once stopped). */
  brake: number;
  /** -1 (left) … 1 (right). */
  steer: number;
  handbrake: boolean;
}

export interface DriveWorld {
  surfaceAt(x: number, z: number): Surface;
  /** Push a circle out of solid obstacles (mutates `p`, writes the push into `out`). */
  resolve(p: MutablePoint, radius: number, out: PushResult): boolean;
}

/** Car-kit model lengths (model units; ×VEHICLE_SCALE in the world). */
const MODEL_HALF_LENGTH: Readonly<Record<string, number>> = {
  sedan: 1.28,
  'sedan-sports': 1.28,
  'hatchback-sports': 1.22,
  suv: 1.35,
  'suv-luxury': 1.35,
  taxi: 1.38,
  van: 1.4,
  danfo: 1.4,
  delivery: 1.42,
  truck: 1.48,
  police: 1.38,
  ambulance: 1.45,
};

export function vehicleSpecFor(model: string, performance?: VehiclePerformance): VehicleSpec {
  const zeroToHundred = performance?.zeroToHundredSeconds ?? 10.5;
  const handling = clamp(performance?.handling ?? 0.6, 0, 1);
  const braking = clamp(performance?.braking ?? 0.6, 0, 1);
  const top = Math.min(CITY_SPEED_CAP, (performance?.topSpeedKmh ?? 180) / 3.6);
  const halfLength = (MODEL_HALF_LENGTH[model] ?? 1.3) * VEHICLE_SCALE;
  return {
    maxSpeed: top,
    // The compact city wants punchy launches: real 0-100 times scaled into the 0-60 band.
    accel: clamp((27.8 / zeroToHundred) * 1.9, 3.2, 9),
    brake: lerp(9, 15, braking),
    reverseSpeed: 5.5,
    reverseAccel: 4.5,
    wheelBase: halfLength * 1.25,
    lockLow: 0.62,
    lockHigh: lerp(0.14, 0.2, handling),
    steerRate: lerp(2.6, 4, handling),
    grip: lerp(6, 10, handling),
    halfLength,
    halfWidth: 0.75 * VEHICLE_SCALE,
  };
}

export function createVehicle(x: number, z: number, heading: number): VehicleState {
  return { x, z, heading, vx: 0, vz: 0, speed: 0, steer: 0, yawRate: 0, slip: 0, impact: 0, rough: 0 };
}

const probe: MutablePoint = { x: 0, z: 0 };
const push: PushResult = { nx: 0, nz: 0, depth: 0 };
/** Footprint samples (forward, right) in units of half-length / half-width. */
const SAMPLES: readonly (readonly [number, number])[] = [
  [0.92, -0.85],
  [0.92, 0.85],
  [-0.92, -0.85],
  [-0.92, 0.85],
  [1, 0],
  [-1, 0],
];

/** Footprint check result (shared scratch): samples on solid ground, and the share of samples off the asphalt. */
const footprintResult = { blocked: 0, rough: 0 };

/** Sample the car's footprint: how many samples sit on solid ground (lot ground, water) and how rough the rest is. */
function footprint(world: DriveWorld, x: number, z: number, heading: number, spec: VehicleSpec): typeof footprintResult {
  const fx = Math.cos(heading);
  const fz = Math.sin(heading);
  let rough = 0;
  let blocked = 0;
  for (let i = 0; i < SAMPLES.length; i++) {
    const sample = SAMPLES[i] as readonly [number, number];
    const f = sample[0];
    const r = sample[1];
    const px = x + fx * f * spec.halfLength - fz * r * spec.halfWidth;
    const pz = z + fz * f * spec.halfLength + fx * r * spec.halfWidth;
    const surface = world.surfaceAt(px, pz);
    if (!drivable(surface)) blocked++;
    else if (surface !== 'asphalt') rough++;
  }
  footprintResult.blocked = blocked;
  footprintResult.rough = rough / SAMPLES.length;
  return footprintResult;
}

export function stepVehicle(state: VehicleState, intent: DriveIntent, spec: VehicleSpec, dt: number, world: DriveWorld): void {
  const prevX = state.x;
  const prevZ = state.z;
  const prevHeading = state.heading;
  const blockedBefore = footprint(world, prevX, prevZ, prevHeading, spec).blocked;
  let fx = Math.cos(state.heading);
  let fz = Math.sin(state.heading);
  let forward = state.vx * fx + state.vz * fz;
  let lateral = state.vx * -fz + state.vz * fx;

  // Longitudinal.
  const throttle = clamp(intent.throttle, 0, 1);
  const brake = clamp(intent.brake, 0, 1);
  if (throttle > 0) {
    if (forward < -0.3) forward = Math.min(0, forward + spec.brake * throttle * dt);
    else forward += spec.accel * throttle * Math.max(0.05, 1 - (forward / spec.maxSpeed) ** 6) * dt;
  }
  if (brake > 0) {
    if (forward > 0.3) forward = Math.max(0, forward - spec.brake * brake * dt);
    else if (throttle === 0) forward = Math.max(-spec.reverseSpeed, forward - spec.reverseAccel * brake * dt);
  }
  // Rolling resistance and air drag; the engine brakes when coasting.
  const coast = throttle === 0 && brake === 0 ? 1.4 : 0.35;
  const resist = (coast + 0.0025 * forward * forward) * dt;
  forward = Math.abs(forward) <= resist ? 0 : forward - Math.sign(forward) * resist;
  if (intent.handbrake) forward = Math.abs(forward) <= 7 * dt ? 0 : forward - Math.sign(forward) * 7 * dt;
  // Kerbs and sand: crawl.
  const cap = state.rough > 0.3 ? ROUGH_SPEED_CAP : spec.maxSpeed;
  if (forward > cap) forward = Math.max(cap, forward - 14 * dt);
  if (forward < -spec.reverseSpeed) forward = -spec.reverseSpeed;

  // Steering: the lock narrows as speed builds; the wheel turns at a finite rate.
  const speedShare = clamp(Math.abs(forward) / spec.maxSpeed, 0, 1);
  const lock = lerp(spec.lockLow, spec.lockHigh, Math.sqrt(speedShare));
  const target = clamp(intent.steer, -1, 1) * lock;
  const step = spec.steerRate * dt;
  state.steer = state.steer + clamp(target - state.steer, -step, step);
  state.yawRate = (forward / spec.wheelBase) * Math.tan(state.steer);
  // Handbrake slides the tail: a little extra rotation at speed.
  if (intent.handbrake && Math.abs(forward) > 4) state.yawRate *= 1.35;
  state.heading = wrapAngle(state.heading + state.yawRate * dt);

  // Drift: the old velocity re-expressed in the new heading leaves some of it sideways; grip bleeds that away.
  const vx = fx * forward - fz * lateral;
  const vz = fz * forward + fx * lateral;
  fx = Math.cos(state.heading);
  fz = Math.sin(state.heading);
  forward = vx * fx + vz * fz;
  lateral = vx * -fz + vz * fx;
  lateral *= 1 - damp(intent.handbrake ? spec.grip * 0.22 : spec.grip, dt);
  state.vx = fx * forward - fz * lateral;
  state.vz = fz * forward + fx * lateral;

  // Integrate, then resolve obstacles with three circles along the body.
  state.x += state.vx * dt;
  state.z += state.vz * dt;
  state.impact = 0;
  const radius = spec.halfWidth * 0.98;
  const reach = spec.halfLength - radius;
  let pushX = 0;
  let pushZ = 0;
  for (let i = -1; i <= 1; i++) {
    probe.x = state.x + fx * reach * i;
    probe.z = state.z + fz * reach * i;
    if (world.resolve(probe, radius, push)) {
      if (Math.abs(push.nx) > Math.abs(pushX)) pushX = push.nx;
      if (Math.abs(push.nz) > Math.abs(pushZ)) pushZ = push.nz;
    }
  }
  if (pushX !== 0 || pushZ !== 0) {
    state.x += pushX;
    state.z += pushZ;
    const length = Math.hypot(pushX, pushZ);
    const nx = pushX / length;
    const nz = pushZ / length;
    const into = state.vx * nx + state.vz * nz;
    if (into < 0) {
      state.impact = -into;
      // Remove the motion into the obstacle and scrub some of the slide along it.
      state.vx = (state.vx - nx * into) * 0.82;
      state.vz = (state.vz - nz * into) * 0.82;
    }
  }

  // Lot ground and water are solid: a move may never put more of the car on them than before (so a car that ended
  // up half on the verge can still back out). Slide along the (axis-aligned) edge, else stop.
  let fit = footprint(world, state.x, state.z, state.heading, spec);
  let rough = fit.rough;
  if (fit.blocked > blockedBefore) {
    const before = Math.hypot(state.vx, state.vz);
    fit = footprint(world, state.x, prevZ, state.heading, spec);
    if (fit.blocked <= blockedBefore) {
      state.z = prevZ;
      state.vz = 0;
      rough = fit.rough;
    } else {
      fit = footprint(world, prevX, state.z, state.heading, spec);
      if (fit.blocked <= blockedBefore) {
        state.x = prevX;
        state.vx = 0;
        rough = fit.rough;
      } else {
        state.x = prevX;
        state.z = prevZ;
        fit = footprint(world, prevX, prevZ, state.heading, spec);
        if (fit.blocked > blockedBefore) {
          state.heading = prevHeading;
          fit = footprint(world, prevX, prevZ, prevHeading, spec);
        }
        state.vx *= -0.15;
        state.vz *= -0.15;
        rough = fit.rough;
      }
    }
    state.impact = Math.max(state.impact, before - Math.hypot(state.vx, state.vz));
  }
  state.rough = rough;
  state.speed = state.vx * Math.cos(state.heading) + state.vz * Math.sin(state.heading);
  state.slip = state.vx * -Math.sin(state.heading) + state.vz * Math.cos(state.heading);
}

/** km/h for the speedometer. */
export const speedKmh = (state: VehicleState): number => Math.abs(state.speed) * 3.6;
