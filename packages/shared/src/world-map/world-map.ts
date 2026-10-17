import type { DistrictId } from '../catalog/geography.js';
import { findVenue } from '../catalog/venues.js';
import { hashString } from '../random/rng.js';
import { cityDistrictAt, districtBounds, homeLots, venueLot, type CityLot } from './city-map.js';
import { nearestRoadPoint, routeDistance } from './routing.js';
import type { Entrance, WorldPoint } from './types.js';

/**
 * Open-world geometry contract shared by the server (validation, fuel) and the client (rendering, GPS).
 *
 * World units are metres; +x is east, +z is south. Lagos and Abuja share one frame (Abuja is 60 cells south-east of Lagos's corner, the water between them unreachable). Each playable city is a compact, stylised Lagos of about 750 × 510 m
 * with four-lane roads (`city-layout.ts` → `city-map.ts`; the layout grid is 640 × 420 m and every road line widens to
 * `ROAD_LINE_WIDTH`): a cross-town drive is ~50-70 real seconds at 15 m/s. Fuel and fares use map km: one world metre is
 * `MAP_KM_PER_WORLD_METRE` km, so crossing the city costs fuel like a 35-40 km Lagos drive.
 *
 * Everything here is pure and deterministic; graphs are built once at module load.
 */

export type { Entrance, WorldPoint } from './types.js';
export {
  BILLBOARD_WORLD_PLACEMENTS,
  CITY_BOUNDS,
  CITY_GEOMETRY_VERSION,
  CITY_LAYOUT,
  CITY_MAP,
  DIR_E,
  DIR_N,
  DIR_S,
  DIR_W,
  billboardPlacement,
  cellBounds,
  cityAt,
  cityBounds,
  cellCentreX,
  cellCentreZ,
  cellIndex,
  cellKindAt,
  cellKindOf,
  colAt,
  colWidth,
  districtBounds,
  homeLots,
  isRoadCol,
  isRoadRow,
  layoutToWorld,
  lotAt,
  migrateWorldPoint,
  rowAt,
  rowDepth,
  venueLot,
  worldToLayout,
  type BillboardWorldPlacement,
  type CityBounds,
  type CityBridge,
  type CityCellKind,
  type CityLot,
  type CityLotKind,
  type CityMap,
  type CityRoadEdge,
  type CityRoadNode,
  type CityRoadTile,
  type CityRoadTileKind,
  type CityRoundabout,
  type DistrictBounds,
} from './city-map.js';
export {
  ABUJA_COLS,
  ABUJA_GAP,
  ABUJA_ORIGIN_COL,
  ABUJA_ORIGIN_ROW,
  ABUJA_ROWS,
  CARRIAGEWAY_HALF_WIDTH,
  CITY_CELL_SIZE,
  CITY_COLS,
  CITY_GRID_RECTS,
  CITY_ROWS,
  CITY_SCENERY_REACH,
  LAGOS_COLS,
  LAGOS_ROWS,
  cityOfCell,
  LANE_WIDTH,
  LANES_PER_DIRECTION,
  ROAD_LINE_WIDTH,
  ROADSIDE_PAVEMENT,
  ROUNDABOUT_ISLAND_RADIUS,
  ROUNDABOUT_OUTER_RADIUS,
  type BillboardMount,
  type CellRect,
  type CompassSide,
  type LotArchetype,
  type RoadClass,
} from './city-layout.js';
export {
  findRoute,
  nearestRoadPoint,
  streetNameAt,
  turnByTurn,
  type CityRoute,
  type ManeuverKind,
  type RoadSnap,
  type RouteLeg,
  type RouteLegKind,
  type RouteManeuver,
  type TurnByTurnOptions,
} from './routing.js';

/** World metres per map km: the ~1 km Ikeja → Ajah drive costs fuel like ~40 km of Lagos road (25 m since the roads
 * widened to four lanes, which made routes ~24% longer in metres; fuel per trip stayed the same). */
