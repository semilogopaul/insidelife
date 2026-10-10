import { CLUB_ROTATION_CAPACITY } from '@insidelife/shared';
import { freeLaneFor, nextFreeLaneStart, type LaneBooking } from './lanes.rules.js';
import { addDays, overlaps, rangeOf } from './schedule.rules.js';

const TODAY = '2026-10-09';
const song = (startDate: string, weeks: number, lane: number | null): LaneBooking => ({ ...rangeOf(startDate, weeks * 7), lane });

describe('club song lanes (capacity that keeps the plays guarantee)', () => {
  it('gives the lowest free lane for the whole run, today when there is one', () => {
    expect(nextFreeLaneStart([], TODAY, 7, 12, 30)).toEqual({ startDate: TODAY, lane: 0 });
    expect(nextFreeLaneStart([song(TODAY, 1, 0), song(TODAY, 2, 1)], TODAY, 7, 12, 30)).toEqual({ startDate: TODAY, lane: 2 });
  });

  it('caps songs at the lane count: when full, the next booking starts the day a lane frees up (no gaps)', () => {
    const lanes = 3;
    const full = [song('2026-10-05', 2, 0), song('2026-10-07', 1, 1), song('2026-10-08', 4, 2)];
    // Lane 1 frees first (ends the 14th), then lane 0 (19th).
    expect(nextFreeLaneStart(full, TODAY, 7, lanes, 30)).toEqual({ startDate: '2026-10-14', lane: 1 });
    // A 2-week run fits from the 14th on lane 1 too (nothing after it there).
    expect(nextFreeLaneStart(full, TODAY, 14, lanes, 30)).toEqual({ startDate: '2026-10-14', lane: 1 });
  });

  it('never puts two songs on one lane on the same day, whatever the order of bookings', () => {
    const bookings: LaneBooking[] = [];
    for (let i = 0; i < 40; i++) {
      const weeks = (i % 4) + 1;
      const next = nextFreeLaneStart(bookings, addDays(TODAY, i % 5), weeks * 7, CLUB_ROTATION_CAPACITY, 60);
      if (!next) continue;
      bookings.push(song(next.startDate, weeks, next.lane));
    }
    for (const a of bookings) for (const b of bookings) if (a !== b && a.lane === b.lane) expect(overlaps(a, b)).toBe(false);
    expect(bookings.length).toBeGreaterThan(CLUB_ROTATION_CAPACITY);
  });

  it('keeps room for older bookings without a lane', () => {
    const unlaned = [song(TODAY, 1, null), song(TODAY, 1, null)];
    // 3 lanes, two taken by unlaned songs on those days: only one lane left.
    expect(freeLaneFor(unlaned, rangeOf(TODAY, 7), 3)).toBe(2);
    expect(freeLaneFor([...unlaned, song(TODAY, 1, 2)], rangeOf(TODAY, 7), 3)).toBeNull();
    expect(freeLaneFor(unlaned, rangeOf('2026-10-16', 7), 3)).toBe(0);
  });

  it('gives up beyond the lead time', () => {
    const busy = Array.from({ length: 2 }, (_, lane) => song(TODAY, 8, lane));
    expect(nextFreeLaneStart(busy, TODAY, 7, 2, 30)).toBeNull();
  });
});
