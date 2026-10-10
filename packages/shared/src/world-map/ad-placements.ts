import type { DistrictId } from '../catalog/geography.js';
import type { BillboardFormat } from '../catalog/promotions.js';
import { createRng } from '../random/rng.js';
import { BILLBOARD_SPECS, CARRIAGEWAY_HALF_WIDTH } from './city-layout.js';
import { CITY_LAYOUT, CITY_MAP, DIR_E, layoutToWorld, type CityLot, type CityRoadTile } from './city-map.js';
import { nearestRoadPoint } from './routing.js';
import type { WorldPoint } from './types.js';

/**
 * Advertising surfaces generated from the city layout (the 12 hand-placed premium billboards live in
 * `BILLBOARD_SPECS`). Deterministic: every client and server derives the same list. Ids are tied to the location
 * (tile, side, lot), not to a running number, so changing the counts below adds or removes spots without moving any
 * existing booking. The 3D client draws each spot; the promotions domain prices and sells them (`AD_SLOTS`).
 *
 * Spots are chosen in the city's *layout* (`CITY_LAYOUT`: the first city's 10 m grid and two-lane roads), so the
 * picking — and with it every id — never depends on road widths; each chosen spot is then placed in the world with
 * `layoutToWorld` (on the four-lane roads' pavements, the same spot moved outwards with the kerb).
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
  /**
   * Where the spot is: the point its id was picked at (in today's world). Bookings belong to it; it never moves.
   * `position` is where the board stands — the same point, or a few metres along the kerb when a door is too close.
   */
  readonly anchor: WorldPoint;
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

interface AdShape {
  readonly format: BillboardFormat;
  /** Advert size in metres (the format's aspect). Spots narrow where a neighbour would touch (`fitFaces`). */
  readonly width: number;
  readonly height: number;
  readonly elevation: number;
  readonly doubleSided: boolean;
  /** Roadside kinds: how far the face stands back from the pavement line, away from the road (metres). */
  readonly setback: number;
}

/**
 * Physical size and mounting per kind, sized to read from the street on a phone (about 1.6–1.8× the area of the first
 * city) while staying off the carriageway and clear of building fronts and doors (`ad-placements.spec.ts`): low faces
 * (shelters, totems) stand back from the kerb so their whole width is over the pavement; street billboards are overhead
 * and turned a little more along the kerb, so the bigger panel reaches no further over the road than the old one.
 */
const SHAPE: Readonly<Record<AdPlacementKind, AdShape>> = {
  'street-billboard': { format: 'landscape', width: 7.2, height: 2.4, elevation: 4.8, doubleSided: false, setback: 0.2 },
  'bus-shelter': { format: 'portrait', width: 1.6, height: 2.4, elevation: 0.3, doubleSided: true, setback: 0.5 },
  totem: { format: 'square', width: 1.7, height: 1.7, elevation: 1, doubleSided: true, setback: 0.35 },
  'stadium-led': { format: 'landscape', width: 7.5, height: 2.5, elevation: 0.5, doubleSided: false, setback: 0 },
  'market-banner': { format: 'landscape', width: 4.5, height: 1.5, elevation: 2.8, doubleSided: true, setback: 0 },
  'park-board': { format: 'landscape', width: 5.7, height: 1.9, elevation: 3.2, doubleSided: false, setback: 0 },
};

/** Street billboards turn this far from end-on (up the road) towards the road: about 26° off the kerb line. */
const BILLBOARD_ANGLE = 1.12;
/** The least gap between two faces at overlapping heights (metres). */
export const AD_FACE_GAP = 0.3;

/** Pavement line from a road tile's centre in the layout (the kerb-side apron; in the world it moves out with the kerb). */
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
  /** Layout position (where it was picked). */
  readonly x: number;
  readonly z: number;
  readonly facing: number;
  /** Away from the road (roadside candidates only): the direction a setback moves the face. */
  readonly away?: WorldPoint;
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

