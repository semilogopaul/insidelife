import { DISTRICT_IDS, type DistrictId } from '../catalog/geography.js';
import { BILLBOARD_FORMAT_SPECS, BILLBOARD_SLOTS, type BillboardFormat, type BillboardSlotId } from '../catalog/promotions.js';
import { VENUES, type VenueDefinition, type VenueType } from '../catalog/venues.js';
import { hashString } from '../random/rng.js';
import {
  BILLBOARD_SPECS,
  CITY_CELL_SIZE,
  CITY_COLS,
  CITY_ROWS,
  DISTRICT_RECTS,
  HOME_SHARE,
  LANDMARKS,
  ROADS,
  ROUNDABOUTS,
  TERRAIN_RECTS,
  VENUE_LOTS,
  type BillboardMount,
  type CellRect,
  type CompassSide,
  type LotArchetype,
  type RoadClass,
} from './city-layout.js';
import type { Entrance, WorldPoint } from './types.js';

/**
 * Builds the CityMap once at module load from the authored layout: terrain and districts per cell, road tiles,
 * the road graph (nodes at junctions, bends and name changes; straight edges between them), venue/home lots with
 * doors and parking, and billboard placements. Pure and deterministic — the server and the client agree exactly.
 */

// ---------------------------------------------------------------------------------------------------------------
// Grid geometry
// ---------------------------------------------------------------------------------------------------------------

const S = CITY_CELL_SIZE;
const ORIGIN_X = (-CITY_COLS * S) / 2;
const ORIGIN_Z = (-CITY_ROWS * S) / 2;
const CELL_COUNT = CITY_COLS * CITY_ROWS;

