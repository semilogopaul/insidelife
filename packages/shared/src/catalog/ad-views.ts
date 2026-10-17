import type { DistrictId } from './geography.js';
import { VENUES, cityOfVenue } from './venues.js';
import { findAdSlot, type AdSlotKind } from './ad-inventory.js';
import { findAdPlacement } from '../world-map/ad-placements.js';
import { BILLBOARD_WORLD_PLACEMENTS, cityAt } from '../world-map/city-map.js';
import { nearestRoadPoint } from '../world-map/routing.js';
import type { WorldPoint } from '../world-map/types.js';
import { venueEntrance } from '../world-map/world-map.js';

/**
 * Where an ad physically is, and what counts as a view. Everything is derived from the same geometry the 3D city draws
 * (`CITY_MAP.billboards` for the premium boards, `AD_PLACEMENTS` for street spots) and the road graph, so it follows
 * the city when roads or spots move.
 *
 * A **view** is one player seeing a running ad: for a physical spot, the player within `AD_VIEW_RADIUS_METRES` of the
 * board with it on screen for `AD_VIEW_DWELL_MS`; on Lagos TV, the ad on a TV in the room for a moment; for a Sponsored
 * app, the app on the phone's home screen. Each player counts once per ad per game hour (`AD_VIEW_DEDUPE_GAME_MINUTES`).
 */

export const AD_VIEW_RADIUS_METRES = 40;
export const AD_VIEW_DWELL_MS = 1_000;
export const AD_VIEW_DEDUPE_GAME_MINUTES = 60;
/** Views per report (the API's limit). */
export const AD_VIEW_BATCH_MAX = 32;
/** A reported view must be this recent (server clock) to count. */
export const AD_VIEW_MAX_AGE_MS = 90_000;

/** How an ad is seen: on the street (a board in the 3D city), on a TV indoors, or on the phone's home screen. */
export type AdSurface = 'street' | 'tv' | 'phone';

export function adSurfaceOf(kind: AdSlotKind): AdSurface {
  if (kind === 'lagos-tv') return 'tv';
  if (kind === 'phone-app') return 'phone';
  return 'street';
}

/** A physical ad face in the city. */
export interface AdSpotGeometry {
  readonly slotId: string;
  /** Centre of the face's bottom edge on the ground plane. */
  readonly position: WorldPoint;
  /** Height of the bottom edge above the ground. */
  readonly elevation: number;
  readonly width: number;
  readonly height: number;
  /** Heading the face looks along (towards viewers). */
  readonly facing: number;
  readonly doubleSided: boolean;
  readonly districtId: DistrictId;
}

const geometryCache = new Map<string, AdSpotGeometry | null>();

/** The face of a premium board or street spot; null for Lagos TV, phone apps and unknown ids. */
export function adSpotGeometry(slotId: string): AdSpotGeometry | null {
  if (geometryCache.has(slotId)) return geometryCache.get(slotId) ?? null;
  let geometry: AdSpotGeometry | null = null;
  const premium = BILLBOARD_WORLD_PLACEMENTS[slotId];
  if (premium) {
    geometry = { slotId, position: premium.position, elevation: premium.elevation, width: premium.width, height: premium.height, facing: premium.facing, doubleSided: false, districtId: premium.districtId };
  } else {
    const spot = findAdPlacement(slotId);
    if (spot) geometry = { slotId, position: spot.position, elevation: spot.elevation, width: spot.width, height: spot.height, facing: spot.facing, doubleSided: spot.doubleSided, districtId: spot.districtId };
  }
  geometryCache.set(slotId, geometry);
  return geometry;
}

/** The middle of the advert face (x, y, z). */
export function adFaceCentre(spot: AdSpotGeometry): { readonly x: number; readonly y: number; readonly z: number } {
  return { x: spot.position.x, y: spot.elevation + spot.height / 2, z: spot.position.z };
}

