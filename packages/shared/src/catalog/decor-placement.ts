/**
 * Where decor may go. Pure geometry shared by the server (which validates every placement) and the client (which uses
 * the same check to colour the ghost green or red, then adds the 3D room's furniture on top). Room space: centred on
 * the origin, back wall at -z, left wall at -x. Rotation is degrees about +Y (three.js convention: 0 faces +Z, the
 * piece's front); floor pieces turn in steps of `DECOR_ROT_STEP`.
 */
import { DECOR_DOOR_HEIGHT, type DecorRoom } from './decor-rooms.js';
import { findDecorItem, type DecorItem } from './decor.js';

export type DecorWall = 'back' | 'left';

export const DECOR_ROT_STEP = 15;
/** Floor pieces keep this clear in front of a door (m). */
export const DECOR_DOOR_CLEARANCE = 0.9;
/** Overlaps shallower than this (m) are touching, not overlapping. */
const TOUCH = 0.01;
/** A tabletop piece may overhang its surface by this much (m). */
const OVERHANG = 0.12;

export interface DecorPose {
  readonly x: number;
  readonly z: number;
  /** Floor pieces 0; wall pieces: height of the bottom edge; tabletop pieces: the surface they sit on. */
  readonly y: number;
  readonly rot: number;
  readonly wall: DecorWall | null;
  /** Tabletop pieces: the placed piece they sit on. */
  readonly onId: string | null;
}

/** A piece already in the room (its pose is canonical). */
export interface PlacedDecor {
  readonly id: string;
  readonly itemId: string;
  readonly pose: DecorPose;
}

export type PlacementVerdict =
  | { readonly ok: true; readonly pose: DecorPose }
  | { readonly ok: false; readonly code: PlacementCode; readonly reason: string };

export type PlacementCode =
  | 'BAD_POSE'
  | 'OUT_OF_ROOM'
  | 'BLOCKS_DOOR'
  | 'BLOCKS_STAIRS'
  | 'BLOCKS_WINDOW'
  | 'OVERLAP'
  | 'NO_SURFACE'
  | 'WRONG_PLACEMENT';

export interface Pt {
  readonly x: number;
  readonly z: number;
}

/** A w×d rectangle centred at (x, z) turned `rot` degrees about +Y. */
export interface OrientedRect {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly d: number;
  readonly rot: number;
}

const rad = (deg: number): number => (deg * Math.PI) / 180;
const round2 = (value: number): number => Math.round(value * 100) / 100;

export function normalizeRot(rot: number): number {
  return ((Math.round(rot) % 360) + 360) % 360;
}

/** The four corners, counter-clockwise from above. */
export function rectCorners(rect: OrientedRect): readonly Pt[] {
  const c = Math.cos(rad(rect.rot));
  const s = Math.sin(rad(rect.rot));
  const hw = rect.w / 2;
  const hd = rect.d / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ].map(([lx, lz]) => ({ x: rect.x + lx! * c + lz! * s, z: rect.z - lx! * s + lz! * c }));
}

/** Axis-aligned bounds of a rectangle once turned. */
export function rectBounds(rect: OrientedRect): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const corners = rectCorners(rect);
  return {
    minX: Math.min(...corners.map((p) => p.x)),
    maxX: Math.max(...corners.map((p) => p.x)),
    minZ: Math.min(...corners.map((p) => p.z)),
    maxZ: Math.max(...corners.map((p) => p.z)),
  };
}

/** Separating-axis test: do two convex polygons overlap by more than `margin` metres? */
export function polygonsOverlap(a: readonly Pt[], b: readonly Pt[], margin = TOUCH): boolean {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!;
      const q = polygon[(i + 1) % polygon.length]!;
      const nx = q.z - p.z;
      const nz = p.x - q.x;
      const length = Math.hypot(nx, nz) || 1;
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const point of a) {
        const dot = (point.x * nx + point.z * nz) / length;
        minA = Math.min(minA, dot);
        maxA = Math.max(maxA, dot);
      }
      for (const point of b) {
        const dot = (point.x * nx + point.z * nz) / length;
        minB = Math.min(minB, dot);
        maxB = Math.max(maxB, dot);
      }
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= margin) return false;
    }
  }
  return true;
}

export const rectsOverlap = (a: OrientedRect, b: OrientedRect, margin = TOUCH): boolean =>
  polygonsOverlap(rectCorners(a), rectCorners(b), margin);

/** Is point `p` inside `rect` grown by `tolerance`? */
export function pointInRect(p: Pt, rect: OrientedRect, tolerance = 0): boolean {
  const c = Math.cos(rad(rect.rot));
  const s = Math.sin(rad(rect.rot));
  const dx = p.x - rect.x;
  const dz = p.z - rect.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= rect.w / 2 + tolerance + 1e-9 && Math.abs(lz) <= rect.d / 2 + tolerance + 1e-9;
}

/** True for pieces you walk over (rugs): they may lie under furniture and across doorways. */
export const isFlatDecor = (item: DecorItem): boolean => item.placement === 'floor' && item.height <= 0.05;

