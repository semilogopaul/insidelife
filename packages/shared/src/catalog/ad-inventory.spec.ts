import { describe, expect, it } from 'vitest';
import { AD_PLACEMENT_KINDS, AD_PLACEMENTS } from '../world-map/ad-placements.js';
import {
  AD_RATE_DEFINITIONS,
  AD_RATE_KEYS,
  AD_SLOTS,
  DEFAULT_PHONE_APP_SLOTS,
  adRateKeyOf,
  adWeekPriceKobo,
  districtPriceFactor,
  findAdSlot,
  isAdRateKey,
  phoneAppSlotNumber,
  type AdSlot,
} from './ad-inventory.js';
import {
  AD_MAX_PRICE_KOBO,
  AD_MIN_PRICE_KOBO,
  BILLBOARD_SLOT_IDS,
  AD_SHORT_BLOCK_FROM_KOBO,
  CLUB_PLAY_PRODUCTS,
  TRACK_MAX_SECONDS,
  adBlockDays,
  adBlockPriceKobo,
  adBlockPriceLabel,
  adBlocksProblem,
  adMaxBlocks,
  adQuote,
  adRateSummary,
  adWeekPriceLabel,
  adWeeksProblem,
  runLengthLabel,
  findBillboardSlot,
  friendlyWeekPriceKobo,
  isValidAdPriceKobo,
} from './promotions.js';

const NAIRA = 100;
const ofKind = (kind: AdSlot['kind']): readonly AdSlot[] => AD_SLOTS.filter((slot) => slot.kind === kind);

/** The day rates before the switch to weekly pricing (₦/day). */
const OLD_DAILY = {
  premium: {
    'mmia-arrivals': 25_000,
    'third-mainland-north': 20_000,
    'third-mainland-south': 20_000,
    'lekki-toll-gate': 15_000,
    'ozumba-mbadiwe': 12_000,
    'vi-towers': 12_000,
    'ikeja-allen': 8_000,
    'balogun-market': 7_500,
    'yaba-hub': 6_000,
    'surulere-stadium': 5_000,
    'ajah-roundabout': 4_000,
    'ikorodu-garage': 2_500,
  },
  'street-billboard': 1_800,
  'bus-shelter': 900,
  totem: 600,
  'stadium-led': 2_500,
  'market-banner': 1_000,
  'park-board': 1_500,
  'lagos-tv': 6_000,
} as const;