// Doors and premium boards where the first city had them (layout metres): picking measures against these.
const venueDoors: readonly WorldPoint[] = CITY_MAP.lots.flatMap((lot, index) => {
  const door = CITY_LAYOUT.lot(index).door;
  return lot.kind === 'venue' && lot.entrance && door ? [door] : [];
});
const premiumBoards: readonly WorldPoint[] = CITY_MAP.billboards.flatMap((board) => {
  const spec = BILLBOARD_SPECS.find((entry) => entry.slotId === board.slotId);
  return spec ? [{ x: CITY_LAYOUT.cellCentreX(spec.cell[0]) + spec.offset[0], z: CITY_LAYOUT.cellCentreZ(spec.cell[1]) + spec.offset[1] }] : [];
});

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
    const tx = CITY_LAYOUT.cellCentreX(tile.col);
    const tz = CITY_LAYOUT.cellCentreZ(tile.row);
    for (const side of [-1, 1]) {
      if (furnitureClash(tile, side, along)) continue;
      const x = tx + px * side * PAVEMENT + ax * along;
      const z = tz + pz * side * PAVEMENT + az * along;
      if (near(venueDoors, x, z, 5) || near(premiumBoards, x, z, PREMIUM_CLEARANCE)) continue;
      // Traffic drives on the right: eastbound cars use the south (+z) kerb, northbound (−z) the east (+x) kerb.
      const travelX = ax * side;
      const travelZ = -az * side;
      const facing = headingOf(-travelX * Math.cos(angle) - px * side * Math.sin(angle), -travelZ * Math.cos(angle) - pz * side * Math.sin(angle));
      out.push({ id: `${prefix}-${tile.col}-${tile.row}-${side > 0 ? 'p' : 'n'}`, street: tile.name, x, z, facing, away: { x: px * side, z: pz * side } });
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
  const index = CITY_MAP.lots.indexOf(lot);
  const layout = CITY_LAYOUT.lot(index);
  const { minX, minZ, maxX, maxZ } = layout.footprint;
  const sides = wholePerimeter ? (['N', 'E', 'S', 'W'] as const) : ([lot.front ?? 'S'] as const);
  const out: Candidate[] = [];
  // One extra spot per side so the ones in front of the entrance (kept clear for people walking in) can be dropped.
  const perSide = Math.ceil(count / sides.length) + 1;
  const door = lot.entrance ? layout.door : null;
  for (const side of sides) {
    for (let i = 0; i < perSide && out.length < count; i++) {
      const t = (i + 0.5) / perSide;
      const x = side === 'E' ? maxX - inset : side === 'W' ? minX + inset : minX + (maxX - minX) * t;
      const z = side === 'S' ? maxZ - inset : side === 'N' ? minZ + inset : minZ + (maxZ - minZ) * t;
      if (door && Math.hypot(door.x - x, door.z - z) < 7) continue;
      const facing = side === 'E' ? 0 : side === 'S' ? Math.PI / 2 : side === 'W' ? Math.PI : -Math.PI / 2;
      out.push({ id: `${prefix}-${index}-${out.length + 1}`, street: lot.street ?? '', venueId: lot.venueId, x, z, facing });
    }
  }
  return out;
}

function spots(kind: AdPlacementKind, candidates: readonly Candidate[]): AdPlacementSpot[] {
  const shape = SHAPE[kind];
  // The setback moves the face, never the candidate: picking (and so every id) is decided before it.
  return candidates.map((candidate) => {
    const at = layoutToWorld(candidate);
    const anchor = { x: at.x + (candidate.away?.x ?? 0) * shape.setback, z: at.z + (candidate.away?.z ?? 0) * shape.setback };
    if (candidate.away) kerbOf.set(candidate.id, { x: Math.abs(candidate.away.z), z: Math.abs(candidate.away.x) });
    return {
    id: candidate.id,
    kind,
    districtId: CITY_LAYOUT.districtAt(candidate),
    street: candidate.street,
    venueId: candidate.venueId ?? null,
    anchor,
    position: anchor,
    elevation: shape.elevation,
    facing: candidate.facing,
    width: shape.width,
    height: shape.height,
    format: shape.format,
    doubleSided: shape.doubleSided,
    };
  });
}

// ----- Doors stay clear ------------------------------------------------------------------------------------------------

