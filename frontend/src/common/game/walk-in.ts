/**
 * Walking into a door enters (or leaves) it, exactly as the Enter button would. Pure: the street and the interiors
 * feed it a door key and whether the player is pushing towards it, once per tick.
 */

/** Metres from a street door within which pushing towards it counts. */
export const WALK_IN_RADIUS = 1.5;
/** Seconds of pushing into the door before it opens. */
export const WALK_IN_DWELL = 0.4;
/** Seconds after a trigger during which nothing triggers (the door must also be walked away from). */
export const WALK_IN_COOLDOWN = 1.5;
/** Slowest ground speed (m/s) that counts as walking into something. */
export const WALK_IN_MIN_SPEED = 0.5;

/** True when moving (vx, vz) is heading at the door (d = vector from the player to it), within about 60 degrees. */
export function isHeadingToward(vx: number, vz: number, dx: number, dz: number): boolean {
  const speed = Math.hypot(vx, vz);
  const distance = Math.hypot(dx, dz);
  if (speed < WALK_IN_MIN_SPEED) return false;
  if (distance < 1e-6) return true;
  return (vx * dx + vz * dz) / (speed * distance) >= 0.5;
}

export class WalkInGate {
  private dwell = 0;
  private cooldown = 0;
  private blocked: string | null = null;
  private started = false;

  /**
   * `key` is the door the player is at (null when none is in reach); `pushing` is whether they are moving towards it.
   * Returns true once, when the walk-in completes. A door you start beside, or just used, stays inert until you have
   * stepped away from it.
   */
  update(dt: number, key: string | null, pushing: boolean): boolean {
    if (!this.started) {
      this.started = true;
      this.blocked = key;
    }
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      this.dwell = 0;
      if (key !== null) this.blocked = key;
      return false;
    }
    if (key !== this.blocked) this.blocked = null;
    if (key === null || key === this.blocked) {
      this.dwell = 0;
      return false;
    }
    if (!pushing) {
      this.dwell = Math.max(0, this.dwell - dt);
      return false;
    }
    this.dwell += dt;
    if (this.dwell < WALK_IN_DWELL) return false;
    this.dwell = 0;
    this.blocked = key;
    this.cooldown = WALK_IN_COOLDOWN;
    return true;
  }
}