/** Ground distance from a point to the board. */
export function adGroundDistance(spot: Pick<AdSpotGeometry, 'position'>, point: WorldPoint): number {
  return Math.hypot(point.x - spot.position.x, point.z - spot.position.z);
}

/** Is `point` on the printed side of the face (either side for two-sided spots), with a little slack at the edge? */
export function isInFrontOfAd(spot: Pick<AdSpotGeometry, 'position' | 'facing' | 'doubleSided'>, point: WorldPoint): boolean {
  if (spot.doubleSided) return true;
  return (point.x - spot.position.x) * Math.cos(spot.facing) + (point.z - spot.position.z) * Math.sin(spot.facing) > -1;
}

/** Close enough and on the right side to read it (the client also requires it on screen for a second). */
export function canViewAdFrom(spot: AdSpotGeometry, point: WorldPoint): boolean {
  return adGroundDistance(spot, point) <= AD_VIEW_RADIUS_METRES && isInFrontOfAd(spot, point);
}

export interface AdViewingPoint {
  /** Where to stand (on the road in front of the board): the GPS destination. */
  readonly position: WorldPoint;
  /** Heading that looks at the board from there. */
  readonly heading: number;
  readonly street: string | null;
}

const viewingCache = new Map<string, AdViewingPoint | null>();

/**
 * Where to go to see a board: a step out in front of it, snapped onto the nearest road so the GPS can route there, as
 * long as that is still within view; otherwise the point in front itself. Derived from the board and the road graph.
 */
export function adViewingPoint(slotId: string): AdViewingPoint | null {
  if (viewingCache.has(slotId)) return viewingCache.get(slotId) ?? null;
  const spot = adSpotGeometry(slotId);
  let result: AdViewingPoint | null = null;
  if (spot) {
    const ahead = 6 + spot.width / 2;
    const front = { x: spot.position.x + Math.cos(spot.facing) * ahead, z: spot.position.z + Math.sin(spot.facing) * ahead };
    const snap = nearestRoadPoint(front);
    const onRoad = snap && canViewAdFrom(spot, snap.point) && adGroundDistance(spot, snap.point) >= 3 ? snap.point : null;
    const position = onRoad ?? front;
    result = { position, heading: Math.atan2(spot.position.z - position.z, spot.position.x - position.x), street: snap?.streetName ?? null };
  }
  viewingCache.set(slotId, result);
  return result;
}

/**
 * The venue nearest to a board by straight distance (rides go to venues; the rest is a short walk). Venues of the board's own city only.
 */
export function nearestVenueToAd(slotId: string): { readonly venueId: string; readonly metres: number } | null {
  const point = adViewingPoint(slotId)?.position;
  if (!point) return null;
  let best: { venueId: string; metres: number } | null = null;
  const city = cityAt(point);
  for (const venue of VENUES) {
    if (cityOfVenue(venue) !== city) continue;
    const door = venueEntrance(venue.id)?.position;
    if (!door) continue;
    const metres = Math.hypot(door.x - point.x, door.z - point.z);
    if (!best || metres < best.metres) best = { venueId: venue.id, metres };
  }
  return best;
}

/** The surface of a slot id, or null for an unknown slot. */
export function adSurfaceOfSlot(slotId: string): AdSurface | null {
  const slot = findAdSlot(slotId);
  return slot ? adSurfaceOf(slot.kind) : null;
}

/** Shortest distance from a point to a polyline (e.g. a ride's route), in metres. */
export function distanceToPolyline(point: WorldPoint, line: readonly WorldPoint[]): number {
  if (line.length === 0) return Number.POSITIVE_INFINITY;
  if (line.length === 1) return Math.hypot(point.x - (line[0] as WorldPoint).x, point.z - (line[0] as WorldPoint).z);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as WorldPoint;
    const b = line[i] as WorldPoint;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq));
    best = Math.min(best, Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t)));
  }
  return best;
}
