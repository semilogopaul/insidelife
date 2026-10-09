import type { DistrictId } from '../catalog/geography.js';
import type { BillboardFormat } from '../catalog/promotions.js';
import { createRng } from '../random/rng.js';
import { CITY_MAP, DIR_E, cityDistrictAt, type CityLot, type CityRoadTile } from './city-map.js';
import type { WorldPoint } from './types.js';

/**
 * Advertising surfaces generated from the city layout (the 12 hand-placed premium billboards live in
 * `BILLBOARD_SPECS`). Deterministic: every client and server derives the same list. Ids are tied to the location
 * (tile, side, lot), not to a running number, so changing the counts below adds or removes spots without moving any
 * existing booking. The 3D client draws each spot; the promotions domain prices and sells them (`AD_SLOTS`).
 */

export const AD_PLACEMENT_KINDS = ['street-billboard', 'bus-shelter', 'totem', 'stadium-led', 'market-banner', 'park-board'] as const;
export type AdPlacementKind = (typeof AD_PLACEMENT_KINDS)[number];

/** How many of each the city gets (the single place to grow or shrink the outdoor inventory). */
export const AD_PLACEMENT_COUNTS: Readonly<Record<AdPlacementKind, number>> = {
  'street-billboard': 130,
  'bus-shelter': 150,
  totem: 190,
  'stadium-led': 16,
  'market-banner': 40,
  'park-board': 12,
};

export interface AdPlacementSpot {
  readonly id: string;
  readonly kind: AdPlacementKind;
  readonly districtId: DistrictId;
  /** Street it's on, for the booking list. */
  readonly street: string;
  /** The venue it belongs to (stadium, market and motor-park spots). */
  readonly venueId: string | null;
  /** Centre of the advert face's bottom edge, on the ground plane. */
  readonly position: WorldPoint;
  /** Height of the bottom edge above the ground (metres). */
  readonly elevation: number;
  /** Heading the advert faces (towards viewers), same convention as billboard placements (E = 0, S = π/2). */
  readonly facing: number;
  /** Advert size in metres. */
  readonly width: number;
  readonly height: number;
  readonly format: BillboardFormat;
  /** Printed on both faces (totems, shelter end panels, banners). */
  readonly doubleSided: boolean;
}

/** Physical size and mounting per kind. */
const SHAPE: Readonly<Record<AdPlacementKind, { readonly format: BillboardFormat; readonly width: number; readonly height: number; readonly elevation: number; readonly doubleSided: boolean }>> = {
  'street-billboard': { format: 'landscape', width: 5.4, height: 1.8, elevation: 4.6, doubleSided: false },
  'bus-shelter': { format: 'portrait', width: 1.2, height: 1.8, elevation: 0.35, doubleSided: true },
  totem: { format: 'square', width: 1.3, height: 1.3, elevation: 1.15, doubleSided: true },
  'stadium-led': { format: 'landscape', width: 6, height: 2, elevation: 0.6, doubleSided: false },
  'market-banner': { format: 'landscape', width: 3.6, height: 1.2, elevation: 2.8, doubleSided: true },
  'park-board': { format: 'landscape', width: 4.5, height: 1.5, elevation: 3.2, doubleSided: false },
};

/** Pavement line from a road tile's centre (the kerb-side apron; lamps and poles stand at ±4.5). */
const PAVEMENT = 4.62;
/** Keep generated spots this far from the hand-placed premium boards and from each other (metres, per kind). */
const PREMIUM_CLEARANCE = 14;
const SPACING: Readonly<Record<AdPlacementKind, number>> = {
  'street-billboard': 18,
  'bus-shelter': 20,
  totem: 11,
  'stadium-led': 0,
  'market-banner': 0,
  'park-board': 0,
};

