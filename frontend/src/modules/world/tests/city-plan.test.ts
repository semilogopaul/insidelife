import { cellKindAt, type Weather } from '@insidelife/shared';
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
