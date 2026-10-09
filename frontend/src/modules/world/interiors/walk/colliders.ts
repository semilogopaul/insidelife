import type { Aabb } from '../../play/physics/collision';
import { FURNITURE_SCALE } from '../kit/furniture-kit';
import { FURNITURE_MANIFEST } from '../kit/kit-manifest';
import type { Rect } from '../layouts/types';
import type { PropSpec } from '../props/prop-types';
import type { At, FurniturePlacement, InteriorTemplate, RoomSpec } from '../templates/types';

/**
 * What you bump into indoors: the room's walls and open edges, furniture footprints (Kenney kit sizes × the kit scale ×
 * the placement's scale), procedural props and the people standing around. Pure; boxes span y ∈ [0, height] so the
 * same list serves the walker (2D push-out) and the camera (ray casts).
 */

/** The interior avatar is unscaled (1.37 m chibi): a slimmer walker than outside. */
export const INTERIOR_WALKER_RADIUS = 0.26;
/** Things placed higher than this sit on other furniture or hang on walls: no footprint of their own. */
const ON_SOMETHING = 0.3;
/** Smaller than this (m) and you step past it. */
const TINY = 0.14;
/** People are obstacles but low enough for the camera to look over. */
const PERSON_SIZE = 0.38;
const PERSON_HEIGHT = 0.9;

/** Axis-aligned box around a w×d footprint (local x/z) at `at`, rotated by `rot` degrees about +Y. */
export function rotatedBox(at: At, w: number, d: number, rot: number, height: number): Aabb {
  const r = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  let ex = (w * c + d * s) / 2;
  let ez = (w * s + d * c) / 2;
  // The AABB of a diagonal piece overstates it; trim so you can still walk round a chair set at an angle.
  if (Math.min(c, s) > 0.05) {
    ex *= 0.86;
    ez *= 0.86;
  }
  return { minX: at[0] - ex, maxX: at[0] + ex, minZ: at[1] - ez, maxZ: at[1] + ez, height };
}

/** Footprint of a kit piece, or null for rugs, wall/counter items and trinkets. */
export function furnitureFootprint(piece: FurniturePlacement): Aabb | null {
  const y = piece.y ?? 0;
  if (y > ON_SOMETHING) return null;
  const [w0, h0, d0] = FURNITURE_MANIFEST[piece.model].size;
  const k = FURNITURE_SCALE * (piece.scale ?? 1);
  let w = w0 * k;
  let d = d0 * k;
  const h = h0 * k;
  if (h < 0.06 || Math.max(w, d) < TINY) return null;
  // Palms and bushes: only the trunk/pot is solid, the fronds hang over.
  if (/^(tree_|plant_|flower_|grass_)/.test(piece.model)) {
    w = d = Math.min(w, d) * 0.35;
  }
  return rotatedBox(piece.at, w, d, piece.rot ?? 0, y + h);
}

