import { CITY_BOUNDS, CITY_MAP, DIR_E, DIR_N, DIR_S, DIR_W } from '@insidelife/shared';
import { APRON, PAVEMENT_Y, ROAD_Y } from '../../city/layout/placements';

/**
 * What the ground is at any world point, derived from the shared CityMap cells (no three.js, allocation-free):
 * - road/bridge cells: an 8 m carriageway (asphalt, y = 0.1) with 1 m pavements on unconnected sides (y = 0.2);
 * - the Ajah roundabout block: asphalt ring around a raised island, arms out to the four roads;
 * - land/sand cells: a 1.6 m kerb apron (y = 0.2) along road edges, then lot ground (y = 0);
 * - water (and anything outside the grid).
 * Walking is allowed everywhere but water; cars drive on asphalt, crawl over pavements and sand, and treat lot ground
 * and water as solid.
 */

export type Surface = 'asphalt' | 'pavement' | 'ground' | 'sand' | 'water';

/** Half width of the carriageway in a road cell (Kenney road tiles ×10: asphalt ±4 m, pavement 4–5 m). */
export const CARRIAGEWAY_HALF_WIDTH = 4;
/** Right-hand lane centre offset from the road centreline. */
export const LANE_OFFSET = 2;
/** Pavement centre offset from the road centreline (between the kerb and the lot apron). */
export const PAVEMENT_OFFSET = 5.4;

const S = CITY_MAP.cellSize;
const COLS = CITY_MAP.cols;
const ROWS = CITY_MAP.rows;
const MIN_X = CITY_BOUNDS.minX;
const MIN_Z = CITY_BOUNDS.minZ;
const HALF = S / 2;
const A = CARRIAGEWAY_HALF_WIDTH;

const K_WATER = 1;
const K_SAND = 2;
const K_ROAD = 3;
const K_BRIDGE = 4;
const K_ROUNDABOUT = 5;

/** Raised island and outer edge of the roundabout ring (Kenney roundabout ×15). */
const ISLAND_RADIUS = 4.2;
const RING_OUTER = 11.6;

const ROUNDABOUT_CENTRES: readonly (readonly [number, number])[] = CITY_MAP.roundabouts.map((entry) => [entry.centre.x, entry.centre.z] as const);

const kindAt = (col: number, row: number): number => (col < 0 || row < 0 || col >= COLS || row >= ROWS ? K_WATER : (CITY_MAP.cells[row * COLS + col] as number));
const roadLike = (kind: number): boolean => kind === K_ROAD || kind === K_ROUNDABOUT;

/** True when a cell-local point lies on the asphalt of a road cell with connection bits `mask`. */
export function onCarriageway(lx: number, lz: number, mask: number): boolean {
  const inX = lx <= A && lx >= -A;
  const inZ = lz <= A && lz >= -A;
  if (inX && inZ) return true;
  if (inZ) return lx > A ? (mask & DIR_E) !== 0 : (mask & DIR_W) !== 0;
  if (inX) return lz > A ? (mask & DIR_S) !== 0 : (mask & DIR_N) !== 0;
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
  if (r < ISLAND_RADIUS) return 'pavement';
  if (r <= RING_OUTER) return 'asphalt';
  return (dx <= A && dx >= -A) || (dz <= A && dz >= -A) ? 'asphalt' : 'pavement';
}

/** Surface under a world point. */
export function surfaceAt(x: number, z: number): Surface {
  const col = Math.floor((x - MIN_X) / S);
  const row = Math.floor((z - MIN_Z) / S);
  const kind = kindAt(col, row);
  if (kind === K_WATER) return 'water';
  const lx = x - (MIN_X + (col + 0.5) * S);
  const lz = z - (MIN_Z + (row + 0.5) * S);
  if (kind === K_ROAD || kind === K_BRIDGE) return onCarriageway(lx, lz, CITY_MAP.roadMask[row * COLS + col] as number) ? 'asphalt' : 'pavement';
  if (kind === K_ROUNDABOUT) return roundaboutSurface(x, z);
  // Land or sand: the kerb apron along road edges, then lot ground.
  if (
    (lz < -HALF + APRON && roadLike(kindAt(col, row - 1))) ||
    (lz > HALF - APRON && roadLike(kindAt(col, row + 1))) ||
    (lx > HALF - APRON && roadLike(kindAt(col + 1, row))) ||
    (lx < -HALF + APRON && roadLike(kindAt(col - 1, row)))
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