describe('ad prices: per 7 days, 7 × the old day rate', () => {
  it('prices every premium board at 7 × its old day rate', () => {
    for (const id of BILLBOARD_SLOT_IDS) expect(findBillboardSlot(id)?.weekPriceKobo, id).toBe(7 * OLD_DAILY.premium[id] * NAIRA);
    expect(findAdSlot('mmia-arrivals')?.weekPriceKobo).toBe(175_000 * NAIRA);
    expect(findAdSlot('ikorodu-garage')?.weekPriceKobo).toBe(17_500 * NAIRA);
  });

  it('keeps venue, stadium, market, park and Lagos TV prices flat at 7 × the day rate', () => {
    for (const kind of ['stadium-led', 'market-banner', 'park-board', 'lagos-tv'] as const) {
      for (const slot of ofKind(kind)) expect(slot.weekPriceKobo, slot.id).toBe(7 * OLD_DAILY[kind] * NAIRA);
    }
  });

  it('scales roadside kinds by district prestige, rounded to ₦500', () => {
    for (const kind of ['street-billboard', 'bus-shelter', 'totem'] as const) {
      for (const slot of ofKind(kind)) {
        const expected = friendlyWeekPriceKobo(7 * OLD_DAILY[kind] * NAIRA * districtPriceFactor(slot.districtId!));
        expect(slot.weekPriceKobo, slot.id).toBe(expected);
        expect(slot.weekPriceKobo % (500 * NAIRA)).toBe(0);
      }
    }
    const shelters = ofKind('bus-shelter');
    const mushin = shelters.find((slot) => slot.districtId === 'mushin');
    const vi = shelters.find((slot) => slot.districtId === 'victoria-island');
    if (mushin && vi) expect(vi.weekPriceKobo).toBeGreaterThan(mushin.weekPriceKobo);
  });

  it('sells the phone app at ₦100,000 per 7 days and songs at ₦5,000 a day = ₦35,000 a week (up to 3 minutes)', () => {
    for (const app of ofKind('phone-app')) expect(app.weekPriceKobo, app.id).toBe(100_000 * NAIRA);
    expect(CLUB_PLAY_PRODUCTS).toEqual([expect.objectContaining({ id: 'all-clubs-7d', days: 7, priceKobo: 35_000 * NAIRA })]);
    expect(TRACK_MAX_SECONDS).toBe(180);
  });

  it('never prices an ad under ₦2,000 a week', () => {
    for (const slot of AD_SLOTS) expect(slot.weekPriceKobo, slot.id).toBeGreaterThanOrEqual(AD_MIN_PRICE_KOBO);
    expect(friendlyWeekPriceKobo(400 * NAIRA)).toBe(AD_MIN_PRICE_KOBO);
  });

  it('quotes 1–4 consecutive weeks with no discount below ₦35,000 a week', () => {
    expect(adQuote(28_000 * NAIRA, 1)).toEqual({ blocks: 1, blockDays: 7, days: 7, blockPriceKobo: 2_800_000, weekPriceKobo: 2_800_000, weeks: 1, totalKobo: 2_800_000 });
    expect(adQuote(28_000 * NAIRA, 4)).toMatchObject({ days: 28, totalKobo: 11_200_000 });
    for (const weeks of [0, 5, 1.5]) {
      expect(adWeeksProblem(weeks)).toMatch(/1 to 4 weeks/);
      expect(() => adQuote(28_000 * NAIRA, weeks)).toThrow(RangeError);
    }
    expect(() => adQuote(1_999 * NAIRA, 1)).toThrow(/₦2,000/);
    expect(() => adQuote(2_000 * NAIRA + 50, 1)).toThrow(RangeError);
    expect(adWeekPriceLabel(17_500 * NAIRA)).toBe('₦17,500/week');
  });

  it('sells expensive slots (₦35,000 a week or more) in 3-day blocks, everything else by the week', () => {
    expect(AD_SHORT_BLOCK_FROM_KOBO).toBe(35_000 * NAIRA);
    expect(adBlockDays(34_500 * NAIRA)).toBe(7);
    expect(adBlockDays(35_000 * NAIRA)).toBe(3);
    // Today's 3-day slots: the premium boards from ₦35,000 a week, Lagos TV and the sponsored phone apps.
    const short = AD_SLOTS.filter((slot) => adBlockDays(slot.weekPriceKobo) === 3).map((slot) => (slot.kind === 'phone-app' ? 'app' : slot.id));
    expect([...new Set(short)].toSorted()).toEqual([
      'app',
      'balogun-market',
      'ikeja-allen',
      'lagos-tv',
      'lekki-toll-gate',
      'mmia-arrivals',
      'ozumba-mbadiwe',
      'surulere-stadium',
      'third-mainland-north',
      'third-mainland-south',
      'vi-towers',
      'yaba-hub',
    ]);
    // Street spots, the stadium, markets and parks stay weekly; so do the two cheapest premium boards.
    for (const id of ['ajah-roundabout', 'ikorodu-garage']) expect(adBlockDays(findAdSlot(id)!.weekPriceKobo), id).toBe(7);
    for (const slot of AD_SLOTS.filter((entry) => entry.kind !== 'premium-billboard' && entry.kind !== 'lagos-tv' && entry.kind !== 'phone-app')) {
      expect(adBlockDays(slot.weekPriceKobo), slot.id).toBe(7);
    }
    // A re-price moves a slot between the two.
    expect(adBlockDays(adWeekPriceKobo(findAdSlot('ajah-roundabout')!, 40_000 * NAIRA))).toBe(3);
    expect(adBlockDays(adWeekPriceKobo(findAdSlot('mmia-arrivals')!, 30_000 * NAIRA))).toBe(7);
  });

  it('prices a block as the daily rate × its days, rounded to ₦500, never under ₦2,000', () => {
    expect(adBlockPriceKobo(100_000 * NAIRA, 3)).toBe(43_000 * NAIRA);
    expect(adBlockPriceKobo(175_000 * NAIRA, 3)).toBe(75_000 * NAIRA);
    expect(adBlockPriceKobo(140_000 * NAIRA, 3)).toBe(60_000 * NAIRA);
    expect(adBlockPriceKobo(105_000 * NAIRA, 3)).toBe(45_000 * NAIRA);
    expect(adBlockPriceKobo(17_500 * NAIRA, 7)).toBe(17_500 * NAIRA);
    expect(adBlockPriceKobo(2_500 * NAIRA, 3)).toBe(AD_MIN_PRICE_KOBO);
    expect(adBlockPriceLabel(43_000 * NAIRA, 3)).toBe('₦43,000 per 3 days');
    expect(adBlockPriceLabel(17_500 * NAIRA, 7)).toBe('₦17,500/week');
    expect(adRateSummary(100_000 * NAIRA)).toBe('₦100,000 per 7 days · sold in 3-day blocks of ₦43,000');
    expect(adRateSummary(42_000 * NAIRA)).toBe('₦42,000 per 7 days · sold in 3-day blocks of ₦18,000');
    expect(adRateSummary(17_500 * NAIRA)).toBe('₦17,500 per 7 days · sold by the week');
    expect(adRateSummary(35_000 * NAIRA, 7)).toBe('₦35,000 per 7 days · sold by the week');
  });

  it('quotes 1–9 three-day blocks (at most 28 days) for expensive slots', () => {
    expect(adMaxBlocks(3)).toBe(9);
    expect(adMaxBlocks(7)).toBe(4);
    expect(adQuote(100_000 * NAIRA, 1)).toEqual({ blocks: 1, blockDays: 3, days: 3, blockPriceKobo: 4_300_000, weekPriceKobo: 10_000_000, weeks: 3 / 7, totalKobo: 4_300_000 });
    expect(adQuote(175_000 * NAIRA, 9)).toMatchObject({ days: 27, totalKobo: 9 * 7_500_000 });
    expect(() => adQuote(175_000 * NAIRA, 10)).toThrow(/1 to 9 blocks of 3 days/);
    expect(adBlocksProblem(0, 3)).toMatch(/1 to 9 blocks of 3 days/);
    // Club songs are always sold by the week, whatever the rate.
    expect(adQuote(140_000 * NAIRA, 2, 7)).toMatchObject({ blockDays: 7, days: 14, totalKobo: 28_000_000 });
    expect(runLengthLabel(3)).toBe('3 days');
    expect(runLengthLabel(7)).toBe('1 week');
    expect(runLengthLabel(21)).toBe('3 weeks');
  });
});

