/**
 * What the furniture in a home does. Pure rules shared by the server (which derives sleep quality, comfort and what
 * counts as "in the home" from where pieces stand) and the 3D client (which anchors every home action to the actual
 * piece in the right room and tells you what is missing):
 *
 * - `roomRole`: a room of a home template is a bedroom, kitchen, living room, bathroom…; a one-room home is all of them;
 * - `furnitureRoomIssue`: a piece with a function only goes in rooms that suit it (a bed in a bedroom, never a bathroom);
 * - `homeFurnishing`: the best piece for each function among those placed (the best bed, the table to eat at — in the
 *   kitchen when there is one — the sofa, the TV, the desk, the wardrobe);
 * - `findFreeSpot`: a free valid spot for a piece in a room, for buying and moving house.
 */
import {
  checkDecorPlacement,
  decorRect,
  isFlatDecor,
  normalizeRot,
  rectCorners,
  rectsOverlap,
  type DecorPose,
  type OrientedRect,
  type PlacedDecor,
} from './decor-placement.js';
import { findDecorRoom, type DecorRoom } from './decor-rooms.js';
import { findDecorItem, type DecorItem } from './decor.js';
import { FURNITURE_FNS, findFurnitureSpec, type FurnitureFn, type FurnitureSlot } from './furniture.js';
import { HOME_SLOT_SPOTS } from './furniture-slots.js';

// ----- Rooms -----------------------------------------------------------------------------------------------------

export type RoomRole = 'living' | 'kitchen' | 'bedroom' | 'bathroom' | 'cinema' | 'single';

const ROOM_ROLES: Readonly<Record<string, RoomRole>> = {
  living: 'living',
  kitchen: 'kitchen',
  bedroom: 'bedroom',
  master: 'bedroom',
  bathroom: 'bathroom',
  cinema: 'cinema',
  room: 'single',
};

/** What a room of a home is for (null for anything that isn't a room of a home: a cabin, a typo). */
export function roomRole(templateId: string, roomId: string): RoomRole | null {
  if (!templateId.startsWith('home-')) return null;
  return Object.hasOwn(ROOM_ROLES, roomId) ? ROOM_ROLES[roomId]! : null;
}

/** Where each function works, best room first (a one-room home does everything in its one room). */
export const FN_ROLES: Readonly<Record<FurnitureFn, readonly RoomRole[]>> = {
  sleep: ['bedroom', 'single'],
  eat: ['kitchen', 'single', 'living'],
  sit: ['living', 'single', 'cinema', 'bedroom'],
  tv: ['living', 'single', 'cinema', 'bedroom'],
  study: ['bedroom', 'single', 'living'],
  dress: ['bedroom', 'single'],
};

const FN_PLACE_HINT: Readonly<Record<FurnitureFn, string>> = {
  sleep: 'A bed belongs in a bedroom.',
  eat: 'A table to eat at belongs in the kitchen or the parlour.',
  sit: 'Sofas and chairs belong in the parlour, the cinema lounge or a bedroom.',
  tv: 'A TV belongs in the parlour, the cinema lounge or a bedroom.',
  study: 'A desk belongs in a bedroom or the parlour.',
  dress: 'A wardrobe belongs in a bedroom.',
};

/** Why a piece can't go in this room of a home (a bed in the bathroom), or null. Rooms that aren't a home's are not judged. */
export function furnitureRoomIssue(templateId: string, roomId: string, item: Pick<DecorItem, 'fn' | 'name'>): string | null {
  const role = roomRole(templateId, roomId);
  if (!role || !item.fn) return null;
  return FN_ROLES[item.fn].includes(role) ? null : `${FN_PLACE_HINT[item.fn]}`;
}

// ----- Family house and hostels: small pieces only ----------------------------------------------------------------

/** Floor pieces up to this footprint (m²) count as small. */
export const SMALL_PIECE_AREA = 1.2;

/**
 * In the family house and hostels the furniture is the family's / the school's and stays put; your own pieces are
 * small ones: things on a wall, a table or a shelf, and floor pieces that are small and have no use of their own.
 */
export function isSmallPiece(item: DecorItem): boolean {
  if (item.fn) return false;
  if (item.placement !== 'floor') return true;
  return item.footprint[0] * item.footprint[1] <= SMALL_PIECE_AREA;
}

