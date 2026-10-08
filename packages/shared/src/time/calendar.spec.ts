import { describe, expect, it } from 'vitest';
import { BASE_YEAR, MINUTES_PER_DAY, MINUTES_PER_YEAR, formatClock12, formatGameDuration, fromDateParts, seasonOf, toDateParts, yearsBetween } from './calendar.js';

describe('calendar', () => {
  it('round-trips date parts', () => {
    const t = fromDateParts({ year: 2031, month: 3, day: 14, hour: 7, minute: 45 });
    expect(toDateParts(t)).toMatchObject({ year: 2031, month: 3, day: 14, hour: 7, minute: 45 });
  });

  it('starts on Friday 1 January of the base year', () => {
    expect(toDateParts(0)).toMatchObject({ year: BASE_YEAR, month: 1, day: 1, weekday: 4 });
    expect(toDateParts(MINUTES_PER_DAY).weekday).toBe(5);
  });

  it('handles times before the origin (characters born before 2027)', () => {
    const parts = toDateParts(-MINUTES_PER_DAY);
    expect(parts).toMatchObject({ year: BASE_YEAR - 1, month: 12, day: 30, weekday: 3 });
  });

  it('computes ages in whole years', () => {
    expect(yearsBetween(0, MINUTES_PER_YEAR * 17 + 5)).toBe(17);
    expect(yearsBetween(0, MINUTES_PER_YEAR * 17 - 1)).toBe(16);
  });

  it('maps Lagos seasons', () => {
    expect(seasonOf(fromDateParts({ year: 2027, month: 1, day: 10 }))).toBe('harmattan');
    expect(seasonOf(fromDateParts({ year: 2027, month: 6, day: 10 }))).toBe('rainy');
    expect(seasonOf(fromDateParts({ year: 2027, month: 8, day: 10 }))).toBe('august-break');
    expect(seasonOf(fromDateParts({ year: 2027, month: 12, day: 10 }))).toBe('detty-december');
  });

  it('formats clocks and durations for players', () => {
    expect(formatClock12(fromDateParts({ year: 2027, month: 1, day: 1, hour: 0, minute: 5 }))).toBe('12:05 AM');
    expect(formatClock12(fromDateParts({ year: 2027, month: 1, day: 1, hour: 13, minute: 30 }))).toBe('1:30 PM');
    expect(formatGameDuration(45)).toBe('45m');
    expect(formatGameDuration(200)).toBe('3h 20m');
    expect(formatGameDuration(MINUTES_PER_DAY * 2 + 240)).toBe('2d 4h');
  });
});