export interface CityBounds {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

/** Playable extent of the city in world metres. */
export const CITY_BOUNDS: CityBounds = { minX: ORIGIN_X, minZ: ORIGIN_Z, maxX: -ORIGIN_X, maxZ: -ORIGIN_Z };

export const cellCentreX = (col: number): number => ORIGIN_X + (col + 0.5) * S;
export const cellCentreZ = (row: number): number => ORIGIN_Z + (row + 0.5) * S;
export const colAt = (x: number): number => Math.floor((x - ORIGIN_X) / S);
export const rowAt = (z: number): number => Math.floor((z - ORIGIN_Z) / S);
const clampCol = (col: number): number => (col < 0 ? 0 : col >= CITY_COLS ? CITY_COLS - 1 : col);
const clampRow = (row: number): number => (row < 0 ? 0 : row >= CITY_ROWS ? CITY_ROWS - 1 : row);
export const cellIndex = (col: number, row: number): number => row * CITY_COLS + col;
const inGrid = (col: number, row: number): boolean => col >= 0 && col < CITY_COLS && row >= 0 && row < CITY_ROWS;

/** Direction bits of a road cell's connections. */
export const DIR_N = 1;
export const DIR_E = 2;
export const DIR_S = 4;
export const DIR_W = 8;
const DIRS = [DIR_N, DIR_E, DIR_S, DIR_W] as const;
const DIR_DC = [0, 1, 0, -1] as const;
const DIR_DR = [-1, 0, 1, 0] as const;
const OPPOSITE = [2, 3, 0, 1] as const;
const SIDE_DIR: Readonly<Record<CompassSide, number>> = { N: 0, E: 1, S: 2, W: 3 };

const at = <T>(list: readonly T[], index: number): T => list[index] as T;

// ---------------------------------------------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------------------------------------------

export type CityCellKind = 'land' | 'water' | 'sand' | 'road' | 'bridge' | 'roundabout';
const CELL_KINDS: readonly CityCellKind[] = ['land', 'water', 'sand', 'road', 'bridge', 'roundabout'];
const K_LAND = 0;
const K_WATER = 1;
const K_SAND = 2;
const K_ROAD = 3;
const K_BRIDGE = 4;
const K_ROUNDABOUT = 5;

export type CityRoadTileKind = 'straight' | 'bend' | 'tee' | 'cross' | 'end' | 'roundabout';

export interface CityRoadTile {
  readonly col: number;
  readonly row: number;
  /** Cell centre (world). */
  readonly x: number;
  readonly z: number;
  readonly kind: CityRoadTileKind;
  /** Connection bits (DIR_N | DIR_E | DIR_S | DIR_W). */
  readonly mask: number;
  readonly bridge: boolean;
  readonly roadClass: RoadClass;
  readonly name: string;
}

export interface CityRoadNode {
  readonly id: number;
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly z: number;
  /** Number of roads meeting here (1 dead end, 2 bend/name change, 3 T, 4 crossroads). */
  readonly degree: number;
  readonly roundabout: boolean;
}

export interface CityRoadEdge {
  readonly id: number;
  readonly a: number;
  readonly b: number;
  readonly length: number;
  readonly name: string;
  readonly roadClass: RoadClass;
  /** True when the edge crosses water (any of its cells is a bridge). */
  readonly bridge: boolean;
  /** Unit direction a → b. */
  readonly dx: number;
  readonly dz: number;
}

export type CityLotKind = 'venue' | 'home' | 'building' | 'infill' | 'landmark';

export interface CityLot {
  /** Venue id for venue lots, `landmark:<id>`, or `lot:<col>:<row>`. */
  readonly id: string;
  readonly kind: CityLotKind;
  readonly districtId: DistrictId;
  readonly venueId?: string;
  readonly archetype?: LotArchetype;
  /** Inclusive cell rectangle. */
  readonly cells: CellRect;
  /** World-space footprint of the lot cells. */
  readonly footprint: CityBounds;
  /** Side that faces the road (absent for interior infill). */
  readonly front?: CompassSide;
  readonly entrance?: Entrance;
  /** Street the door opens onto. */
  readonly street?: string;
  /** Stable per-lot seed for visual variety. */
  readonly seed: number;
}

export interface BillboardWorldPlacement {
  readonly slotId: BillboardSlotId;
  /** Centre of the advert face's bottom edge, on the ground plane. */
  readonly position: WorldPoint;
  /** Height of the bottom edge above the ground (metres). */
  readonly elevation: number;
  /** Direction the advert faces (towards viewers); see `Entrance` for the heading convention. */
  readonly facing: number;
  readonly width: number;
  readonly height: number;
  readonly format: BillboardFormat;
  readonly mount: BillboardMount;
  readonly districtId: DistrictId;
}

export interface CityBridge {
  readonly name: string;
  readonly from: WorldPoint;
  readonly to: WorldPoint;
  readonly length: number;
}

export interface CityRoundabout {
  readonly name: string;
  readonly centre: WorldPoint;
  readonly nodeId: number;
  /** Radius of the driving ring (metres). */
  readonly ringRadius: number;
}

export interface CityMap {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly bounds: CityBounds;
  /** Cell kind codes, row-major (`cellKindOf` decodes). */
  readonly cells: Uint8Array;
  /** District index (into DISTRICT_IDS) per cell. */
  readonly districts: Uint8Array;
  /** Road connection bits per cell. */
  readonly roadMask: Uint8Array;
  /** Lot index per cell or -1. */
  readonly lotIndex: Int32Array;
  readonly roadTiles: readonly CityRoadTile[];
  readonly nodes: readonly CityRoadNode[];
  readonly edges: readonly CityRoadEdge[];
  readonly lots: readonly CityLot[];
  readonly bridges: readonly CityBridge[];
  readonly roundabouts: readonly CityRoundabout[];
  readonly billboards: readonly BillboardWorldPlacement[];
}

// ---------------------------------------------------------------------------------------------------------------
// Terrain & districts
// ---------------------------------------------------------------------------------------------------------------

const UNASSIGNED = 255;

function paintRects<T>(target: { [index: number]: T }, rects: ReadonlyArray<readonly [T, CellRect]>): void {
  for (const [value, [c0, r0, c1, r1]] of rects) {
    for (let r = Math.max(0, r0); r <= Math.min(CITY_ROWS - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(CITY_COLS - 1, c1); c++) target[cellIndex(c, r)] = value;
    }
  }
}

function buildDistricts(): Uint8Array {
  const districts = new Uint8Array(CELL_COUNT).fill(UNASSIGNED);
  paintRects(
    districts,
    DISTRICT_RECTS.map(([id, rect]) => [DISTRICT_IDS.indexOf(id), rect] as const),
  );
  // Multi-source BFS: water and unpainted cells take the nearest painted district.
  const queue = new Int32Array(CELL_COUNT);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < CELL_COUNT; i++) if (districts[i] !== UNASSIGNED) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++] as number;
    const col = i % CITY_COLS;
    const row = (i - col) / CITY_COLS;
    for (let d = 0; d < 4; d++) {
      const nc = col + at(DIR_DC, d);
      const nr = row + at(DIR_DR, d);
      if (!inGrid(nc, nr)) continue;
      const n = cellIndex(nc, nr);
      if (districts[n] !== UNASSIGNED) continue;
      districts[n] = districts[i] as number;
      queue[tail++] = n;
    }
  }
  return districts;
}

