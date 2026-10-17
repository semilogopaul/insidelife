import { createHash } from 'node:crypto';
import { CITY_MAP, DISTRICTS } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { cityPlan } from '../city/layout/placements';

/**
 * Lagos's plan (every model instance, lamp, wall, collider and lot colour) is pinned: adding Abuja's places, looks and
 * landmarks must never move a tree, a building or a lamp in Lagos. If you change Lagos on purpose, re-pin the hash.
 */
describe('Lagos on the plan', () => {
  it('is exactly what it was before Abuja became a full city', () => {
    const plan = cityPlan();
    // Lagos lies north of z = 700 m in the world frame; Abuja is far south of it.
    const lagos = (z: number): boolean => z < 700;
    const round = (n: number): number => Math.round(n * 1000) / 1000;
    const data = {
      placements: Object.fromEntries(
        Object.entries(plan.placements).map(([kit, list]) => [kit, list.filter((p) => lagos(p.z)).map((p) => [p.model, round(p.x), round(p.y), round(p.z), round(p.yaw), round(p.sx), round(p.sy), round(p.sz), p.tint])]),
      ),
      lamps: plan.lamps.filter((l) => lagos(l.z)).map((l) => [round(l.x), round(l.y), round(l.z)]),
      walls: plan.walls.filter((w) => lagos(w.z0)).map((w) => [round(w.x0), round(w.z0), round(w.x1), round(w.z1), w.height, w.color]),
      colliders: plan.colliders.filter((c) => lagos(c.minZ)).map((c) => [round(c.minX), round(c.minZ), round(c.maxX), round(c.maxZ), round(c.height)]),
      ground: CITY_MAP.lots.flatMap((lot, i) => (DISTRICTS[lot.districtId].cityId === 'lagos' ? [[i, plan.lotGround.get(i) ?? -1]] : [])),
    };
    expect(createHash('sha256').update(JSON.stringify(data)).digest('hex')).toBe('16ca181fddabd4d0b4127662ea44743bd060b4121c21a20aa1039816a7f2e6ed');
  });
});
