import type { AircraftClass, AircraftLivery } from '../contract';
import { AIRCRAFT_SPECS, doorPoint } from '../model/aircraft-spec';

/**
 * Where the planes stand on the General Aviation Terminal's apron (pure, so it is testable and the walker's colliders
 * and the 3D scene agree). The room is the airside template: hangars along the back, the terminal door on the left.
 * Your own stand is fixed and reserved for the biggest class; other players' planes (friends first) are shelf-packed on
 * the right by footprint so they never overlap, at most `MAX_OTHERS` of them; the rest are "in a hangar".
 */

/** Airside room, metres. Hangars fill z from -15 to -10.6; the terminal door is on the left wall. */
export const AIRSIDE_ROOM = { width: 46, depth: 30, height: 7 } as const;
/** Planes are shown at this fraction of real size so a whole apron fits in a walkable room. */
export const APRON_SCALE = 0.34;
export const MAX_OTHERS = 6;
const MARGIN = 1.1;

/** Free ground in front of the hangars. */
export const APRON_FREE: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number } = { minX: -22.4, maxX: 22.4, minZ: -9.6, maxZ: 14.4 };
/** The biggest class, scaled: the reserve for your own stand. */
const OWN_RESERVE = { w: AIRCRAFT_SPECS['airliner-jet'].span * APRON_SCALE, d: AIRCRAFT_SPECS['airliner-jet'].length * APRON_SCALE };
/** Centre of your stand (planes park nose to the hangars). */
export const OWN_STAND = { x: -9.8, z: 3.2 } as const;
/** Others start to the right of your reserve. */
const OTHERS_MIN_X = OWN_STAND.x + OWN_RESERVE.w / 2 + 1.0;

export interface ApronPlane {
  /** Anything stable (a character id, an aircraft id) to key the planes by. */
  readonly id: string;
  readonly cls: AircraftClass;
  readonly livery: AircraftLivery;
}

export interface PlacedPlane extends ApronPlane {
  /** Room-space position of the point under the middle of the fuselage, and the heading (degrees about +Y, 180 = nose to the hangars). */
  readonly x: number;
  readonly z: number;
  readonly rot: number;
  /** Footprint (x extent, z extent) at apron scale. */
  readonly w: number;
  readonly d: number;
  /** The left-side door on the ground, room space. */
  readonly door: readonly [x: number, z: number];
}

export interface ApronLayout {
  readonly own: PlacedPlane | null;
  readonly others: readonly PlacedPlane[];
  /** Planes of other players that did not fit on the apron ("in a hangar"). */
  readonly hangared: number;
}

const HEADING = 180;

function place(plane: ApronPlane, x: number, z: number): PlacedPlane {
  const spec = AIRCRAFT_SPECS[plane.cls];
  const [dx, , dz] = doorPoint(spec);
  // Heading 180: model +x → room -x, model +z → room -z.
  return { ...plane, x, z, rot: HEADING, w: spec.span * APRON_SCALE, d: spec.length * APRON_SCALE, door: [x - dx * APRON_SCALE, z - dz * APRON_SCALE] };
}

/** Lays out the apron: your plane (if any) on your stand, then up to `MAX_OTHERS` of `others`, in the order given. */
export function layoutApron(own: ApronPlane | null, others: readonly ApronPlane[]): ApronLayout {
  const placedOwn = own ? place(own, OWN_STAND.x, OWN_STAND.z) : null;
  const placed: PlacedPlane[] = [];
  // Shelf packing from the hangars towards the terminal-facing front: rows of planes left to right.
  let rowZ = APRON_FREE.minZ;
  let rowDepth = 0;
  let cursorX = OTHERS_MIN_X;
  for (const plane of others) {
    if (placed.length >= MAX_OTHERS) break;
    const spec = AIRCRAFT_SPECS[plane.cls];
    const w = spec.span * APRON_SCALE;
    const d = spec.length * APRON_SCALE;
    let x0 = cursorX;
    let z0 = rowZ;
    let depth = rowDepth;
    if (x0 + w > APRON_FREE.maxX) {
      // New row.
      x0 = OTHERS_MIN_X;
      z0 = rowZ + rowDepth + (rowDepth > 0 ? MARGIN : 0);
      depth = 0;
    }
    if (x0 + w > APRON_FREE.maxX || z0 + d > APRON_FREE.maxZ) continue;
    placed.push(place(plane, x0 + w / 2, z0 + d / 2));
    cursorX = x0 + w + MARGIN;
    rowZ = z0;
    rowDepth = Math.max(depth, d);
  }
  return { own: placedOwn, others: placed, hangared: others.length - placed.length };
}

/** Axis-aligned rectangle of a placed plane. */
export function planeRect(plane: PlacedPlane): { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number } {
  return { minX: plane.x - plane.w / 2, maxX: plane.x + plane.w / 2, minZ: plane.z - plane.d / 2, maxZ: plane.z + plane.d / 2 };
}

/** How close to the door of your plane counts as boarding it (metres). */
export const BOARDING_RADIUS = 1.1;

/** Standing at the plane's door. */
export function atDoor(plane: PlacedPlane, x: number, z: number): boolean {
  return Math.hypot(x - plane.door[0], z - plane.door[1]) <= BOARDING_RADIUS;
}

/** Solid, invisible boxes for the walker: the fuselage and the wings' root, not the empty wing tips you can walk under. */
export function planeColliders(plane: PlacedPlane): ReadonlyArray<{ readonly at: readonly [number, number]; readonly size: readonly [number, number, number] }> {
  const spec = AIRCRAFT_SPECS[plane.cls];
  const body = { at: [plane.x, plane.z] as const, size: [spec.fuselage.w * APRON_SCALE * 1.5 + 0.4, 2, plane.d * 0.94] as const };
  const wing = { at: [plane.x, plane.z + (spec.wing.z * spec.length) * -APRON_SCALE] as const, size: [plane.w * 0.9, 2, spec.wing.rootChord * APRON_SCALE * 1.1] as const };
  return [body, wing];
}
