import { DISTRICT_IDS, type DistrictId } from '../catalog/geography.js';
import { BILLBOARD_FORMAT_SPECS, BILLBOARD_SLOTS, type BillboardFormat, type BillboardSlotId } from '../catalog/promotions.js';
import { VENUES, type VenueDefinition, type VenueType } from '../catalog/venues.js';
import { hashString } from '../random/rng.js';
import {
  BILLBOARD_SPECS,
  CARRIAGEWAY_HALF_WIDTH,
  CITY_CELL_SIZE,
  CITY_COLS,
  CITY_ROWS,
  DISTRICT_RECTS,
  HOME_SHARE,
  LANDMARKS,
  LAYOUT_CARRIAGEWAY_HALF_WIDTH,
  ROAD_LINE_WIDTH,
  ROADS,
  ROUNDABOUT_ISLAND_RADIUS,
  ROUNDABOUT_OUTER_RADIUS,
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
const CELL_COUNT = CITY_COLS * CITY_ROWS;

export interface CityBounds {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

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
  /** World extent along x and z: `ROAD_LINE_WIDTH` across the road, 10 m or `ROAD_LINE_WIDTH` along it. */
  readonly width: number;
  readonly depth: number;
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
  /** World metres between the two nodes. */
  readonly length: number;
  /** Grid steps between the two nodes. */
  readonly cells: number;
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
  /** Radius of the middle of the two-lane driving ring (metres). */
  readonly ringRadius: number;
  /** The raised island and the ring's outer kerb (metres from the centre). */
  readonly islandRadius: number;
  readonly outerRadius: number;
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

// ---------------------------------------------------------------------------------------------------------------
// Layout → world: every grid line that carries a road is ROAD_LINE_WIDTH wide (four lanes), the rest stay 10 m
// ---------------------------------------------------------------------------------------------------------------

/** The road raster, needed before anything has a world position (it decides which lines widen). */
const RASTER: RoadRaster = rasterizeRoads();

/** Columns with a north–south road and rows with an east–west road anywhere along them. */
const ROAD_COLS = new Uint8Array(CITY_COLS);
const ROAD_ROWS = new Uint8Array(CITY_ROWS);
for (let i = 0; i < CELL_COUNT; i++) {
  const m = RASTER.mask[i] as number;
  const col = i % CITY_COLS;
  const row = (i - col) / CITY_COLS;
  if (m & (DIR_N | DIR_S)) ROAD_COLS[col] = 1;
  if (m & (DIR_E | DIR_W)) ROAD_ROWS[row] = 1;
}
for (const spec of ROUNDABOUTS) {
  ROAD_COLS[spec.centre[0]] = 1;
  ROAD_ROWS[spec.centre[1]] = 1;
}

/** World edges of the grid lines (count + 1 values), centred on the origin. */
function lineEdges(wide: Uint8Array): Float64Array {
  const edges = new Float64Array(wide.length + 1);
  for (let i = 0; i < wide.length; i++) edges[i + 1] = (edges[i] as number) + (wide[i] ? ROAD_LINE_WIDTH : S);
  const half = (edges[wide.length] as number) / 2;
  for (let i = 0; i <= wide.length; i++) edges[i] = (edges[i] as number) - half;
  return edges;
}

const COL_EDGES = lineEdges(ROAD_COLS);
const ROW_EDGES = lineEdges(ROAD_ROWS);
const ORIGIN_X = COL_EDGES[0] as number;
const ORIGIN_Z = ROW_EDGES[0] as number;

/** Playable extent of the city in world metres. */
export const CITY_BOUNDS: CityBounds = { minX: ORIGIN_X, minZ: ORIGIN_Z, maxX: COL_EDGES[CITY_COLS] as number, maxZ: ROW_EDGES[CITY_ROWS] as number };

/** Index of the line containing `value` (outside the grid: continues in 10 m steps, like the layout). */
function lineAt(value: number, edges: Float64Array, count: number): number {
  const first = edges[0] as number;
  const last = edges[count] as number;
  if (value < first) return Math.floor((value - first) / S);
  if (value >= last) return count + Math.floor((value - last) / S);
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((edges[mid] as number) <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** World start and width of a line (outside the grid: 10 m lines continuing outwards). */
function lineSpan(index: number, edges: Float64Array, count: number): readonly [start: number, width: number] {
  if (index < 0) return [(edges[0] as number) + index * S, S];
  if (index >= count) return [(edges[count] as number) + (index - count) * S, S];
  const start = edges[index] as number;
  return [start, (edges[index + 1] as number) - start];
}

export const cellCentreX = (col: number): number => {
  const [start, width] = lineSpan(col, COL_EDGES, CITY_COLS);
  return start + width / 2;
};
export const cellCentreZ = (row: number): number => {
  const [start, width] = lineSpan(row, ROW_EDGES, CITY_ROWS);
  return start + width / 2;
};
export const colAt = (x: number): number => lineAt(x, COL_EDGES, CITY_COLS);
export const rowAt = (z: number): number => lineAt(z, ROW_EDGES, CITY_ROWS);
/** World width of a grid column / depth of a grid row (10 m, or `ROAD_LINE_WIDTH` where a road runs along it). */
export const colWidth = (col: number): number => lineSpan(col, COL_EDGES, CITY_COLS)[1];
export const rowDepth = (row: number): number => lineSpan(row, ROW_EDGES, CITY_ROWS)[1];
/** True when a north–south road runs along the column / an east–west road along the row (a four-lane line). */
export const isRoadCol = (col: number): boolean => ROAD_COLS[col] === 1;
export const isRoadRow = (row: number): boolean => ROAD_ROWS[row] === 1;

/** World rectangle of one cell. */
export function cellBounds(col: number, row: number): CityBounds {
  const [x0, w] = lineSpan(col, COL_EDGES, CITY_COLS);
  const [z0, d] = lineSpan(row, ROW_EDGES, CITY_ROWS);
  return { minX: x0, minZ: z0, maxX: x0 + w, maxZ: z0 + d };
}

// The layout: the uniform 10 m grid the first city was built on. Ids are chosen there (never in the world), and the
// first city's world coordinates *are* layout coordinates, which is what `layoutToWorld` migrates.
const LAYOUT_ORIGIN_X = (-CITY_COLS * S) / 2;
const LAYOUT_ORIGIN_Z = (-CITY_ROWS * S) / 2;
const layoutCentreX = (col: number): number => LAYOUT_ORIGIN_X + (col + 0.5) * S;
const layoutCentreZ = (row: number): number => LAYOUT_ORIGIN_Z + (row + 0.5) * S;

/** Across a road line the layout's two-lane carriageway stretches to four lanes; pavements keep their width. */
const HALF = S / 2;
const LAYOUT_A = LAYOUT_CARRIAGEWAY_HALF_WIDTH;
const WORLD_A = CARRIAGEWAY_HALF_WIDTH;
const ROAD_HALF = ROAD_LINE_WIDTH / 2;

function warp(value: number, layoutOrigin: number, edges: Float64Array, wide: Uint8Array, count: number): number {
  const index = Math.floor((value - layoutOrigin) / S);
  if (index < 0) return (edges[0] as number) + (value - layoutOrigin);
  if (index >= count) return (edges[count] as number) + (value - (layoutOrigin + count * S));
  const local = value - (layoutOrigin + index * S);
  const start = edges[index] as number;
  if (!wide[index]) return start + local;
  const u = local - HALF;
  const a = Math.abs(u);
  const w = a <= LAYOUT_A ? (a * WORLD_A) / LAYOUT_A : WORLD_A + (a - LAYOUT_A);
  return start + ROAD_HALF + (u < 0 ? -w : w);
}

function unwarp(value: number, layoutOrigin: number, edges: Float64Array, wide: Uint8Array, count: number): number {
  const index = lineAt(value, edges, count);
  if (index < 0) return layoutOrigin + (value - (edges[0] as number));
  if (index >= count) return layoutOrigin + count * S + (value - (edges[count] as number));
  const local = value - (edges[index] as number);
  const start = layoutOrigin + index * S;
  if (!wide[index]) return start + local;
  const u = local - ROAD_HALF;
  const a = Math.abs(u);
  const w = a <= WORLD_A ? (a * LAYOUT_A) / WORLD_A : LAYOUT_A + (a - WORLD_A);
  return start + HALF + (u < 0 ? -w : w);
}

/**
 * Layout point (which is also a first-city world point) → world point. Monotonic per axis: lot cells keep their size,
 * and across a road line the two-lane carriageway stretches to four lanes while pavements and lot edges move outwards
 * unchanged, so a door, a parked car or a billboard stays the same thing, only further from the road's centre.
 */
export function layoutToWorld(point: WorldPoint): WorldPoint {
  return {
    x: warp(point.x, LAYOUT_ORIGIN_X, COL_EDGES, ROAD_COLS, CITY_COLS),
    z: warp(point.z, LAYOUT_ORIGIN_Z, ROW_EDGES, ROAD_ROWS, CITY_ROWS),
  };
}

/** The inverse of `layoutToWorld`. */
export function worldToLayout(point: WorldPoint): WorldPoint {
  return {
    x: unwarp(point.x, LAYOUT_ORIGIN_X, COL_EDGES, ROAD_COLS, CITY_COLS),
    z: unwarp(point.z, LAYOUT_ORIGIN_Z, ROW_EDGES, ROAD_ROWS, CITY_ROWS),
  };
}

/**
 * Version of the world geometry (1: the first city's two-lane roads, 2: four lanes). A position saved without a
 * version, or with an older one, is a layout point and goes through `layoutToWorld` once (`migrateWorldPoint`).
 */
export const CITY_GEOMETRY_VERSION = 2;

/** A position saved under geometry `version` (undefined: saved before versions existed), in today's world. */
export function migrateWorldPoint<T extends WorldPoint>(point: T, version: number | undefined): T {
  if (version !== undefined && version >= CITY_GEOMETRY_VERSION) return point;
  return { ...point, ...layoutToWorld(point) };
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
/** Kerbside parking: the car's centre this far in from the road cell's edge (pavement + kerb clearance + half a car). */
const PARKING_FROM_EDGE = 2.4;

const SIDE_VECTORS: Readonly<Record<CompassSide, readonly [number, number]>> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

const normaliseAngle = (angle: number): number => {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
};

function rectFootprint([c0, r0, c1, r1]: CellRect): CityBounds {
  const from = cellBounds(c0, r0);
  const to = cellBounds(c1, r1);
  return { minX: from.minX, minZ: from.minZ, maxX: to.maxX, maxZ: to.maxZ };
}

/** The first city's footprint of a cell rectangle (layout metres). */
function layoutFootprint([c0, r0, c1, r1]: CellRect): CityBounds {
  return { minX: LAYOUT_ORIGIN_X + c0 * S, minZ: LAYOUT_ORIGIN_Z + r0 * S, maxX: LAYOUT_ORIGIN_X + (c1 + 1) * S, maxZ: LAYOUT_ORIGIN_Z + (r1 + 1) * S };
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
  const half = (dx !== 0 ? colWidth(col) : rowDepth(row)) / 2;
  const heading = Math.atan2(dz, dx);
  // Kerbside in the road cell in front, in the outer lane of that side.
  const roadHalf = (dx !== 0 ? colWidth(col + dx) : rowDepth(row + dz)) / 2;
  const parking = Math.max(1.6, roadHalf - PARKING_FROM_EDGE);
  const roadX = cellCentreX(col + dx);
  const roadZ = cellCentreZ(row + dz);
  return {
    position: { x: cx + dx * (half - ENTRANCE_INSET), z: cz + dz * (half - ENTRANCE_INSET) },
    heading,
    parking: { x: dx !== 0 ? roadX - dx * parking : cx, z: dz !== 0 ? roadZ - dz * parking : cz, heading: normaliseAngle(heading + Math.PI / 2) },
  };
}

/** Where the first city put a door (layout metres): ad spots keep clear of these, exactly as they always have. */
function layoutDoor(col: number, row: number, front: CompassSide): WorldPoint {
  const [dx, dz] = SIDE_VECTORS[front];
  const cx = layoutCentreX(col);
  const cz = layoutCentreZ(row);
  return { x: cx + dx * (S / 2 - ENTRANCE_INSET), z: cz + dz * (S / 2 - ENTRANCE_INSET) };
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
  mansion: 'mansion',
  'private-jet': 'jet-pad',
  refinery: 'refinery',
};

// ---------------------------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------------------------

/** What the first city decided per lot, kept in layout metres (index-aligned with `CityMap.lots`). */
interface LayoutLot {
  readonly footprint: CityBounds;
  readonly door: WorldPoint | null;
}

function buildCityMap(): { readonly map: CityMap; readonly layoutLots: readonly LayoutLot[] } {
  const terrain = buildTerrain();
  const districts = buildDistricts();
  const raster = RASTER;
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
      width: colWidth(col),
      depth: rowDepth(row),
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
      const length = Math.abs(cellCentreX(col) - node.x) + Math.abs(cellCentreZ(row) - node.z);
      edges.push({ id: edges.length, a: node.id, b: end, length, cells: steps, name, roadClass, bridge, dx: at(DIR_DC, d), dz: at(DIR_DR, d) });
      edgeCells.push(visited);
    }
  }

  // Lots.
  const lots: CityLot[] = [];
  const layoutLots: LayoutLot[] = [];
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
    layoutLots.push({ footprint: layoutFootprint(spec.rect), door: layoutDoor(dc, dr, spec.front) });
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
    layoutLots.push({ footprint: layoutFootprint(spec.rect), door: null });
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
        layoutLots.push({ footprint: layoutFootprint(rect), door: null });
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
        layoutLots.push({ footprint: layoutFootprint(rect), door: straightFront ? layoutDoor(col, row, front) : null });
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
    const a = cellBounds(first % CITY_COLS, Math.floor(first / CITY_COLS));
    const b = cellBounds(last % CITY_COLS, Math.floor(last / CITY_COLS));
    // From the near edge of the first bridge cell to the far edge of the last, along the road.
    const from = { x: edge.dx > 0 ? a.minX : edge.dx < 0 ? a.maxX : (a.minX + a.maxX) / 2, z: edge.dz > 0 ? a.minZ : edge.dz < 0 ? a.maxZ : (a.minZ + a.maxZ) / 2 };
    const to = { x: edge.dx > 0 ? b.maxX : edge.dx < 0 ? b.minX : (b.minX + b.maxX) / 2, z: edge.dz > 0 ? b.maxZ : edge.dz < 0 ? b.minZ : (b.minZ + b.maxZ) / 2 };
    bridges.push({ name: edge.name, from, to, length: Math.abs(to.x - from.x) + Math.abs(to.z - from.z) });
  }

  const roundabouts: CityRoundabout[] = ROUNDABOUTS.map((spec) => ({
    name: spec.name,
    centre: { x: cellCentreX(spec.centre[0]), z: cellCentreZ(spec.centre[1]) },
    nodeId: nodeOfCell[cellIndex(spec.centre[0], spec.centre[1])] as number,
    ringRadius: (ROUNDABOUT_ISLAND_RADIUS + ROUNDABOUT_OUTER_RADIUS) / 2,
    islandRadius: ROUNDABOUT_ISLAND_RADIUS,
    outerRadius: ROUNDABOUT_OUTER_RADIUS,
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
      position: layoutToWorld({ x: layoutCentreX(spec.cell[0]) + spec.offset[0], z: layoutCentreZ(spec.cell[1]) + spec.offset[1] }),
      elevation: spec.elevation,
      facing: FACING[spec.faces] ?? 0,
      width: spec.width,
      height: (spec.width * format.height) / format.width,
      format: slot.format,
      mount: spec.mount,
      districtId: slot.districtId,
    });
  }

  const map: CityMap = {
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
  return { map, layoutLots };
}

const BUILT = buildCityMap();

/** The city, built once per process. */
export const CITY_MAP: CityMap = BUILT.map;

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

/** Bounding box and land centroid of every district, in the world and in the layout. */
function measureDistricts(centreX: (col: number) => number, centreZ: (row: number) => number, box: (rect: CellRect) => CityBounds): Readonly<Record<DistrictId, DistrictBounds>> {
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
      sumX += centreX(col);
      sumZ += centreZ(row);
      count++;
    }
    result[id] = { ...box([minC, minR, maxC, maxR]), centre: count > 0 ? { x: sumX / count, z: sumZ / count } : { x: 0, z: 0 } };
  });
  return result;
}