/** No board, pole or shelter stands closer than this to any door (venues, homes, office blocks), in metres. */
export const AD_DOOR_CLEARANCE = 3;
/** Roadside spots: the direction along their kerb (the way a board may slide within its spot). */
const kerbOf = new Map<string, WorldPoint>();
/** Every front door in the city (world metres). */
const cityDoors: readonly WorldPoint[] = CITY_MAP.lots.flatMap((lot) => (lot.entrance ? [lot.entrance.position] : []));
/** The furthest a board slides along its kerb to clear a door (metres: up to the next frontage, never into the road). */
const MAX_SLIDE = 9.5;
/** Structures of two spots keep at least this far apart when one slides (metres). */
const STRUCTURE_GAP = 0.9;
/** A board that slides keeps at least this far from others of its kind (metres; its kind may ask for less). */
const MOVED_SPACING = 18;

/**
 * The ground points a spot's structure stands on: a totem's base and panel, a shelter's panel and the shelter running
 * behind it along the pavement, a street billboard's pole. What must stay clear of doors (and of each other).
 */
export function adFootprint(spot: Pick<AdPlacementSpot, 'kind' | 'position' | 'facing' | 'width'>): readonly WorldPoint[] {
  const { x, z } = spot.position;
  const bx = -Math.cos(spot.facing);
  const bz = -Math.sin(spot.facing);
  const ux = -Math.sin(spot.facing);
  const uz = Math.cos(spot.facing);
  const at = (back: number, side: number): WorldPoint => ({ x: x + bx * back + ux * side, z: z + bz * back + uz * side });
  switch (spot.kind) {
    case 'street-billboard':
      return [at(0.4, 0)];
    case 'bus-shelter':
      return [at(0, -spot.width / 2), at(0, spot.width / 2), at(1.5, -0.85), at(1.5, 0.85), at(3, -0.85), at(3, 0.85)];
    case 'totem':
      return [at(0, -spot.width / 2), at(0, 0), at(0, spot.width / 2)];
    default:
      return [];
  }
}

const clearOfDoors = (points: readonly WorldPoint[], doors: readonly WorldPoint[] = cityDoors): boolean =>
  points.every((point) => doors.every((door) => Math.hypot(door.x - point.x, door.z - point.z) >= AD_DOOR_CLEARANCE));

/** On the pavement: low structures never reach the carriageway; a billboard's pole stands off it and its face overhangs little. */
function offTheRoad(spot: AdPlacementSpot, points: readonly WorldPoint[]): boolean {
  const kerb = CARRIAGEWAY_HALF_WIDTH - 0.1;
  const clear = (point: WorldPoint, distance: number): boolean => (nearestRoadPoint(point)?.distance ?? 0) >= distance;
  if (spot.kind === 'street-billboard') return points.every((point) => clear(point, kerb)) && adFaceEnds(spot).every((end) => clear(end, kerb - 1.4));
  return [...points, spot.position].every((point) => clear(point, kerb));
}

/**
 * Slide every roadside board that stands at a door along its kerb, within its spot, until it's `AD_DOOR_CLEARANCE`
 * from every door, on the pavement and clear of the other structures. Picking (and so every id and `anchor`) was
 * decided before this; only `position` moves. Deterministic.
 */
function clearDoorways(input: readonly AdPlacementSpot[]): AdPlacementSpot[] {
  const out = input.map((spot) => ({ ...spot }));
  const reach = MAX_SLIDE + 8;
  const slides: number[] = [];
  for (let step = 0.25; step <= MAX_SLIDE + 1e-9; step += 0.25) slides.push(step, -step);
  out.forEach((spot, index) => {
    const kerb = kerbOf.get(spot.id);
    const doors = cityDoors.filter((door) => Math.hypot(door.x - spot.anchor.x, door.z - spot.anchor.z) < reach);
    if (!kerb || clearOfDoors(adFootprint(spot), doors)) return;
    // The other structures it could slide into (as they stand now: earlier spots may have slid already).
    const nearby = out.flatMap((other, at) =>
      at === index || Math.hypot(other.position.x - spot.anchor.x, other.position.z - spot.anchor.z) > reach ? [] : [...adFootprint(other), other.position],
    );
    // …and the spacing its kind keeps between spots (a shelter every 20 m, not two at one stop).
    const sameKind = out.filter((other, at) => at !== index && other.kind === spot.kind).map((other) => other.position);
    for (const slide of slides) {
      const moved = { ...spot, position: { x: spot.anchor.x + kerb.x * slide, z: spot.anchor.z + kerb.z * slide } };
      const points = adFootprint(moved);
      if (!clearOfDoors(points, doors)) continue;
      if (near(sameKind, moved.position.x, moved.position.z, Math.min(SPACING[spot.kind], MOVED_SPACING))) continue;
      if (points.some((point) => nearby.some((other) => Math.hypot(other.x - point.x, other.z - point.z) < STRUCTURE_GAP))) continue;
      if (!offTheRoad(moved, points)) continue;
      out[index] = moved;
      return;
    }
  });
  return out;
}