function buildTerrain(): Uint8Array {
  const terrain = new Uint8Array(CELL_COUNT).fill(K_LAND);
  const code = { land: K_LAND, water: K_WATER, sand: K_SAND } as const;
  paintRects(
    terrain,
    TERRAIN_RECTS.map(([kind, rect]) => [code[kind], rect] as const),
  );
  return terrain;
}

// ---------------------------------------------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------------------------------------------

const ROAD_CLASS_RANK: Readonly<Record<RoadClass, number>> = { expressway: 3, arterial: 2, street: 1 };

interface RoadRaster {
  readonly mask: Uint8Array;
  /** Road name per (cell, direction) connection. */
  readonly connName: (string | undefined)[];
  readonly connClass: (RoadClass | undefined)[];
}

function dirIndexBetween(c0: number, r0: number, c1: number, r1: number): number {
  if (c1 > c0) return 1;
  if (c1 < c0) return 3;
  if (r1 > r0) return 2;
  return 0;
}

function rasterizeRoads(): RoadRaster {
  const mask = new Uint8Array(CELL_COUNT);
  const connName: (string | undefined)[] = new Array<string | undefined>(CELL_COUNT * 4);
  const connClass: (RoadClass | undefined)[] = new Array<RoadClass | undefined>(CELL_COUNT * 4);
  for (const spec of ROADS) {
    for (let p = 1; p < spec.points.length; p++) {
      const [ac, ar] = at(spec.points, p - 1);
      const [bc, br] = at(spec.points, p);
      if (ac !== bc && ar !== br) throw new Error(`Road "${spec.name}" has a diagonal segment`);
      const d = dirIndexBetween(ac, ar, bc, br);
      const steps = Math.abs(bc - ac) + Math.abs(br - ar);
      let c = ac;
      let r = ar;
      for (let s = 0; s < steps; s++) {
        const nc = c + at(DIR_DC, d);
        const nr = r + at(DIR_DR, d);
        const a = cellIndex(c, r);
        const b = cellIndex(nc, nr);
        mask[a] = (mask[a] as number) | at(DIRS, d);
        mask[b] = (mask[b] as number) | at(DIRS, at(OPPOSITE, d));
        connName[a * 4 + d] = spec.name;
        connName[b * 4 + at(OPPOSITE, d)] = spec.name;
        connClass[a * 4 + d] = spec.class;
        connClass[b * 4 + at(OPPOSITE, d)] = spec.class;
        c = nc;
        r = nr;
      }
    }
  }
  return { mask, connName, connClass };
}

const popcount4 = (mask: number): number => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
const isStraight = (mask: number): boolean => mask === (DIR_N | DIR_S) || mask === (DIR_E | DIR_W);

function tileKindOf(mask: number): CityRoadTileKind {
  const degree = popcount4(mask);
  if (degree <= 1) return 'end';
  if (degree === 2) return isStraight(mask) ? 'straight' : 'bend';
  return degree === 3 ? 'tee' : 'cross';
}

/** Name and class of the most important road through a cell. */
function cellRoadInfo(raster: RoadRaster, index: number): { name: string; roadClass: RoadClass } {
  let name = '';
  let roadClass: RoadClass = 'street';
  let rank = 0;
  for (let d = 0; d < 4; d++) {
    const n = raster.connName[index * 4 + d];
    const k = raster.connClass[index * 4 + d];
    if (!n || !k) continue;
    if (ROAD_CLASS_RANK[k] > rank) {
      rank = ROAD_CLASS_RANK[k];
      name = n;
      roadClass = k;
    }
  }
  return { name, roadClass };
}

// ---------------------------------------------------------------------------------------------------------------
// Lots
// ---------------------------------------------------------------------------------------------------------------

