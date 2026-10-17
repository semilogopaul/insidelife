import {
  DECOR_ROT_STEP,
  checkDecorPlacement,
  decorRect,
  findDecorItem,
  isFlatDecor,
  normalizeRot,
  pointInRect,
  rectBounds,
  rectsOverlap,
  wallPose,
  type DecorItem,
  type DecorPose,
  type DecorRoom,
  type DecorWall,
  type OrientedRect,
  type PlacedDecor,
  type PlacementVerdict,
} from '@insidelife/shared';
import type { Fixture, WallMount } from './fixtures';

/** Where the pointer is: on the floor, on a wall, or on top of a surface piece (a table, a bed, a shelf). */
export type DropTarget =
  | { readonly kind: 'floor'; readonly x: number; readonly z: number }
  | { readonly kind: 'wall'; readonly wall: DecorWall; /** Along the wall. */ readonly u: number; /** Height of the pointer. */ readonly y: number }
  | { readonly kind: 'surface'; readonly parentId: string; readonly x: number; readonly z: number };

export interface DropContext {
  readonly room: DecorRoom;
  readonly item: DecorItem;
  /** The other pieces in the room (not the one being moved). */
  readonly others: readonly PlacedDecor[];
  readonly fixtures: readonly Fixture[];
  readonly mounts: readonly WallMount[];
  /** Rotation the piece is being put down with (degrees). */
  readonly rot: number;
  /** Turn oriented pieces to face away from the wall they're snapped to. */
  readonly autoFace: boolean;
  /** The server's rule for this place when it isn't a home's (a cabin adds what's secured for flight, ceilings…). */
  readonly check?: (room: DecorRoom, item: DecorItem, pose: DecorPose, others: readonly PlacedDecor[]) => PlacementVerdict;
}

const verdictOf = (context: DropContext, pose: DecorPose): PlacementVerdict =>
  (context.check ?? checkDecorPlacement)(context.room, context.item, pose, context.others);

export interface Drop {
  readonly pose: DecorPose;
  readonly ok: boolean;
  /** Why not, in plain words. */
  readonly reason: string | null;
}

/** Pieces snap to a 5 cm grid, and flush to walls and neighbours within this reach (m). */
export const GRID = 0.05;
export const SNAP_REACH = 0.18;

const snapGrid = (value: number): number => Math.round(value / GRID) * GRID;
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Pieces with a front (anything not square or round-ish) turn their back to the wall they're pushed against. */
const hasFront = (item: DecorItem): boolean => !isFlatDecor(item) && Math.abs(item.footprint[0] - item.footprint[1]) > 0.08;

/** Half extents of a footprint once turned. */
function halfExtents(item: DecorItem, rot: number): { ex: number; ez: number } {
  const bounds = rectBounds({ x: 0, z: 0, w: item.footprint[0], d: item.footprint[1], rot });
  return { ex: bounds.maxX, ez: bounds.maxZ };
}

function snapAxis(value: number, min: number, max: number): number {
  if (value - min < SNAP_REACH) return min;
  if (max - value < SNAP_REACH) return max;
  return snapGrid(value);
}

/** Edge-to-edge snapping to axis-aligned neighbours when both are square-on. */
function snapToNeighbours(x: number, z: number, ex: number, ez: number, rects: readonly OrientedRect[]): { x: number; z: number } {
  let bestX = x;
  let bestZ = z;
  let dx = SNAP_REACH;
  let dz = SNAP_REACH;
  for (const rect of rects) {
    const b = rectBounds(rect);
    const overlapZ = z + ez > b.minZ - 0.05 && z - ez < b.maxZ + 0.05;
    const overlapX = x + ex > b.minX - 0.05 && x - ex < b.maxX + 0.05;
    if (overlapZ) {
      for (const candidate of [b.minX - ex, b.maxX + ex]) if (Math.abs(candidate - x) < dx) { dx = Math.abs(candidate - x); bestX = candidate; }
    }
    if (overlapX) {
      for (const candidate of [b.minZ - ez, b.maxZ + ez]) if (Math.abs(candidate - z) < dz) { dz = Math.abs(candidate - z); bestZ = candidate; }
    }
  }
  return { x: bestX, z: bestZ };
}