/** Wall pose for a point `u` along a wall: on the wall line, facing into the room. */
export function wallPose(room: Pick<DecorRoom, 'width' | 'depth'>, wall: DecorWall, u: number, y: number): DecorPose {
  return wall === 'back'
    ? { x: round2(u), z: -room.depth / 2, y: round2(y), rot: 0, wall, onId: null }
    : { x: -room.width / 2, z: round2(u), y: round2(y), rot: 90, wall, onId: null };
}

/** Along-wall coordinate of a wall pose. */
export const wallCoordinate = (pose: DecorPose): number => (pose.wall === 'left' ? pose.z : pose.x);

/** The plan-view rectangle a piece occupies (wall pieces: the slab out from the wall). */
export function decorRect(room: Pick<DecorRoom, 'width' | 'depth'>, item: DecorItem, pose: DecorPose): OrientedRect {
  const [w, d] = item.footprint;
  if (pose.wall === 'back') return { x: pose.x, z: -room.depth / 2 + d / 2, w, d, rot: 0 };
  if (pose.wall === 'left') return { x: -room.width / 2 + d / 2, z: pose.z, w, d, rot: 90 };
  return { x: pose.x, z: pose.z, w, d, rot: pose.rot };
}

/** Bring a requested pose to its canonical form (rounded; wall pieces snapped onto their wall; floor pieces on the floor). */
export function canonicalPose(room: Pick<DecorRoom, 'width' | 'depth'>, item: DecorItem, pose: DecorPose): DecorPose {
  if (item.placement === 'wall') {
    const wall = pose.wall ?? 'back';
    return wallPose(room, wall, wall === 'left' ? pose.z : pose.x, pose.y);
  }
  return {
    x: round2(pose.x),
    z: round2(pose.z),
    y: round2(item.placement === 'floor' ? 0 : pose.y),
    rot: normalizeRot(pose.rot),
    wall: null,
    onId: item.placement === 'tabletop' ? pose.onId : null,
  };
}

/** Height of the top of a placed piece that others can sit on, or null when nothing sits on it. */
export function surfaceTop(item: DecorItem, pose: DecorPose): number | null {
  return item.surface === undefined ? null : pose.y + item.surface;
}

const fail = (code: PlacementCode, reason: string): PlacementVerdict => ({ ok: false, code, reason });

function doorKeepOut(room: DecorRoom): OrientedRect[] {
  return room.doors.map((door) =>
    door.wall === 'back'
      ? { x: door.at, z: -room.depth / 2 + DECOR_DOOR_CLEARANCE / 2, w: door.width + 0.1, d: DECOR_DOOR_CLEARANCE, rot: 0 }
      : { x: -room.width / 2 + DECOR_DOOR_CLEARANCE / 2, z: door.at, w: DECOR_DOOR_CLEARANCE, d: door.width + 0.1, rot: 0 },
  );
}

/**
 * Can this piece go here? `others` are the other pieces in the same room (not the piece itself). Returns the
 * canonical pose to store, or why not. The client adds the room's own furniture on top of this.
 */
export function checkDecorPlacement(
  room: DecorRoom,
  item: DecorItem,
  requested: DecorPose,
  others: readonly PlacedDecor[],
): PlacementVerdict {
  if (![requested.x, requested.z, requested.y, requested.rot].every(Number.isFinite)) return fail('BAD_POSE', 'That spot doesn’t make sense.');
  if (item.placement !== 'wall' && requested.wall) return fail('WRONG_PLACEMENT', `${item.name} doesn’t hang on a wall.`);
  if (item.placement === 'wall' && requested.wall !== 'back' && requested.wall !== 'left') return fail('WRONG_PLACEMENT', `${item.name} hangs on a wall.`);
  if (item.placement !== 'wall' && normalizeRot(requested.rot) % DECOR_ROT_STEP !== 0) return fail('BAD_POSE', 'Turn it in steps of 15 degrees.');
  const pose = canonicalPose(room, item, requested);
  const rect = decorRect(room, item, pose);

  if (item.placement === 'wall') return checkWall(room, item, pose, others);
  if (item.placement === 'tabletop') return checkTabletop(item, pose, rect, others, room);

  // Floor pieces: inside the room, clear of doors and stairs, not through other pieces.
  const corners = rectCorners(rect);
  // A centimetre of slack: positions are rounded to the centimetre, which can nudge a flush piece past the wall.
  const halfW = room.width / 2 + TOUCH;
  const halfD = room.depth / 2 + TOUCH;
  if (corners.some((p) => Math.abs(p.x) > halfW || Math.abs(p.z) > halfD)) return fail('OUT_OF_ROOM', 'That would poke through the wall.');
  for (const keep of room.keepOut) {
    const block: OrientedRect = { x: (keep.minX + keep.maxX) / 2, z: (keep.minZ + keep.maxZ) / 2, w: keep.maxX - keep.minX, d: keep.maxZ - keep.minZ, rot: 0 };
    if (rectsOverlap(rect, block)) return fail('BLOCKS_STAIRS', 'That’s in front of the stairs.');
  }
  const flat = isFlatDecor(item);
  if (!flat && doorKeepOut(room).some((door) => rectsOverlap(rect, door))) return fail('BLOCKS_DOOR', 'That would block the door.');
  for (const other of others) {
    const otherItem = findDecorItem(other.itemId);
    if (!otherItem || other.pose.onId) continue;
    if (otherItem.placement === 'wall') {
      if (hangsOver(room, otherItem, other.pose, rect, item.height)) return fail('OVERLAP', `That’s in the way of the ${otherItem.name.toLowerCase()}.`);
      continue;
    }
    // Rugs lie under other things; anything else needs its own floor.
    if (flat !== isFlatDecor(otherItem)) continue;
    if (rectsOverlap(rect, decorRect(room, otherItem, other.pose))) return fail('OVERLAP', `That overlaps the ${otherItem.name.toLowerCase()}.`);
  }
  return { ok: true, pose };
}