/** Door trigger inset from the lot edge (metres) — on the pavement in front of the facade. */
const ENTRANCE_INSET = 0.9;
/** Districts always have at least this many residential lots. */
const MIN_HOMES_PER_DISTRICT = 6;
/** Kerbside parking offset from the road centreline (metres). */
const PARKING_OFFSET = 2.4;

const SIDE_VECTORS: Readonly<Record<CompassSide, readonly [number, number]>> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

const normaliseAngle = (angle: number): number => {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
};

function rectFootprint([c0, r0, c1, r1]: CellRect): CityBounds {
  return { minX: ORIGIN_X + c0 * S, minZ: ORIGIN_Z + r0 * S, maxX: ORIGIN_X + (c1 + 1) * S, maxZ: ORIGIN_Z + (r1 + 1) * S };
}

/** Door cell of a lot along its front. */
function doorCell([c0, r0, c1, r1]: CellRect, front: CompassSide, door?: number): readonly [number, number] {
  if (front === 'N' || front === 'S') {
    const width = c1 - c0 + 1;
    const offset = Math.min(width - 1, Math.max(0, door ?? Math.floor(width / 2)));
    return [c0 + offset, front === 'N' ? r0 : r1];
  }
  const depth = r1 - r0 + 1;
  const offset = Math.min(depth - 1, Math.max(0, door ?? Math.floor(depth / 2)));
  return [front === 'W' ? c0 : c1, r0 + offset];
}

function entranceFor(col: number, row: number, front: CompassSide): Entrance {
  const [dx, dz] = SIDE_VECTORS[front];
  const cx = cellCentreX(col);
  const cz = cellCentreZ(row);
  const heading = Math.atan2(dz, dx);
  const roadX = cx + dx * S;
  const roadZ = cz + dz * S;
  return {
    position: { x: cx + dx * (S / 2 - ENTRANCE_INSET), z: cz + dz * (S / 2 - ENTRANCE_INSET) },
    heading,
    parking: { x: roadX - dx * PARKING_OFFSET, z: roadZ - dz * PARKING_OFFSET, heading: normaliseAngle(heading + Math.PI / 2) },
  };
}

const ARCHETYPE_BY_TYPE: Readonly<Record<VenueType, LotArchetype>> = {
  home: 'shop',
  campus: 'campus',
  office: 'office',
  market: 'market',
  mall: 'mall',
  'hospital-public': 'hospital',
  'hospital-private': 'hospital',
  pharmacy: 'shop',
  gym: 'shop',
  bar: 'club',
  club: 'club',
  buka: 'shop',
  restaurant: 'shop',
  beach: 'park',
  park: 'park',
  'cbt-centre': 'shop',
  airport: 'airport',
  'motor-park': 'motor-park',
  'event-centre': 'hotel',
  'estate-agency': 'shop',
  'car-dealer': 'car-dealer',
  church: 'church',
  mosque: 'mosque',
  cinema: 'shop',
  salon: 'shop',
  government: 'government',
  school: 'school',
};

// ---------------------------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------------------------

