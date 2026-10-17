import { describe, expect, it } from 'vitest';
import { CITY_IDS, DISTRICTS, DISTRICT_IDS, type CityId } from '../catalog/geography.js';
import { BILLBOARD_SLOT_IDS } from '../catalog/promotions.js';
import { VENUES, venuesOfCity } from '../catalog/venues.js';
import {
  BILLBOARD_WORLD_PLACEMENTS,
  CITY_MAP,
  DOOR_STEP_OUT,
  ENTRY_RADIUS,
  MAP_KM_PER_WORLD_METRE,
  ROAD_LINE_WIDTH,
  cellKindAt,
  cityAt,
  cityBounds,
  districtAt,
  districtBounds,
  doorStepFor,
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

const cityVenues = VENUES;
const entranceOf = (venueId: string): WorldPoint => {
  const entrance = venueEntrance(venueId);
  if (!entrance) throw new Error(`no entrance for ${venueId}`);
  return entrance.position;
};

describe('city layout', () => {
  it('fits the compact footprint', () => {
    // The 640 × 420 m layout with every road line widened to four lanes.
    const lagos = cityBounds('lagos');
    expect(lagos.maxX - lagos.minX).toBeLessThanOrEqual(760);
    expect(lagos.maxZ - lagos.minZ).toBeLessThanOrEqual(520);
    const abuja = cityBounds('abuja');
    expect(abuja.maxX - abuja.minX).toBeLessThanOrEqual(760);
    expect(abuja.maxZ - abuja.minZ).toBeLessThanOrEqual(520);
  });

  it('puts Abuja in the same frame, far from Lagos: no overlap, a wide gap, and every cell belongs to one city', () => {
    const lagos = cityBounds('lagos');
    const abuja = cityBounds('abuja');
    expect(abuja.minX - lagos.maxX).toBeGreaterThanOrEqual(500);
    expect(abuja.minZ - lagos.maxZ).toBeGreaterThanOrEqual(500);
    expect(cityAt({ x: (lagos.minX + lagos.maxX) / 2, z: (lagos.minZ + lagos.maxZ) / 2 })).toBe('lagos');
    expect(cityAt({ x: (abuja.minX + abuja.maxX) / 2, z: (abuja.minZ + abuja.maxZ) / 2 })).toBe('abuja');
    // Every road, lot and venue lies within its own city's rectangle.
    for (const tile of CITY_MAP.roadTiles) {
      const city = cityAt({ x: tile.x, z: tile.z });
      const box = cityBounds(city);
      expect(tile.x >= box.minX && tile.x <= box.maxX && tile.z >= box.minZ && tile.z <= box.maxZ, `${tile.col},${tile.row}`).toBe(true);
    }
    for (const lot of CITY_MAP.lots) expect(cityAt({ x: lot.footprint.minX, z: lot.footprint.minZ }), lot.id).toBe(DISTRICTS[lot.districtId].cityId);
  });

  it('never joins the cities by road: the road graph has no edge between them', () => {
    const cityOfNode = (id: number): CityId => cityAt({ x: CITY_MAP.nodes[id]!.x, z: CITY_MAP.nodes[id]!.z });
    for (const edge of CITY_MAP.edges) expect(cityOfNode(edge.a)).toBe(cityOfNode(edge.b));
  });

  it('has the airports the contract names: a terminal in each city and a General Aviation Terminal in each', () => {
    const expected: ReadonlyArray<readonly [string, CityId, string]> = [
      ['mmia-airport', 'lagos', 'airport'],
      ['mmia-gat', 'lagos', 'aviation-terminal'],
      ['naia-airport', 'abuja', 'airport'],
      ['naia-gat', 'abuja', 'aviation-terminal'],
    ];
    for (const [id, city, type] of expected) {
      const venue = VENUES.find((entry) => entry.id === id)!;
      expect(venue.type, id).toBe(type);
      expect(DISTRICTS[venue.districtId].cityId, id).toBe(city);
      expect(venueLot(id)?.archetype, id).toBeDefined();
    }
    expect(VENUES.find((entry) => entry.id === 'naia-airport')!.districtId).toBe('lugbe');
  });

  it('gives every in-city venue an authored lot whose door is on the pavement of a road in its own district', () => {
    for (const venue of cityVenues) {
      const lot = venueLot(venue.id);
      expect(lot, venue.id).not.toBeNull();
      const entrance = venueEntrance(venue.id);
      expect(entrance, venue.id).not.toBeNull();
      const snap = nearestRoadPoint(entrance!.position);
      expect(snap!.distance, venue.id).toBeLessThanOrEqual(ROAD_LINE_WIDTH / 2 + 1);
      expect(districtAt(entrance!.position), venue.id).toBe(venue.districtId);
      // The parking spot is on the road surface, next to the door.
      const parkingKind = cellKindAt(entrance!.parking);
      expect(['road', 'bridge'], venue.id).toContain(parkingKind);
      expect(straightDistance(entrance!.position, entrance!.parking), venue.id).toBeLessThan(8);
    }
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
      expect(nearestRoadPoint(home.position)!.distance).toBeLessThanOrEqual(ROAD_LINE_WIDTH / 2 + 1);
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
  it('reaches every venue of the city from every residential lot (sampled per district) and between all its venues', () => {
    for (const id of DISTRICT_IDS) {
      const lots = homeLots(id);
      for (const lot of [lots[0], lots[Math.floor(lots.length / 2)], lots[lots.length - 1]]) {
        for (const venue of venuesOfCity(DISTRICTS[id].cityId)) expect(findRoute(lot!.entrance!.position, entranceOf(venue.id)), `${lot!.id} → ${venue.id}`).not.toBeNull();
      }
    }
  }, 30_000);

  it('has no route between the cities: a road never leads from Lagos to Abuja', () => {
    expect(findRoute(entranceOf('mmia-airport'), entranceOf('naia-airport'))).toBeNull();
    expect(roadDistance(entranceOf('mmia-airport'), entranceOf('naia-airport'))).toBeGreaterThan(straightDistance(entranceOf('mmia-airport'), entranceOf('naia-airport')));
  });

  it('keeps venue-to-venue drives short and on land or bridges', () => {
    let longest = 0;
    let longestPair = '';
    const wet: string[] = [];
    const unroutable: string[] = [];
    for (const a of cityVenues) {
      for (const b of cityVenues) {
        if (a.id >= b.id || DISTRICTS[a.districtId].cityId !== DISTRICTS[b.districtId].cityId) continue;
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
    expect(longest, longestPair).toBeLessThanOrEqual(1100);
    // Crossing the city costs fuel like a 35-45 km Lagos drive.
    expect(longest * MAP_KM_PER_WORLD_METRE).toBeGreaterThan(30);
    expect(longest * MAP_KM_PER_WORLD_METRE).toBeLessThan(48);
  }, 30_000);

  it('keeps Abuja drives in the same range as Lagos’s', () => {
    const abuja = venuesOfCity('abuja');
    let longest = 0;
    for (const a of abuja) for (const b of abuja) if (a.id < b.id) longest = Math.max(longest, findRoute(entranceOf(a.id), entranceOf(b.id))!.length);
    expect(longest).toBeGreaterThan(400);
    expect(longest).toBeLessThanOrEqual(1100);
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

describe('stepping out of a door', () => {
  it('puts each player on their own spot a step in front of it, the same every time', () => {
    const door = { position: { x: 10, z: 20 }, heading: Math.PI / 2, parking: { x: 10, z: 26, heading: 0 } };
    const spots = ['ada', 'femi', 'tolu', 'chidi', 'ngozi'].map((key) => doorStepFor(door, key));
    expect(doorStepFor(door, 'ada')).toEqual(spots[0]);
    for (const spot of spots) {
      const distance = Math.hypot(spot.x - door.position.x, spot.z - door.position.z);
      expect(distance).toBeGreaterThanOrEqual(DOOR_STEP_OUT - 1e-9);
      expect(distance).toBeLessThan(ENTRY_RADIUS / 4);
      // In front of the door (heading +z), never behind it into the building.
      expect(spot.z).toBeGreaterThan(door.position.z + 1);
    }
    expect(new Set(spots.map((spot) => `${spot.x.toFixed(2)},${spot.z.toFixed(2)}`)).size).toBeGreaterThan(2);
  });
});
