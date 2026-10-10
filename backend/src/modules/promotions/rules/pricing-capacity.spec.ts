import {
  AD_MAX_RUN_DAYS,
  AD_MAX_WEEKS,
  AD_MIN_PRICE_KOBO,
  AD_SLOTS,
  adBlockDays,
  adBlockPriceKobo,
  adMaxBlocks,
  BILLBOARD_FORMAT_SPECS,
  BILLBOARD_SLOT_IDS,
  BILLBOARD_SLOTS,
  CLUB_PLAY_PRODUCTS,
  adQuote,
  clubPlayVenues,
  findBillboardSlot,
  isClubPlayVenue,
} from '@insidelife/shared';
import {
  addDays,
  dailyOccupancy,
  daysBetween,
  firstFullClub,
  firstFullDay,
  isIsoDate,
  lagosToday,
  nextFreeClubStart,
  nextFreeStart,
  rangeOf,
} from './schedule.rules.js';

const NAIRA = 100;

describe('billboard catalog', () => {
  it('has exactly the slot ids the 3D world places, each once', () => {
    const ids = BILLBOARD_SLOTS.map((slot) => slot.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.toSorted()).toEqual(BILLBOARD_SLOT_IDS.toSorted());
  });

  it('prices premium boards per week, airport and Third Mainland on top', () => {
    for (const slot of BILLBOARD_SLOTS) {
      expect(slot.weekPriceKobo).toBeGreaterThanOrEqual(17_500 * NAIRA);
      expect(slot.maxConcurrentAds).toBeGreaterThan(0);
      expect([slot.width, slot.height]).toEqual([BILLBOARD_FORMAT_SPECS[slot.format].width, BILLBOARD_FORMAT_SPECS[slot.format].height]);
    }
    const premium = ['mmia-arrivals', 'third-mainland-north', 'third-mainland-south'].map((id) => findBillboardSlot(id)?.weekPriceKobo ?? 0);
    const others = BILLBOARD_SLOTS.filter((slot) => slot.tier !== 'premium').map((slot) => slot.weekPriceKobo);
    expect(Math.min(...premium)).toBeGreaterThan(Math.max(...others));
    expect(findBillboardSlot('mmia-arrivals')?.weekPriceKobo).toBe(175_000 * NAIRA);
  });

  it('uses exact aspect ratios for the upload sizes', () => {
    expect(BILLBOARD_FORMAT_SPECS.landscape.width / BILLBOARD_FORMAT_SPECS.landscape.height).toBe(3);
    expect(BILLBOARD_FORMAT_SPECS.portrait.width / BILLBOARD_FORMAT_SPECS.portrait.height).toBeCloseTo(2 / 3);
    expect(BILLBOARD_FORMAT_SPECS.square.width).toBe(BILLBOARD_FORMAT_SPECS.square.height);
  });

  it('sells club plays as one product: ₦5,000 a day, by the week (₦35,000), in every club and lounge', () => {
    expect(CLUB_PLAY_PRODUCTS).toEqual([expect.objectContaining({ id: 'all-clubs-7d', days: 7, priceKobo: 35_000 * NAIRA })]);
    expect(clubPlayVenues().map((venue) => venue.id)).toEqual(expect.arrayContaining(['the-vault', 'vi-lounge', 'bourdillon-lounge']));
    expect(isClubPlayVenue('the-vault')).toBe(true);
    expect(isClubPlayVenue('unilag')).toBe(false);
  });
});

describe('adQuote', () => {
  it('charges whole blocks at the block price, at least ₦2,000, never more than 28 days (default rates stay under ₦2.5m)', () => {
    for (const slot of AD_SLOTS) {
      const blockDays = adBlockDays(slot.weekPriceKobo);
      for (let blocks = 1; blocks <= adMaxBlocks(blockDays); blocks++) {
        const quote = adQuote(slot.weekPriceKobo, blocks);
        expect(quote).toMatchObject({ blocks, blockDays, days: blockDays * blocks, weekPriceKobo: slot.weekPriceKobo });
        expect(quote.totalKobo).toBe(adBlockPriceKobo(slot.weekPriceKobo, blockDays) * blocks);
        expect(quote.days).toBeLessThanOrEqual(AD_MAX_RUN_DAYS);
        expect(quote.totalKobo % NAIRA).toBe(0);
        expect(quote.totalKobo).toBeGreaterThanOrEqual(AD_MIN_PRICE_KOBO);
        expect(quote.totalKobo).toBeLessThanOrEqual(250_000_000);
      }
    }
  });

  it('sells the expensive slots in 3-day blocks (₦100,000 a week or more), the rest by the week', () => {
    expect(adQuote(findBillboardSlot('mmia-arrivals')!.weekPriceKobo, 1)).toMatchObject({ blockDays: 3, days: 3, totalKobo: 75_000 * NAIRA });
    expect(adQuote(findBillboardSlot('ozumba-mbadiwe')!.weekPriceKobo, 1)).toMatchObject({ blockDays: 7, days: 7, totalKobo: 84_000 * NAIRA });
  });

  it('refuses lengths other than 1–4 weeks, or 1–9 three-day blocks', () => {
    for (const weeks of [0, 5, 2.5, -1]) expect(() => adQuote(17_500 * NAIRA, weeks)).toThrow(RangeError);
    for (const blocks of [0, 10, 1.5]) expect(() => adQuote(175_000 * NAIRA, blocks)).toThrow(RangeError);
    expect(AD_MAX_WEEKS).toBe(4);
  });
});