// ----- Functions -------------------------------------------------------------------------------------------------

/** A piece of furniture standing in a room of the home. */
export interface RoomedPiece {
  readonly id: string;
  readonly itemId: string;
  readonly roomId: string;
  readonly pose: DecorPose;
}

export interface FoundFn {
  readonly pieceId: string;
  readonly itemId: string;
  readonly roomId: string;
  /** Beds: sleep quality (0-1). */
  readonly quality: number;
}

export type HomeFurnishing = Readonly<Record<FurnitureFn, FoundFn | null>>;

export const NO_FURNISHING: HomeFurnishing = { sleep: null, eat: null, sit: null, tv: null, study: null, dress: null };

/** Better pieces rank higher: bed quality, then price. */
export function furnitureWorth(item: Pick<DecorItem, 'quality' | 'price'>): number {
  return (item.quality ?? 0) * 1e9 + item.price;
}

/**
 * The best piece for every function among those standing in the home (on the floor of a room that suits the function,
 * not on another piece). Beds: the best sleep quality wins. Tables: one in the kitchen beats one in the parlour — you
 * eat in the kitchen when the home has a table there. Everything else: the dearest.
 */
export function homeFurnishing(templateId: string, pieces: readonly RoomedPiece[]): HomeFurnishing {
  const found: Partial<Record<FurnitureFn, FoundFn>> = {};
  const rank = new Map<FurnitureFn, readonly [number, number, string]>();
  for (const piece of pieces) {
    const item = findDecorItem(piece.itemId);
    if (!item?.fn || piece.pose.onId) continue;
    const role = roomRole(templateId, piece.roomId);
    if (!role) continue;
    const roles = FN_ROLES[item.fn];
    const roleRank = roles.indexOf(role);
    if (roleRank < 0) continue;
    // Eating: the kitchen first. Other functions: any suitable room, the dearest piece.
    const key: readonly [number, number, string] = [item.fn === 'eat' ? -roleRank : 0, furnitureWorth(item), piece.id];
    const best = rank.get(item.fn);
    if (best && (key[0] < best[0] || (key[0] === best[0] && (key[1] < best[1] || (key[1] === best[1] && key[2] > best[2]))))) continue;
    rank.set(item.fn, key);
    found[item.fn] = { pieceId: piece.id, itemId: item.id, roomId: piece.roomId, quality: item.quality ?? 0 };
  }
  return { ...NO_FURNISHING, ...found };
}

/** The sleep quality of the best bed placed in the home, or null with no bed at all. */
export const bestBedQuality = (furnishing: HomeFurnishing): number | null => furnishing.sleep?.quality ?? null;

/** "No bed here yet — buy one in the furniture store" (on the action that needs it). */
export const MISSING_ACTION_NOTE: Readonly<Record<FurnitureFn, string>> = {
  sleep: 'No bed here yet — buy one in the furniture store',
  eat: 'No table to eat at yet — buy a dining set in the furniture store',
  sit: 'Nowhere to sit yet — buy a sofa in the furniture store',
  tv: 'No TV here yet — buy one in the furniture store',
  study: 'No desk here yet — buy one in the furniture store',
  dress: 'No wardrobe here yet — buy one in the furniture store',
};

/** The Decorate checklist line when a function is missing. */
export const MISSING_CHECKLIST: Readonly<Record<FurnitureFn, string>> = {
  sleep: 'No bed in this home',
  eat: 'No table to eat at',
  sit: 'Nowhere to sit',
  tv: 'No TV',
  study: 'No desk to study at',
  dress: 'No wardrobe',
};

/** Functions a home needs to feel lived in (the rest are nice to have). */
export const ESSENTIAL_FNS: readonly FurnitureFn[] = ['sleep', 'eat', 'sit'];

export interface ChecklistEntry {
  readonly fn: FurnitureFn;
  readonly ok: boolean;
  readonly essential: boolean;
  readonly text: string;
}

/** Every function with whether the home has it, essentials first. */
export function homeChecklist(furnishing: HomeFurnishing): ChecklistEntry[] {
  return FURNITURE_FNS.map((fn): ChecklistEntry => ({ fn, ok: furnishing[fn] !== null, essential: ESSENTIAL_FNS.includes(fn), text: furnishing[fn] ? `Has ${FURNITURE_FN_OK[fn]}` : MISSING_CHECKLIST[fn] })).toSorted(
    (a, b) => Number(b.essential) - Number(a.essential) || Number(a.ok) - Number(b.ok),
  );
}

