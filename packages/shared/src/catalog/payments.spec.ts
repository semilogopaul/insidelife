import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOPUP_DAILY_LIMIT_NGN,
  DEFAULT_TOPUP_MAX_PER_PAYMENT_NGN,
  TOPUP_MIN_NGN,
  TOPUP_PACKAGES,
  TOPUP_RATE_TIERS,
  topupAmountProblem,
  topupRateFor,
  topupVirtualAmount,
} from './payments.js';

describe('top-up rates', () => {
  it('has one whole-number rate per pack, rising with the price: 300, 350, 400, 440, 500 per ₦1', () => {
    expect(TOPUP_RATE_TIERS.map((tier) => [tier.fromNgn, tier.perNaira])).toEqual([
      [500, 300],
      [1_000, 350],
      [2_500, 400],
      [5_000, 440],
      [10_000, 500],
    ]);
    for (const tier of TOPUP_RATE_TIERS) expect(Number.isInteger(tier.perNaira)).toBe(true);
  });

  it('credits every pack exactly its advertised amount', () => {
    for (const pack of TOPUP_PACKAGES) expect(topupVirtualAmount(pack.priceNgn), pack.id).toBe(pack.virtualAmount);
  });

  it('uses the largest pack whose price is at most the amount, at the boundaries', () => {
    expect(topupRateFor(499)).toBeNull();
    expect(topupRateFor(500)).toBe(300);
    expect(topupRateFor(999)).toBe(300);
    expect(topupRateFor(1_000)).toBe(350);
    expect(topupRateFor(2_499)).toBe(350);
    expect(topupRateFor(2_500)).toBe(400);
    expect(topupRateFor(4_999)).toBe(400);
    expect(topupRateFor(5_000)).toBe(440);
    expect(topupRateFor(9_999)).toBe(440);
    expect(topupRateFor(10_000)).toBe(500);
    expect(topupRateFor(10_000_000)).toBe(500);
  });

  it('credits custom amounts at that rate', () => {
    expect(topupVirtualAmount(500)).toBe(150_000);
    expect(topupVirtualAmount(750)).toBe(225_000);
    expect(topupVirtualAmount(999)).toBe(299_700);
    expect(topupVirtualAmount(7_000)).toBe(3_080_000);
    expect(topupVirtualAmount(25_000)).toBe(12_500_000);
    expect(topupVirtualAmount(DEFAULT_TOPUP_MAX_PER_PAYMENT_NGN)).toBe(5_000_000_000);
    expect(Number.isSafeInteger(topupVirtualAmount(DEFAULT_TOPUP_MAX_PER_PAYMENT_NGN))).toBe(true);
  });

  it('never credits less for paying more', () => {
    let previous = 0;
    for (let price = TOPUP_MIN_NGN; price <= 12_000; price += 1) {
      const credited = topupVirtualAmount(price);
      expect(credited, String(price)).toBeGreaterThan(previous);
      previous = credited;
    }
  });

  it('refuses amounts under ₦500, over the maximum, or not whole naira', () => {
    expect(() => topupVirtualAmount(499)).toThrow(RangeError);
    expect(() => topupVirtualAmount(1_000.5)).toThrow(RangeError);
    expect(() => topupVirtualAmount(Number.NaN)).toThrow(RangeError);
    expect(topupAmountProblem(500)).toBeNull();
    expect(topupAmountProblem(10_000_000)).toBeNull();
    expect(topupAmountProblem(499)).toMatch(/start at ₦500/);
    expect(topupAmountProblem(10_000_001)).toMatch(/at most ₦10,000,000/);
    expect(topupAmountProblem(20_000, 15_000)).toMatch(/at most ₦15,000/);
    expect(topupAmountProblem(1_234.5)).toMatch(/whole naira/);
  });

  it('has no daily cap by default', () => {
    expect(DEFAULT_TOPUP_DAILY_LIMIT_NGN).toBe(0);
  });
});
