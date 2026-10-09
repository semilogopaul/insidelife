import { describe, expect, it } from 'vitest';
import { AD_PLACEMENTS } from '../world-map/ad-placements.js';
import { AD_SLOTS, DEFAULT_PHONE_APP_SLOTS, findAdSlot, phoneAppSlotNumber } from './ad-inventory.js';

describe('ad inventory', () => {
  it('offers more than 500 places to advertise with the default 10 phone apps', () => {
    const sellable = AD_SLOTS.filter((slot) => (phoneAppSlotNumber(slot.id) ?? 0) <= DEFAULT_PHONE_APP_SLOTS);
    expect(sellable.length).toBeGreaterThan(500);
  });

  it('has unique, short, url-safe ids (they are stored on bookings)', () => {
    const ids = AD_SLOTS.map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z0-9-]{2,32}$/);
  });

  it('sells every generated placement, with a positive price and room for at least one ad', () => {
    for (const spot of AD_PLACEMENTS) {
      const slot = findAdSlot(spot.id);
      expect(slot, spot.id).toBeDefined();
      expect(slot?.pricePerDayKobo).toBeGreaterThan(0);
      expect(slot?.maxConcurrentAds).toBeGreaterThan(0);
      expect(slot?.format).toBe(spot.format);
    }
  });

  it('prices roadside spots by district prestige', () => {
    const shelters = AD_SLOTS.filter((slot) => slot.kind === 'bus-shelter');
    const cheapest = Math.min(...shelters.map((slot) => slot.pricePerDayKobo));
    const dearest = Math.max(...shelters.map((slot) => slot.pricePerDayKobo));
    expect(dearest).toBeGreaterThan(cheapest);
    const mushin = shelters.find((slot) => slot.districtId === 'mushin');
    const vi = shelters.find((slot) => slot.districtId === 'victoria-island');
    if (mushin && vi) expect(vi.pricePerDayKobo).toBeGreaterThan(mushin.pricePerDayKobo);
  });

  it('keeps generated spots clear of each other', () => {
    for (const kind of ['street-billboard', 'bus-shelter'] as const) {
      const spots = AD_PLACEMENTS.filter((spot) => spot.kind === kind);
      for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)).toBeGreaterThanOrEqual(18);
    }
  });
});
