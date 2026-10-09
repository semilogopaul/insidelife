import { describe, expect, it } from 'vitest';
import {
  ageOn,
  birthDateProblem,
  isEmailCode,
  MIN_PLAYER_AGE,
  parseCalendarDate,
  utcCalendarDate,
} from './account.js';

const today = { year: 2026, month: 10, day: 9 };

describe('date of birth', () => {
  it('parses only real calendar dates', () => {
    expect(parseCalendarDate('2010-05-31')).toEqual({ year: 2010, month: 5, day: 31 });
    expect(parseCalendarDate('2012-02-29')).not.toBeNull();
    expect(parseCalendarDate('2011-02-29')).toBeNull();
    expect(parseCalendarDate('2010-13-01')).toBeNull();
    expect(parseCalendarDate('2010-5-31')).toBeNull();
    expect(parseCalendarDate('31/05/2010')).toBeNull();
  });

  it('counts whole years, turning over on the birthday', () => {
    expect(ageOn({ year: 2013, month: 10, day: 9 }, today)).toBe(13);
    expect(ageOn({ year: 2013, month: 10, day: 10 }, today)).toBe(12);
    expect(ageOn({ year: 2013, month: 11, day: 1 }, today)).toBe(12);
    // A leap-day baby turns over on 1 March in other years.
    expect(ageOn({ year: 2012, month: 2, day: 29 }, { year: 2025, month: 2, day: 28 })).toBe(12);
    expect(ageOn({ year: 2012, month: 2, day: 29 }, { year: 2025, month: 3, day: 1 })).toBe(13);
  });

  it(`lets players in from their ${MIN_PLAYER_AGE}th birthday and refuses younger ones`, () => {
    expect(birthDateProblem('2013-10-09', today)).toBeNull();
    expect(birthDateProblem('2013-10-10', today)).toBe('too-young');
    expect(birthDateProblem('2020-01-01', today)).toBe('too-young');
    expect(birthDateProblem('1990-06-15', today)).toBeNull();
  });

  it('catches impossible dates', () => {
    expect(birthDateProblem('2026-10-10', today)).toBe('future');
    expect(birthDateProblem('1899-01-01', today)).toBe('too-old');
    expect(birthDateProblem('not-a-date', today)).toBe('invalid');
    expect(birthDateProblem('', today)).toBe('invalid');
  });

  it('reads the UTC date of an instant', () => {
    expect(utcCalendarDate(Date.UTC(2026, 9, 9, 23, 30))).toEqual(today);
  });
});

describe('verification code format', () => {
  it('accepts exactly six digits', () => {
    expect(isEmailCode('012345')).toBe(true);
    expect(isEmailCode('12345')).toBe(false);
    expect(isEmailCode('1234567')).toBe(false);
    expect(isEmailCode('12a456')).toBe(false);
  });
});
