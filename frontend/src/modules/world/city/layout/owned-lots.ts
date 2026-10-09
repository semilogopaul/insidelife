import { CITY_MAP, homeLotOf, homeLots, type CityLot, type OwnedPropertyMarkerDto } from '@insidelife/shared';
import {
  APRON,
  at,
  frameOf,
  type CityPlan,
  type Collider,
  type GateSpot,
  type LotFrame,
  type Placement,
  type WallSegment,
} from './placements';

/**
 * Your land and houses in the city. Each property stands on the residential lot `homeLotOf('property:<id>')` (the
 * same lot the server puts your front door on when you live there). On those lots the generic house, trees, compound
 * wall and collisions are cleared and replaced with what you own: bare land with survey beacons, a building site, or
 * the finished bungalow / duplex / block of flats / mansion behind your own wall and gate.
 */

export interface OwnedLot {
  readonly property: OwnedPropertyMarkerDto;
  readonly lot: CityLot;
  readonly lotIndex: number;
}

/** Lot-local layout (u along the frontage, v towards the road; metres). */
export const WALL_INSET = 0.4;
const WALL_HEIGHT = 2.1;
/** Front wall line, just behind the pavement apron. */
export const FRONT_LINE = (frame: LotFrame): number => frame.depth / 2 - APRON;
/** Half-width of the gate gap in the front wall. */
export const GATE_HALF = 2.2;

/** The house body for each blueprint: footprint (width × depth, from the back), storeys and wall colour. */
export const HOUSE_SHAPES = {
  bungalow: { width: 7.4, depth: 5.2, storeys: 1, wall: 0xf1e3c6 },
  duplex: { width: 7.8, depth: 5.8, storeys: 2, wall: 0xf4efe4 },
  'block-of-flats': { width: 8.4, depth: 6.2, storeys: 3, wall: 0xe9dfcf },
  mansion: { width: 8.6, depth: 5.4, storeys: 2, wall: 0xfbf8f1 },
} as const;

export const STOREY = 3;
/** Back of the house sits this far in front of the back wall. */
export const HOUSE_BACK = 0.6;

const GROUND: Readonly<Record<OwnedPropertyMarkerDto['stage'], number>> = {
  land: 0xa86f45, // laterite
  construction: 0x9c7a5a, // trampled earth and sand
  built: 0xb9b2a2, // interlocking paving
};

let lastOwned: { readonly key: string; readonly owned: readonly OwnedLot[] } = { key: '', owned: [] };

/**
 * Your properties on their lots. Each gets its own: the one you live in keeps the lot your front door is on, the rest
 * take their own lot or, when two of yours land on the same one, the next free lot along. Returns the same array while
 * nothing about the lots changes, so snapshot refreshes don't rebuild the city.
 */
export function ownedLots(properties: readonly OwnedPropertyMarkerDto[]): readonly OwnedLot[] {
  const owned = placeOwned(properties);
  const key = ownedLotsKey(owned);
  if (key !== lastOwned.key) lastOwned = { key, owned };
  return lastOwned.owned;
}

function placeOwned(properties: readonly OwnedPropertyMarkerDto[]): OwnedLot[] {
  const rank = (property: OwnedPropertyMarkerDto): number =>
    property.livedIn ? 3 : property.stage === 'built' ? 2 : property.stage === 'construction' ? 1 : 0;
  const byLot = new Map<string, OwnedLot>();
  for (const property of [...properties].sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id))) {
    const own = homeLotOf(`property:${property.id}`, property.districtId);
    const lots = homeLots(property.districtId);
    if (!own || lots.length === 0) continue;
    const start = Math.max(0, lots.indexOf(own));
    for (let step = 0; step < lots.length; step++) {
      const lot = lots[(start + step) % lots.length] as CityLot;
      if (byLot.has(lot.id)) continue;
      byLot.set(lot.id, { property, lot, lotIndex: CITY_MAP.lots.indexOf(lot) });
      break;
    }
  }
  return [...byLot.values()];
}

const inside = (lot: CityLot, x: number, z: number): boolean =>
  x > lot.footprint.minX && x < lot.footprint.maxX && z > lot.footprint.minZ && z < lot.footprint.maxZ;

/** Walls and gate around a site or a finished house (bare land is open). */
function compound(owned: OwnedLot): { walls: WallSegment[]; gates: GateSpot[] } {
  const { stage } = owned.property;
  if (stage === 'land') return { walls: [], gates: [] };
  const frame = frameOf(owned.lot);
  const half = frame.width / 2 - WALL_INSET;
  const back = -frame.depth / 2 + WALL_INSET;
  const front = FRONT_LINE(frame);
  // A building site has a block fence going up (no gate yet); a house has the full wall and a steel gate.
  const height = stage === 'built' ? WALL_HEIGHT : 1.2;
  const color =
    stage === 'built' ? (owned.property.blueprintId === 'mansion' ? 0xf6f1e7 : 0xe9dcc4) : 0x9a9a94;
  const wall = (u0: number, v0: number, u1: number, v1: number): WallSegment => {
    const [x0, z0] = at(frame, u0, v0);
    const [x1, z1] = at(frame, u1, v1);
    return { x0, z0, x1, z1, height, color };
  };
  const walls = [
    wall(-half, back, half, back),
    wall(-half, back, -half, front),
    wall(half, back, half, front),
    wall(-half, front, -GATE_HALF, front),
    wall(GATE_HALF, front, half, front),
  ];
  if (stage !== 'built') return { walls, gates: [] };
  const [x, z] = at(frame, 0, front);
  return { walls, gates: [{ x, z, dx: frame.ax, dz: frame.az, width: GATE_HALF * 2 }] };
}

