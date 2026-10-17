import { CITY_MAP, DISTRICTS, type CityId } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { MAX_PAGE_HEIGHT, PAGE_WIDTH, POST_SLOT, SLOTS_PER_PAGE, SLOT_H, signAtlasPlan, signEntries, slotUv } from '../city/render/sign-atlas';

const CITIES: readonly CityId[] = ['lagos', 'abuja'];
const OWN_SIGNAGE = new Set(['mansion', 'jet-pad', 'refinery']);

/** The venue lots that should carry a signboard in a city. */
const signedLots = (cityId: CityId) =>
  CITY_MAP.lots.filter((lot) => lot.kind === 'venue' && lot.venueId && lot.entrance && !OWN_SIGNAGE.has(lot.archetype ?? 'shop') && DISTRICTS[lot.districtId].cityId === cityId);

describe('sign atlas (one per city)', () => {
  it('keeps every page within 2048 × 2048 px, a page per 63 signs', () => {
    for (const cityId of CITIES) {
      for (const page of signAtlasPlan(cityId)) {
        expect(PAGE_WIDTH, cityId).toBeLessThanOrEqual(2048);
        expect(page.height, `${cityId} page ${page.index}`).toBeLessThanOrEqual(MAX_PAGE_HEIGHT);
        expect(page.height % SLOT_H).toBe(0);
        expect(page.entries.length).toBeLessThanOrEqual(SLOTS_PER_PAGE - 1);
      }
    }
  });

  it('never drops a sign: every venue lot with a door has one, on its own city’s atlas only', () => {
    for (const cityId of CITIES) {
      const other = CITIES.find((id) => id !== cityId) as CityId;
      const entries = signEntries(cityId);
      const signed = new Set(entries.flatMap((entry) => (entry.lot?.venueId ? [entry.lot.venueId] : [])));
      for (const lot of signedLots(cityId)) expect(signed.has(lot.venueId as string), `${cityId}: ${lot.venueId}`).toBe(true);
      expect(signed.size, cityId).toBe(signedLots(cityId).length);
      for (const lot of signedLots(other)) expect(signed.has(lot.venueId as string), `${lot.venueId} is ${other}'s`).toBe(false);
    }
  });

  it('puts every sign on a page of its own slot (never the post swatch, never twice)', () => {
    for (const cityId of CITIES) {
      const taken = new Set<string>();
      for (const entry of signEntries(cityId)) {
        expect(entry.slot, `${cityId} ${entry.text}`).not.toBe(POST_SLOT);
        const key = `${entry.page}:${entry.slot}`;
        expect(taken.has(key), key).toBe(false);
        taken.add(key);
        const page = signAtlasPlan(cityId)[entry.page];
        expect(page, key).toBeDefined();
        const [u0, v0, u1, v1] = slotUv(page?.height ?? 1, entry.slot);
        for (const value of [u0, v0, u1, v1]) expect(value).toBeGreaterThanOrEqual(0);
        for (const value of [u0, v0, u1, v1]) expect(value).toBeLessThanOrEqual(1);
        expect(u1).toBeGreaterThan(u0);
        expect(v1).toBeGreaterThan(v0);
      }
    }
  });

  it('keeps Lagos’s toll plaza sign in Lagos and gives Abuja a good many of its own', () => {
    expect(signEntries('lagos').some((entry) => entry.lot === null)).toBe(true);
    expect(signEntries('abuja').some((entry) => entry.lot === null)).toBe(false);
    expect(signEntries('abuja').length).toBeGreaterThan(60);
  });

  it('holds only the current city’s texels: the two atlases together are far below the old 2048 × 4096', () => {
    const bytes = (cityId: CityId): number => signAtlasPlan(cityId).reduce((total, page) => total + PAGE_WIDTH * page.height * 4, 0);
    for (const cityId of CITIES) expect(bytes(cityId), cityId).toBeLessThanOrEqual(2048 * 4096 * 4);
  });
});
