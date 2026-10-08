/** Small allocation-free numeric helpers for per-frame code. */

export const TAU = Math.PI * 2;

export const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Wrap an angle to (-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}

/** Signed shortest difference `to - from` in (-π, π]. */
export const angleDelta = (from: number, to: number): number => wrapAngle(to - from);

/** Frame-rate independent exponential approach factor for a rate (1/s). */
export const damp = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** Exponentially approach an angle along the shortest arc. */
export const dampAngle = (from: number, to: number, rate: number, dt: number): number => wrapAngle(from + angleDelta(from, to) * damp(rate, dt));

/** Move `value` towards `target` by at most `step`. */
export function approach(value: number, target: number, step: number): number {
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

/** Heading (shared convention: direction (cos h, sin h) on x/z) → three.js `rotation.y` for a model whose front is +z. */
export const yawFromHeading = (heading: number): number => Math.PI / 2 - heading;