describe('ad rates (admin-editable)', () => {
  it('has one rate per placement kind, Lagos TV, the phone apps, each premium board and the club song', () => {
    expect(AD_RATE_KEYS).toEqual([...AD_PLACEMENT_KINDS, 'lagos-tv', 'phone-app', ...BILLBOARD_SLOT_IDS, 'club-song']);
    expect(AD_RATE_DEFINITIONS['street-billboard']).toMatchObject({ unit: 'week', byDistrict: true, defaultKobo: 12_600 * NAIRA });
    expect(AD_RATE_DEFINITIONS['stadium-led']).toMatchObject({ byDistrict: false, defaultKobo: 17_500 * NAIRA });
    expect(AD_RATE_DEFINITIONS['phone-app'].defaultKobo).toBe(100_000 * NAIRA);
    // Owner's rule: ₦5,000 a day, stored per 7-day block like every other ad.
    expect(AD_RATE_DEFINITIONS['club-song']).toMatchObject({ unit: 'week', defaultKobo: 35_000 * NAIRA });
    for (const key of AD_RATE_KEYS) expect(isValidAdPriceKobo(AD_RATE_DEFINITIONS[key].defaultKobo), key).toBe(true);
    expect(isAdRateKey('totem')).toBe(true);
    expect(isAdRateKey('toString')).toBe(false);
  });

  it('maps every slot to its rate and derives the slot price from it', () => {
    for (const slot of AD_SLOTS) {
      const key = adRateKeyOf(slot);
      expect(adWeekPriceKobo(slot, AD_RATE_DEFINITIONS[key].defaultKobo), slot.id).toBe(slot.weekPriceKobo);
    }
    const shelter = ofKind('bus-shelter')[0]!;
    // Doubling a byDistrict base rate roughly doubles every spot of that kind (still on the ₦500 grid).
    expect(adWeekPriceKobo(shelter, 2 * AD_RATE_DEFINITIONS['bus-shelter'].defaultKobo) % (500 * NAIRA)).toBe(0);
    expect(adWeekPriceKobo(findAdSlot('lagos-tv')!, 50_000 * NAIRA)).toBe(50_000 * NAIRA);
  });

  it('clamps a district-scaled price to the ₦100m cap, so a rate near it stays bookable', () => {
    const rich = AD_SLOTS.filter((slot) => slot.kind === 'street-billboard').toSorted((a, b) => districtPriceFactor(b.districtId!) - districtPriceFactor(a.districtId!))[0]!;
    expect(districtPriceFactor(rich.districtId!)).toBeGreaterThan(1);
    const price = adWeekPriceKobo(rich, AD_MAX_PRICE_KOBO);
    expect(price).toBe(AD_MAX_PRICE_KOBO);
    expect(isValidAdPriceKobo(price)).toBe(true);
    expect(() => adQuote(price, 4)).not.toThrow();
  });

  it('accepts only whole naira from ₦2,000 to ₦100m', () => {
    expect(isValidAdPriceKobo(2_000 * NAIRA)).toBe(true);
    expect(isValidAdPriceKobo(100_000_000 * NAIRA)).toBe(true);
    expect(isValidAdPriceKobo(1_999 * NAIRA)).toBe(false);
    expect(isValidAdPriceKobo(100_000_001 * NAIRA)).toBe(false);
    expect(isValidAdPriceKobo(2_000 * NAIRA + 1)).toBe(false);
    expect(isValidAdPriceKobo(Number.NaN)).toBe(false);
  });
});

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
      expect(slot?.weekPriceKobo).toBeGreaterThan(0);
      expect(slot?.maxConcurrentAds).toBeGreaterThan(0);
      expect(slot?.format).toBe(spot.format);
    }
  });

  it('keeps generated spots clear of each other', () => {
    for (const kind of ['street-billboard', 'bus-shelter'] as const) {
      const spots = AD_PLACEMENTS.filter((spot) => spot.kind === kind);
      for (const a of spots) for (const b of spots) if (a !== b) expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)).toBeGreaterThanOrEqual(18);
    }
  });
});
