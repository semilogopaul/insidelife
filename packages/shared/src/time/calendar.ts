/**
 * Game calendar.
 *
 * The world runs on a single shared clock. Game time is expressed as an integer
 * count of game minutes since 00:00 on 1 January of {@link BASE_YEAR}. The
 * calendar is deliberately simple: 12 months of 30 days (360-day years) so that
 * monthly and yearly cycles (salaries, rent, school sessions, birthdays) line up
 * cleanly for players.
 */

export const BASE_YEAR = 2027;

export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const DAYS_PER_WEEK = 7;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;

export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
export const MINUTES_PER_WEEK = MINUTES_PER_DAY * DAYS_PER_WEEK;
export const MINUTES_PER_MONTH = MINUTES_PER_DAY * DAYS_PER_MONTH;
export const MINUTES_PER_YEAR = MINUTES_PER_MONTH * MONTHS_PER_YEAR;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;

/** 1 January of the base year is a Friday (index 4 when Monday = 0). */
const BASE_WEEKDAY_OFFSET = 4;

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;
export type MonthName = (typeof MONTHS)[number];

/** Absolute game time, in whole game minutes since the calendar origin. */
export type GameMinute = number;

export interface GameDateParts {
  readonly year: number;
  /** 1-12 */
  readonly month: number;
  /** 1-30 */
  readonly day: number;
  /** 0-23 */
  readonly hour: number;
  /** 0-59 */
  readonly minute: number;
  /** 0 = Monday … 6 = Sunday */
  readonly weekday: number;
  /** Whole days since the calendar origin. */
  readonly dayIndex: number;
  /** Minutes since the start of the current day (0-1439). */
  readonly minuteOfDay: number;
}

export function toDateParts(t: GameMinute): GameDateParts {
  const whole = Math.floor(t);
  const dayIndex = Math.floor(whole / MINUTES_PER_DAY);
  const minuteOfDay = whole - dayIndex * MINUTES_PER_DAY;
  const yearIndex = Math.floor(dayIndex / DAYS_PER_YEAR);
  const dayOfYear = dayIndex - yearIndex * DAYS_PER_YEAR;
  const monthIndex = Math.floor(dayOfYear / DAYS_PER_MONTH);
  return {
    year: BASE_YEAR + yearIndex,
    month: monthIndex + 1,
    day: dayOfYear - monthIndex * DAYS_PER_MONTH + 1,
    hour: Math.floor(minuteOfDay / MINUTES_PER_HOUR),
    minute: minuteOfDay % MINUTES_PER_HOUR,
    weekday: (((dayIndex + BASE_WEEKDAY_OFFSET) % DAYS_PER_WEEK) + DAYS_PER_WEEK) % DAYS_PER_WEEK,
    dayIndex,
    minuteOfDay,
  };
}

export function fromDateParts(parts: {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour?: number;
  readonly minute?: number;
}): GameMinute {
  const yearIndex = parts.year - BASE_YEAR;
  return (
    yearIndex * MINUTES_PER_YEAR +
    (parts.month - 1) * MINUTES_PER_MONTH +
    (parts.day - 1) * MINUTES_PER_DAY +
    (parts.hour ?? 0) * MINUTES_PER_HOUR +
    (parts.minute ?? 0)
  );
}

export function startOfDay(t: GameMinute): GameMinute {
  return Math.floor(t / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}

export function startOfMonth(t: GameMinute): GameMinute {
  return Math.floor(t / MINUTES_PER_MONTH) * MINUTES_PER_MONTH;
}

export function dayIndexOf(t: GameMinute): number {
  return Math.floor(t / MINUTES_PER_DAY);
}

export function monthIndexOf(t: GameMinute): number {
  return Math.floor(t / MINUTES_PER_MONTH);
}

export function isWeekend(t: GameMinute): boolean {
  return toDateParts(t).weekday >= 5;
}

/** Whole years elapsed between two game times (used for ages). */
export function yearsBetween(from: GameMinute, to: GameMinute): number {
  return Math.floor((to - from) / MINUTES_PER_YEAR);
}

/** Fractional years elapsed between two game times. */
export function exactYearsBetween(from: GameMinute, to: GameMinute): number {
  return (to - from) / MINUTES_PER_YEAR;
}

export const SEASONS = ['harmattan', 'dry', 'rainy', 'august-break', 'detty-december'] as const;
export type Season = (typeof SEASONS)[number];

/**
 * Lagos seasons, simplified: Harmattan haze in Jan-Feb, hot dry March, long
 * rains April-July, the "August break", short rains Sep-Oct, dry November and
 * the festive "Detty December" when the diaspora comes home.
 */
export function seasonOf(t: GameMinute): Season {
  const { month } = toDateParts(t);
  if (month === 12) return 'detty-december';
  if (month <= 2) return 'harmattan';
  if (month === 8) return 'august-break';
  if ((month >= 4 && month <= 7) || month === 9 || month === 10) return 'rainy';
  return 'dry';
}

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/** "07:45" */
export function formatClock(t: GameMinute): string {
  const { hour, minute } = toDateParts(t);
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** "7:45 AM" */
export function formatClock12(t: GameMinute): string {
  const { hour, minute } = toDateParts(t);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${pad2(minute)} ${suffix}`;
}

/** "Fri 14 Mar 2031" */
export function formatDate(t: GameMinute): string {
  const p = toDateParts(t);
  const weekday = WEEKDAYS[p.weekday] ?? WEEKDAYS[0];
  const month = MONTHS[p.month - 1] ?? MONTHS[0];
  return `${weekday.slice(0, 3)} ${p.day} ${month.slice(0, 3)} ${p.year}`;
}

/** Human duration for game minutes: "45m", "3h 20m", "2d 4h", "1y 3mo". */
export function formatGameDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < MINUTES_PER_HOUR) return `${m}m`;
  if (m < MINUTES_PER_DAY) {
    const h = Math.floor(m / MINUTES_PER_HOUR);
    const rest = m % MINUTES_PER_HOUR;
    return rest ? `${h}h ${rest}m` : `${h}h`;
  }
  if (m < MINUTES_PER_MONTH) {
    const d = Math.floor(m / MINUTES_PER_DAY);
    const h = Math.floor((m % MINUTES_PER_DAY) / MINUTES_PER_HOUR);
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  if (m < MINUTES_PER_YEAR) {
    const mo = Math.floor(m / MINUTES_PER_MONTH);
    const d = Math.floor((m % MINUTES_PER_MONTH) / MINUTES_PER_DAY);
    return d ? `${mo}mo ${d}d` : `${mo}mo`;
  }
  const y = Math.floor(m / MINUTES_PER_YEAR);
  const mo = Math.floor((m % MINUTES_PER_YEAR) / MINUTES_PER_MONTH);
  return mo ? `${y}y ${mo}mo` : `${y}y`;
}
