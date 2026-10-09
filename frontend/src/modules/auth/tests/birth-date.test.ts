import { describe, expect, it } from 'vitest';
import { codeDigits } from '@/common/components/CodeField';
import { birthDateError, birthDateFromParts } from '../lib/birth-date';

const today = new Date(2026, 9, 9, 12);

describe('date of birth on the sign-up form', () => {
  it('builds an ISO date only once day, month and year are filled in', () => {
    expect(birthDateFromParts({ day: '7', month: '3', year: '2001' })).toBe('2001-03-07');
    expect(birthDateFromParts({ day: '', month: '3', year: '2001' })).toBe('');
    expect(birthDateFromParts({ day: '7', month: '', year: '2001' })).toBe('');
    expect(birthDateFromParts({ day: '7', month: '3', year: '01' })).toBe('');
  });

  it('explains what is wrong in plain words', () => {
    expect(birthDateError({ day: '', month: '', year: '' }, today)).toMatch(/day, month and year/);
    expect(birthDateError({ day: '10', month: '10', year: '2013' }, today)).toMatch(/13 and over/);
    expect(birthDateError({ day: '9', month: '10', year: '2013' }, today)).toBeNull();
    expect(birthDateError({ day: '31', month: '2', year: '2000' }, today)).toMatch(/real date/);
    expect(birthDateError({ day: '1', month: '1', year: '2030' }, today)).toMatch(/future/);
  });
});

describe('code field input', () => {
  it('keeps only the digits of a pasted code, up to six', () => {
    expect(codeDigits('123 456')).toBe('123456');
    expect(codeDigits('Your code: 12-34-56-78')).toBe('123456');
    expect(codeDigits('12a')).toBe('12');
  });
});