function buildCityMap(): CityMap {
  const terrain = buildTerrain();
  const districts = buildDistricts();
  const raster = rasterizeRoads();
  const { mask } = raster;

  // Cell kinds.
  const cells = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    const base = terrain[i] as number;
    cells[i] = (mask[i] as number) !== 0 ? (base === K_WATER ? K_BRIDGE : K_ROAD) : base;
  }
  const roundaboutCentres = new Set<number>();
  for (const spec of ROUNDABOUTS) {
    const [cc, cr] = spec.centre;
    roundaboutCentres.add(cellIndex(cc, cr));
    for (let r = cr - 1; r <= cr + 1; r++) for (let c = cc - 1; c <= cc + 1; c++) if (inGrid(c, r)) cells[cellIndex(c, r)] = K_ROUNDABOUT;
  }

  // Road tiles (roundabout ring cells are covered by the roundabout tile).
  const roadTiles: CityRoadTile[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const m = mask[i] as number;
    if (m === 0) continue;
    const kind = cells[i] as number;
    if (kind === K_ROUNDABOUT && !roundaboutCentres.has(i)) continue;
    const col = i % CITY_COLS;
    const row = (i - col) / CITY_COLS;
    const info = cellRoadInfo(raster, i);
    roadTiles.push({
      col,
      row,
      x: cellCentreX(col),
      z: cellCentreZ(row),
      kind: roundaboutCentres.has(i) ? 'roundabout' : tileKindOf(m),
      mask: m,
      bridge: kind === K_BRIDGE,
      roadClass: info.roadClass,
      name: info.name,
    });
  }

  // Graph nodes: junctions, dead ends, bends, name changes, roundabouts.
  const nodeOfCell = new Int32Array(CELL_COUNT).fill(-1);
  const nodes: CityRoadNode[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const m = mask[i] as number;
    if (m === 0) continue;
    const degree = popcount4(m);
    let isNode = degree !== 2 || !isStraight(m) || roundaboutCentres.has(i);
    if (!isNode) {
      const dirs = DIRS.map((_, d) => d).filter((d) => (m & at(DIRS, d)) !== 0);
      isNode = raster.connName[i * 4 + at(dirs, 0)] !== raster.connName[i * 4 + at(dirs, 1)];
    }
    if (!isNode) continue;
    const col = i % CITY_COLS;
    const row = (i - col) / CITY_COLS;
    nodeOfCell[i] = nodes.length;
    nodes.push({ id: nodes.length, col, row, x: cellCentreX(col), z: cellCentreZ(row), degree, roundabout: roundaboutCentres.has(i) });
  }

  // Graph edges: walk from each node along each connection to the next node.
  const edges: CityRoadEdge[] = [];
  const edgeCells: number[][] = [];
  const walked = new Uint8Array(CELL_COUNT * 4);
  for (const node of nodes) {
    const start = cellIndex(node.col, node.row);
    for (let d = 0; d < 4; d++) {
      if (((mask[start] as number) & at(DIRS, d)) === 0 || walked[start * 4 + d]) continue;
      const name = raster.connName[start * 4 + d] ?? '';
      const roadClass = raster.connClass[start * 4 + d] ?? 'street';
      let col = node.col;
      let row = node.row;
      let steps = 0;
      let bridge = false;
      const visited = [start];
      walked[start * 4 + d] = 1;
      for (;;) {
        col += at(DIR_DC, d);
        row += at(DIR_DR, d);
        steps++;
        const index = cellIndex(col, row);
        visited.push(index);
        if (cells[index] === K_BRIDGE) bridge = true;
        if (nodeOfCell[index] !== -1) {
          walked[index * 4 + at(OPPOSITE, d)] = 1;
          break;
        }
        walked[index * 4 + d] = 1;
        walked[index * 4 + at(OPPOSITE, d)] = 1;
      }
      const end = nodeOfCell[cellIndex(col, row)] as number;
      edges.push({ id: edges.length, a: node.id, b: end, length: steps * S, name, roadClass, bridge, dx: at(DIR_DC, d), dz: at(DIR_DR, d) });
      edgeCells.push(visited);
    }
  }

  // Lots.
  const lots: CityLot[] = [];
  const lotIndex = new Int32Array(CELL_COUNT).fill(-1);
  const districtOf = (col: number, row: number): DistrictId => at(DISTRICT_IDS, districts[cellIndex(col, row)] as number);
  const streetInFront = (col: number, row: number, front: CompassSide): string => {
    const d = SIDE_DIR[front];
    const nc = col + at(DIR_DC, d);
    const nr = row + at(DIR_DR, d);
    return inGrid(nc, nr) ? cellRoadInfo(raster, cellIndex(nc, nr)).name : '';
  };
  const claim = (rect: CellRect, index: number): void => {
    const [c0, r0, c1, r1] = rect;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (inGrid(c, r)) lotIndex[cellIndex(c, r)] = index;
  };

  const authored = new Set<string>();
  for (const spec of VENUE_LOTS) {
    const venue = VENUES.find((entry) => entry.id === spec.venueId) as VenueDefinition | undefined;
    if (!venue || venue.regionId) continue;
    authored.add(spec.venueId);
    const [dc, dr] = doorCell(spec.rect, spec.front, spec.door);
    lots.push({
      id: spec.venueId,
      kind: 'venue',
      districtId: districtOf(dc, dr),
      venueId: spec.venueId,
      archetype: spec.archetype,
      cells: spec.rect,
      footprint: rectFootprint(spec.rect),
      front: spec.front,
      entrance: entranceFor(dc, dr, spec.front),
      street: streetInFront(dc, dr, spec.front),
      seed: hashString(`lot:${spec.venueId}`),
    });
    claim(spec.rect, lots.length - 1);
  }
  for (const spec of LANDMARKS) {
    const [dc, dr] = doorCell(spec.rect, spec.front);
    lots.push({
      id: `landmark:${spec.id}`,
      kind: 'landmark',
      districtId: districtOf(dc, dr),
      cells: spec.rect,
      footprint: rectFootprint(spec.rect),
      front: spec.front,
      seed: hashString(`landmark:${spec.id}`),
    });
    claim(spec.rect, lots.length - 1);
  }
  const reserved = new Set<number>(BILLBOARD_SPECS.map((spec) => cellIndex(spec.cell[0], spec.cell[1])));

  // Filler lots: every remaining land cell. Cells facing a straight road get a door.
  const fillerStart = lots.length;
  for (let row = 0; row < CITY_ROWS; row++) {
    for (let col = 0; col < CITY_COLS; col++) {
      const i = cellIndex(col, row);
      if (cells[i] !== K_LAND || lotIndex[i] !== -1 || reserved.has(i)) continue;
      const districtId = districtOf(col, row);
      const seed = hashString(`lot:${col}:${row}`);
      let front: CompassSide | undefined;
      let bestRank = -1;
      for (const side of ['S', 'E', 'N', 'W'] as const) {
        const d = SIDE_DIR[side];
        const nc = col + at(DIR_DC, d);
        const nr = row + at(DIR_DR, d);
        if (!inGrid(nc, nr)) continue;
        const n = cellIndex(nc, nr);
        if (cells[n] !== K_ROAD) continue;
        const straight = isStraight(mask[n] as number) ? 10 : 0;
        const rank = straight + ROAD_CLASS_RANK[cellRoadInfo(raster, n).roadClass];
        if (rank > bestRank) {
          bestRank = rank;
          front = side;
        }
      }
      const rect: CellRect = [col, row, col, row];
      if (!front) {
        lots.push({ id: `lot:${col}:${row}`, kind: 'infill', districtId, cells: rect, footprint: rectFootprint(rect), seed });
      } else {
        const straightFront = bestRank >= 10;
        const home = straightFront && (seed % 1000) / 1000 < HOME_SHARE[districtId];
        lots.push({
          id: `lot:${col}:${row}`,
          kind: home ? 'home' : 'building',
          districtId,
          cells: rect,
          footprint: rectFootprint(rect),
          front,
          entrance: straightFront ? entranceFor(col, row, front) : undefined,
          street: streetInFront(col, row, front),
          seed,
        });
      }
      lotIndex[i] = lots.length - 1;
    }
  }

  // Every district keeps a few homes even where offices dominate (Marina flats, VI apartments).
  for (const districtId of DISTRICT_IDS) {
    let homes = 0;
    const offices: number[] = [];
    for (let i = fillerStart; i < lots.length; i++) {
      const candidate = at(lots, i);
      if (candidate.districtId !== districtId || !candidate.entrance) continue;
      if (candidate.kind === 'home') homes++;
      else if (candidate.kind === 'building') offices.push(i);
    }
    offices.sort((a, b) => at(lots, a).seed - at(lots, b).seed);
    for (let k = 0; homes < MIN_HOMES_PER_DISTRICT && k < offices.length; k++, homes++) {
      const index = at(offices, k);
      lots[index] = { ...at(lots, index), kind: 'home' };
    }
  }

  // Venues added to the catalog later than the layout take over a filler lot in their district (never homeless).
  for (const venue of VENUES as readonly VenueDefinition[]) {
    if (venue.regionId || authored.has(venue.id)) continue;
    const candidates: number[] = [];
    for (let i = fillerStart; i < lots.length; i++) {
      const candidate = at(lots, i);
      if (candidate.kind === 'building' && candidate.entrance && candidate.districtId === venue.districtId) candidates.push(i);
    }
    if (candidates.length === 0) continue;
    const index = at(candidates, hashString(`venue-lot:${venue.id}`) % candidates.length);
    const base = at(lots, index);
    lots[index] = { ...base, id: venue.id, kind: 'venue', venueId: venue.id, archetype: ARCHETYPE_BY_TYPE[venue.type], seed: hashString(`lot:${venue.id}`) };
  }

  // Bridges: maximal straight runs of bridge cells, named by their road.
  const bridges: CityBridge[] = [];
  for (let e = 0; e < edges.length; e++) {
    const edge = at(edges, e);
    if (!edge.bridge) continue;
    const run = at(edgeCells, e).filter((index) => cells[index] === K_BRIDGE);
    const first = at(run, 0);
    const last = at(run, run.length - 1);
    const from = { x: cellCentreX(first % CITY_COLS) - edge.dx * (S / 2), z: cellCentreZ(Math.floor(first / CITY_COLS)) - edge.dz * (S / 2) };
    const to = { x: cellCentreX(last % CITY_COLS) + edge.dx * (S / 2), z: cellCentreZ(Math.floor(last / CITY_COLS)) + edge.dz * (S / 2) };
    bridges.push({ name: edge.name, from, to, length: run.length * S });
  }

  const roundabouts: CityRoundabout[] = ROUNDABOUTS.map((spec) => ({
    name: spec.name,
    centre: { x: cellCentreX(spec.centre[0]), z: cellCentreZ(spec.centre[1]) },
    nodeId: nodeOfCell[cellIndex(spec.centre[0], spec.centre[1])] as number,
    ringRadius: S * 0.95,
  }));

  const billboards: BillboardWorldPlacement[] = [];
  const FACING: Readonly<Record<string, number>> = {
    E: 0,
    SE: Math.PI / 4,
    S: Math.PI / 2,
    SW: (3 * Math.PI) / 4,
    W: Math.PI,
    NW: (-3 * Math.PI) / 4,
    N: -Math.PI / 2,
    NE: -Math.PI / 4,
  };
  for (const spec of BILLBOARD_SPECS) {
    const slot = BILLBOARD_SLOTS.find((entry) => entry.id === spec.slotId);
    if (!slot?.districtId) continue;
    const format = BILLBOARD_FORMAT_SPECS[slot.format];
    billboards.push({
      slotId: spec.slotId,
      position: { x: cellCentreX(spec.cell[0]) + spec.offset[0], z: cellCentreZ(spec.cell[1]) + spec.offset[1] },
      elevation: spec.elevation,
      facing: FACING[spec.faces] ?? 0,
      width: spec.width,
      height: (spec.width * format.height) / format.width,
      format: slot.format,
      mount: spec.mount,
      districtId: slot.districtId,
    });
  }

  return {
    cellSize: S,
    cols: CITY_COLS,
    rows: CITY_ROWS,
    bounds: CITY_BOUNDS,
    cells,
    districts,
    roadMask: mask,
    lotIndex,
    roadTiles,
    nodes,
    edges,
    lots,
    bridges,
    roundabouts,
    billboards,
  };
}

