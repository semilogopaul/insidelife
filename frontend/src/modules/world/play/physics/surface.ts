import {
  CARRIAGEWAY_HALF_WIDTH as SHARED_CARRIAGEWAY_HALF_WIDTH,
  CITY_MAP,
  DIR_E,
  DIR_N,
  DIR_S,
  DIR_W,
  LANE_WIDTH,
  ROAD_LINE_WIDTH,
  ROADSIDE_PAVEMENT,
  ROUNDABOUT_ISLAND_RADIUS,
  ROUNDABOUT_OUTER_RADIUS,
  cellCentreX,
  cellCentreZ,
  colAt,
  colWidth,
  rowAt,
  rowDepth,
} from '@insidelife/shared';
import { APRON, PAVEMENT_Y, ROAD_Y } from '../../city/layout/placements';

/**
 * What the ground is at any world point, derived from the shared CityMap cells (no three.js, allocation-free):
 * - road/bridge cells: a four-lane carriageway (asphalt, y = 0.1, ±7 m across a 16 m road line) with a 1 m pavement
 *   (y = 0.2) on unconnected sides;
 * - the Ajah roundabout block: a two-lane asphalt ring around a raised island, arms out to the four roads;
 * - land/sand cells: a 1.6 m kerb apron (y = 0.2) along road edges, then lot ground (y = 0);
 * - water (and anything outside the grid).
 * Walking is allowed everywhere but water; cars drive on asphalt, crawl over pavements and sand, and treat lot ground
 * and water as solid.
 */

export type Surface = 'asphalt' | 'pavement' | 'ground' | 'sand' | 'water';

/** Half width of the carriageway: two lanes each way. */
export const CARRIAGEWAY_HALF_WIDTH = SHARED_CARRIAGEWAY_HALF_WIDTH;
/** Lane centres from the road centreline, right of travel: the inner (fast) lane and the outer (kerbside) lane. */
export const LANE_OFFSETS = [LANE_WIDTH / 2, LANE_WIDTH * 1.5] as const;
/** The kerbside lane (where buses stop and cars park). */
export const LANE_OFFSET = LANE_OFFSETS[1];
/** Pavement centre offset from the road centreline (between the kerb and the lot apron). */
export const PAVEMENT_OFFSET = ROAD_LINE_WIDTH / 2 + 0.4;

const COLS = CITY_MAP.cols;
const ROWS = CITY_MAP.rows;

const K_WATER = 1;
const K_SAND = 2;
const K_ROAD = 3;
const K_BRIDGE = 4;
const K_ROUNDABOUT = 5;

const ROUNDABOUT_CENTRES: readonly (readonly [number, number])[] = CITY_MAP.roundabouts.map((entry) => [entry.centre.x, entry.centre.z] as const);

const kindAt = (col: number, row: number): number => (col < 0 || row < 0 || col >= COLS || row >= ROWS ? K_WATER : (CITY_MAP.cells[row * COLS + col] as number));
const roadLike = (kind: number): boolean => kind === K_ROAD || kind === K_ROUNDABOUT;

/**
 * True when a cell-local point lies on the asphalt of a road cell with connection bits `mask`. `ax` is the half width
 * of the north–south carriageway (x), `az` of the east–west one (z): the cell's extent less its pavement.
 */
export function onCarriageway(lx: number, lz: number, mask: number, ax = CARRIAGEWAY_HALF_WIDTH, az = CARRIAGEWAY_HALF_WIDTH): boolean {
  const inX = lx <= ax && lx >= -ax;
  const inZ = lz <= az && lz >= -az;
  if (inX && inZ) return true;
  if (inZ) return lx > ax ? (mask & DIR_E) !== 0 : (mask & DIR_W) !== 0;
  if (inX) return lz > az ? (mask & DIR_S) !== 0 : (mask & DIR_N) !== 0;
  return false;
}

function roundaboutSurface(x: number, z: number): Surface {
  let best = Number.POSITIVE_INFINITY;
  let dx = 0;
  let dz = 0;
  for (const [cx, cz] of ROUNDABOUT_CENTRES) {
    const ox = x - cx;
    const oz = z - cz;
    const d = ox * ox + oz * oz;
    if (d < best) {
      best = d;
      dx = ox;
      dz = oz;
    }
  }
  const r = Math.sqrt(best);
  if (r < ROUNDABOUT_ISLAND_RADIUS) return 'pavement';
  if (r <= ROUNDABOUT_OUTER_RADIUS) return 'asphalt';
  const A = CARRIAGEWAY_HALF_WIDTH;
  return (dx <= A && dx >= -A) || (dz <= A && dz >= -A) ? 'asphalt' : 'pavement';
}

/** Surface under a world point. */
export function surfaceAt(x: number, z: number): Surface {
  const col = colAt(x);
  const row = rowAt(z);
  const kind = kindAt(col, row);
  if (kind === K_WATER) return 'water';
  const lx = x - cellCentreX(col);
  const lz = z - cellCentreZ(row);
  const hx = colWidth(col) / 2;
  const hz = rowDepth(row) / 2;
  if (kind === K_ROAD || kind === K_BRIDGE) {
    return onCarriageway(lx, lz, CITY_MAP.roadMask[row * COLS + col] as number, hx - ROADSIDE_PAVEMENT, hz - ROADSIDE_PAVEMENT) ? 'asphalt' : 'pavement';
  }
  if (kind === K_ROUNDABOUT) return roundaboutSurface(x, z);
  // Land or sand: the kerb apron along road edges, then lot ground.
  if (
    (lz < -hz + APRON && roadLike(kindAt(col, row - 1))) ||
    (lz > hz - APRON && roadLike(kindAt(col, row + 1))) ||
    (lx > hx - APRON && roadLike(kindAt(col + 1, row))) ||
    (lx < -hx + APRON && roadLike(kindAt(col - 1, row)))
  ) {
    return 'pavement';
  }
  return kind === K_SAND ? 'sand' : 'ground';
}

const HEIGHTS: Readonly<Record<Surface, number>> = { asphalt: ROAD_Y, pavement: PAVEMENT_Y, ground: 0, sand: 0, water: 0 };

/** Height of the walkable/drivable surface (metres). */
export function groundHeightAt(x: number, z: number): number {
  return HEIGHTS[surfaceAt(x, z)];
}

export const walkable = (surface: Surface): boolean => surface !== 'water';

/** Cars: asphalt is free, pavements and sand are slow, lot ground and water are solid. */
export const drivable = (surface: Surface): boolean => surface === 'asphalt' || surface === 'pavement' || surface === 'sand';
