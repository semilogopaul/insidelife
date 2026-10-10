import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';
import type { ColliderGrid } from '../physics/collision';
import { angleDelta, clamp, damp, wrapAngle } from '../physics/math';

/**
 * Third-person cameras. Walking: an orbit camera behind the player (drag to orbit, wheel/pinch to zoom) that drifts
 * back behind the player while they move. Driving: a chase camera with speed-based FOV that springs back behind the
 * car after you look around. Riding: a calmer, wider chase. All modes pull in when a building is between the camera
 * and the player. Mutates a three.js camera; no allocations per frame.
 */

export type CameraMode = 'walk' | 'drive' | 'ride';

interface ModeTuning {
  readonly distance: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly pitch: number;
  readonly targetHeight: number;
  /** How fast yaw follows the subject's heading (1/s) when the player isn't looking around. */
  readonly follow: number;
  /** Seconds after a manual look before auto-follow resumes. */
  readonly hold: number;
  readonly fov: number;
}

const TUNING: Readonly<Record<CameraMode, ModeTuning>> = {
  walk: { distance: 8, minDistance: 2.6, maxDistance: 18, pitch: 0.42, targetHeight: 1.55, follow: 1.6, hold: 1.6, fov: 52 },
  drive: { distance: 11, minDistance: 6, maxDistance: 22, pitch: 0.3, targetHeight: 1.7, follow: 4.2, hold: 1.4, fov: 55 },
  ride: { distance: 12.5, minDistance: 7, maxDistance: 24, pitch: 0.32, targetHeight: 1.8, follow: 2.4, hold: 2.2, fov: 54 },
};

const LOOK_SPEED = 0.0062;
const MIN_PITCH = -0.05;
const MAX_PITCH = 1.25;
/** Camera keeps this clear of walls (metres). */
const WALL_MARGIN = 0.45;
/** Extra pitch tried when a wall crowds the camera, and the closest the camera ever gets. */
const LIFT = 0.55;
const MIN_CLEAR = 1.6;
/**
 * Squeezed closer than MIN_CLEAR (a wall or a lightbox right behind you at a gate), the camera comes in to this rather
 * than sit inside the obstacle — looking down over your head (full lift), never through it.
 */
const NEAREST = 1.05;
/** Turns tried (radians) when the view behind is cramped and you're standing still: the camera swings to the clearest. */
const SWING_OFFSETS: readonly number[] = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8];

export interface CameraSubject {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** m/s (signed for cars: negative while reversing). */
  speed: number;
}

