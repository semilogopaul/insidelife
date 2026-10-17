import { CITY_MAP, cellKindAt, type Weather } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { KIT_MANIFEST } from '../city/assets/kit-manifest';
import { computeAtmosphere } from '../city/lib/atmosphere';
import { resolveQuality } from '../city/lib/quality';
import { cityPlan } from '../city/layout/placements';

const clear: Weather = { condition: 'clear', intensity: 0, raining: false, temperatureC: 30, season: 'dry' };

describe('city plan', () => {
  const plan = cityPlan();

  it('places only models that exist in the kit bundles', () => {
    const known: Record<string, Readonly<Record<string, unknown>>> = {
      commercial: KIT_MANIFEST.commercial.models,
      suburban: KIT_MANIFEST.suburban.models,
      roads: KIT_MANIFEST.roads.models,
      nature: KIT_MANIFEST.nature.models,
      vehicles: KIT_MANIFEST.parked.models,
    };
    for (const [kit, placements] of Object.entries(plan.placements)) {
      for (const placement of placements) {
        if (placement.model.startsWith('proc:')) continue;
        expect(known[kit]?.[placement.model], `${kit}/${placement.model}`).toBeDefined();
      }
    }
  });

  it('draws roads procedurally (no kit road tiles) and keeps buildings off roads and water', () => {
    expect(plan.placements.roads.filter((p) => p.model.startsWith('road-'))).toHaveLength(0);
    for (const placement of [...plan.placements.commercial, ...plan.placements.suburban]) {
      if (placement.model.startsWith('detail-')) continue;
      const kind = cellKindAt(placement);
      expect(['land', 'sand'], `${placement.model} at ${placement.x},${placement.z}`).toContain(kind);
    }
  });

  it('exposes building colliders for the play layer', () => {
    expect(plan.colliders.length).toBeGreaterThan(300);
    for (const collider of plan.colliders) {
      expect(collider.maxX).toBeGreaterThan(collider.minX);
      expect(collider.height).toBeGreaterThan(2);
    }
  });

  it('is deterministic', () => {
    expect(cityPlan()).toBe(plan);
  });
});

describe('venue exteriors', () => {
  const plan = cityPlan();
  const lotOf = (venueId: string): { readonly index: number; readonly lot: (typeof CITY_MAP.lots)[number] } => {
    const index = CITY_MAP.lots.findIndex((candidate) => candidate.venueId === venueId);
    return { index, lot: CITY_MAP.lots[index] as (typeof CITY_MAP.lots)[number] };
  };
  const inside = (venueId: string, model: string): number => {
    const { lot } = lotOf(venueId);
    const f = lot.footprint;
    return [...plan.placements.nature, ...plan.placements.commercial].filter((p) => p.model === model && p.x >= f.minX && p.x <= f.maxX && p.z >= f.minZ && p.z <= f.maxZ).length;
  };

  it('gives each market its own ground, and Computer Village kiosks instead of parasols', () => {
    const grounds = ['computer-village', 'yaba-market', 'mushin-market', 'balogun-market', 'ajah-market'].map((id) => plan.lotGround.get(lotOf(id).index));
    expect(new Set(grounds).size).toBe(grounds.length);
    expect(inside('computer-village', 'proc:kiosk')).toBeGreaterThan(3);
    expect(inside('computer-village', 'proc:kiosk')).toBeGreaterThan(inside('yaba-market', 'proc:kiosk'));
  });

  it('keeps a park and a market apart, and a nature reserve a forest', () => {
    expect(plan.lotGround.get(lotOf('freedom-park').index)).not.toBe(plan.lotGround.get(lotOf('computer-village').index));
    expect(inside('lekki-conservation', 'proc:stall')).toBe(0);
    expect(plan.lotGround.get(lotOf('lekki-conservation').index)).not.toBe(plan.lotGround.get(lotOf('freedom-park').index));
  });

  it('draws beaches as beaches (a hut on the sand), not as parks', () => {
    for (const id of ['tarkwa-bay', 'elegushi-beach']) expect(inside(id, 'proc:hut'), id).toBeGreaterThan(0);
  });
});

describe('atmosphere & quality', () => {
  it('is day at noon and night at midnight', () => {
    const noon = computeAtmosphere(12.5, clear, { far: 400 });
    const midnight = computeAtmosphere(0, clear, { far: 400 });
    expect(noon.night).toBe(0);
    expect(noon.lightDirection[1]).toBeGreaterThan(0.8);
    expect(midnight.night).toBe(1);
    expect(midnight.lightIntensity).toBeLessThan(noon.lightIntensity);
  });

  it('thickens fog in harmattan and wets the streets in rain', () => {
    const haze = computeAtmosphere(12, { ...clear, condition: 'haze', intensity: 0.8 }, { far: 400 });
    const rain = computeAtmosphere(12, { ...clear, condition: 'rain', intensity: 0.6, raining: true }, { far: 400 });
    expect(haze.fogFar).toBeLessThan(260);
    expect(rain.wet).toBe(1);
    expect(rain.rain).toBeGreaterThan(0.5);
  });

  it('caps phones at DPR 1.5 and degrades auto quality on decline', () => {
    expect(resolveQuality('auto', true, 0).dpr[1]).toBeLessThanOrEqual(1.5);
    expect(resolveQuality('auto', false, 0).tier).toBe('high');
    expect(resolveQuality('auto', false, 2).tier).toBe('low');
    expect(resolveQuality('high', false, 2).tier).toBe('high');
    expect(resolveQuality('low', false, 0).shadows).toBe(false);
  });
});