/** A face as a ground segment with a height range: what `fitFaces` and the spec compare. */
export interface AdFaceExtent {
  readonly position: WorldPoint;
  readonly facing: number;
  readonly width: number;
  readonly height: number;
  readonly elevation: number;
}

/** The two ends of a face on the ground plane. */
export function adFaceEnds(face: Pick<AdFaceExtent, 'position' | 'facing' | 'width'>): readonly [WorldPoint, WorldPoint] {
  const ax = (-Math.sin(face.facing) * face.width) / 2;
  const az = (Math.cos(face.facing) * face.width) / 2;
  return [
    { x: face.position.x - ax, z: face.position.z - az },
    { x: face.position.x + ax, z: face.position.z + az },
  ];
}

/** Closest approach of two ground segments, and where it happens along each (0–1). */
function segmentGap(a0: WorldPoint, a1: WorldPoint, b0: WorldPoint, b1: WorldPoint): { readonly gap: number; readonly ta: number; readonly tb: number } {
  const ux = a1.x - a0.x;
  const uz = a1.z - a0.z;
  const vx = b1.x - b0.x;
  const vz = b1.z - b0.z;
  const cross = ux * vz - uz * vx;
  if (Math.abs(cross) > 1e-9) {
    const ta = ((b0.x - a0.x) * vz - (b0.z - a0.z) * vx) / cross;
    const tb = ((b0.x - a0.x) * uz - (b0.z - a0.z) * ux) / cross;
    if (ta >= 0 && ta <= 1 && tb >= 0 && tb <= 1) return { gap: 0, ta, tb };
  }
  const along = (p: WorldPoint, s: WorldPoint, sx: number, sz: number): number => {
    const length = sx * sx + sz * sz;
    return length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.x) * sx + (p.z - s.z) * sz) / length));
  };
  let best = { gap: Number.POSITIVE_INFINITY, ta: 0, tb: 0 };
  for (const [ta, tb] of [
    [0, along(a0, b0, vx, vz)],
    [1, along(a1, b0, vx, vz)],
    [along(b0, a0, ux, uz), 0],
    [along(b1, a0, ux, uz), 1],
  ] as const) {
    const gap = Math.hypot(a0.x + ux * ta - (b0.x + vx * tb), a0.z + uz * ta - (b0.z + vz * tb));
    if (gap < best.gap) best = { gap, ta, tb };
  }
  return best;
}

/** Horizontal gap between two faces whose height ranges overlap (Infinity when one is wholly above the other). */
export function adFaceGap(a: AdFaceExtent, b: AdFaceExtent): number {
  if (Math.min(a.elevation + a.height, b.elevation + b.height) <= Math.max(a.elevation, b.elevation)) return Number.POSITIVE_INFINITY;
  const [a0, a1] = adFaceEnds(a);
  const [b0, b1] = adFaceEnds(b);
  return segmentGap(a0, a1, b0, b1).gap;
}

/** A face is never narrowed below this share of its kind's size. */
const MIN_FIT_SCALE = 0.5;

type Sized = { width: number; height: number };

/**
 * Spots packed along a lot's sides (stadium LEDs, market banners, motor-park boards) or standing near a premium board
 * could touch a neighbour at full size. Narrow the face whose end is in the way (format aspect kept; premium boards
 * never change) until every pair at overlapping heights is `AD_FACE_GAP` apart. Deterministic; never moves or drops a spot.
 */