const FURNITURE_FN_OK: Readonly<Record<FurnitureFn, string>> = {
  sleep: 'a bed',
  eat: 'a table to eat at',
  sit: 'somewhere to sit',
  tv: 'a TV',
  study: 'a desk',
  dress: 'a wardrobe',
};

/** Which function a home action needs a piece for (null: it needs none). */
export function actionNeeds(action: { readonly id: string; readonly animation?: string }): FurnitureFn | null {
  switch (action.id) {
    case 'sleep':
    case 'nap':
      return 'sleep';
    case 'home-meal':
      return 'eat';
    case 'watch-tv':
    case 'play-games':
      return 'tv';
    case 'study':
    case 'learn-code':
    case 'practice-craft':
    case 'freelance':
      return 'study';
    default:
      return null;
  }
}

// ----- Finding a place ---------------------------------------------------------------------------------------------

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Metres a piece keeps off the wall it stands against. */
const WALL_GAP = 0.02;

/** Local (right, ahead) → room-space offset for a piece turned `rot` degrees (0 faces +z; see `furnish.ts`). */
export function localToRoom(rot: number, right: number, ahead: number): readonly [number, number] {
  const a = (rot * Math.PI) / 180;
  return [Math.cos(a) * right + Math.sin(a) * ahead, -Math.sin(a) * right + Math.cos(a) * ahead];
}

type Style = 'wall' | 'centre';

/** Beds, sofas, desks, wardrobes, TVs stand against a wall; tables and rugs go in the middle. */
function styleOf(item: DecorItem): Style {
  if (item.fn === 'eat' || (item.placement === 'floor' && item.height <= 0.05)) return 'centre';
  return 'wall';
}

const poseAt = (x: number, z: number, rot: number, y = 0, onId: string | null = null): DecorPose => ({ x: round2(x), z: round2(z), y, rot: normalizeRot(rot), wall: null, onId });

/** Candidate poses for a floor piece, best first. Walls first (head to the wall, facing the room) or the middle first. */
function floorCandidates(room: DecorRoom, item: DecorItem, style: Style): DecorPose[] {
  const [w, d] = item.footprint;
  const halfW = room.width / 2;
  const halfD = room.depth / 2;
  const out: DecorPose[] = [];
  const along = (length: number, extent: number): number[] => {
    const span = length / 2 - extent / 2;
    if (span < 0) return [];
    const list: number[] = [0];
    for (let step = 0.2; step <= span + 1e-9; step += 0.2) list.push(step, -step);
    return list;
  };
  const walls = (): void => {
    // Back wall (faces +z), left wall (faces +x), right wall (faces -x), front wall (faces -z).
    for (const u of along(room.width, w)) out.push(poseAt(u, -halfD + d / 2 + WALL_GAP, 0));
    for (const u of along(room.depth, w)) out.push(poseAt(-halfW + d / 2 + WALL_GAP, u, 90));
    for (const u of along(room.depth, w)) out.push(poseAt(halfW - d / 2 - WALL_GAP, u, 270));
    for (const u of along(room.width, w)) out.push(poseAt(u, halfD - d / 2 - WALL_GAP, 180));
  };
  const middle = (): void => {
    const points: Array<readonly [number, number]> = [];
    for (let x = -halfW + 0.6; x <= halfW - 0.6; x += 0.4) {
      for (let z = -halfD + 0.6; z <= halfD - 0.6; z += 0.4) points.push([x, z]);
    }
    points.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    for (const [x, z] of points) {
      out.push(poseAt(x, z, 0));
      out.push(poseAt(x, z, 90));
    }
  };
  if (style === 'wall') {
    walls();
    middle();
  } else {
    middle();
    walls();
  }
  return out;
}

function wallCandidates(room: DecorRoom, item: DecorItem): DecorPose[] {
  const out: DecorPose[] = [];
  const y = item.hangAt ?? 1.2;
  for (const wall of ['back', 'left'] as const) {
    const length = wall === 'back' ? room.width : room.depth;
    for (let u = 0; u <= length / 2 - item.footprint[0] / 2; u += 0.3) {
      for (const sign of u === 0 ? [1] : [1, -1]) {
        out.push(wall === 'back' ? { x: round2(u * sign), z: -room.depth / 2, y, rot: 0, wall, onId: null } : { x: -room.width / 2, z: round2(u * sign), y, rot: 90, wall, onId: null });
      }
    }
  }
  return out;
}

