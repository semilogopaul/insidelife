import {
  BILLBOARD_FORMAT_SPECS,
  BILLBOARD_MAX_DAYS,
  BILLBOARD_SLOT_IDS,
  BILLBOARD_SLOTS,
  CLUB_PLAY_PRODUCTS,
  billboardQuote,
  clubPlayVenues,
  findBillboardSlot,
  isClubPlayVenue,
} from '@insidelife/shared';
import { addDays, bookingWindowProblem, dailyOccupancy, firstFullClub, firstFullDay, isIsoDate, lagosToday, rangeOf } from './schedule.rules.js';

const NAIRA = 100;

describe('billboard catalog', () => {
  it('has exactly the slot ids the 3D world places, each once', () => {
    const ids = BILLBOARD_SLOTS.map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.toSorted()).toEqual(BILLBOARD_SLOT_IDS.toSorted());
  });

  it('prices every board between ₦2,500 and ₦25,000 a day, airport and Third Mainland on top', () => {
    for (const slot of BILLBOARD_SLOTS) {
      expect(slot.pricePerDayKobo).toBeGreaterThanOrEqual(2_500 * NAIRA);
      expect(slot.pricePerDayKobo).toBeLessThanOrEqual(25_000 * NAIRA);
      expect(slot.maxConcurrentAds).toBeGreaterThan(0);
      expect([slot.width, slot.height]).toEqual([BILLBOARD_FORMAT_SPECS[slot.format].width, BILLBOARD_FORMAT_SPECS[slot.format].height]);
    }
    const premium = ['mmia-arrivals', 'third-mainland-north', 'third-mainland-south'].map((id) => findBillboardSlot(id)?.pricePerDayKobo ?? 0);
    const others = BILLBOARD_SLOTS.filter((slot) => slot.tier !== 'premium').map((slot) => slot.pricePerDayKobo);
    expect(Math.min(...premium)).toBeGreaterThan(Math.max(...others));
    expect(findBillboardSlot('mmia-arrivals')?.pricePerDayKobo).toBe(25_000 * NAIRA);
  });

  it('uses exact aspect ratios for the upload sizes', () => {
    expect(BILLBOARD_FORMAT_SPECS.landscape.width / BILLBOARD_FORMAT_SPECS.landscape.height).toBe(3);
    expect(BILLBOARD_FORMAT_SPECS.portrait.width / BILLBOARD_FORMAT_SPECS.portrait.height).toBeCloseTo(2 / 3);
    expect(BILLBOARD_FORMAT_SPECS.square.width).toBe(BILLBOARD_FORMAT_SPECS.square.height);
  });

  it('prices club plays between ₦1,000 and ₦20,000', () => {
    for (const product of CLUB_PLAY_PRODUCTS) {
      expect(product.priceKobo).toBeGreaterThanOrEqual(1_000 * NAIRA);
      expect(product.priceKobo).toBeLessThanOrEqual(20_000 * NAIRA);
    }
    expect(clubPlayVenues().map((venue) => venue.id)).toContain('the-vault');
    expect(isClubPlayVenue('the-vault')).toBe(true);
    expect(isClubPlayVenue('unilag')).toBe(false);
  });
});