/** World AABB of a lot-local rectangle. */
function rect(frame: LotFrame, u0: number, v0: number, u1: number, v1: number, height: number): Collider {
  const [ax, az] = at(frame, u0, v0);
  const [bx, bz] = at(frame, u1, v1);
  return {
    minX: Math.min(ax, bx),
    minZ: Math.min(az, bz),
    maxX: Math.max(ax, bx),
    maxZ: Math.max(az, bz),
    height,
  };
}

/** The solid parts of what stands on the lot: the house body, or the site's blockwork. */
function bodies(owned: OwnedLot): Collider[] {
  const { stage, blueprintId } = owned.property;
  if (stage === 'land' || !blueprintId) return [];
  const frame = frameOf(owned.lot);
  const shape = HOUSE_SHAPES[blueprintId];
  const back = -frame.depth / 2 + WALL_INSET + HOUSE_BACK;
  const height = stage === 'built' ? shape.storeys * STOREY + 1.5 : 2.4;
  return [rect(frame, -shape.width / 2, back, shape.width / 2, back + shape.depth, height)];
}

/** Two palms in the yard of a finished house. */
function yardPalms(owned: OwnedLot): Placement[] {
  if (owned.property.stage !== 'built') return [];
  const frame = frameOf(owned.lot);
  const front = FRONT_LINE(frame) - 0.7;
  const half = frame.width / 2 - WALL_INSET - 0.7;
  return [-half, half].map((u, index) => {
    const [x, z] = at(frame, u, front);
    const model = index === 0 ? 'tree_palmTall' : 'tree_palm';
    return {
      kit: 'nature',
      model,
      x,
      y: 0,
      z,
      yaw: (owned.lot.seed % 628) / 100 + index * 2,
      sx: 5.4,
      sy: 5.4,
      sz: 5.4,
      tint: 0xffffff,
      lod: false,
    };
  });
}

let cache: { readonly key: string; readonly base: CityPlan; readonly plan: CityPlan } | null = null;

/** Cache key: which lots, and what stands on each. */
function ownedLotsKey(owned: readonly OwnedLot[]): string {
  return owned
    .map(
      ({ lot, property }) =>
        `${lot.id}:${property.id}:${property.stage}:${property.blueprintId ?? '-'}:${property.livedIn ? 1 : 0}`,
    )
    .join('|');
}

/**
 * The city plan with your lots cleared and your own walls, gates, colliders and yard palms added. Returns `base`
 * itself when you own nothing, and the same object for the same lots (the city batches and colliders rebuild only
 * when what you own changes).
 */
export function withOwnedLots(base: CityPlan, owned: readonly OwnedLot[]): CityPlan {
  if (owned.length === 0) return base;
  const key = ownedLotsKey(owned);
  if (cache?.key === key && cache.base === base) return cache.plan;

  const cleared = (x: number, z: number): boolean => owned.some(({ lot }) => inside(lot, x, z));
  const keep = <T>(list: readonly T[], point: (item: T) => readonly [number, number]): readonly T[] => {
    const kept = list.filter((item) => !cleared(...point(item)));
    return kept.length === list.length ? list : kept;
  };
  const extra = owned.map(compound);
  const palms = owned.flatMap(yardPalms);
  const lotGround = new Map(base.lotGround);
  for (const { lotIndex, property } of owned) lotGround.set(lotIndex, GROUND[property.stage]);

  const placement = (item: Placement): readonly [number, number] => [item.x, item.z];
  const plan: CityPlan = {
    ...base,
    placements: {
      ...base.placements,
      commercial: keep(base.placements.commercial, placement),
      suburban: keep(base.placements.suburban, placement),
      nature: [...keep(base.placements.nature, placement), ...palms],
    },
    walls: [
      ...keep(base.walls, (wall) => [(wall.x0 + wall.x1) / 2, (wall.z0 + wall.z1) / 2]),
      ...extra.flatMap((part) => part.walls),
    ],
    gates: [...keep(base.gates, (gate) => [gate.x, gate.z]), ...extra.flatMap((part) => part.gates)],
    colliders: [
      ...keep(base.colliders, (box) => [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2]),
      ...owned.flatMap(bodies),
    ],
    lotGround,
  };
  cache = { key, base, plan };
  return plan;
}
