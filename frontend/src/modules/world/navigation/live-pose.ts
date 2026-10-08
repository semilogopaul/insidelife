/**
 * The player's exact pose, updated every frame by whoever moves the player (the play layer; until it exists, the
 * review camera's focus). Navigation, the minimap, shadows and LOD read it without React. `world-store.setPose`
 * remains the low-rate (≈5 Hz) copy for the HUD and the server.
 */
export interface LivePose {
  x: number;
  z: number;
  /** Heading in the shared convention: direction (cos h, sin h) on x/z; east = 0, south = π/2. */
  heading: number;
  /** Metres per second (for ETAs). */
  speed: number;
  /** `performance.now()` of the last write; 0 = never written. */
  updatedAt: number;
}

export const livePose: LivePose = { x: 0, z: 0, heading: -Math.PI / 2, speed: 0, updatedAt: 0 };

export function publishLivePose(x: number, z: number, heading: number, speed: number): void {
  livePose.x = x;
  livePose.z = z;
  livePose.heading = heading;
  livePose.speed = speed;
  livePose.updatedAt = performance.now();
}

/** True while someone keeps writing the pose (tolerates very slow frames on weak devices). */
export function livePoseFresh(now = performance.now()): boolean {
  return livePose.updatedAt > 0 && now - livePose.updatedAt < 4000;
}