function fitFaces(input: readonly AdPlacementSpot[], fixed: readonly AdFaceExtent[]): AdPlacementSpot[] {
  const out: (AdPlacementSpot & Sized)[] = input.map((spot) => ({ ...spot }));
  const faces: { readonly face: AdFaceExtent; readonly spot: (AdPlacementSpot & Sized) | null }[] = [...out.map((spot) => ({ face: spot, spot })), ...fixed.map((face) => ({ face, spot: null }))];
  // Only pairs that could touch at full size are ever compared.
  const pairs: (readonly [number, number])[] = [];
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const a = faces[i] as (typeof faces)[number];
      const b = faces[j] as (typeof faces)[number];
      if (!a.spot && !b.spot) continue;
      if (Math.hypot(a.face.position.x - b.face.position.x, a.face.position.z - b.face.position.z) < (a.face.width + b.face.width) / 2 + AD_FACE_GAP) pairs.push([i, j]);
    }
  }
  const shrink = (spot: (AdPlacementSpot & Sized) | null): void => {
    if (!spot || spot.width <= SHAPE[spot.kind].width * MIN_FIT_SCALE) return;
    spot.width *= 0.95;
    spot.height *= 0.95;
  };
  for (let pass = 0; pass < 60; pass++) {
    let touching = false;
    for (const [i, j] of pairs) {
      const a = faces[i] as (typeof faces)[number];
      const b = faces[j] as (typeof faces)[number];
      if (adFaceGap(a.face, b.face) >= AD_FACE_GAP) continue;
      touching = true;
      const [a0, a1] = adFaceEnds(a.face);
      const [b0, b1] = adFaceEnds(b.face);
      const { ta, tb } = segmentGap(a0, a1, b0, b1);
      const aEnd = ta < 0.02 || ta > 0.98;
      const bEnd = tb < 0.02 || tb > 0.98;
      // Narrowing a face only helps when its end is what touches the other.
      if (aEnd && !bEnd) shrink(a.spot ?? b.spot);
      else if (bEnd && !aEnd) shrink(b.spot ?? a.spot);
      else shrink(!b.spot || (a.spot && a.face.width >= b.face.width) ? a.spot : b.spot);
    }
    if (!touching) break;
  }
  return out;
}

function generate(): AdPlacementSpot[] {
  const big = (tile: CityRoadTile): boolean => tile.roadClass !== 'street';
  // Billboards stand ~26° off the kerb line: overhead, the panel reaches less than a metre over the road and clears the
  // building fronts behind it.
  const billboards = pick('street-billboard', roadside('sb', big, 2.2, BILLBOARD_ANGLE), premiumBoards);
  const shelters = pick('bus-shelter', roadside('bs', () => true, -2.2, 0), [...premiumBoards, ...billboards]);
  const totems = pick('totem', roadside('tt', (tile) => tile.roadClass !== 'expressway', 0.4, 0), [...premiumBoards, ...billboards, ...shelters]);
  const lotsOf = (archetype: string): CityLot[] => CITY_MAP.lots.filter((lot) => lot.archetype === archetype);
  const stadium = lotsOf('stadium').flatMap((lot) => aroundLot(lot, 'led', AD_PLACEMENT_COUNTS['stadium-led'], 3, true));
  const markets = lotsOf('market');
  const marketBanners = markets.flatMap((lot) => aroundLot(lot, 'mk', Math.round(AD_PLACEMENT_COUNTS['market-banner'] / Math.max(1, markets.length)), 2.5, true));
  const parks = lotsOf('motor-park');
  const parkBoards = parks.flatMap((lot) => aroundLot(lot, 'mp', Math.round(AD_PLACEMENT_COUNTS['park-board'] / Math.max(1, parks.length)), 2, false));
  const all = [
    ...spots('street-billboard', billboards),
    ...spots('bus-shelter', shelters),
    ...spots('totem', totems),
    ...spots('stadium-led', stadium),
    ...spots('market-banner', marketBanners),
    ...spots('park-board', parkBoards),
  ].toSorted((a, b) => a.id.localeCompare(b.id));
  // Twice: a board blocked by a neighbour that slid away later in the first pass gets another go.
  return fitFaces(clearDoorways(clearDoorways(all)), CITY_MAP.billboards);
}

/** Every generated advertising surface in the city. */
export const AD_PLACEMENTS: readonly AdPlacementSpot[] = generate();

const PLACEMENT_INDEX: ReadonlyMap<string, AdPlacementSpot> = new Map(AD_PLACEMENTS.map((spot) => [spot.id, spot]));

export function findAdPlacement(id: string): AdPlacementSpot | undefined {
  return PLACEMENT_INDEX.get(id);
}