export class CameraRig {
  mode: CameraMode = 'walk';
  yaw = 0;
  pitch = TUNING.walk.pitch;
  /** Wanted distance (zoom); the actual distance shrinks when something blocks the view. */
  distance = TUNING.walk.distance;
  private actual = TUNING.walk.distance;
  private readonly target = new Vector3();
  private readonly look = new Vector3();
  private initialised = false;
  private fovKick = 0;
  private lift = 0;
  private clock = 0;
  shake = 0;

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    const tuning = TUNING[mode];
    this.distance = tuning.distance;
    this.pitch = tuning.pitch;
  }

  /** Snap behind a subject (spawn, mode switches); `yawOffset` turns the view (e.g. side-on when leaving a door). */
  snap(subject: CameraSubject, yawOffset = 0): void {
    this.yaw = wrapAngle(subject.heading + yawOffset);
    this.lift = 0;
    this.initialised = false;
  }

  /**
   * Snap for someone stepping out of a door with the building at their back: the clearest of side-on views along the
   * pavement (or straight behind if that happens to be open).
   */
  snapClear(subject: CameraSubject, colliders: ColliderGrid): void {
    const tuning = TUNING[this.mode];
    this.target.set(subject.x, subject.y + tuning.targetHeight, subject.z);
    let best = 0;
    let bestClear = -1;
    for (const offset of [0, Math.PI / 2, -Math.PI / 2]) {
      this.yaw = wrapAngle(subject.heading + offset);
      const clear = this.clearAt(colliders, tuning.pitch, tuning.distance) - (offset === 0 ? 0 : 0.5);
      if (clear > bestClear + 0.01) {
        bestClear = clear;
        best = offset;
      }
    }
    this.snap(subject, best);
  }

  /** Look and zoom from input (pixels / zoom steps). */
  applyInput(lookX: number, lookY: number, zoom: number): void {
    const tuning = TUNING[this.mode];
    this.yaw = wrapAngle(this.yaw + lookX * LOOK_SPEED);
    this.pitch = clamp(this.pitch + lookY * LOOK_SPEED, MIN_PITCH, MAX_PITCH);
    if (zoom !== 0) this.distance = clamp(this.distance * Math.exp(zoom * 0.12), tuning.minDistance, tuning.maxDistance);
  }

  /** Forward direction on the ground (for camera-relative walking): writes (x, z). */
  forward(out: { x: number; z: number }): void {
    out.x = Math.cos(this.yaw);
    out.z = Math.sin(this.yaw);
  }

  /** Free distance behind the target at a pitch. */
  private clearAt(colliders: ColliderGrid, pitch: number, reach: number): number {
    const c = Math.cos(pitch);
    return colliders.raycast(this.target.x, this.target.y, this.target.z, -Math.cos(this.yaw) * c, Math.sin(pitch), -Math.sin(this.yaw) * c, reach);
  }

  update(camera: PerspectiveCamera, subject: CameraSubject, dt: number, sinceLook: number, colliders: ColliderGrid, reducedMotion: boolean): void {
    const tuning = TUNING[this.mode];
    // Follow the subject's heading unless the player has just looked around.
    const moving = Math.abs(subject.speed) > (this.mode === 'walk' ? 0.6 : 1.2);
    if (sinceLook > tuning.hold && (moving || this.mode !== 'walk')) {
      const reversing = this.mode === 'drive' && subject.speed < -1;
      const goal = reversing ? this.yaw : subject.heading;
      const rate = this.mode === 'walk' ? tuning.follow * clamp(Math.abs(subject.speed) / 3, 0.3, 1.2) : tuning.follow;
      this.yaw = wrapAngle(this.yaw + angleDelta(this.yaw, goal) * damp(rate, dt));
      if (this.mode !== 'walk') this.pitch += (tuning.pitch - this.pitch) * damp(1.5, dt);
    }

    // Smoothed target (keeps tiny physics jitters off the screen).
    const tx = subject.x;
    const ty = subject.y + tuning.targetHeight;
    const tz = subject.z;
    if (!this.initialised) {
      this.target.set(tx, ty, tz);
      this.actual = this.distance;
      this.initialised = true;
    } else {
      const k = damp(this.mode === 'walk' ? 16 : 22, dt);
      this.target.x += (tx - this.target.x) * k;
      this.target.y += (ty - this.target.y) * damp(8, dt);
      this.target.z += (tz - this.target.z) * k;
    }

    // Wall pull-in. When a wall is close behind, try lifting the camera (looking down over the player) and keep
    // whichever view is less cramped; the lift eases in and out.
    const reach = this.distance + WALL_MARGIN;
    let base = this.clearAt(colliders, this.pitch, reach);
    // Standing still with something right behind (stepping out of a gate between a wall and a board): swing round to
    // the clearest view, unless the player is turning the camera themselves.
    if (this.mode === 'walk' && !moving && sinceLook > tuning.hold && base < this.distance * 0.55) {
      const from = this.yaw;
      let bestYaw = from;
      let bestClear = base;
      for (const offset of SWING_OFFSETS) {
        this.yaw = wrapAngle(from + offset);
        const clear = this.clearAt(colliders, this.pitch, reach);
        if (clear > bestClear + 0.75) {
          bestClear = clear;
          bestYaw = this.yaw;
        }
      }
      this.yaw = wrapAngle(from + angleDelta(from, bestYaw) * damp(2.5, dt));
      if (this.yaw !== from) base = this.clearAt(colliders, this.pitch, reach);
    }
    let liftGoal = 0;
    if (base - WALL_MARGIN < MIN_CLEAR) {
      // Pinned: look down over the player's head rather than through a wall or into the back of their head.
      liftGoal = Math.min(MAX_PITCH, this.pitch + LIFT * 1.5) - this.pitch;
    } else if (base < this.distance * 0.7) {
      const lifted = Math.min(MAX_PITCH, this.pitch + LIFT);
      if (this.clearAt(colliders, lifted, reach) > base + 1) liftGoal = lifted - this.pitch;
    }
    this.lift += (liftGoal - this.lift) * damp(liftGoal > this.lift ? 6 : 2, dt);
    const pitch = this.pitch + this.lift;
    const cosPitch = Math.cos(pitch);
    const dx = -Math.cos(this.yaw) * cosPitch;
    const dy = Math.sin(pitch);
    const dz = -Math.sin(this.yaw) * cosPitch;
    const hit = this.lift > 0.01 ? colliders.raycast(this.target.x, this.target.y, this.target.z, dx, dy, dz, reach) : base;
    const wanted = Math.max(NEAREST, Math.min(this.distance, hit - WALL_MARGIN));
    this.actual += (wanted - this.actual) * damp(wanted < this.actual ? 30 : 3.5, dt);

    camera.position.set(this.target.x + dx * this.actual, Math.max(0.7, this.target.y + dy * this.actual), this.target.z + dz * this.actual);
    this.clock += dt;
    if (this.shake > 0 && !reducedMotion) {
      camera.position.x += Math.sin(this.clock * 61) * this.shake * 0.5;
      camera.position.y += Math.sin(this.clock * 47 + 1.3) * this.shake * 0.5;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    } else this.shake = 0;

    // Look slightly ahead of a moving car.
    const lead = this.mode === 'walk' ? 0 : clamp(subject.speed * 0.18, -1, 3);
    this.look.set(this.target.x + Math.cos(subject.heading) * lead, this.target.y - (this.mode === 'walk' ? 0.1 : 0.3), this.target.z + Math.sin(subject.heading) * lead);
    camera.lookAt(this.look);

    // Speed-based FOV.
    const kick = this.mode === 'drive' ? clamp(Math.abs(subject.speed) * (reducedMotion ? 0.25 : 0.75), 0, reducedMotion ? 4 : 13) : 0;
    this.fovKick += (kick - this.fovKick) * damp(3, dt);
    const fov = tuning.fov + this.fovKick;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = MathUtils.lerp(camera.fov, fov, damp(6, dt));
      camera.updateProjectionMatrix();
    }
  }
}
