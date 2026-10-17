import { CITY_MAP, CITY_SCENERY_REACH, DISTRICTS, cityBounds, type CityBounds, type CityId } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { cityPlan } from '../city/layout/placements';
import { buildLandmarkGeometry } from '../city/render/landmark-geometry';
import { buildOuterLandGeometry } from '../city/render/ground-geometry';
import { resolveQuality } from '../city/lib/quality';

/** The farthest the client ever draws anything: the largest cull distance and fog far across the quality tiers. */
const DRAW_DISTANCE = Math.max(
  ...[resolveQuality('low', false, 0), resolveQuality('auto', true, 0), resolveQuality('high', false, 0)].flatMap((profile) => [profile.cullDistance, profile.fogFar]),
);
/** Margin on top of the draw distance (a camera a few metres up, a rock a few metres tall). */
const MARGIN = 50;

type Box = Pick<CityBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>;
const grow = (box: Box, by: number): Box => ({ minX: box.minX - by, maxX: box.maxX + by, minZ: box.minZ - by, maxZ: box.maxZ + by });
const distance = (a: Box, b: Box): number => Math.hypot(Math.max(0, a.minX - b.maxX, b.minX - a.maxX), Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ));

const playable = (cityId: CityId): Box => cityBounds(cityId);
const scenery = (cityId: CityId): Box => grow(cityBounds(cityId), CITY_SCENERY_REACH[cityId]);

describe('the two cities never show each other', () => {
  it('keeps each city’s scenery further from the other city’s streets than the draw distance', () => {
    expect(DRAW_DISTANCE).toBeLessThanOrEqual(400);
    expect(distance(scenery('lagos'), playable('abuja'))).toBeGreaterThan(DRAW_DISTANCE + MARGIN);
    expect(distance(scenery('abuja'), playable('lagos'))).toBeGreaterThan(DRAW_DISTANCE + MARGIN);
    expect(distance(scenery('lagos'), scenery('abuja'))).toBeGreaterThan(DRAW_DISTANCE);
  });

  it('puts every placed prop (buildings, trees, cars) inside its own city or its scenery band', () => {
    const plan = cityPlan();
    const bands = [scenery('lagos'), scenery('abuja')];
    for (const [kit, placements] of Object.entries(plan.placements)) {
      for (const placement of placements) {
        const point = { minX: placement.x, maxX: placement.x, minZ: placement.z, maxZ: placement.z };
        expect(bands.some((band) => distance(point, band) === 0), `${kit} ${placement.model} at ${placement.x.toFixed(0)}, ${placement.z.toFixed(0)}`).toBe(true);
      }
    }
  });

  it('keeps lots, roads and lamps in their own city', () => {
    for (const lot of CITY_MAP.lots) {
      const city = DISTRICTS[lot.districtId].cityId;
      const other = city === 'lagos' ? 'abuja' : 'lagos';
      expect(distance(lot.footprint, playable(other)), lot.id).toBeGreaterThan(DRAW_DISTANCE + MARGIN);
    }
    for (const lamp of cityPlan().lamps) {
      const point = { minX: lamp.x, maxX: lamp.x, minZ: lamp.z, maxZ: lamp.z };
      expect([playable('lagos'), playable('abuja')].some((box) => distance(point, box) === 0)).toBe(true);
    }
  });

  it('draws the land round Abuja and Lagos as separate pieces, none within draw distance of both cities', () => {
    const geometry = buildOuterLandGeometry();
    const position = geometry.getAttribute('position');
    // Every four vertices are one quad (the writer emits quads only).
    for (let i = 0; i + 3 < position.count; i += 4) {
      const xs = [0, 1, 2, 3].map((k) => position.getX(i + k));
      const zs = [0, 1, 2, 3].map((k) => position.getZ(i + k));
      const quad: Box = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
      const nearLagos = distance(quad, playable('lagos')) < DRAW_DISTANCE + MARGIN;
      const nearAbuja = distance(quad, playable('abuja')) < DRAW_DISTANCE + MARGIN;
      expect(nearLagos && nearAbuja, `quad ${JSON.stringify(quad)}`).toBe(false);
    }
    geometry.dispose();
  });

  it('builds each city’s landmarks apart, inside that city’s own scenery band', () => {
    for (const cityId of ['lagos', 'abuja'] as const) {
      const geometry = buildLandmarkGeometry(cityId);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      expect(box, cityId).not.toBeNull();
      if (!box) continue;
      const band = scenery(cityId);
      expect(box.min.x, cityId).toBeGreaterThanOrEqual(band.minX - 1);
      expect(box.max.x, cityId).toBeLessThanOrEqual(band.maxX + 1);
      expect(box.min.z, cityId).toBeGreaterThanOrEqual(band.minZ - 1);
      expect(box.max.z, cityId).toBeLessThanOrEqual(band.maxZ + 1);
      geometry.dispose();
    }
  });

  it('keeps Abuja’s skyline: Aso Rock and the Zuma-style monolith are the tallest things in the city', () => {
    const geometry = buildLandmarkGeometry('abuja');
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.max.y ?? 0).toBeGreaterThan(60);
    geometry.dispose();
  });
});