/** The city, built once per process. */
export const CITY_MAP: CityMap = buildCityMap();

// ---------------------------------------------------------------------------------------------------------------
// Indexes & queries
// ---------------------------------------------------------------------------------------------------------------

const LOT_BY_VENUE: ReadonlyMap<string, CityLot> = new Map(
  CITY_MAP.lots.filter((entry) => entry.venueId !== undefined).map((entry) => [entry.venueId as string, entry]),
);

const HOME_LOTS: Readonly<Record<DistrictId, readonly CityLot[]>> = (() => {
  const byDistrict = Object.fromEntries(DISTRICT_IDS.map((id) => [id, [] as CityLot[]])) as Record<DistrictId, CityLot[]>;
  for (const entry of CITY_MAP.lots) if (entry.kind === 'home' && entry.entrance) byDistrict[entry.districtId].push(entry);
  return byDistrict;
})();

export interface DistrictBounds extends CityBounds {
  /** Centroid of the district's land cells. */
  readonly centre: WorldPoint;
}

const DISTRICT_BOUNDS: Readonly<Record<DistrictId, DistrictBounds>> = (() => {
  const result = {} as Record<DistrictId, DistrictBounds>;
  DISTRICT_IDS.forEach((id, index) => {
    let minC = CITY_COLS;
    let minR = CITY_ROWS;
    let maxC = -1;
    let maxR = -1;
    let sumX = 0;
    let sumZ = 0;
    let count = 0;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (CITY_MAP.districts[i] !== index || CITY_MAP.cells[i] === K_WATER) continue;
      const col = i % CITY_COLS;
      const row = (i - col) / CITY_COLS;
      minC = Math.min(minC, col);
      maxC = Math.max(maxC, col);
      minR = Math.min(minR, row);
      maxR = Math.max(maxR, row);
      sumX += cellCentreX(col);
      sumZ += cellCentreZ(row);
      count++;
    }
    result[id] = {
      minX: ORIGIN_X + minC * S,
      minZ: ORIGIN_Z + minR * S,
      maxX: ORIGIN_X + (maxC + 1) * S,
      maxZ: ORIGIN_Z + (maxR + 1) * S,
      centre: count > 0 ? { x: sumX / count, z: sumZ / count } : { x: 0, z: 0 },
    };
  });
  return result;
})();