function surfaceCandidates(room: DecorRoom, item: DecorItem, others: readonly PlacedDecor[]): DecorPose[] {
  const out: DecorPose[] = [];
  for (const other of others) {
    const parent = findDecorItem(other.itemId);
    if (!parent || parent.surface === undefined || parent.placement === 'tabletop' || other.pose.onId) continue;
    const rect = decorRect(room, parent, other.pose);
    const offsets: Array<readonly [number, number]> = [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.2], [0, -0.2], [0.5, 0], [-0.5, 0]];
    for (const [dx, dz] of offsets) {
      const [rx, rz] = localToRoom(rect.rot, dx, dz);
      out.push({ x: round2(rect.x + rx), z: round2(rect.z + rz), y: 0, rot: other.pose.rot, wall: null, onId: other.id });
    }
  }
  return out;
}

/**
 * A free valid pose for `item` in `room`, or null when it doesn't fit anywhere. Deterministic: against a wall (head to
 * the wall, facing the room) for beds, sofas, desks, TVs and wardrobes; in the middle for tables and rugs; on the first
 * table, bed or shelf with room for tabletop pieces. `others` are the pieces already in the room.
 */
export function findFreeSpot(room: DecorRoom, item: DecorItem, others: readonly PlacedDecor[]): DecorPose | null {
  const candidates =
    item.placement === 'wall' ? wallCandidates(room, item) : item.placement === 'tabletop' ? surfaceCandidates(room, item, others) : floorCandidates(room, item, styleOf(item));
  const valid: DecorPose[] = [];
  for (const pose of candidates) {
    const verdict = checkDecorPlacement(room, item, pose, others);
    if (!verdict.ok) continue;
    // A place you can walk round: room to get past it before settling for a cramped one.
    if (item.placement !== 'floor' || hasClearance(room, item, verdict.pose, others)) return verdict.pose;
    if (valid.length === 0) valid.push(verdict.pose);
  }
  return valid[0] ?? null;
}

/** Metres to leave round a piece (the wall behind a wall piece excepted) so there is a way past it. */
const CLEAR_ROUND = 0.5;

function hasClearance(room: DecorRoom, item: DecorItem, pose: DecorPose, others: readonly PlacedDecor[]): boolean {
  if (isFlatDecor(item)) return true;
  const rect = decorRect(room, item, pose);
  const grown: OrientedRect = { ...rect, w: rect.w + CLEAR_ROUND, d: rect.d + CLEAR_ROUND };
  const near = (box: OrientedRect): boolean => rectsOverlap(grown, box);
  for (const fixture of room.fixtures ?? []) if (near({ x: fixture.x, z: fixture.z, w: fixture.w, d: fixture.d, rot: 0 })) return false;
  for (const keep of room.keepOut) if (near({ x: (keep.minX + keep.maxX) / 2, z: (keep.minZ + keep.maxZ) / 2, w: keep.maxX - keep.minX, d: keep.maxZ - keep.minZ, rot: 0 })) return false;
  for (const other of others) {
    const otherItem = findDecorItem(other.itemId);
    if (!otherItem || other.pose.onId || otherItem.placement !== 'floor' || isFlatDecor(otherItem)) continue;
    if (near(decorRect(room, otherItem, other.pose))) return false;
  }
  return true;
}

/** The rooms of a home template to try for a piece, best first (a bed: the bedroom; a table to eat at: the kitchen first). */
export function roomsToTry(templateId: string, roomIds: readonly string[], item: DecorItem, preferred?: string | null): string[] {
  const roles = item.fn ? FN_ROLES[item.fn] : (['living', 'single', 'bedroom', 'kitchen', 'cinema'] as const);
  const fits = roomIds.filter((roomId) => {
    const role = roomRole(templateId, roomId);
    return role !== null && role !== 'bathroom' && (roles as readonly RoomRole[]).includes(role);
  });
  const ordered = fits.toSorted((a, b) => (roles as readonly RoomRole[]).indexOf(roomRole(templateId, a)!) - (roles as readonly RoomRole[]).indexOf(roomRole(templateId, b)!));
  // The room you are standing in wins when the piece suits it (a rug, a plant: anywhere).
  if (preferred && fits.includes(preferred)) return [preferred, ...ordered.filter((roomId) => roomId !== preferred)];
  return ordered;
}