describe('next free start with mixed block lengths', () => {
  it('works by day, whatever block length each booking was sold in', () => {
    // A board that was sold by the week (two 7-day bookings) is now sold in 3-day blocks (its rate went up).
    const bookings = [booking('2026-10-05', 7), booking('2026-10-12', 7), booking('2026-10-19', 3)];
    // 1-ad board: the 3-day run starts the day the last booking ends; a 9-day run too.
    expect(nextFreeStart(bookings, TODAY, 3, 1, LEAD)).toBe('2026-10-22');
    expect(nextFreeStart(bookings, TODAY, 9, 1, LEAD)).toBe('2026-10-22');
    // A gap of exactly 3 days between bookings takes a 3-day block but not a week.
    const gap = [booking('2026-10-05', 7), booking('2026-10-15', 7)];
    expect(nextFreeStart(gap, TODAY, 3, 1, LEAD)).toBe('2026-10-12');
    expect(nextFreeStart(gap, TODAY, 7, 1, LEAD)).toBe('2026-10-22');
    // On a 2-ad board a 3-day booking overlapping a week leaves room only where at most one is running.
    const shared = [booking(TODAY, 7), booking('2026-10-10', 3)];
    expect(nextFreeStart(shared, TODAY, 3, 2, LEAD)).toBe('2026-10-13');
    for (const days of [3, 6, 9, 27]) {
      const run = rangeOf(nextFreeStart(shared, TODAY, days, 2, LEAD) ?? TODAY, days);
      expect(firstFullDay(shared, run, 2), `${days} days`).toBeNull();
    }
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
});

const booking = (startDate: string, days: number) => rangeOf(startDate, days);
const allClubs = (startDate: string, days: number) => ({ ...rangeOf(startDate, days), allClubs: true, clubs: [] });
const oneClub = (startDate: string, days: number) => ({ ...rangeOf(startDate, days), allClubs: false, clubs: ['the-vault'] });
const TODAY = '2026-10-09';
const LEAD = 60;

describe('next free start (7-day runs, no gaps)', () => {
  it('starts today when the slot has room for the whole run', () => {
    expect(nextFreeStart([], TODAY, 7, 1, LEAD)).toBe(TODAY);
    // One of two places taken today: there is still room.
    expect(nextFreeStart([booking('2026-10-05', 14)], TODAY, 7, 2, LEAD)).toBe(TODAY);
  });

  it('starts the day the earliest blocking booking ends, so runs are contiguous', () => {
    const running = booking('2026-10-05', 14); // ends (exclusive) on the 19th
    expect(nextFreeStart([running], TODAY, 7, 1, LEAD)).toBe('2026-10-19');
    // A second run queued after it starts where it ends: no gap between them.
    const queued = booking('2026-10-19', 7);
    expect(nextFreeStart([running, queued], TODAY, 14, 1, LEAD)).toBe('2026-10-26');
    // Several bookings sharing a 3-ad board: the earliest one to end frees the place.
    const board = [booking('2026-10-01', 14), booking('2026-10-03', 21), booking('2026-10-08', 7)];
    expect(nextFreeStart(board, TODAY, 7, 3, LEAD)).toBe('2026-10-15');
  });

  it('never squeezes a run into a gap that is too short, and respects maxConcurrentAds on every day', () => {
    // Free 9th–11th, then a booking from the 12th: a 7-day run can't fit before it.
    const later = booking('2026-10-12', 7);
    const start = nextFreeStart([later], TODAY, 7, 1, LEAD);
    expect(start).toBe('2026-10-19');
    for (const capacity of [1, 2, 3]) {
      const bookings = Array.from({ length: capacity }, (_, index) => booking(addDays(TODAY, index * 3), 10));
      const run = rangeOf(nextFreeStart(bookings, TODAY, 7, capacity, LEAD) ?? TODAY, 7);
      expect(firstFullDay(bookings, run, capacity), `capacity ${capacity}`).toBeNull();
      expect(daysBetween(run.startDate, run.endDate)).toBe(7);
    }
  });

  it('gives up beyond the lead time', () => {
    expect(nextFreeStart([booking(TODAY, 90)], TODAY, 7, 1, LEAD)).toBeNull();
    expect(nextFreeStart([booking(TODAY, 60)], TODAY, 7, 1, LEAD)).toBe(addDays(TODAY, 60));
  });

  it('finds the next day every club has room for a song', () => {
    expect(nextFreeClubStart([], ['the-vault', 'vi-lounge'], TODAY, 7, 2, 30)).toBe(TODAY);
    // The Vault is full until the 12th (an every-club order plus its own): every club's run waits for it.
    const orders = [allClubs('2026-10-06', 10), oneClub('2026-10-08', 4)];
    expect(nextFreeClubStart(orders, ['vi-lounge'], TODAY, 7, 2, 30)).toBe(TODAY);
    expect(nextFreeClubStart(orders, ['vi-lounge', 'the-vault'], TODAY, 7, 2, 30)).toBe('2026-10-12');
  });
});

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