/** Turn to face away from a nearby wall: back (0), left (90), front (180), right (270). */
function facingWall(room: DecorRoom, x: number, z: number, ex: number, ez: number): number | null {
  const gaps: ReadonlyArray<readonly [number, number]> = [
    [z - ez + room.depth / 2, 0],
    [x - ex + room.width / 2, 90],
    [room.depth / 2 - (z + ez), 180],
    [room.width / 2 - (x + ex), 270],
  ];
  let best: readonly [number, number] | null = null;
  for (const gap of gaps) if (gap[0] < SNAP_REACH && (best === null || gap[0] < best[0])) best = gap;
  return best ? best[1] : null;
}

function fail(pose: DecorPose, reason: string): Drop {
  return { pose, ok: false, reason };
}

/** Does a floor rectangle run into the room's own furniture? */
function hitsFixture(rect: OrientedRect, fixtures: readonly Fixture[]): boolean {
  return fixtures.some((fixture) => rectsOverlap(rect, fixture.rect));
}

/**
 * Turn a pointer position into a pose: snapped (grid, walls, neighbours), turned to face the room, and checked with
 * the server's rules plus the room's own furniture and wall fittings. Pure; the ghost shows `ok` and `reason`.
 */
export function resolveDrop(context: DropContext, target: DropTarget): Drop {
  const { room, item, others, fixtures } = context;
  const rot = normalizeRot(context.rot);

  if (target.kind === 'wall') return dropOnWall(context, target);

  if (item.placement === 'wall') {
    // A wall piece dragged over the floor: slide it onto the nearest wall, near the pointer.
    const wall: DecorWall = target.kind === 'floor' && target.x + room.width / 2 < target.z + room.depth / 2 ? 'left' : 'back';
    const u = target.kind === 'floor' ? (wall === 'back' ? target.x : target.z) : 0;
    return dropOnWall(context, { kind: 'wall', wall, u, y: item.hangAt ?? 1.2 });
  }

  if (target.kind === 'surface') return dropOnSurface(context, target);

  if (item.placement === 'tabletop') {
    const x = round2(snapGrid(target.x));
    const z = round2(snapGrid(target.z));
    return fail({ x, z, y: 0, rot, wall: null, onId: null }, 'Put it on a table, bed or shelf.');
  }

  // Floor.
  let turn = rot;
  let { ex, ez } = halfExtents(item, turn);
  if (context.autoFace && hasFront(item)) {
    const facing = facingWall(room, target.x, target.z, ex, ez);
    if (facing !== null) {
      turn = facing;
      ({ ex, ez } = halfExtents(item, turn));
    }
  }
  const minX = -room.width / 2 + ex;
  const maxX = room.width / 2 - ex;
  const minZ = -room.depth / 2 + ez;
  const maxZ = room.depth / 2 - ez;
  let x = snapAxis(Math.min(Math.max(target.x, minX), maxX), minX, maxX);
  let z = snapAxis(Math.min(Math.max(target.z, minZ), maxZ), minZ, maxZ);
  const neighbours = [
    ...others.filter((other) => !other.pose.onId).flatMap((other) => {
      const otherItem = findDecorItem(other.itemId);
      return otherItem && otherItem.placement === 'floor' && !isFlatDecor(otherItem) ? [decorRect(room, otherItem, other.pose)] : [];
    }),
    ...fixtures.map((fixture) => fixture.rect),
  ];
  if (!isFlatDecor(item) && turn % 90 === 0) ({ x, z } = snapToNeighbours(x, z, ex, ez, neighbours));
  x = round2(Math.min(Math.max(x, minX), maxX));
  z = round2(Math.min(Math.max(z, minZ), maxZ));
  const verdict = verdictOf(context, { x, z, y: 0, rot: turn, wall: null, onId: null });
  if (!verdict.ok) return fail({ x, z, y: 0, rot: turn, wall: null, onId: null }, verdict.reason);
  if (!isFlatDecor(item) && hitsFixture(decorRect(room, item, verdict.pose), fixtures)) return fail(verdict.pose, 'That’s in the way of the furniture.');
  return { pose: verdict.pose, ok: true, reason: null };
}

