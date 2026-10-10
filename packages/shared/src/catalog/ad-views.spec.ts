import { describe, expect, it } from 'vitest';
import { AD_PLACEMENTS } from '../world-map/ad-placements.js';
import { CITY_MAP } from '../world-map/city-map.js';
import { AD_SLOTS } from './ad-inventory.js';
import {
  AD_VIEW_RADIUS_METRES,
  adGroundDistance,
  adSpotGeometry,
  adSurfaceOf,
  adViewingPoint,
  canViewAdFrom,
  distanceToPolyline,
  isInFrontOfAd,
  nearestVenueToAd,
} from './ad-views.js';

describe('ad geometry', () => {
  it('locates every physical slot from the same geometry the city draws', () => {
    for (const board of CITY_MAP.billboards) {
      expect(adSpotGeometry(board.slotId)).toMatchObject({ position: board.position, width: board.width, facing: board.facing, doubleSided: false });
    }
    for (const spot of AD_PLACEMENTS) expect(adSpotGeometry(spot.id)).toMatchObject({ position: spot.position, doubleSided: spot.doubleSided });
    expect(adSpotGeometry('lagos-tv')).toBeNull();
    expect(adSpotGeometry('app-1')).toBeNull();
  });

  it('classifies every slot by where it is seen', () => {
    for (const slot of AD_SLOTS) {
      const surface = adSurfaceOf(slot.kind);
      expect(surface === 'street').toBe(adSpotGeometry(slot.id) !== null);
    }
  });

  it('only counts viewers within 40 m on the printed side', () => {
    const spot = adSpotGeometry('third-mainland-north');
    expect(spot).not.toBeNull();
    if (!spot) return;
    const ahead = (m: number) => ({ x: spot.position.x + Math.cos(spot.facing) * m, z: spot.position.z + Math.sin(spot.facing) * m });
    expect(canViewAdFrom(spot, ahead(10))).toBe(true);
    expect(canViewAdFrom(spot, ahead(AD_VIEW_RADIUS_METRES - 1))).toBe(true);
    expect(canViewAdFrom(spot, ahead(AD_VIEW_RADIUS_METRES + 1))).toBe(false);
    expect(isInFrontOfAd(spot, ahead(-10))).toBe(false);
  });

  it('derives a reachable viewing point in sight of every board', () => {
    for (const slot of AD_SLOTS) {
      const spot = adSpotGeometry(slot.id);
      if (!spot) continue;
      const viewing = adViewingPoint(slot.id);
      expect(viewing, slot.id).not.toBeNull();
      if (!viewing) continue;
      expect(adGroundDistance(spot, viewing.position), slot.id).toBeLessThanOrEqual(AD_VIEW_RADIUS_METRES);
      expect(isInFrontOfAd(spot, viewing.position), slot.id).toBe(true);
    }
  });

  it('finds the nearest venue for a ride', () => {
    const nearest = nearestVenueToAd('ikeja-allen');
    expect(nearest?.venueId).toBeTruthy();
    expect(nearest?.metres).toBeGreaterThanOrEqual(0);
    expect(nearestVenueToAd('lagos-tv')).toBeNull();
  });

  it('measures distance to a route polyline', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
      { x: 100, z: 100 },
    ];
    expect(distanceToPolyline({ x: 50, z: 10 }, line)).toBeCloseTo(10);
    expect(distanceToPolyline({ x: 120, z: 50 }, line)).toBeCloseTo(20);
    expect(distanceToPolyline({ x: -3, z: -4 }, line)).toBeCloseTo(5);
    expect(distanceToPolyline({ x: 0, z: 0 }, [])).toBe(Number.POSITIVE_INFINITY);
  });
});
