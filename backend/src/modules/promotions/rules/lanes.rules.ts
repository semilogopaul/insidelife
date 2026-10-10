import type { IsoDate } from '@insidelife/shared';
import { addDays, dailyOccupancy, daysBetween, overlaps, rangeOf, type DateRange } from './schedule.rules.js';

/**
 * Club songs hold a schedule lane for their whole run (shared `club-schedule.ts`): every lane gets the same plays a day,
 * so capacity is "a lane free on every day of the run". Bookings from before lanes existed (`lane: null`) still take a
 * place on their days.
 */
export interface LaneBooking extends DateRange {
  readonly lane: number | null;
}

/** The lowest lane free on every day of `range`, or null. Unlaned bookings need a free lane of their own each day. */
export function freeLaneFor(bookings: readonly LaneBooking[], range: DateRange, lanes: number): number | null {
  const overlapping = bookings.filter((booking) => overlaps(booking, range));
  const taken = new Set(overlapping.flatMap((booking) => (booking.lane === null ? [] : [booking.lane])));
  const free = Array.from({ length: lanes }, (_, lane) => lane).filter((lane) => !taken.has(lane));
  if (free.length === 0) return null;
  const unlaned = overlapping.filter((booking) => booking.lane === null);
  if (unlaned.length > 0) {
    const busiest = Math.max(0, ...dailyOccupancy(unlaned, range.startDate, daysBetween(range.startDate, range.endDate)));
    if (free.length <= busiest) return null;
    // Leave the lowest free lanes to the unlaned bookings, which play wherever there's room.
    return free[busiest] ?? null;
  }
  return free[0] ?? null;
}

/**
 * Where a new run of `days` goes: the first day from `today` (at most `maxLeadDays` ahead) on which some lane is free for
 * the whole run, and that lane. Runs follow each other without gaps: the start is today, or the day a lane frees up.
 */
export function nextFreeLaneStart(
  bookings: readonly LaneBooking[],
  today: IsoDate,
  days: number,
  lanes: number,
  maxLeadDays: number,
): { readonly startDate: IsoDate; readonly lane: number } | null {
  for (let offset = 0; offset <= maxLeadDays; offset++) {
    const range = rangeOf(addDays(today, offset), days);
    const lane = freeLaneFor(bookings, range, lanes);
    if (lane !== null) return { startDate: range.startDate, lane };
  }
  return null;
}