/**
 * Where an existing player's piece stood before pieces were placeable: the spot its template slot had in that room.
 * Null when the template has no spot for the slot in that room.
 */
export function slotPose(templateId: string, roomId: string, itemId: string): DecorPose | null {
  const item = findDecorItem(itemId);
  const slot = item?.furnitureSlot;
  const spec = findFurnitureSpec(item?.shopItemId);
  if (!item || !slot || !spec) return null;
  const spots = (HOME_SLOT_SPOTS as Readonly<Record<string, Readonly<Record<string, Readonly<Partial<Record<FurnitureSlot, readonly [number, number, number]>>>> | undefined> | undefined>>)[templateId]?.[roomId];
  const spot = spots?.[slot];
  if (!spot) return null;
  const [x, z, rot] = spot;
  const [dx, dz] = localToRoom(rot, spec.anchorOffset?.[0] ?? 0, spec.anchorOffset?.[1] ?? 0);
  return poseAt(x - dx, z - dz, rot);
}

/** Which rooms of a template have a spot for this slot (to put legacy pieces where they used to be). */
export function slotRooms(templateId: string, slot: FurnitureSlot): string[] {
  const rooms = (HOME_SLOT_SPOTS as Readonly<Record<string, Readonly<Record<string, Readonly<Partial<Record<FurnitureSlot, readonly [number, number, number]>>>>> | undefined>>)[templateId];
  return rooms ? Object.entries(rooms).filter(([, spots]) => spots[slot] !== undefined).map(([roomId]) => roomId) : [];
}

/** The pose itself, then the same turned pose shifted a little each way (nearest first). */
function* nudges(pose: DecorPose): Generator<DecorPose> {
  yield pose;
  for (let step = 0.05; step <= 0.45; step += 0.05) {
    for (const [dx, dz] of [[0, step], [0, -step], [step, 0], [-step, 0]] as const) yield poseAt(pose.x + dx, pose.z + dz, pose.rot);
  }
}

/**
 * Put a piece in a home: the legacy slot spot when asked and valid, else a free spot in the `preferred` room, else in
 * the rooms that suit it. `piecesIn(roomId)` are the pieces already standing in a room. Null: no room for it (it stays in
 * the inventory).
 */
export function placeInHome(
  templateId: string,
  roomIds: readonly string[],
  item: DecorItem,
  piecesIn: (roomId: string) => readonly PlacedDecor[],
  options: { readonly preferred?: string | null; readonly legacy?: boolean; readonly provided?: boolean; readonly cap?: number } = {},
): { readonly roomId: string; readonly pose: DecorPose } | null {
  const tryRoom = (roomId: string, legacy: boolean): { readonly roomId: string; readonly pose: DecorPose } | null => {
    const room = findDecorRoom(templateId, roomId, options.provided === true);
    if (!room || furnitureRoomIssue(templateId, roomId, item)) return null;
    const others = piecesIn(roomId);
    if (options.cap !== undefined && others.length >= options.cap) return null;
    if (legacy) {
      const pose = slotPose(templateId, roomId, item.id);
      if (pose) {
        // Where the template had it, or the nearest valid place just beside (a bigger bed than the template's pushed off the wall).
        for (const candidate of nudges(pose)) {
          const verdict = checkDecorPlacement(room, item, candidate, others);
          if (verdict.ok) return { roomId, pose: verdict.pose };
        }
      }
    }
    const pose = findFreeSpot(room, item, others);
    return pose ? { roomId, pose } : null;
  };
  if (options.legacy && item.furnitureSlot) {
    for (const roomId of slotRooms(templateId, item.furnitureSlot)) {
      const hit = tryRoom(roomId, true);
      if (hit) return hit;
    }
  }
  for (const roomId of roomsToTry(templateId, roomIds, item, options.preferred)) {
    const hit = tryRoom(roomId, false);
    if (hit) return hit;
  }
  return null;
}

/** Corners helper kept for callers that draw a piece's outline. */
export const pieceCorners = (room: Pick<DecorRoom, 'width' | 'depth'>, item: DecorItem, pose: DecorPose) => rectCorners(decorRect(room, item, pose));