/** Does a wall piece hang where a floor piece (plan `rect`, `height` tall) stands? */
function hangsOver(room: DecorRoom, wallItem: DecorItem, wallPose_: DecorPose, rect: OrientedRect, height: number): boolean {
  if (wallPose_.y >= height) return false;
  return rectsOverlap(decorRect(room, wallItem, wallPose_), rect);
}

function checkWall(room: DecorRoom, item: DecorItem, pose: DecorPose, others: readonly PlacedDecor[]): PlacementVerdict {
  const wall = pose.wall!;
  const length = wall === 'back' ? room.width : room.depth;
  const u = wallCoordinate(pose);
  const [w] = item.footprint;
  const lo = u - w / 2;
  const hi = u + w / 2;
  if (lo < -length / 2 + 0.05 || hi > length / 2 - 0.05) return fail('OUT_OF_ROOM', 'That doesn’t fit on this stretch of wall.');
  const top = pose.y + item.height;
  if (pose.y < 0.05 || top > room.height - 0.05) return fail('OUT_OF_ROOM', 'Too high or too low for this wall.');
  for (const door of room.doors) {
    if (door.wall === wall && lo < door.at + door.width / 2 + 0.05 && hi > door.at - door.width / 2 - 0.05 && pose.y < DECOR_DOOR_HEIGHT) return fail('BLOCKS_DOOR', 'That’s in the doorway.');
  }
  for (const window of room.windows) {
    if (window.wall === wall && lo < window.at + window.width / 2 && hi > window.at - window.width / 2 && pose.y < window.sill + window.height && top > window.sill) return fail('BLOCKS_WINDOW', 'That would cover the window.');
  }
  for (const other of others) {
    const otherItem = findDecorItem(other.itemId);
    if (!otherItem || other.pose.onId) continue;
    if (otherItem.placement === 'wall') {
      if (other.pose.wall !== wall) continue;
      const [ow] = otherItem.footprint;
      const olo = wallCoordinate(other.pose) - ow / 2;
      const ohi = wallCoordinate(other.pose) + ow / 2;
      if (lo < ohi - TOUCH && hi > olo + TOUCH && pose.y < other.pose.y + otherItem.height - TOUCH && top > other.pose.y + TOUCH)
        return fail('OVERLAP', `That overlaps the ${otherItem.name.toLowerCase()}.`);
    } else if (!isFlatDecor(otherItem) && hangsOver(room, item, pose, decorRect(room, otherItem, other.pose), otherItem.height)) {
      return fail('OVERLAP', `That’s behind the ${otherItem.name.toLowerCase()}.`);
    }
  }
  return { ok: true, pose };
}

function checkTabletop(item: DecorItem, pose: DecorPose, rect: OrientedRect, others: readonly PlacedDecor[], room: DecorRoom): PlacementVerdict {
  const parent = others.find((other) => other.id === pose.onId);
  const parentItem = parent ? findDecorItem(parent.itemId) : undefined;
  if (!parent || !parentItem || parent.pose.onId || parentItem.surface === undefined || parentItem.placement === 'tabletop')
    return fail('NO_SURFACE', `${item.name} needs a table, shelf or bed to sit on.`);
  const surface = decorRect(room, parentItem, parent.pose);
  if (!rectCorners(rect).every((corner) => pointInRect(corner, surface, OVERHANG))) return fail('NO_SURFACE', 'That’s hanging off the edge.');
  const y = round2(surfaceTop(parentItem, parent.pose)!);
  const placed: DecorPose = { ...pose, y };
  for (const other of others) {
    if (other.pose.onId !== pose.onId) continue;
    const otherItem = findDecorItem(other.itemId);
    if (otherItem && rectsOverlap(rect, decorRect(room, otherItem, other.pose))) return fail('OVERLAP', `That overlaps the ${otherItem.name.toLowerCase()}.`);
  }
  return { ok: true, pose: placed };
}

/** The pose part of a stored/sent spot. */
export const decorPoseOf = (spot: {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rot: number;
  readonly wall: DecorWall | null;
  readonly onId: string | null;
}): DecorPose => ({ x: spot.x, z: spot.z, y: spot.y, rot: spot.rot, wall: spot.wall, onId: spot.onId });
