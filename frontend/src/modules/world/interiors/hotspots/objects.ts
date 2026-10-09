import type { PlaceObjectKind } from '@/common/places';
import { FURNITURE_SCALE } from '../kit/furniture-kit';
import { FURNITURE_MANIFEST } from '../kit/kit-manifest';
import type { PropSpec } from '../props/prop-types';
import type { At, FurniturePlacement, InteriorTemplate } from '../templates/types';
import { rotatedBox } from '../walk/colliders';

/**
 * The things in a room you can use — the bar, the DJ booth, the dance floor, a bed, the front desk, a gym machine, a
 * shelf, a car on show, a pew — with a name and a box you can tap. Hotspots attach to them, so tapping the bar lists
 * what the bar offers. Read from the template's furniture and props (no authoring per room). Pure.
 */

export type { PlaceObjectKind };

/** A box in room space: floor rectangle, bottom and top. */
export interface Box3 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface PlaceObject {
  readonly kind: PlaceObjectKind;
  readonly name: string;
  readonly box: Box3;
}

/** Things lower than this get a taller tap box (you tap a rug-flat dance floor or mat, not a sliver). */
const MIN_TAP_HEIGHT = 0.35;

function box(at: At, w: number, d: number, rot: number, height: number, minY = 0): Box3 {
  const b = rotatedBox(at, w, d, rot, minY + Math.max(height, MIN_TAP_HEIGHT));
  return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, minY, maxY: b.height };
}

function pieceBox(piece: FurniturePlacement): Box3 {
  const [w, h, d] = FURNITURE_MANIFEST[piece.model].size;
  const k = FURNITURE_SCALE * (piece.scale ?? 1);
  return box(piece.at, w * k, d * k, piece.rot ?? 0, h * k, piece.y ?? 0);
}

/** What a template calls some things (a counter is the bar at a lounge, the till in a shop). */
function counterName(templateId: string): string {
  switch (templateId) {
    case 'bar':
    case 'club':
      return 'Bar';
    case 'buka':
      return 'Food counter';
    case 'pharmacy':
      return 'Pharmacy counter';
    case 'mall':
      return 'Till';
    case 'airport':
      return 'Check-in';
    case 'government':
      return 'Service counter';
    default:
      return 'Counter';
  }
}

function deskName(templateId: string, staffed: boolean): string {
  if (!staffed) return 'Desk';
  if (templateId === 'clinic') return 'Doctor’s desk';
  if (templateId === 'hospital-ward') return 'Nurses’ station';
  return 'Front desk';
}

function furnitureObject(
  piece: FurniturePlacement,
  template: InteriorTemplate,
  staffed: (b: Box3) => boolean,
): PlaceObject | null {
  const m = piece.model;
  const hospital = template.id === 'hospital-ward' || template.id === 'clinic';
  const b = (): Box3 => pieceBox(piece);
  if (m.startsWith('bed')) return { kind: 'bed', name: hospital ? 'Hospital bed' : 'Bed', box: b() };
  if (/^lounge(Sofa|DesignSofa)/.test(m)) return { kind: 'sofa', name: 'Sofa', box: b() };
  if (/^lounge(Chair|DesignChair)/.test(m)) return { kind: 'sofa', name: 'Armchair', box: b() };
  if (/^table/.test(m)) return { kind: 'table', name: 'Table', box: b() };
  if (/^desk/.test(m)) {
    const piecebox = b();
    return { kind: 'desk', name: deskName(template.id, staffed(piecebox)), box: piecebox };
  }
  if (/^chair/.test(m) && m !== 'chairDesk') return { kind: 'chair', name: 'Chair', box: b() };
  if (m.startsWith('television')) return { kind: 'tv', name: 'TV', box: b() };
  if (m === 'kitchenStove') return { kind: 'cooker', name: 'Cooker', box: b() };
  if (m === 'shower' || m === 'bathtub') return { kind: 'shower', name: 'Shower', box: b() };
  if (m.startsWith('bookcase')) return { kind: 'shelf', name: 'Bookshelf', box: b() };
  if (m === 'bench' || m === 'benchCushion') return { kind: 'bench', name: 'Bench', box: b() };
  return null;
}