export const WORLD_METRES_PER_MAP_KM = 25;
/** Map km represented by one world metre (fuel and fares use map km). */
export const MAP_KM_PER_WORLD_METRE = 1 / WORLD_METRES_PER_MAP_KM;
/** How close (metres) you must be to a door to go in. */
export const ENTRY_RADIUS = 14;
/** Fastest plausible movement (m/s) per mode, with headroom; used by anti-teleport checks. */
export const MAX_PLAUSIBLE_SPEED = { walk: 8, car: 40 } as const;

/** Unit vector `(x, z)` of a heading (see `Entrance`). */
export function headingVector(heading: number): WorldPoint {
  return { x: Math.cos(heading), z: Math.sin(heading) };
}

/** A kerbside entrance near a district's centre — only used if a district somehow has no lots. */
function districtFallbackEntrance(districtId: DistrictId, key: string): Entrance {
  const snap = nearestRoadPoint(districtBounds(districtId).centre);
  const point = snap?.point ?? { x: 0, z: 0 };
  const heading = ((hashString(key) % 4) * Math.PI) / 2;
  return { position: point, heading, parking: { x: point.x, z: point.z, heading: heading + Math.PI / 2 } };
}

/** Door of a catalog venue (null for an unknown id). */
export function venueEntrance(venueId: string): Entrance | null {
  const venue = findVenue(venueId);
  if (!venue) return null;
  return venueLot(venueId)?.entrance ?? districtFallbackEntrance(venue.districtId, venueId);
}

/** Front door of a character's home in a district (deterministic lot per character; neighbours may share a lot). */
/**
 * Which house a home is: the character id for family and rented homes, `property:<id>` when they live in a house
 * they built. Server and clients hash the same key, so routes, rides, the door ring and the 3D house all agree.
 */
export function homeKey(characterId: string, homePropertyId: string | null | undefined): string {
  return homePropertyId ? `property:${homePropertyId}` : characterId;
}

/** The home lot a key lands on in a district (null when the district has no home lots). */
export function homeLotOf(key: string, districtId: DistrictId): CityLot | null {
  const lots = homeLots(districtId);
  return lots[hashString(`home:${key}`) % Math.max(1, lots.length)] ?? null;
}

/** Front door of a home (`key` from `homeKey`). */
export function homeEntrance(key: string, districtId: DistrictId): Entrance {
  return homeLotOf(key, districtId)?.entrance ?? districtFallbackEntrance(districtId, `home:${key}`);
}

/** How far in front of a door you stand when you step out of it (metres; well within `ENTRY_RADIUS`). */
export const DOOR_STEP_OUT = 1.5;

/**
 * Where someone stepping out of a door stands: a step in front of it, spread along the facade per person (`key`, e.g.
 * the character id) so two players leaving the same place together don't stand on the same spot. Deterministic.
 */
export function doorStepFor(entrance: Entrance, key: string): WorldPoint {
  const hash = hashString(`door-step:${key}`);
  const side = ((hash % 7) - 3) * 0.3;
  const out = DOOR_STEP_OUT + ((hash >>> 4) % 3) * 0.2;
  const cos = Math.cos(entrance.heading);
  const sin = Math.sin(entrance.heading);
  return { x: entrance.position.x + cos * out - sin * side, z: entrance.position.z + sin * out + cos * side };
}

/** District containing a world point (points outside the city snap to the nearest edge cell). */
export function districtAt(point: WorldPoint): DistrictId {
  return cityDistrictAt(point);
}

export function straightDistance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Driving distance in metres between two points along roads (A* over the road graph, including the walk to and from
 * the kerb). Very short hops skip the search; unroutable points fall back to 1.3 × the straight distance.
 */
export function roadDistance(a: WorldPoint, b: WorldPoint): number {
  const straight = straightDistance(a, b);
  if (straight < 12) return straight;
  const viaRoads = routeDistance(a, b);
  return viaRoads === null ? straight * 1.3 : Math.max(straight, viaRoads);
}