interface Candidate {
  readonly id: string;
  readonly street: string;
  readonly venueId?: string;
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

const headingOf = (dx: number, dz: number): number => Math.atan2(dz, dx);

/** Road axis and the outward side vector for a straight tile. */
function axes(tile: CityRoadTile): { readonly ax: number; readonly az: number; readonly px: number; readonly pz: number } {
  const alongX = (tile.mask & DIR_E) !== 0;
  return alongX ? { ax: 1, az: 0, px: 0, pz: 1 } : { ax: 0, az: 1, px: 1, pz: 0 };
}

/** Is anything already standing here? Lamps, electricity poles (see the city plan) and venue doors. */
function furnitureClash(tile: CityRoadTile, side: number, along: number): boolean {
  const alongX = (tile.mask & DIR_E) !== 0;
  const index = alongX ? tile.col : tile.row;
  if (Math.abs(along) > 1.6) return false;
  if (tile.roadClass !== 'street') return index % 3 === 0 && (index % 2 === 0 ? 1 : -1) === side;
  return (index % 4 === 3 && side === -1) || (index % 3 === 1 && side === 1);
}

const venueDoors: readonly WorldPoint[] = CITY_MAP.lots.flatMap((lot) => (lot.kind === 'venue' && lot.entrance ? [lot.entrance.position] : []));
const premiumBoards: readonly WorldPoint[] = CITY_MAP.billboards.map((board) => board.position);

const near = (points: readonly WorldPoint[], x: number, z: number, radius: number): boolean => points.some((point) => Math.hypot(point.x - x, point.z - z) < radius);

/**
 * Roadside candidates on straight, non-bridge tiles: one per tile side, nudged `along` the tile. The advert faces the
 * oncoming traffic of the near lane, turned `angle` towards the road (0 = end-on, up the road; π/2 = facing the road).
 */
function roadside(prefix: string, accept: (tile: CityRoadTile) => boolean, along: number, angle: number): Candidate[] {
  const out: Candidate[] = [];
  for (const tile of CITY_MAP.roadTiles) {
    if (tile.kind !== 'straight' || tile.bridge || !accept(tile)) continue;
    const { ax, az, px, pz } = axes(tile);
    for (const side of [-1, 1]) {
      if (furnitureClash(tile, side, along)) continue;
      const x = tile.x + px * side * PAVEMENT + ax * along;
      const z = tile.z + pz * side * PAVEMENT + az * along;
      if (near(venueDoors, x, z, 5) || near(premiumBoards, x, z, PREMIUM_CLEARANCE)) continue;
      // Traffic drives on the right: eastbound cars use the south (+z) kerb, northbound (−z) the east (+x) kerb.
      const travelX = ax * side;
      const travelZ = -az * side;
      const facing = headingOf(-travelX * Math.cos(angle) - px * side * Math.sin(angle), -travelZ * Math.cos(angle) - pz * side * Math.sin(angle));
      out.push({ id: `${prefix}-${tile.col}-${tile.row}-${side > 0 ? 'p' : 'n'}`, street: tile.name, x, z, facing });
    }
  }
  return out;
}

/** Seeded pick of `count` candidates at least `spacing` metres apart. */
function pick(kind: AdPlacementKind, candidates: readonly Candidate[], taken: readonly WorldPoint[]): Candidate[] {
  const rng = createRng(`ad-placements:${kind}`);
  const chosen: Candidate[] = [];
  const spacing = SPACING[kind];
  for (const candidate of rng.shuffle(candidates)) {
    if (chosen.length >= AD_PLACEMENT_COUNTS[kind]) break;
    if (spacing > 0 && chosen.some((other) => Math.hypot(other.x - candidate.x, other.z - candidate.z) < spacing)) continue;
    if (near(taken, candidate.x, candidate.z, 3)) continue;
    chosen.push(candidate);
  }
  return chosen;
}

/** Spots around a lot's frontage (markets, motor parks) or its whole footprint (the stadium forecourt). */
function aroundLot(lot: CityLot, prefix: string, count: number, inset: number, wholePerimeter: boolean): Candidate[] {
  const { minX, minZ, maxX, maxZ } = lot.footprint;
  const sides = wholePerimeter ? (['N', 'E', 'S', 'W'] as const) : ([lot.front ?? 'S'] as const);
  const out: Candidate[] = [];
  // One extra spot per side so the ones in front of the entrance (kept clear for people walking in) can be dropped.
  const perSide = Math.ceil(count / sides.length) + 1;
  const door = lot.entrance?.position;
  for (const side of sides) {
    for (let i = 0; i < perSide && out.length < count; i++) {
      const t = (i + 0.5) / perSide;
      const x = side === 'E' ? maxX - inset : side === 'W' ? minX + inset : minX + (maxX - minX) * t;
      const z = side === 'S' ? maxZ - inset : side === 'N' ? minZ + inset : minZ + (maxZ - minZ) * t;
      if (door && Math.hypot(door.x - x, door.z - z) < 7) continue;
      const facing = side === 'E' ? 0 : side === 'S' ? Math.PI / 2 : side === 'W' ? Math.PI : -Math.PI / 2;
      out.push({ id: `${prefix}-${CITY_MAP.lots.indexOf(lot)}-${out.length + 1}`, street: lot.street ?? '', venueId: lot.venueId, x, z, facing });
    }
  }
  return out;
}

function spots(kind: AdPlacementKind, candidates: readonly Candidate[]): AdPlacementSpot[] {
  const shape = SHAPE[kind];
  return candidates.map((candidate) => ({
    id: candidate.id,
    kind,
    districtId: cityDistrictAt({ x: candidate.x, z: candidate.z }),
    street: candidate.street,
    venueId: candidate.venueId ?? null,
    position: { x: candidate.x, z: candidate.z },
    elevation: shape.elevation,
    facing: candidate.facing,
    width: shape.width,
    height: shape.height,
    format: shape.format,
    doubleSided: shape.doubleSided,
  }));
}

function generate(): AdPlacementSpot[] {
  const big = (tile: CityRoadTile): boolean => tile.roadClass !== 'street';
  // Billboards stand ~33° off the kerb line so the panel clears both the carriageway and the buildings behind it.
  const billboards = pick('street-billboard', roadside('sb', big, 2.2, 1.0), premiumBoards);
  const shelters = pick('bus-shelter', roadside('bs', () => true, -2.2, 0), [...premiumBoards, ...billboards]);
  const totems = pick('totem', roadside('tt', (tile) => tile.roadClass !== 'expressway', 0.4, 0), [...premiumBoards, ...billboards, ...shelters]);
  const lotsOf = (archetype: string): CityLot[] => CITY_MAP.lots.filter((lot) => lot.archetype === archetype);
  const stadium = lotsOf('stadium').flatMap((lot) => aroundLot(lot, 'led', AD_PLACEMENT_COUNTS['stadium-led'], 3, true));
  const markets = lotsOf('market');
  const marketBanners = markets.flatMap((lot) => aroundLot(lot, 'mk', Math.round(AD_PLACEMENT_COUNTS['market-banner'] / Math.max(1, markets.length)), 2.5, true));
  const parks = lotsOf('motor-park');
  const parkBoards = parks.flatMap((lot) => aroundLot(lot, 'mp', Math.round(AD_PLACEMENT_COUNTS['park-board'] / Math.max(1, parks.length)), 2, false));
  return [
    ...spots('street-billboard', billboards),
    ...spots('bus-shelter', shelters),
    ...spots('totem', totems),
    ...spots('stadium-led', stadium),
    ...spots('market-banner', marketBanners),
    ...spots('park-board', parkBoards),
  ].toSorted((a, b) => a.id.localeCompare(b.id));
}

/** Every generated advertising surface in the city. */
export const AD_PLACEMENTS: readonly AdPlacementSpot[] = generate();

const PLACEMENT_INDEX: ReadonlyMap<string, AdPlacementSpot> = new Map(AD_PLACEMENTS.map((spot) => [spot.id, spot]));

export function findAdPlacement(id: string): AdPlacementSpot | undefined {
  return PLACEMENT_INDEX.get(id);
}
