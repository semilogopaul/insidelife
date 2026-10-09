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

/**
 * First start offset (0 = today, at most `maxLeadDays`) from which `days` consecutive days are all free, given which
 * days from today are full. Skips past a full day at once, so a run starts on the first day it fits: today, or the day
 * the earliest blocking booking ends.
 */
function firstFittingOffset(full: readonly boolean[], days: number, maxLeadDays: number): number | null {
  for (let start = 0; start <= maxLeadDays; start++) {
    let blockedAt = -1;
    for (let day = start; day < start + days; day++) {
      if (full[day]) {
        blockedAt = day;
        break;
      }
    }
    if (blockedAt === -1) return start;
    start = blockedAt;
  }
  return null;
}

/**
 * Where a new run of `days` goes on a slot holding at most `capacity` bookings a day: today if every day of the run
 * has room, otherwise the first later day from which the whole run fits — the day the earliest blocking booking
 * ends — so runs follow each other without gaps. Null when it can't start within `maxLeadDays`.
 */
export function nextFreeStart(bookings: readonly DateRange[], today: IsoDate, days: number, capacity: number, maxLeadDays: number): IsoDate | null {
  const counts = dailyOccupancy(bookings, today, maxLeadDays + days);
  const offset = firstFittingOffset(
    counts.map((count) => count >= capacity),
    days,
    maxLeadDays,
  );
  return offset === null ? null : addDays(today, offset);
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

/** `nextFreeStart` across several clubs at once: a day is blocked when any target club's rotation is full. */
export function nextFreeClubStart(
  bookings: readonly ClubBooking[],
  targetClubs: readonly string[],
  today: IsoDate,
  days: number,
  capacity: number,
  maxLeadDays: number,
): IsoDate | null {
  const full = Array.from({ length: maxLeadDays + days }, () => false);
  for (const club of targetClubs) {
    const counts = dailyOccupancy(
      bookings.filter((booking) => booking.allClubs || booking.clubs.includes(club)),
      today,
      full.length,
    );
    counts.forEach((count, day) => {
      if (count >= capacity) full[day] = true;
    });
  }
  const offset = firstFittingOffset(full, days, maxLeadDays);
  return offset === null ? null : addDays(today, offset);
}
