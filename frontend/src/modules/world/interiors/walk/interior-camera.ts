import { Vector3, type PerspectiveCamera } from 'three';
import type { ColliderGrid } from '../../play/physics/collision';
import { angleDelta, clamp, damp, wrapAngle } from '../../play/physics/math';
import type { CameraSubject } from '../../play/camera/camera-rig';

/**
 * The close third-person camera for walking around a home. It works like the street camera (drag to orbit, pinch or
 * wheel to zoom, drifts behind you as you walk, pulls in when something tall is in the way) but stays on the open
 * side of the dollhouse cutaway — rooms have walls only at the back and on the left — so it never ends up behind a
 * wall. No allocations per frame.
 */

/**
 * Directions (angle on x/z, 0 = +x, π/2 = +z) the camera may sit in, seen from the player: the open right and front
 * sides of the room, with a little slack either way (the ray cast handles a wall that's close).
 */
export const OPEN_ARC: readonly [number, number] = [-0.4, Math.PI / 2 + 0.4];
/** Where the camera starts: front-right, like the dollhouse view. */
const HOME_OFFSET = Math.PI / 4 + 0.1;

const TUNING = {
  distance: 4.6,
  minDistance: 2.2,
  maxDistance: 8.5,
  pitch: 0.78,
  minPitch: 0.18,
  maxPitch: 1.25,
  targetHeight: 0.95,
  /** Yaw follow rate (1/s) while walking, after `hold` seconds without a manual look. */
  follow: 1.0,
  hold: 2.2,
} as const;

const LOOK_SPEED = 0.0062;
/** How far to the right of someone's front the camera frames them (1 = 45°). */
const FRONT_RIGHT = 0.8;
/** Camera pitch when framing someone at an activity. */
const FRAME_PITCH = 0.5;
const WALL_MARGIN = 0.22;
const MIN_CLEAR = 0.9;
const LIFT = 0.45;

/** Keep a camera yaw (forward = (cos yaw, sin yaw)) on the open side: its offset (−forward) inside `OPEN_ARC`. Pure. */
export function clampYaw(yaw: number): number {
  const offset = wrapAngle(yaw + Math.PI);
  const [lo, hi] = OPEN_ARC;
  if (offset >= lo && offset <= hi) return wrapAngle(yaw);
  const nearest = Math.abs(angleDelta(offset, lo)) < Math.abs(angleDelta(offset, hi)) ? lo : hi;
  return wrapAngle(nearest - Math.PI);
}

/** How portrait the screen is: 0 for landscape, 1 for a tall phone. */
const portraitness = (aspect: number): number => clamp((1.1 - aspect) / 0.65, 0, 1);

/** Vertical field of view for walking indoors: wider on a portrait phone so the room isn't a letterbox slit. Pure. */
export function walkFov(aspect: number): number {
  return 50 + portraitness(aspect) * 14;
}

/**
 * Distance multiplier for the screen's shape: a portrait phone (narrow horizontally even with `walkFov`) stands back
 * further so it sees about as much of the room around the player as a laptop. Pure.
 */
export function framingScale(aspect: number): number {
  return 1 + portraitness(aspect) * 0.45;
}

/**
 * Is a point (someone standing or sitting there) in the way of the camera's view of the player, or right in front of
 * the lens? Pure: positions as (x, y, z) triples; `y` is the point's chest height.
 */
export function blocksView(
  px: number,
  py: number,
  pz: number,
  cx: number,
  cy: number,
  cz: number,
  tx: number,
  ty: number,
  tz: number,
): boolean {
  const vx = tx - cx;
  const vy = ty - cy;
  const vz = tz - cz;
  const wx = px - cx;
  const wy = py - cy;
  const wz = pz - cz;
  if (Math.hypot(wx, wy, wz) < 1.2) return true;
  const length2 = vx * vx + vy * vy + vz * vz;
  if (length2 < 1e-6) return false;
  const t = (wx * vx + wy * vy + wz * vz) / length2;
  if (t <= 0 || t >= 0.86) return false;
  // Chibi heads are big: anything within ~0.6 m of the sight line covers the player.
  return Math.hypot(wx - vx * t, wy - vy * t, wz - vz * t) < 0.62;
}

export class InteriorCamera {
  yaw = clampYaw(HOME_OFFSET - Math.PI);
  pitch: number = TUNING.pitch;
  /** Wanted distance (zoom); the actual distance shrinks when something blocks the view. */
  distance: number = TUNING.distance;
  private actual: number = TUNING.distance;
  private lift = 0;
  private readonly target = new Vector3();
  private readonly look = new Vector3();
  private initialised = false;
  /** The walk field of view has been applied once (later changes, e.g. rotating the phone, ease in). */
  private fovReady = false;
  /** A yaw and pitch to ease towards (framing someone who just sat down), or null. */
  private goalYaw: number | null = null;
  private goalPitch: number = TUNING.pitch;

  /** Back to the default front-right view, snapped to the subject on the next update. */
  reset(): void {
    this.yaw = clampYaw(HOME_OFFSET - Math.PI);
    this.pitch = TUNING.pitch;
    this.lift = 0;
    this.initialised = false;
    this.goalYaw = null;
  }

  /** Re-target without easing (room changed). */
  snap(): void {
    this.initialised = false;
    this.goalYaw = null;
  }

