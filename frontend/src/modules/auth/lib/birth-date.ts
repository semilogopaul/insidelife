import { BIRTH_DATE_MESSAGES, birthDateProblem, type CalendarDate } from '@insidelife/shared';

/** What the player typed: day and year as text, month as `1`-`12` (empty until chosen). */
export interface BirthDateParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

export const EMPTY_BIRTH_DATE: BirthDateParts = { day: '', month: '', year: '' };

/** `YYYY-MM-DD` once every part is filled in, else ''. */
export function birthDateFromParts({ day, month, year }: BirthDateParts): string {
  const d = day.trim();
  const y = year.trim();
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(y)) return '';
  return `${y}-${month.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** The player's own calendar date (their device's time zone). */
export function localToday(now: Date): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Why these parts can't open an account, in the player's words (null = fine). The server checks again. */
export function birthDateError(parts: BirthDateParts, now: Date): string | null {
  const value = birthDateFromParts(parts);
  if (!value) return 'Enter your date of birth: day, month and year';
  const problem = birthDateProblem(value, localToday(now));
  return problem ? BIRTH_DATE_MESSAGES[problem] : null;
}
