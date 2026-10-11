import { MAX_SINGLE_TRANSFER, MINUTES_PER_DAY, TRANSFER_TIERS, dailyTransferLimit, formatNaira, transferFee, transferTierFor } from '@insidelife/shared';
import { characterAgeDays, checkTransfer, sanitizeNote } from './transfer-rules.js';
import { startOfUtcDay } from './utc-day.js';

const RICH = MAX_SINGLE_TRANSFER * 20;

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
    const check = checkTransfer({ amount: 20_000, cash: RICH });
    expect(check).toEqual({ ok: true, quote: { amount: 20_000, fee: 10, stampDuty: 50, total: 60, totalDebit: 20_060 } });
  });
});

describe('transfer limits', () => {
  it('rejects amounts outside ₦100 – the single-transfer maximum and non-integers', () => {
    expect(checkTransfer({ amount: 99, cash: RICH })).toMatchObject({ ok: false, code: 'TRANSFER_TOO_SMALL' });
    expect(checkTransfer({ amount: MAX_SINGLE_TRANSFER + 1, cash: RICH })).toMatchObject({ ok: false, code: 'TRANSFER_TOO_LARGE' });
    expect(checkTransfer({ amount: 100.5, cash: RICH })).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
    expect(checkTransfer({ amount: -500, cash: RICH })).toMatchObject({ ok: false, code: 'INVALID_AMOUNT' });
  });

  it('accepts exactly ₦100 and exactly the maximum, refuses zero, and explains every refusal (mutation-tested edges)', () => {
    expect(checkTransfer({ amount: 100, cash: RICH }).ok).toBe(true);
    expect(checkTransfer({ amount: MAX_SINGLE_TRANSFER, cash: RICH }).ok).toBe(true);
    expect(checkTransfer({ amount: 0, cash: RICH })).toEqual({ ok: false, code: 'INVALID_AMOUNT', message: 'Enter a whole naira amount' });
    expect(checkTransfer({ amount: 99, cash: RICH })).toEqual({ ok: false, code: 'TRANSFER_TOO_SMALL', message: 'The smallest transfer is ₦100' });
    expect(checkTransfer({ amount: MAX_SINGLE_TRANSFER + 1, cash: RICH })).toEqual({ ok: false, code: 'TRANSFER_TOO_LARGE', message: `You can send at most ${formatNaira(MAX_SINGLE_TRANSFER)} at once` });
    expect(checkTransfer({ amount: 10_000, cash: 10_000 })).toEqual({ ok: false, code: 'INSUFFICIENT_FUNDS', message: 'You need ₦10,060 including ₦60 charges' });
  });

  it('turns every control character in a note into a single space', () => {
    expect(sanitizeNote('a\u0000\u0001\u001fb')).toBe('a b');
    expect(sanitizeNote('a\u007fb')).toBe('a b');
    expect(sanitizeNote('suya\u0007money')).toBe('suya money');
  });

  it('requires the sender to afford amount plus charges', () => {
    expect(checkTransfer({ amount: 10_000, cash: 10_059 })).toMatchObject({ ok: false, code: 'INSUFFICIENT_FUNDS' });
    expect(checkTransfer({ amount: 10_000, cash: 10_060 }).ok).toBe(true);
  });

  it('tiers by character age in game days and verified email', () => {
    expect(transferTierFor(0, true)).toBe(1);
    expect(transferTierFor(6, true)).toBe(1);
    expect(transferTierFor(7, false)).toBe(2);
    expect(transferTierFor(45, false)).toBe(2);
    expect(transferTierFor(30, true)).toBe(3);
    expect([1, 2, 3].map((tier) => dailyTransferLimit(tier as 1 | 2 | 3))).toEqual(TRANSFER_TIERS.map((tier) => tier.dailyLimit));
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
