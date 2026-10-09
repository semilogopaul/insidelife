import { describe, expect, it } from 'vitest';
import { DISTRICT_IDS } from '../catalog/geography.js';
import { BILLBOARD_SLOT_IDS } from '../catalog/promotions.js';
import { VENUES } from '../catalog/venues.js';
import {
  BILLBOARD_WORLD_PLACEMENTS,
  CITY_BOUNDS,
  CITY_MAP,
  MAP_KM_PER_WORLD_METRE,
  cellKindAt,
  districtAt,
  districtBounds,
  findRoute,
  homeEntrance,
  homeKey,
  homeLotOf,
  homeLots,
  nearestRoadPoint,
  roadDistance,
  straightDistance,
  streetNameAt,
  turnByTurn,
  venueEntrance,
  venueLot,
  type WorldPoint,
} from './world-map.js';

const cityVenues = VENUES.filter((venue) => !('regionId' in venue && venue.regionId));
const entranceOf = (venueId: string): WorldPoint => {
  const entrance = venueEntrance(venueId);
  if (!entrance) throw new Error(`no entrance for ${venueId}`);
  return entrance.position;
};

describe('city layout', () => {
  it('fits the compact footprint', () => {
    expect(CITY_BOUNDS.maxX - CITY_BOUNDS.minX).toBeLessThanOrEqual(640);
    expect(CITY_BOUNDS.maxZ - CITY_BOUNDS.minZ).toBeLessThanOrEqual(420);
  });

  it('gives every in-city venue an authored lot whose door is on the pavement of a road in its own district', () => {
    for (const venue of cityVenues) {
      const lot = venueLot(venue.id);
      expect(lot, venue.id).not.toBeNull();
      const entrance = venueEntrance(venue.id);
      expect(entrance, venue.id).not.toBeNull();
      const snap = nearestRoadPoint(entrance!.position);
      expect(snap!.distance, venue.id).toBeLessThanOrEqual(6);
      expect(districtAt(entrance!.position), venue.id).toBe(venue.districtId);
      // The parking spot is on the road surface, next to the door.
      const parkingKind = cellKindAt(entrance!.parking);
      expect(['road', 'bridge'], venue.id).toContain(parkingKind);
      expect(straightDistance(entrance!.position, entrance!.parking), venue.id).toBeLessThan(8);
    }
  });

  it('keeps out-of-town venues out of the city', () => {
    for (const venue of VENUES) if ('regionId' in venue && venue.regionId) expect(venueEntrance(venue.id)).toBeNull();
  });

  it('venue lots never overlap roads, water or each other', () => {
    const claimed = new Map<number, string>();
    for (const lot of CITY_MAP.lots.filter((entry) => entry.kind === 'venue' || entry.kind === 'landmark')) {
      const [c0, r0, c1, r1] = lot.cells;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const index = r * CITY_MAP.cols + c;
          const kind = CITY_MAP.cells[index];
          expect(kind === 0 || kind === 2, `${lot.id} cell ${c},${r}`).toBe(true);
          expect(claimed.get(index), `${lot.id} overlaps`).toBeUndefined();
          claimed.set(index, lot.id);
        }
      }
    }
  });

  it('has residential lots in every district', () => {
    for (const id of DISTRICT_IDS) {
      expect(homeLots(id).length, id).toBeGreaterThanOrEqual(4);
      const bounds = districtBounds(id);
      expect(bounds.maxX).toBeGreaterThan(bounds.minX);
      const home = homeEntrance('character-1', id);
      expect(districtAt(home.position), id).toBe(id);
      expect(nearestRoadPoint(home.position)!.distance).toBeLessThanOrEqual(6);
    }
  });

  it('places every billboard slot', () => {
    for (const id of BILLBOARD_SLOT_IDS) {
      const placement = BILLBOARD_WORLD_PLACEMENTS[id];
      expect(placement, id).toBeDefined();
      expect(placement!.width).toBeGreaterThan(0);
      expect(placement!.height).toBeGreaterThan(0);
    }
  });

  it('names streets', () => {
    expect(streetNameAt(entranceOf('unilag'))).toBe('Herbert Macaulay Way');
    expect(streetNameAt({ x: 10_000, z: 10_000 })).toBeNull();
  });
});

