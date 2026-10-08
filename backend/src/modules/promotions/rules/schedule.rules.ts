import type { IsoDate } from '@insidelife/shared';

/**
 * Real calendar days for promotions. Bookings are whole Africa/Lagos days (WAT = UTC+1 all year, no DST), stored as
 * `YYYY-MM-DD` with an exclusive end date, so plain string comparison orders them correctly.
 */

const DAY_MS = 86_400_000;
const LAGOS_OFFSET_MS = 3_600_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const utcMidnight = (date: IsoDate): number => Date.parse(`${date}T00:00:00.000Z`);

export function lagosToday(now: Date = new Date()): IsoDate {
  return new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** A real calendar date (rejects 2026-02-30 and friends). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = utcMidnight(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(utcMidnight(date) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}

export interface DateRange {
  readonly startDate: IsoDate;
  /** Exclusive. */
  readonly endDate: IsoDate;
}

export function rangeOf(startDate: IsoDate, days: number): DateRange {
  return { startDate, endDate: addDays(startDate, days) };
}

export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.startDate < b.endDate && b.startDate < a.endDate;
}

/** Number of bookings on each day of `[from, from + days)`. */
export function dailyOccupancy(bookings: readonly DateRange[], from: IsoDate, days: number): number[] {
  const counts = Array.from({ length: days }, () => 0);
  for (const booking of bookings) {
    const first = Math.max(0, daysBetween(from, booking.startDate));
    const last = Math.min(days, daysBetween(from, booking.endDate));
    for (let day = first; day < last; day++) counts[day] = (counts[day] ?? 0) + 1;
  }
  return counts;
}

/** First day of `range` that already holds `capacity` bookings, or null when every day has room. */
export function firstFullDay(bookings: readonly DateRange[], range: DateRange, capacity: number): IsoDate | null {
  const days = daysBetween(range.startDate, range.endDate);
  const counts = dailyOccupancy(bookings, range.startDate, days);
  const index = counts.findIndex((count) => count >= capacity);
  return index === -1 ? null : addDays(range.startDate, index);
}

export interface BookingWindowLimits {
  readonly minDays: number;
  readonly maxDays: number;
  /** Latest start, counted from today (today = 0). */
  readonly maxLeadDays: number;
}

export type BookingWindowProblem = 'invalid-date' | 'in-past' | 'too-far' | 'invalid-length';

/** Validate a requested run against today's Lagos date. */
export function bookingWindowProblem(startDate: string, days: number, today: IsoDate, limits: BookingWindowLimits): BookingWindowProblem | null {
  if (!isIsoDate(startDate)) return 'invalid-date';
  if (!Number.isInteger(days) || days < limits.minDays || days > limits.maxDays) return 'invalid-length';
  if (startDate < today) return 'in-past';
  if (daysBetween(today, startDate) > limits.maxLeadDays) return 'too-far';
  return null;
}

export interface ClubBooking extends DateRange {
  readonly allClubs: boolean;
  readonly clubs: readonly string[];
}

/** First club (and day) among `targetClubs` whose rotation is already full on some day of `range`. */
export function firstFullClub(
  bookings: readonly ClubBooking[],
  targetClubs: readonly string[],
  range: DateRange,
  capacity: number,
): { readonly club: string; readonly date: IsoDate } | null {
  for (const club of targetClubs) {
    const inClub = bookings.filter((booking) => booking.allClubs || booking.clubs.includes(club));
    const date = firstFullDay(inClub, range, capacity);
    if (date) return { club, date };
  }
  return null;
}