function propObject(prop: PropSpec, template: InteriorTemplate): PlaceObject | null {
  const at = prop.at;
  const rot = prop.rot ?? 0;
  const y = prop.y ?? 0;
  switch (prop.kind) {
    case 'bar-counter': {
      const isBar = template.id === 'bar' || template.id === 'club';
      return {
        kind: isBar ? 'bar' : 'counter',
        name: counterName(template.id),
        box: box(at, prop.length, 0.6, rot, 1.0, y),
      };
    }
    case 'dj-booth':
      return { kind: 'dj-booth', name: 'DJ booth', box: box(at, 1.6, 0.7, rot, 1.1, y) };
    case 'stage':
      return {
        kind: 'stage',
        name: 'Stage',
        box: box(at, prop.size[0], prop.size[1], rot, prop.height ?? 0.4, y),
      };
    case 'mattress':
      return { kind: 'bed', name: 'Mattress', box: box(at, prop.size[0], prop.size[1], rot, 0.25, y) };
    case 'pew':
      return { kind: 'pew', name: 'Pew', box: box(at, prop.length, 0.5, rot, 0.8, y) };
    case 'mat':
      return {
        kind: 'mat',
        name: template.id === 'mosque' ? 'Prayer mat' : template.id === 'gym' ? 'Exercise mat' : 'Mat',
        box: box(at, prop.size[0], prop.size[1], rot, 0.05, y),
      };
    case 'treadmill':
      return { kind: 'gym-machine', name: 'Treadmill', box: box(at, 0.8, 1.6, rot, 1.2, y) };
    case 'bench-press':
      return { kind: 'gym-machine', name: 'Bench press', box: box(at, 0.7, 1.4, rot, 1.0, y) };
    case 'dumbbell-rack':
      return { kind: 'gym-machine', name: 'Weights', box: box(at, 1.2, 0.4, rot, 0.8, y) };
    case 'punching-bag':
      return { kind: 'gym-machine', name: 'Punching bag', box: box(at, 0.5, 0.5, rot, 1.6, y) };
    case 'shelf':
      return prop.items === 'bottles'
        ? null
        : {
            kind: 'shelf',
            name: prop.items === 'clothes' ? 'Clothes rail' : 'Shelf',
            box: box(at, prop.size[0], prop.size[2], rot, prop.size[1], y),
          };
    case 'stall':
      return { kind: 'stall', name: 'Stall', box: box(at, 1.4, 0.8, rot, 2.0, y) };
    case 'seat-row':
      return {
        kind: 'seats',
        name: template.id === 'cinema' ? 'Cinema seats' : 'Seats',
        box: box(at, prop.count * 0.56, 0.5, rot, 0.75, y),
      };
    case 'salon-chair':
      return { kind: 'salon-chair', name: 'Salon chair', box: box(at, 0.6, 0.6, rot, 1.1, y) };
    case 'lectern':
      return { kind: 'pulpit', name: 'Pulpit', box: box(at, 0.5, 0.42, rot, 1.0, y) };
    case 'bench':
      return { kind: 'bench', name: 'Bench', box: box(at, prop.length, 0.4, rot, 0.4, y) };
    case 'plastic-chair':
      return { kind: 'chair', name: 'Chair', box: box(at, 0.46, 0.44, rot, 0.8, y) };
    case 'table-cloth':
      return { kind: 'table', name: 'Table', box: box(at, prop.size[0], prop.size[2], rot, prop.size[1], y) };
    case 'gas-cooker':
      return { kind: 'cooker', name: 'Cooker', box: box(at, 0.75, 0.4, rot, 0.25, y) };
    default:
      return null;
  }
}

/** Every usable thing in a room, with its tap box. */
export function roomObjects(template: InteriorTemplate): PlaceObject[] {
  const people: At[] = template.npcs.map((npc) => [npc.at[0], npc.at[npc.at.length - 1] as number]);
  const staffed = (b: Box3): boolean => people.some(([x, z]) => distanceToBox(b, x, z) < 0.8);
  const objects: PlaceObject[] = [];
  for (const prop of template.props) {
    const object = propObject(prop, template);
    if (object) objects.push(object);
  }
  for (const piece of template.furniture) {
    const object = furnitureObject(piece, template, staffed);
    if (object) objects.push(object);
  }
  const floor = template.extras?.clubLights;
  if (floor)
    objects.push({
      kind: 'dance-floor',
      name: 'Dance floor',
      box: box(floor.at, floor.size[0], floor.size[1], 0, 0.05),
    });
  for (const car of template.extras?.cars ?? [])
    objects.push({ kind: 'car', name: 'Car on show', box: box(car.at, 2.0, 4.2, car.rot ?? 0, 1.5) });
  return objects;
}

/** Floor distance from (x, z) to a box (0 inside). */
export function distanceToBox(
  b: Pick<Box3, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
  x: number,
  z: number,
): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** The point of a box's floor rectangle nearest to (x, z). */
export function closestOnBox(b: Pick<Box3, 'minX' | 'maxX' | 'minZ' | 'maxZ'>, x: number, z: number): At {
  return [Math.min(b.maxX, Math.max(b.minX, x)), Math.min(b.maxZ, Math.max(b.minZ, z))];
}

const area = (b: Box3): number => (b.maxX - b.minX) * (b.maxZ - b.minZ);

/**
 * The object something at `at` belongs to: the nearest within `reach` (inside wins; between two it's inside, the
 * smaller — a stool's spot is at the bar, a seat on a sofa is the sofa, not the rug-sized dance floor beside it).
 */
export function objectAt(
  objects: readonly PlaceObject[],
  at: At,
  reach = 0.9,
  kinds?: readonly PlaceObjectKind[],
): PlaceObject | null {
  let best: PlaceObject | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const object of objects) {
    if (kinds && !kinds.includes(object.kind)) continue;
    const d = distanceToBox(object.box, at[0], at[1]);
    if (d > reach) continue;
    // Inside: prefer the smaller thing; outside: the nearer one.
    const score = d === 0 ? -1 / Math.max(0.01, area(object.box)) : d;
    if (score < bestScore) {
      best = object;
      bestScore = score;
    }
  }
  return best;
}

/** One slab of the ray-box test: narrows [enter, leave] to where the ray is between lo and hi on an axis. */
const slab = { enter: 0, leave: 0 };
function clip(o: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let t1 = (lo - o) / d;
  let t2 = (hi - o) / d;
  if (t1 > t2) {
    const t = t1;
    t1 = t2;
    t2 = t;
  }
  slab.enter = Math.max(slab.enter, t1);
  slab.leave = Math.min(slab.leave, t2);
  return slab.enter <= slab.leave;
}

/** How far along a ray (origin, unit direction) it first enters a box (grown by `grow`), or null. Allocation-free. */
export function rayHitsBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: Box3,
  grow = 0,
): number | null {
  slab.enter = 0;
  slab.leave = Number.POSITIVE_INFINITY;
  if (!clip(ox, dx, b.minX - grow, b.maxX + grow)) return null;
  if (!clip(oy, dy, b.minY - grow, b.maxY + grow)) return null;
  if (!clip(oz, dz, b.minZ - grow, b.maxZ + grow)) return null;
  return slab.enter;
}