  /**
   * Frame someone who has just settled into an activity from their front-right (their face and the hand holding a
   * glass, a phone, a spoon), as far as the open side of the room allows. `facing` is their rotation about +Y (0 faces
   * +Z). Eases in; any look input cancels it.
   */
  frameFront(facing: number): void {
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    // Their right hand: (-fz, fx). The camera sits out along front + right, looking back at them.
    const dx = fx - fz * FRONT_RIGHT;
    const dz = fz + fx * FRONT_RIGHT;
    this.goalYaw = clampYaw(Math.atan2(-dz, -dx));
    // A lower angle than walking about, so the face shows under the hair.
    this.goalPitch = Math.min(this.pitch, FRAME_PITCH);
  }

  applyInput(lookX: number, lookY: number, zoom: number): void {
    this.yaw = clampYaw(this.yaw + lookX * LOOK_SPEED);
    this.pitch = clamp(this.pitch + lookY * LOOK_SPEED, TUNING.minPitch, TUNING.maxPitch);
    if (zoom !== 0)
      this.distance = clamp(this.distance * Math.exp(zoom * 0.12), TUNING.minDistance, TUNING.maxDistance);
  }

  /** Forward on the ground (camera-relative walking): writes (x, z). */
  forward(out: { x: number; z: number }): void {
    out.x = Math.cos(this.yaw);
    out.z = Math.sin(this.yaw);
  }

  private clearAt(colliders: ColliderGrid, pitch: number, reach: number): number {
    const c = Math.cos(pitch);
    return colliders.raycast(
      this.target.x,
      this.target.y,
      this.target.z,
      -Math.cos(this.yaw) * c,
      Math.sin(pitch),
      -Math.sin(this.yaw) * c,
      reach,
    );
  }

  update(
    camera: PerspectiveCamera,
    subject: CameraSubject,
    dt: number,
    sinceLook: number,
    colliders: ColliderGrid,
    aspect: number,
  ): void {
    if (this.goalYaw !== null) {
      if (sinceLook < 0.3 || subject.speed > 0.5) this.goalYaw = null;
      else {
        const delta = angleDelta(this.yaw, this.goalYaw);
        const k = damp(2.2, dt);
        this.yaw = clampYaw(this.yaw + delta * k);
        this.pitch += (this.goalPitch - this.pitch) * k;
        if (Math.abs(delta) < 0.01 && Math.abs(this.goalPitch - this.pitch) < 0.01) this.goalYaw = null;
      }
    }
    // Drift behind the walker (within the open arc) unless the player has just looked around.
    if (sinceLook > TUNING.hold && subject.speed > 0.5) {
      const goal = clampYaw(subject.heading);
      const rate = TUNING.follow * clamp(subject.speed / 2, 0.3, 1);
      this.yaw = clampYaw(this.yaw + angleDelta(this.yaw, goal) * damp(rate, dt));
    }

    const ty = subject.y + TUNING.targetHeight;
    if (!this.initialised) {
      this.target.set(subject.x, ty, subject.z);
      this.initialised = true;
      this.actual = this.distance * framingScale(aspect);
    } else {
      const k = damp(14, dt);
      this.target.x += (subject.x - this.target.x) * k;
      this.target.y += (ty - this.target.y) * damp(6, dt);
      this.target.z += (subject.z - this.target.z) * k;
    }

    const distance = this.distance * framingScale(aspect);
    const reach = distance + WALL_MARGIN;
    const base = this.clearAt(colliders, this.pitch, reach);
    let liftGoal = 0;
    if (base < distance * 0.65) {
      const lifted = Math.min(TUNING.maxPitch, this.pitch + LIFT);
      if (this.clearAt(colliders, lifted, reach) > base + 0.5) liftGoal = lifted - this.pitch;
    }
    this.lift += (liftGoal - this.lift) * damp(liftGoal > this.lift ? 6 : 2, dt);
    const pitch = this.pitch + this.lift;
    const cosPitch = Math.cos(pitch);
    const dx = -Math.cos(this.yaw) * cosPitch;
    const dy = Math.sin(pitch);
    const dz = -Math.sin(this.yaw) * cosPitch;
    const hit =
      this.lift > 0.01
        ? colliders.raycast(this.target.x, this.target.y, this.target.z, dx, dy, dz, reach)
        : base;
    const wanted = Math.max(MIN_CLEAR, Math.min(distance, hit - WALL_MARGIN));
    this.actual += (wanted - this.actual) * damp(wanted < this.actual ? 25 : 3, dt);

    camera.position.set(
      this.target.x + dx * this.actual,
      Math.max(0.4, this.target.y + dy * this.actual),
      this.target.z + dz * this.actual,
    );
    this.look.set(this.target.x, this.target.y - 0.12, this.target.z);
    camera.lookAt(this.look);
    const fov = walkFov(aspect);
    const fovChanged = Math.abs(camera.fov - fov) > 0.01;
    if (fovChanged) camera.fov = this.fovReady ? camera.fov + (fov - camera.fov) * damp(5, dt) : fov;
    this.fovReady = true;
    if (fovChanged || camera.near > 0.1 || camera.far < 60) {
      camera.near = Math.min(camera.near, 0.1);
      camera.far = Math.max(camera.far, 60);
      camera.updateProjectionMatrix();
    }
  }

  /** The point the camera looks at (smoothed player position at chest height). */
  get focus(): Vector3 {
    return this.target;
  }

  /** Small helper for tests and the dev hook: current camera offset angle (from the player). */
  get offsetAngle(): number {
    return wrapAngle(this.yaw + Math.PI);
  }
}