function dropOnWall(context: DropContext, target: Extract<DropTarget, { kind: 'wall' }>): Drop {
  const { room, item, fixtures, mounts } = context;
  if (item.placement !== 'wall') {
    return fail(wallPose(room, target.wall, target.u, target.y), `${item.name} doesn’t hang on a wall.`);
  }
  const length = target.wall === 'back' ? room.width : room.depth;
  const half = item.footprint[0] / 2;
  const u = round2(snapGrid(Math.min(Math.max(target.u, -length / 2 + 0.05 + half), length / 2 - 0.05 - half)));
  // The pointer is the middle of the piece.
  const wanted = target.y - item.height / 2;
  const y = round2(snapGrid(Math.min(Math.max(wanted, 0.1), room.height - item.height - 0.1)));
  const pose = wallPose(room, target.wall, u, y);
  const verdict = verdictOf(context, pose);
  if (!verdict.ok) return fail(pose, verdict.reason);
  for (const mount of mounts) {
    if (mount.wall === target.wall && Math.abs(mount.u - u) < mount.halfWidth + half && y < mount.y1 && y + item.height > mount.y0) {
      return fail(verdict.pose, 'That’s over something on the wall.');
    }
  }
  const slab = decorRect(room, item, verdict.pose);
  if (fixtures.some((fixture) => fixture.height > y && rectsOverlap(slab, fixture.rect))) return fail(verdict.pose, 'That’s behind the furniture.');
  return { pose: verdict.pose, ok: true, reason: null };
}

function dropOnSurface(context: DropContext, target: Extract<DropTarget, { kind: 'surface' }>): Drop {
  const { room, item, others } = context;
  const rot = normalizeRot(context.rot);
  const parent = others.find((other) => other.id === target.parentId);
  const parentItem = parent ? findDecorItem(parent.itemId) : undefined;
  if (item.placement !== 'tabletop') return fail({ x: target.x, z: target.z, y: 0, rot, wall: null, onId: null }, `${item.name} goes on the floor.`);
  if (!parent || !parentItem) return fail({ x: target.x, z: target.z, y: 0, rot, wall: null, onId: null }, 'Nothing to put it on.');
  // Keep the piece's middle where it was pointed, but pulled back inside the surface.
  const surface = decorRect(room, parentItem, parent.pose);
  const c = Math.cos((surface.rot * Math.PI) / 180);
  const s = Math.sin((surface.rot * Math.PI) / 180);
  const dx = target.x - surface.x;
  const dz = target.z - surface.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const limitX = Math.max(0, surface.w / 2 - Math.min(item.footprint[0], item.footprint[1]) / 2);
  const limitZ = Math.max(0, surface.d / 2 - Math.min(item.footprint[0], item.footprint[1]) / 2);
  const px = Math.min(Math.max(lx, -limitX), limitX);
  const pz = Math.min(Math.max(lz, -limitZ), limitZ);
  const x = round2(surface.x + px * c + pz * s);
  const z = round2(surface.z - px * s + pz * c);
  const pose: DecorPose = { x, z, y: 0, rot, wall: null, onId: parent.id };
  const verdict = verdictOf(context, pose);
  if (!verdict.ok) return fail(pose, verdict.reason);
  return { pose: verdict.pose, ok: true, reason: null };
}

/** Is a floor point on a surface piece's top? (For picking the table under the pointer.) */
export function surfaceUnder(room: DecorRoom, others: readonly PlacedDecor[], x: number, z: number): PlacedDecor | undefined {
  return others.find((other) => {
    const item = findDecorItem(other.itemId);
    return item?.surface !== undefined && !other.pose.onId && pointInRect({ x, z }, decorRect(room, item, other.pose));
  });
}

export { DECOR_ROT_STEP };
