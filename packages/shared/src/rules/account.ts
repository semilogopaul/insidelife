/**
 * Real-world account rules, shared so sign-up can explain a problem before the round trip. The server applies the
 * same rules and is the authority.
 */

/** Players must be at least this old (Terms and Privacy policy). */
export const MIN_PLAYER_AGE = 13;
/** Anyone claiming to be older than this has mistyped the year. */
export const MAX_PLAYER_AGE = 120;

/** Digits in an email verification code. */
export const EMAIL_CODE_LENGTH = 6;

/** Typed by the player to confirm deleting their account (case and surrounding spaces don't matter). */
export const ACCOUNT_DELETION_PHRASE = 'DELETE MY ACCOUNT';

/** Days support can still restore a deleted account before it is anonymised (the server's default; it may differ). */
export const ACCOUNT_RESTORE_WINDOW_DAYS = 30;

/** Did the player type the confirmation phrase? */
export function isAccountDeletionPhrase(typed: string): boolean {
  return typed.trim().replace(/\s+/g, ' ').toUpperCase() === ACCOUNT_DELETION_PHRASE;
}

/** A date with no time or time zone. `month` is 1-12. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `YYYY-MM-DD` to a calendar date, or null when it is not a real date (e.g. 2011-02-30). */
export function parseCalendarDate(value: string): CalendarDate | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/** Calendar date to `YYYY-MM-DD`. */
export function formatCalendarDate({ year, month, day }: CalendarDate): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The UTC calendar date of a wall-clock instant (shift `ms` first for another zone). */
export function utcCalendarDate(ms: number): CalendarDate {
  const date = new Date(ms);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** Whole years lived on `today`. A 29 February birthday counts from 1 March in other years. */
export function ageOn(birth: CalendarDate, today: CalendarDate): number {
  const hadBirthday = today.month > birth.month || (today.month === birth.month && today.day >= birth.day);
  return today.year - birth.year - (hadBirthday ? 0 : 1);
}

export type BirthDateProblem = 'invalid' | 'future' | 'too-young' | 'too-old';

/** Why a date of birth can't open an account (null = fine). `today` is the player's (or the most generous) date. */
export function birthDateProblem(value: string, today: CalendarDate): BirthDateProblem | null {
  const birth = parseCalendarDate(value);
  if (!birth) return 'invalid';
  if (formatCalendarDate(birth) > formatCalendarDate(today)) return 'future';
  const age = ageOn(birth, today);
  if (age < MIN_PLAYER_AGE) return 'too-young';
  if (age > MAX_PLAYER_AGE) return 'too-old';
  return null;
}

/** Player-facing explanation for each problem. */
export const BIRTH_DATE_MESSAGES: Readonly<Record<BirthDateProblem, string>> = {
  invalid: 'Enter your real date of birth',
  future: 'That date is in the future. Check the year',
  'too-young': `Inside Life is for players aged ${MIN_PLAYER_AGE} and over. Come back on your ${MIN_PLAYER_AGE}th birthday — Lagos will still be here`,
  'too-old': 'Check the year of your date of birth',
};

/** True when `value` looks like a verification code (exactly the right number of digits). */
export function isEmailCode(value: string): boolean {
  return value.length === EMAIL_CODE_LENGTH && /^\d+$/.test(value);
}