/** Kind of the cell under a world point (outside the grid counts as water). */
export function cellKindAt(point: WorldPoint): CityCellKind {
  const col = colAt(point.x);
  const row = rowAt(point.z);
  if (!inGrid(col, row)) return 'water';
  return at(CELL_KINDS, CITY_MAP.cells[cellIndex(col, row)] as number);
}

/** Decodes a cell kind code from `CITY_MAP.cells`. */
export function cellKindOf(code: number): CityCellKind {
  return at(CELL_KINDS, code);
}

/** District under a world point (points outside the city snap to the nearest cell). */
export function cityDistrictAt(point: WorldPoint): DistrictId {
  const index = cellIndex(clampCol(colAt(point.x)), clampRow(rowAt(point.z)));
  return at(DISTRICT_IDS, CITY_MAP.districts[index] as number);
}

/** Authored lot of an in-city venue (null for out-of-town venues). */
export function venueLot(venueId: string): CityLot | null {
  return LOT_BY_VENUE.get(venueId) ?? null;
}

/** Lot under a world point, if any. */
export function lotAt(point: WorldPoint): CityLot | null {
  const col = colAt(point.x);
  const row = rowAt(point.z);
  if (!inGrid(col, row)) return null;
  const index = CITY_MAP.lotIndex[cellIndex(col, row)] as number;
  return index >= 0 ? at(CITY_MAP.lots, index) : null;
}