describe('billboardQuote', () => {
  const ikorodu = { pricePerDayKobo: 2_500 * NAIRA };
  const airport = { pricePerDayKobo: 25_000 * NAIRA };

  it('charges the day rate below a week', () => {
    expect(billboardQuote(ikorodu, 1)).toEqual({ days: 1, unitPriceKobo: 250_000, subtotalKobo: 250_000, discountKobo: 0, totalKobo: 250_000 });
    expect(billboardQuote(airport, 6).totalKobo).toBe(6 * 2_500_000);
  });

  it('discounts every complete week by 15%', () => {
    expect(billboardQuote(airport, 7)).toMatchObject({ subtotalKobo: 17_500_000, discountKobo: 2_625_000, totalKobo: 14_875_000 });
    // 10 days = one bundled week + 3 days at the day rate.
    expect(billboardQuote(airport, 10).totalKobo).toBe(14_875_000 + 3 * 2_500_000);
    expect(billboardQuote(airport, 14).discountKobo).toBe(2 * 2_625_000);
  });

  it('always charges whole naira and stays under the ₦1m single-checkout ceiling', () => {
    for (const slot of BILLBOARD_SLOTS) {
      for (let days = 1; days <= BILLBOARD_MAX_DAYS; days++) {
        const quote = billboardQuote(slot, days);
        expect(quote.totalKobo % NAIRA).toBe(0);
        expect(quote.totalKobo).toBeLessThan(100_000_000);
        expect(quote.totalKobo).toBeLessThanOrEqual(quote.subtotalKobo);
      }
    }
  });

  it('refuses invalid lengths', () => {
    expect(() => billboardQuote(airport, 0)).toThrow(RangeError);
    expect(() => billboardQuote(airport, 31)).toThrow(RangeError);
    expect(() => billboardQuote(airport, 1.5)).toThrow(RangeError);
  });
});

describe('calendar days (Africa/Lagos)', () => {
  it('rolls over at midnight WAT, not UTC', () => {
    expect(lagosToday(new Date('2026-10-08T22:59:59Z'))).toBe('2026-10-08');
    expect(lagosToday(new Date('2026-10-08T23:00:00Z'))).toBe('2026-10-09');
  });

  it('validates real dates and does date arithmetic', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(rangeOf('2026-10-08', 7)).toEqual({ startDate: '2026-10-08', endDate: '2026-10-15' });
  });

  it('checks the booking window', () => {
    const limits = { minDays: 1, maxDays: 30, maxLeadDays: 60 };
    expect(bookingWindowProblem('2026-10-08', 3, '2026-10-08', limits)).toBeNull();
    expect(bookingWindowProblem('2026-10-07', 3, '2026-10-08', limits)).toBe('in-past');
    expect(bookingWindowProblem('2026-12-08', 3, '2026-10-08', limits)).toBe('too-far');
    expect(bookingWindowProblem('2026-10-09', 0, '2026-10-08', limits)).toBe('invalid-length');
    expect(bookingWindowProblem('2026-10-32', 1, '2026-10-08', limits)).toBe('invalid-date');
  });
});

const booking = (startDate: string, days: number) => rangeOf(startDate, days);

describe('capacity', () => {
  it('counts bookings per day with exclusive end dates', () => {
    const bookings = [booking('2026-10-08', 3), booking('2026-10-09', 1), booking('2026-10-01', 7)];
    // 06, 07: only the 1st–7th booking; 08: it has ended (exclusive), the 8th–10th starts; 09: two overlap.
    expect(dailyOccupancy(bookings, '2026-10-06', 6)).toEqual([1, 1, 1, 2, 1, 0]);
  });

  it('finds the first day at capacity inside the requested range', () => {
    const capacity = 2;
    const bookings = [booking('2026-10-08', 5), booking('2026-10-10', 2)];
    expect(firstFullDay(bookings, rangeOf('2026-10-08', 2), capacity)).toBeNull();
    expect(firstFullDay(bookings, rangeOf('2026-10-08', 7), capacity)).toBe('2026-10-10');
    expect(firstFullDay(bookings, rangeOf('2026-10-12', 3), capacity)).toBeNull();
  });

  it('counts all-club orders against every club', () => {
    const range = rangeOf('2026-10-08', 3);
    const bookings = [
      { ...rangeOf('2026-10-08', 7), allClubs: true, clubs: [] },
      { ...rangeOf('2026-10-09', 1), allClubs: false, clubs: ['the-vault'] },
    ];
    expect(firstFullClub(bookings, ['vi-lounge'], range, 2)).toBeNull();
    expect(firstFullClub(bookings, ['vi-lounge', 'the-vault'], range, 2)).toEqual({ club: 'the-vault', date: '2026-10-09' });
  });
});
