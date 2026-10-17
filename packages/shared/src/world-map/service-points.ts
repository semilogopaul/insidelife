import type { DistrictId } from '../catalog/geography.js';
import { SCARCITY_DRY_STATION_SHARE } from '../catalog/vehicle-care.js';
import { rngFor } from '../random/rng.js';
import { CITY_LAYOUT, CITY_MAP, type CityLot } from './city-map.js';
import type { Entrance, WorldPoint } from './types.js';

/**
 * Filling stations and mechanic workshops on the streets: plain roadside lots (not venues — there's nothing to walk
 * into), picked deterministically from the city's `building` lots that front a road, so every client and the server
 * agree. A station or workshop takes the whole lot (the client draws pumps under a canopy, or a shed with tyres
 * instead of the building). You stop at the kerb in front of it (`entrance.parking`) — or walk up — and buy fuel or a
 * repair; the server checks you're within `SERVICE_RADIUS` of `entrance.position`.
 *
 * Home lots are never used (a player's house could be on one) and nothing in `CITY_MAP` changes, so ad spots and
 * houses keep their ids. Lots are picked by distances in the city's layout (`CITY_LAYOUT`), so widening the roads never
 * moves a station to another lot.
 */

export type ServicePointKind = 'fuel' | 'mechanic';

export interface ServicePoint {
  /** `fuel:<col>:<row>` or `mechanic:<col>:<row>` (tied to the lot, so it never moves). */
  readonly id: string;
  readonly kind: ServicePointKind;
  readonly name: string;
  readonly districtId: DistrictId;
  readonly lotId: string;
  readonly street: string;
  /** Front of the lot on the kerb apron (where you stand), facing the road; `parking` is the kerb spot for the car. */
  readonly entrance: Entrance;
}

/** How close (metres from the forecourt's front) you must be to buy fuel or see the mechanic. */
export const SERVICE_RADIUS = 14;

/** How many of each per district (districts without a free roadside lot get none and lean on their neighbours). */
const PLAN: ReadonlyArray<readonly [ServicePointKind, DistrictId, number]> = [
  ['fuel', 'ikeja', 2],
  ['fuel', 'yaba', 1],
  ['fuel', 'mushin', 1],
  ['fuel', 'surulere', 1],
  ['fuel', 'ojo', 1],
  ['fuel', 'ikorodu', 1],
  ['fuel', 'epe', 1],
  ['fuel', 'ikoyi', 1],
  ['fuel', 'lekki', 1],
  ['fuel', 'ajah', 1],
  ['mechanic', 'mushin', 1],
  ['mechanic', 'ikeja', 1],
  ['mechanic', 'yaba', 1],
  ['mechanic', 'surulere', 1],
  ['mechanic', 'ikorodu', 1],
  ['mechanic', 'ikoyi', 1],
  ['mechanic', 'ajah', 1],
  // Abuja (after Lagos's, so Lagos's stations and their names never move).
  ['fuel', 'wuse', 1],
  ['fuel', 'garki', 1],
  ['fuel', 'jabi', 1],
  ['fuel', 'abuja-cbd', 1],
  ['fuel', 'gwarinpa', 1],
  ['fuel', 'kubwa', 1],
  ['fuel', 'lugbe', 1],
  ['fuel', 'asokoro', 1],
  ['mechanic', 'garki', 1],
  ['mechanic', 'kubwa', 1],
  ['mechanic', 'lugbe', 1],
];

const FUEL_NAMES = ['Mega Station', 'Filling Station', 'Petrol Station'] as const;
const MECHANIC_NAMES = ['Mechanic Village', 'Auto Workshop', 'Motors & Vulcanizer'] as const;

/** Layout centre of a lot (picking measures in the layout). */
function lotCentre(index: number): WorldPoint {
  const { footprint } = CITY_LAYOUT.lot(index);
  return { x: (footprint.minX + footprint.maxX) / 2, z: (footprint.minZ + footprint.maxZ) / 2 };
}

const isCandidate = (lot: CityLot): boolean =>
  lot.kind === 'building' && lot.entrance !== undefined && lot.front !== undefined && lot.cells[0] === lot.cells[2] && lot.cells[1] === lot.cells[3];