describe('routing', () => {
  it('reaches every venue from every residential lot (sampled per district) and between all venues', () => {
    for (const id of DISTRICT_IDS) {
      const lots = homeLots(id);
      for (const lot of [lots[0], lots[Math.floor(lots.length / 2)], lots[lots.length - 1]]) {
        for (const venue of cityVenues) expect(findRoute(lot!.entrance!.position, entranceOf(venue.id)), `${lot!.id} → ${venue.id}`).not.toBeNull();
      }
    }
  }, 30_000);

  it('keeps venue-to-venue drives short and on land or bridges', () => {
    let longest = 0;
    let longestPair = '';
    const wet: string[] = [];
    const unroutable: string[] = [];
    for (const a of cityVenues) {
      for (const b of cityVenues) {
        if (a.id >= b.id) continue;
        const route = findRoute(entranceOf(a.id), entranceOf(b.id));
        if (!route) {
          unroutable.push(`${a.id} → ${b.id}`);
          continue;
        }
        if (route.length > longest) {
          longest = route.length;
          longestPair = `${a.id} → ${b.id}`;
        }
        // Sample the polyline every 2 m: never in open water (bridges are fine).
        for (let i = 1; i < route.points.length; i++) {
          const p = route.points[i - 1]!;
          const q = route.points[i]!;
          const steps = Math.ceil(Math.hypot(q.x - p.x, q.z - p.z) / 2);
          for (let s = 0; s <= steps; s++) {
            const point = { x: p.x + ((q.x - p.x) * s) / steps, z: p.z + ((q.z - p.z) * s) / steps };
            if (cellKindAt(point) === 'water') wet.push(`${a.id} → ${b.id} at ${point.x.toFixed(1)},${point.z.toFixed(1)}`);
          }
        }
      }
    }
    expect(unroutable).toEqual([]);
    expect(wet).toEqual([]);
    expect(longest, longestPair).toBeLessThanOrEqual(900);
    // Crossing the city costs fuel like a 35-45 km Lagos drive.
    expect(longest * MAP_KM_PER_WORLD_METRE).toBeGreaterThan(30);
    expect(longest * MAP_KM_PER_WORLD_METRE).toBeLessThan(48);
  }, 30_000);

  it('is deterministic', () => {
    const a = findRoute(entranceOf('mmia-airport'), entranceOf('elegushi-beach'));
    const b = findRoute(entranceOf('mmia-airport'), entranceOf('elegushi-beach'));
    expect(b).toEqual(a);
    expect(homeEntrance('abc', 'yaba')).toEqual(homeEntrance('abc', 'yaba'));
  });

  it('puts an owner who lives in their own house at that property’s lot', () => {
    expect(homeKey('character-1', null)).toBe('character-1');
    expect(homeKey('character-1', 'p-1')).toBe('property:p-1');
    // The lot the city draws your house on is the lot your front door is on.
    const lot = homeLotOf('property:p-1', 'lekki');
    expect(lot?.kind).toBe('home');
    expect(homeEntrance(homeKey('character-1', 'p-1'), 'lekki')).toEqual(lot?.entrance);
  });

  it('measures road distance along roads, never shorter than a straight line', () => {
    const from = entranceOf('unilag');
    const to = entranceOf('eko-hotel');
    const road = roadDistance(from, to);
    expect(road).toBeGreaterThanOrEqual(straightDistance(from, to));
    expect(road).toBeCloseTo(findRoute(from, to)!.length, 0);
    expect(roadDistance(from, { x: from.x + 3, z: from.z })).toBeCloseTo(3);
  });

  it('crosses the lagoon on Third Mainland Bridge from Ikorodu to the Island', () => {
    const route = findRoute(entranceOf('ikorodu-garage'), entranceOf('balogun-market'))!;
    expect(route.legs.some((leg) => leg.name === 'Third Mainland Bridge' && leg.kind === 'bridge')).toBe(true);
  });

  it('produces turn-by-turn maneuvers with street names and a roundabout exit', () => {
    const route = findRoute(entranceOf('lasu'), entranceOf('epe-land-office'))!;
    const maneuvers = turnByTurn(route, { destinationName: 'Epe Land Bureau' });
    expect(maneuvers[0]!.kind).toBe('depart');
    expect(maneuvers.at(-1)!.kind).toBe('arrive');
    expect(maneuvers.at(-1)!.text).toBe('You have arrived at Epe Land Bureau');
    expect(maneuvers.some((m) => m.kind === 'roundabout' && /exit onto/.test(m.text))).toBe(true);
    expect(maneuvers.some((m) => m.kind === 'left' || m.kind === 'right')).toBe(true);
    for (let i = 1; i < maneuvers.length; i++) expect(maneuvers[i]!.at).toBeGreaterThanOrEqual(maneuvers[i - 1]!.at);
  });

  it('routes quickly enough for the server', () => {
    const started = Date.now();
    for (let i = 0; i < 200; i++) roadDistance(entranceOf('mmia-airport'), entranceOf('ajah-market'));
    expect((Date.now() - started) / 200).toBeLessThan(2);
  });
});