/** Residential lots (with doors) of a district. */
export function homeLots(districtId: DistrictId): readonly CityLot[] {
  return HOME_LOTS[districtId];
}

/** World-space bounding box (and centroid) of a district's land. */
export function districtBounds(districtId: DistrictId): DistrictBounds {
  return DISTRICT_BOUNDS[districtId];
}

/** Billboard placements keyed by slot id. */
export const BILLBOARD_WORLD_PLACEMENTS: Readonly<Partial<Record<BillboardSlotId, BillboardWorldPlacement>>> = Object.fromEntries(
  CITY_MAP.billboards.map((placement) => [placement.slotId, placement]),
);

export function billboardPlacement(slotId: BillboardSlotId): BillboardWorldPlacement | null {
  return BILLBOARD_WORLD_PLACEMENTS[slotId] ?? null;
}

/** Edges passing through each road cell (CSR), for nearest-road searches. */
export const CELL_EDGES: { readonly start: Int32Array; readonly edges: Int32Array } = (() => {
  const counts = new Int32Array(CELL_COUNT + 1);
  const lists: number[][] = [];
  for (const edge of CITY_MAP.edges) {
    const a = at(CITY_MAP.nodes, edge.a);
    const cellsOfEdge: number[] = [];
    const steps = edge.length / S;
    for (let s = 0; s <= steps; s++) cellsOfEdge.push(cellIndex(a.col + edge.dx * s, a.row + edge.dz * s));
    lists.push(cellsOfEdge);
    for (const index of cellsOfEdge) counts[index + 1] = (counts[index + 1] as number) + 1;
  }
  for (let i = 1; i <= CELL_COUNT; i++) counts[i] = (counts[i] as number) + (counts[i - 1] as number);
  const fill = counts.slice(0, CELL_COUNT);
  const flat = new Int32Array(counts[CELL_COUNT] as number);
  lists.forEach((cellsOfEdge, edgeId) => {
    for (const index of cellsOfEdge) {
      const slot = fill[index] as number;
      flat[slot] = edgeId;
      fill[index] = slot + 1;
    }
  });
  return { start: counts, edges: flat };
})();

export { ORIGIN_X as CITY_ORIGIN_X, ORIGIN_Z as CITY_ORIGIN_Z, inGrid as cityCellInGrid };
