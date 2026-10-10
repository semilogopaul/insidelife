import { venueEntrance } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { cityPlan } from '../city/layout/placements';
import { estateSite, refinerySite, type Rect } from '../city/layout/showcase-sites';
import { buildShowcaseGeometry } from '../city/render/showcase-geometry';
import { POST_SLOT, signEntries } from '../city/render/sign-atlas';

const inside = (inner: Rect, outer: Rect, margin = 0): boolean =>
  inner.minX >= outer.minX + margin && inner.maxX <= outer.maxX - margin && inner.minZ >= outer.minZ + margin && inner.maxZ <= outer.maxZ - margin;

const triangles = (geometry: { readonly index: { readonly count: number } | null } | null): number => (geometry?.index ? geometry.index.count / 3 : 0);

describe('OBO’s estate and Dangote Refinery in the city', () => {
  it('derives the estate from its lots: house and pool on the grounds, gates at the doors, the jet on its pad', () => {
    const site = estateSite();
    expect(site).not.toBeNull();
    if (!site) return;
    const { grounds, pad, house, pool, jet } = site;
    for (const part of [house.ground, house.first, house.top, house.roof, pool, site.deck]) expect(inside(part, grounds)).toBe(true);
    expect(inside(pool, site.deck)).toBe(true);
    // The gates stand where the venue doors are.
    expect(Math.abs(site.gate.x - (venueEntrance('obo-mansion')?.position.x ?? Number.NaN))).toBeLessThan(0.01);
    expect(Math.abs(site.jetGate.z - (venueEntrance('air-obo')?.position.z ?? Number.NaN))).toBeLessThan(0.01);
    // AIR OBO fits its pad, nose at the apron gate, and the apron gives its wing room on the waterfront.
    expect(jet.nose).toBeGreaterThan(pad.minX + 2);
    expect(jet.tail).toBeLessThan(pad.maxX);
    expect(jet.z).toBeGreaterThan(pad.minZ);
    expect(site.apron?.maxZ).toBe(pad.minZ);
  });

  it('puts the tank farm inside the works, tanks clear of each other', () => {
    const site = refinerySite();
    expect(site).not.toBeNull();
    if (!site) return;
    for (const tank of site.tanks) expect(inside({ minX: tank.x - tank.r, maxX: tank.x + tank.r, minZ: tank.z - tank.r, maxZ: tank.z + tank.r }, site.works, 1)).toBe(true);
    for (const a of site.tanks) for (const b of site.tanks) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.r + b.r + 1);
    expect(site.centre.minX).toBe(site.works.maxX);
  });

  it('builds each site in a few merged meshes within the triangle budget, with its text decals and two flares', () => {
    const built = buildShowcaseGeometry();
    for (const site of [built.estate, built.refinery]) {
      expect(site).not.toBeNull();
      if (!site) continue;
      expect(site.opaque.getAttribute('color')).toBeDefined();
      expect(site.glass?.getAttribute('position').count).toBeGreaterThan(0);
      expect(site.glow?.getAttribute('color')).toBeDefined();
      expect(site.decals?.getAttribute('uv')).toBeDefined();
      const total = triangles(site.opaque) + triangles(site.glass) + triangles(site.glow) + triangles(site.decals);
      expect(total).toBeLessThan(60_000);
    }
    expect(built.flares).toHaveLength(2);
    for (const [, y] of built.flares) expect(y).toBeGreaterThan(40);
  });

  it('walls the estate and the works, makes the house and the jet solid, and keeps their names off the signboards', () => {
    const site = estateSite();
    const plan = cityPlan();
    if (!site) throw new Error('no estate');
    expect(plan.colliders.some((box) => box.minX === site.house.top.minX && box.height > 13)).toBe(true);
    expect(plan.colliders.some((box) => box.minX === site.jet.nose && box.maxX === site.jet.tail)).toBe(true);
    const near = (rect: Rect) => plan.walls.filter((wall) => wall.x0 >= rect.minX - 1 && wall.x1 <= rect.maxX + 1 && wall.z0 >= rect.minZ - 1 && wall.z1 <= rect.maxZ + 1);
    expect(near(site.grounds).length).toBeGreaterThanOrEqual(4);
    const works = refinerySite()?.works;
    if (works) expect(near(works).length).toBeGreaterThanOrEqual(4);
    const entries = signEntries();
    expect(entries.length).toBeLessThanOrEqual(POST_SLOT);
    expect(entries.some((entry) => entry.lot?.venueId === 'obo-mansion' || entry.lot?.venueId === 'dangote-refinery')).toBe(false);
  });
});