/** Layout door of a lot (by id). */
function doorOf(lotId: string): WorldPoint {
  const index = CITY_MAP.lots.findIndex((lot) => lot.id === lotId);
  return CITY_LAYOUT.lot(index).door ?? lotCentre(index);
}

function buildServicePoints(): readonly ServicePoint[] {
  const used = new Set<string>();
  const points: ServicePoint[] = [];
  const counter: Record<ServicePointKind, number> = { fuel: 0, mechanic: 0 };
  for (const [kind, districtId, count] of PLAN) {
    const centre = CITY_LAYOUT.districtCentre(districtId);
    for (let n = 0; n < count; n++) {
      // Spread out: the free lot farthest from every service point already in the district (the first one is the
      // nearest to the district centre), never right next door to another one.
      const placed = points.filter((point) => point.districtId === districtId).map((point) => doorOf(point.lotId));
      let best: CityLot | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const [index, lot] of CITY_MAP.lots.entries()) {
        if (lot.districtId !== districtId || !isCandidate(lot) || used.has(lot.id)) continue;
        const at = lotCentre(index);
        const nearest = placed.length === 0 ? 0 : Math.min(...placed.map((p) => Math.hypot(p.x - at.x, p.z - at.z)));
        if (placed.length > 0 && nearest < 25) continue;
        const score = placed.length === 0 ? -Math.hypot(at.x - centre.x, at.z - centre.z) : nearest;
        if (score > bestScore) {
          bestScore = score;
          best = lot;
        }
      }
      if (!best || !best.entrance) continue;
      used.add(best.id);
      const names = kind === 'fuel' ? FUEL_NAMES : MECHANIC_NAMES;
      const street = best.street ?? 'Roadside';
      points.push({
        id: `${kind}:${best.id.replace(/^lot:/, '')}`,
        kind,
        name: `${street} ${names[counter[kind]++ % names.length]}`,
        districtId,
        lotId: best.id,
        street,
        entrance: best.entrance,
      });
    }
  }
  return points;
}

export const SERVICE_POINTS: readonly ServicePoint[] = buildServicePoints();

const BY_ID: ReadonlyMap<string, ServicePoint> = new Map(SERVICE_POINTS.map((point) => [point.id, point]));
const BY_LOT: ReadonlyMap<string, ServicePoint> = new Map(SERVICE_POINTS.map((point) => [point.lotId, point]));

export function findServicePoint(id: string): ServicePoint | undefined {
  return BY_ID.get(id);
}

/** The service point built on a city lot (the client draws it instead of the lot's building). */
export function servicePointOnLot(lotId: string): ServicePoint | undefined {
  return BY_LOT.get(lotId);
}

/** GPS destination id of a service point (`service:fuel:12:3`). */
export const serviceLocationId = (point: Pick<ServicePoint, 'id'>): string => `service:${point.id}`;

/** The service point a GPS destination id points at, if it is one. */
export function servicePointFromLocation(locationId: string): ServicePoint | undefined {
  return locationId.startsWith('service:') ? BY_ID.get(locationId.slice('service:'.length)) : undefined;
}

/** Nearest service point of a kind (straight line), optionally only within `within` metres. */
export function nearestServicePoint(kind: ServicePointKind, point: WorldPoint, within = Number.POSITIVE_INFINITY): ServicePoint | null {
  let best: ServicePoint | null = null;
  let bestDistance = within;
  for (const candidate of SERVICE_POINTS) {
    if (candidate.kind !== kind) continue;
    const distance = Math.hypot(candidate.entrance.position.x - point.x, candidate.entrance.position.z - point.z);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/** The service point of a kind you're close enough to use, or null. */
export function servicePointAt(kind: ServicePointKind, point: WorldPoint): ServicePoint | null {
  return nearestServicePoint(kind, point, SERVICE_RADIUS);
}

/** During fuel scarcity some stations have nothing to sell that day (seeded per station per day, same everywhere). */
export function fuelStationDry(worldSeed: string, stationId: string, dayIndex: number, scarcity: boolean): boolean {
  return scarcity && rngFor(worldSeed, 'station-dry', stationId, dayIndex).chance(SCARCITY_DRY_STATION_SHARE);
}
