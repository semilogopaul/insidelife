/** A point on the ground plane, in world metres (+x east, +z south). */
export interface WorldPoint {
  readonly x: number;
  readonly z: number;
}

/**
 * Headings are radians on the ground plane: a heading `h` points along `(cos h, sin h)` in `(x, z)`.
 * East = 0, south = π/2, west = π, north = -π/2.
 */
export interface Entrance {
  /** Where the door trigger is (on the pavement in front of the door). */
  readonly position: WorldPoint;
  /** Radians; the direction you face when walking out of the door (towards the road). */
  readonly heading: number;
  /** Where your car is parked when you come out (kerbside, facing the traffic direction). */
  readonly parking: WorldPoint & { readonly heading: number };
}
