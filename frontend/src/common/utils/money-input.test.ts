import { describe, expect, it } from 'vitest';
import { groupDigits, parseNairaInput, pressKey } from './money-input';

describe('parseNairaInput', () => {
  it('reads whole naira from whatever people type', () => {
    expect(parseNairaInput('12500')).toBe(12_500);
    expect(parseNairaInput('₦12,500')).toBe(12_500);
    expect(parseNairaInput(' 1 250 000 ')).toBe(1_250_000);
    expect(parseNairaInput('12500.75')).toBe(12_500);
    expect(parseNairaInput('007')).toBe(7);
  });

  it('treats empty or digit-free text as no amount', () => {
    expect(parseNairaInput('')).toBeNull();
    expect(parseNairaInput('₦')).toBeNull();
    expect(parseNairaInput('abc')).toBeNull();
  });

  it('caps the number of digits so nothing overflows', () => {
    expect(parseNairaInput('9'.repeat(30))).toBe(999_999_999_999);
  });
});

describe('groupDigits', () => {
  it('groups thousands for display', () => {
    expect(groupDigits(1_250_000)).toBe('1,250,000');
    expect(groupDigits(0)).toBe('0');
    expect(groupDigits(null)).toBe('');
  });
});

describe('pressKey', () => {
  it('appends digits, double zero and deletes', () => {
    let amount = pressKey(null, '1');
    amount = pressKey(amount, '2');
    amount = pressKey(amount, '00');
    expect(amount).toBe(1_200);
    expect(pressKey(amount, 'back')).toBe(120);
    expect(pressKey(5, 'back')).toBeNull();
    expect(pressKey(1_200, 'clear')).toBeNull();
  });

  it('ignores leading zeros', () => {
    expect(pressKey(null, '0')).toBeNull();
    expect(pressKey(null, '00')).toBeNull();
  });
});