/** [width, depth, height] of a prop on the floor (local axes), or null when it doesn't block (flat, hanging, on a wall). */
function propSize(prop: PropSpec): readonly [number, number, number] | null {
  switch (prop.kind) {
    case 'box':
      return prop.size[1] < 0.05 ? null : [prop.size[0], prop.size[2], prop.size[1]];
    case 'sign':
      return prop.wall ? null : [prop.size[0] + 0.05, 0.12, 0.55 + prop.size[1]];
    case 'pot': {
      const r = prop.r ?? 0.22;
      return [r * 2, r * 2, r * 1.3];
    }
    case 'cooler':
      return [0.57, 0.44, 0.5];
    case 'bucket':
      return [0.34, 0.34, 0.32];
    case 'gas-cooker':
      return [0.75, 0.4, 0.7];
    case 'plastic-chair':
      return [0.46, 0.44, 0.8];
    case 'bench':
      return [prop.length, 0.4, 0.4];
    case 'pew':
      return [prop.length, 0.5, 0.8];
    case 'seat-row':
      return [prop.count * 0.56, 0.5, 0.75];
    case 'stall':
      return [1.4, 0.8, 1.0];
    case 'shelf':
      return [prop.size[0], prop.size[2], prop.size[1]];
    case 'iv-stand':
    case 'flag':
      return [0.3, 0.3, 1.8];
    case 'dj-booth':
      return [1.6, 0.7, 1.1];
    case 'speaker-stack':
      return [0.6, 0.5, prop.height ?? 1.4];
    case 'bar-counter':
      return [prop.length, 0.6, 1.1];
    case 'stage':
      return [prop.size[0], prop.size[1], prop.height ?? 0.4];
    case 'lectern':
      return [0.5, 0.42, 1.0];
    case 'treadmill':
      return [0.8, 1.6, 1.2];
    case 'bench-press':
      return [0.7, 1.4, 1.0];
    case 'dumbbell-rack':
      return [1.2, 0.4, 0.8];
    case 'punching-bag':
      return [0.4, 0.4, 1.6];
    case 'salon-chair':
    case 'hood-dryer':
      return [0.6, 0.6, 1.1];
    case 'luggage':
      return [0.45, 0.3, 0.6];
    case 'water-dispenser':
      return [0.34, 0.34, 1.28];
    case 'mattress':
      return [prop.size[0], prop.size[1], 0.25];
    case 'danfo':
      return [2.0, 4.4, 1.9];
    case 'grill':
      return [1.0, 0.4, 0.9];
    case 'generator':
      return [0.64, 0.46, 0.65];
    case 'pillar':
      return [0.45, 0.45, prop.height];
    case 'planter':
      return [prop.size[0], prop.size[1], 0.5];
    case 'drink-crate':
      return [0.45, 0.32, 0.3];
    case 'stairs':
      return [prop.size[0], prop.size[2], prop.size[1]];
    case 'stairwell':
      return [prop.size[0] + 0.16, prop.size[1] + 0.08, 0.95];
    case 'table-cloth':
      return [prop.size[0], prop.size[2], prop.size[1]];
    case 'aquarium':
      return [prop.size[0], prop.size[2], 0.5 + prop.size[1]];
    case 'standing-fan':
      return [0.4, 0.4, 1.3];
    default:
      return null;
  }
}

/** Footprint of a procedural prop, or null when it doesn't block. */
export function propFootprint(prop: PropSpec): Aabb | null {
  const y = prop.y ?? 0;
  if (y > ON_SOMETHING) return null;
  const size = propSize(prop);
  if (!size || Math.max(size[0], size[1]) < TINY) return null;
  // A stairwell's railing sits a touch past its far end (local -z): shift the box with it.
  if (prop.kind === 'stairwell') {
    const r = ((prop.rot ?? 0) * Math.PI) / 180;
    const shift = -0.04;
    return rotatedBox(
      [prop.at[0] + Math.sin(r) * shift, prop.at[1] + Math.cos(r) * shift],
      size[0],
      size[1],
      prop.rot ?? 0,
      y + size[2],
    );
  }
  return rotatedBox(prop.at, size[0], size[1], prop.rot ?? 0, y + size[2]);
}

/** The floor you can stand on. */
export function roomBounds(room: RoomSpec): Rect {
  return { minX: -room.width / 2, maxX: room.width / 2, minZ: -room.depth / 2, maxZ: room.depth / 2 };
}

/**
 * Walls (back and left, full height), the open cutaway edges (front and right: invisible, zero height so cameras see
 * past them), every footprint and the people present.
 */
export function roomColliders(template: InteriorTemplate, people: readonly At[] = []): Aabb[] {
  const { width: W, depth: D, height: H } = template.room;
  const pad = 1.5;
  const boxes: Aabb[] = [
    { minX: -W / 2 - pad, maxX: W / 2 + pad, minZ: -D / 2 - pad, maxZ: -D / 2, height: H },
    { minX: -W / 2 - pad, maxX: -W / 2, minZ: -D / 2 - pad, maxZ: D / 2 + pad, height: H },
    { minX: W / 2, maxX: W / 2 + pad, minZ: -D / 2 - pad, maxZ: D / 2 + pad, height: 0 },
    { minX: -W / 2 - pad, maxX: W / 2 + pad, minZ: D / 2, maxZ: D / 2 + pad, height: 0 },
  ];
  for (const piece of template.furniture) {
    const box = furnitureFootprint(piece);
    if (box) boxes.push(box);
  }
  for (const prop of template.props) {
    const box = propFootprint(prop);
    if (box) boxes.push(box);
  }
  for (const [x, z] of people) {
    boxes.push({
      minX: x - PERSON_SIZE / 2,
      maxX: x + PERSON_SIZE / 2,
      minZ: z - PERSON_SIZE / 2,
      maxZ: z + PERSON_SIZE / 2,
      height: PERSON_HEIGHT,
    });
  }
  return boxes;
}
