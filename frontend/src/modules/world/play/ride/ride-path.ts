import type { CityRoute, WorldPoint } from '@insidelife/shared';
import { clamp } from '../physics/math';

/**
 * Booked rides (danfo, keke, okada, Bolt, BRT, auto-drive) play back along the GPS route: the road part of the route
 * (kerb to kerb), corners rounded, offset into the right-hand lane. Server time decides progress — departure at
 * `departAt`, arrival at `arriveAt` (game minutes) — with a gentle pull-away and stop, and a stop-start shuffle for
 * danfos. Pure.
 */

export interface RidePath {
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  readonly cumulative: Float32Array;
  readonly length: number;
}

export interface PathPoint {
  x: number;
  z: number;
  heading: number;
}

const CORNER_RADIUS = 5;

/** The drivable part of a route (without the walk from/to the doors), corners rounded, offset right by `lane`. */
export function buildRidePath(route: CityRoute, lane = 1.6): RidePath {
  const source = route.points.length > 3 ? route.points.slice(1, route.points.length - 1) : route.points.slice();
  const rounded: WorldPoint[] = [];
  for (let i = 0; i < source.length; i++) {
    const p = source[i] as WorldPoint;
    const prev = source[i - 1];
    const next = source[i + 1];
    if (!prev || !next) {
      rounded.push(p);
      continue;
    }
    const inX = p.x - prev.x;
    const inZ = p.z - prev.z;
    const outX = next.x - p.x;
    const outZ = next.z - p.z;
    const inLength = Math.hypot(inX, inZ);
    const outLength = Math.hypot(outX, outZ);
    const turn = inLength > 0 && outLength > 0 ? (inX * outX + inZ * outZ) / (inLength * outLength) : 1;
    if (turn > 0.98 || inLength < 1 || outLength < 1) {
      rounded.push(p);
      continue;
    }
    const r = Math.min(CORNER_RADIUS, inLength / 2, outLength / 2);
    const ax = p.x - (inX / inLength) * r;
    const az = p.z - (inZ / inLength) * r;
    const bx = p.x + (outX / outLength) * r;
    const bz = p.z + (outZ / outLength) * r;
    for (let s = 0; s <= 4; s++) {
      const t = s / 4;
      const u = 1 - t;
      rounded.push({ x: u * u * ax + 2 * u * t * p.x + t * t * bx, z: u * u * az + 2 * u * t * p.z + t * t * bz });
    }
  }
  const n = rounded.length;
  const xs = new Float32Array(Math.max(1, n));
  const zs = new Float32Array(Math.max(1, n));
  const cumulative = new Float32Array(Math.max(1, n));
  for (let i = 0; i < n; i++) {
    const p = rounded[i] as WorldPoint;
    const a = rounded[Math.max(0, i - 1)] as WorldPoint;
    const b = rounded[Math.min(n - 1, i + 1)] as WorldPoint;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    // Right of travel: (-dz, dx).
    xs[i] = p.x + (-dz / length) * lane;
    zs[i] = p.z + (dx / length) * lane;
    cumulative[i] = i === 0 ? 0 : (cumulative[i - 1] as number) + Math.hypot((xs[i] as number) - (xs[i - 1] as number), (zs[i] as number) - (zs[i - 1] as number));
  }
  return { xs, zs, cumulative, length: n > 0 ? (cumulative[n - 1] as number) : 0 };
}

/** Point and travel heading at distance `s` along the path. */
export function pointAlong(path: RidePath, s: number, out: PathPoint): PathPoint {
  const n = path.xs.length;
  if (n === 1) {
    out.x = path.xs[0] as number;
    out.z = path.zs[0] as number;
    return out;
  }
  const along = clamp(s, 0, path.length);
  let lo = 1;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((path.cumulative[mid] as number) < along) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const c0 = path.cumulative[i - 1] as number;
  const segment = Math.max(1e-6, (path.cumulative[i] as number) - c0);
  const t = clamp((along - c0) / segment, 0, 1);
  const x0 = path.xs[i - 1] as number;
  const z0 = path.zs[i - 1] as number;
  const x1 = path.xs[i] as number;
  const z1 = path.zs[i] as number;
  out.x = x0 + (x1 - x0) * t;
  out.z = z0 + (z1 - z0) * t;
  if (segment > 1e-4) out.heading = Math.atan2(z1 - z0, x1 - x0);
  return out;
}

/**
 * Share of the route covered (0–1) at game minute `now` for a trip from `departAt` to `arriveAt`. Speed ramps up over
 * the first 6 % and down over the last 6 % (continuous, monotonic); danfos add a stop-start shuffle that never runs
 * backwards and still arrives exactly on time.
 */
export function rideProgress(now: number, departAt: number, arriveAt: number, stopStart = false): number {
  const duration = arriveAt - departAt;
  if (duration <= 0) return 1;
  const p = clamp((now - departAt) / duration, 0, 1);
  const e = 0.06;
  const v = 1 / (1 - e);
  const eased = p < e ? (v * p * p) / (2 * e) : p > 1 - e ? 1 - (v * (1 - p) * (1 - p)) / (2 * e) : v * (p - e / 2);
  if (!stopStart) return eased;
  const wobble = Math.sin(p * Math.PI * 9) * 0.012 * Math.sin(p * Math.PI);
  return clamp(eased + wobble, 0, 1);
}
