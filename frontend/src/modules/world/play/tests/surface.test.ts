import { CITY_MAP, ROAD_LINE_WIDTH, cellCentreX, cellCentreZ, findRoute, venueEntrance } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { groundHeightAt, onCarriageway, surfaceAt } from '../physics/surface';
import { createWalker, stepWalker, type WalkWorld } from '../physics/walker';
import { rideProgress, buildRidePath, pointAlong } from '../ride/ride-path';

describe('ground surfaces', () => {
  it('splits a road cell into a four-lane carriageway and pavement by its connections', () => {
    const eastWest = 2 | 8;
    expect(onCarriageway(7.5, 0, eastWest)).toBe(true);
    expect(onCarriageway(0, 7.5, eastWest)).toBe(false);
    expect(onCarriageway(0, 6.9, eastWest)).toBe(true);
    // A road line 10 m wide (none today) would keep the first city's ±4 m carriageway.
    expect(onCarriageway(0, 4.5, eastWest, 4, 4)).toBe(false);
  });

  it('reads asphalt (y 0.1) on roads, pavement (y 0.2) at the kerb, water outside the city', () => {
    const tile = CITY_MAP.roadTiles.find((t) => t.kind === 'straight' && !t.bridge)!;
    expect(surfaceAt(tile.x, tile.z)).toBe('asphalt');
    expect(groundHeightAt(tile.x, tile.z)).toBeCloseTo(0.1);
    const across = (tile.mask & 2) !== 0 ? { x: tile.x, z: tile.z + ROAD_LINE_WIDTH / 2 - 0.4 } : { x: tile.x + ROAD_LINE_WIDTH / 2 - 0.4, z: tile.z };
    expect(surfaceAt(across.x, across.z)).toBe('pavement');
    expect(groundHeightAt(across.x, across.z)).toBeCloseTo(0.2);
    expect(surfaceAt(CITY_MAP.bounds.maxX + 50, 0)).toBe('water');
    expect(surfaceAt(cellCentreX(0), cellCentreZ(CITY_MAP.rows - 1))).toBe('water');
  });

  it('puts every venue door on walkable ground', () => {
    for (const id of ['unilag', 'berger-car-market', 'eko-hotel', 'lasuth']) {
      const door = venueEntrance(id)!.position;
      expect(surfaceAt(door.x, door.z)).not.toBe('water');
    }
  });
});

describe('walking', () => {
  const world: WalkWorld = { surfaceAt: (x) => (x > 10 ? 'water' : 'pavement'), groundHeightAt: () => 0.2, resolve: () => undefined };

  it('walks where the camera points and slides along water instead of entering it', () => {
    const walker = createWalker(0, 0, 0, 0.2);
    for (let i = 0; i < 120; i++) stepWalker(walker, { dirX: 1, dirZ: 0, run: false }, 1 / 60, world);
    expect(walker.x).toBeGreaterThan(2.5);
    for (let i = 0; i < 600; i++) stepWalker(walker, { dirX: 0.7, dirZ: 0.7, run: true }, 1 / 60, world);
    expect(walker.x).toBeLessThanOrEqual(10);
    expect(walker.z).toBeGreaterThan(10);
    expect(walker.speed).toBeLessThan(8);
  });
});

describe('ride playback', () => {
  it('maps server time to route progress: monotonic, eased, on time', () => {
    let last = -1;
    for (let t = 0; t <= 100; t += 0.5) {
      const p = rideProgress(t, 0, 100, true);
      expect(p).toBeGreaterThanOrEqual(last - 1e-9);
      last = p;
    }
    expect(rideProgress(0, 0, 100)).toBe(0);
    expect(rideProgress(100, 0, 100)).toBeCloseTo(1);
    expect(rideProgress(50, 0, 100)).toBeCloseTo(0.5, 1);
    expect(rideProgress(200, 0, 100)).toBe(1);
  });

  it('follows the GPS route kerb to kerb in the right-hand lane', () => {
    const route = findRoute(venueEntrance('unilag')!.position, venueEntrance('yabatech')!.position)!;
    const path = buildRidePath(route, 1.8);
    expect(path.length).toBeGreaterThan(10);
    const point = { x: 0, z: 0, heading: 0 };
    for (let s = 0; s <= path.length; s += 5) {
      pointAlong(path, s, point);
      expect(surfaceAt(point.x, point.z)).toBe('asphalt');
    }
  });
});