const DISTRICT_BOUNDS = measureDistricts(cellCentreX, cellCentreZ, rectFootprint);
const LAYOUT_DISTRICT_BOUNDS = measureDistricts(layoutCentreX, layoutCentreZ, layoutFootprint);

/**
 * The first city's layout, where ids are decided: cell centres, lot footprints, doors and district centres in layout
 * metres (10 m cells, two-lane roads). Anything that *picks* places by distance (ad spots, filling stations) measures
 * here, so widening the roads never changes what it picks, then puts what it picked in the world with `layoutToWorld`.
 */
export const CITY_LAYOUT = {
  cellCentreX: layoutCentreX,
  cellCentreZ: layoutCentreZ,
  /** Layout footprint and door of `CITY_MAP.lots[index]`. */
  lot: (index: number): LayoutLot => at(BUILT.layoutLots, index),
  /** Centroid of a district's land in layout metres. */
  districtCentre: (districtId: DistrictId): WorldPoint => LAYOUT_DISTRICT_BOUNDS[districtId].centre,
  /** District of a layout point. */
  districtAt: (point: WorldPoint): DistrictId => {
    const col = clampCol(Math.floor((point.x - LAYOUT_ORIGIN_X) / S));
    const row = clampRow(Math.floor((point.z - LAYOUT_ORIGIN_Z) / S));
    return at(DISTRICT_IDS, CITY_MAP.districts[cellIndex(col, row)] as number);
  },
} as const;

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
    for (let s = 0; s <= edge.cells; s++) cellsOfEdge.push(cellIndex(a.col + edge.dx * s, a.row + edge.dz * s));
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
