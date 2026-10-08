import { MINUTES_PER_DAY, dailyTransferLimit, transferFee, transferTierFor } from '@insidelife/shared';
import { characterAgeDays, checkTransfer, sanitizeNote } from './transfer-rules.js';
import { startOfUtcDay } from './utc-day.js';

const RICH = 100_000_000;

describe('transfer fees (Nigerian interbank schedule)', () => {
  it.each([
    [100, 0, 0],
    [4_999, 0, 0],
    [5_000, 10, 0],
    [9_999, 10, 0],
    [10_000, 10, 50],
    [50_000, 10, 50],
    [50_001, 50, 50],
    [5_000_000, 50, 50],
  ])('₦%i costs fee ₦%i + stamp duty ₦%i', (amount, fee, stampDuty) => {
    expect(transferFee(amount)).toEqual({ fee, stampDuty, total: fee + stampDuty });
  });

  it('quotes the total debit as amount + fee + stamp duty', () => {
    const check = checkTransfer({ amount: 20_000, cash: RICH, sentToday: 0, dailyLimit: 200_000 });
    expect(check).toEqual({ ok: true, quote: { amount: 20_000, fee: 10, stampDuty: 50, total: 60, totalDebit: 20_060 } });
  });
});

describe('transfer limits', () => {
  it('rejects amounts outside ₦100 – ₦5m and non-integers', () => {
    expect(checkTransfer({ amount: 99, cash: RICH, sentToday: 0, dailyLimit: 5_000_000 })).toMatchObject({ ok: false, code: 'TRANSFER_TOO_SMALL' });
    expect(checkTransfer({ amount: 5_000_001, cash: RICH, sentToday: 0, dailyLimit: 50_000_000 })).toMatchObject({ ok: false, code: 'TRANSFER_TOO_LARGE' });
    expect(checkTransfer({ amount: 100.5, cash: RICH, sentToday: 0, dailyLimit: 5_000_000 })).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(checkTransfer({ amount: -500, cash: RICH, sentToday: 0, dailyLimit: 5_000_000 })).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
  });

  it('counts charges toward the daily limit (Tier 1 = ₦30k)', () => {
    const limit = dailyTransferLimit(1);
    // ₦29,940 + ₦10 fee + ₦50 duty = exactly ₦30,000.
    expect(checkTransfer({ amount: 29_940, cash: RICH, sentToday: 0, dailyLimit: limit }).ok).toBe(true);
    expect(checkTransfer({ amount: 29_941, cash: RICH, sentToday: 0, dailyLimit: limit })).toMatchObject({ ok: false, code: 'DAILY_LIMIT_EXCEEDED' });
    expect(checkTransfer({ amount: 4_000, cash: RICH, sentToday: 26_000, dailyLimit: limit }).ok).toBe(true);
    expect(checkTransfer({ amount: 4_001, cash: RICH, sentToday: 26_000, dailyLimit: limit })).toMatchObject({ ok: false, code: 'DAILY_LIMIT_EXCEEDED' });
  });

  it('requires the sender to afford amount plus charges', () => {
    expect(checkTransfer({ amount: 10_000, cash: 10_059, sentToday: 0, dailyLimit: 200_000 })).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    expect(checkTransfer({ amount: 10_000, cash: 10_060, sentToday: 0, dailyLimit: 200_000 }).ok).toBe(true);
  });

  it('tiers by character age in game days and verified email', () => {
    expect(transferTierFor(0, true)).toBe(1);
    expect(transferTierFor(6, true)).toBe(1);
    expect(transferTierFor(7, false)).toBe(2);
    expect(transferTierFor(45, false)).toBe(2);
    expect(transferTierFor(30, true)).toBe(3);
    expect([1, 2, 3].map((tier) => dailyTransferLimit(tier as 1 | 2 | 3))).toEqual([30_000, 200_000, 5_000_000]);
  });

  it('measures character age in whole game days since creation', () => {
    const created = 1_000_000;
    expect(characterAgeDays(created, created + MINUTES_PER_DAY - 1)).toBe(0);
    expect(characterAgeDays(created, created + 7 * MINUTES_PER_DAY)).toBe(7);
    expect(characterAgeDays(created, created - 5)).toBe(0);
  });

  it('resets daily limits at 00:00 UTC', () => {
    expect(startOfUtcDay(new Date('2026-10-08T23:59:59.999Z')).toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(startOfUtcDay(new Date('2026-10-09T00:00:00.000Z')).toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });

  it('sanitises notes to a single short line', () => {
    expect(sanitizeNote('  for \n\t suya  ')).toBe('for suya');
    expect(sanitizeNote('\u0000\u0007')).toBeNull();
    expect(sanitizeNote('x'.repeat(200))?.length).toBe(80);
    expect(sanitizeNote(undefined)).toBeNull();
  });
});
