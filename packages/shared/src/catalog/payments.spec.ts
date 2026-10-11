import { describe, expect, it } from 'vitest';
import { INCOME_MULTIPLIER as K } from '../money/income-multiplier.js';
import {
  CUSTOM_TOPUP_ID,
  DEFAULT_TOPUP_DAILY_LIMIT_NGN,
  DEFAULT_TOPUP_MAX_PER_PAYMENT_NGN,
  TOPUP_MIN_NGN,
  TOPUP_PACKAGES,
  TOPUP_RATE_TIERS,
  findTopupPackage,
  topupAmountProblem,
  topupRateFor,
  topupVirtualAmount,
  CENTS_PER_DOLLAR,
  DEFAULT_TOPUP_MAX_PER_PAYMENT_USD,
  DEFAULT_USD_RATE_NGN,
  TOPUP_USD_QUICK_PICKS,
  USD_RATE_MAX_NGN,
  USD_RATE_MIN_NGN,
  formatPaymentAmount,
  formatUsdCents,
  isPaymentCurrency,
  isValidUsdRateNgn,
  koboForUsdCents,
  topupUsdAmountProblem,
  topupVirtualAmountUsd,
  usdCentsForKobo,
} from './payments.js';

describe('top-up rates', () => {
  it('has one whole-number rate per pack, rising with the price: 300, 350, 400, 440, 500 per ₦1 × INCOME_MULTIPLIER', () => {
    expect(TOPUP_RATE_TIERS.map((tier) => [tier.fromNgn, tier.perNaira])).toEqual([
      [500, 300 * K],
      [1_000, 350 * K],
      [2_500, 400 * K],
      [5_000, 440 * K],
      [10_000, 500 * K],
    ]);
    for (const tier of TOPUP_RATE_TIERS) expect(Number.isInteger(tier.perNaira)).toBe(true);
  });

  it('credits every pack exactly its advertised amount', () => {
    for (const pack of TOPUP_PACKAGES) expect(topupVirtualAmount(pack.priceNgn), pack.id).toBe(pack.virtualAmount);
  });

  it('uses the largest pack whose price is at most the amount, at the boundaries', () => {
    expect(topupRateFor(499)).toBeNull();
    expect(topupRateFor(500)).toBe(300 * K);
    expect(topupRateFor(999)).toBe(300 * K);
    expect(topupRateFor(1_000)).toBe(350 * K);
    expect(topupRateFor(2_499)).toBe(350 * K);
    expect(topupRateFor(2_500)).toBe(400 * K);
    expect(topupRateFor(4_999)).toBe(400 * K);
    expect(topupRateFor(5_000)).toBe(440 * K);
    expect(topupRateFor(9_999)).toBe(440 * K);
    expect(topupRateFor(10_000)).toBe(500 * K);
    expect(topupRateFor(10_000_000)).toBe(500 * K);
  });

  it('credits custom amounts at that rate', () => {
    expect(topupVirtualAmount(500)).toBe(150_000 * K);
    expect(topupVirtualAmount(750)).toBe(225_000 * K);
    expect(topupVirtualAmount(999)).toBe(299_700 * K);
    expect(topupVirtualAmount(7_000)).toBe(3_080_000 * K);
    expect(topupVirtualAmount(25_000)).toBe(12_500_000 * K);
    expect(topupVirtualAmount(DEFAULT_TOPUP_MAX_PER_PAYMENT_NGN)).toBe(5_000_000_000 * K);
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

/** Added after mutation testing: the pack ids and the custom id are part of the payments contract. */
describe('top-up packs and ids', () => {
  it('keeps the pack ids the app and stored payments use, cheapest first', () => {
    expect(TOPUP_PACKAGES.map((pack) => pack.id)).toEqual(['small-chops', 'jollof-pack', 'owambe-pack', 'big-boy-pack', 'odogwu-pack']);
    for (const pack of TOPUP_PACKAGES) expect(findTopupPackage(pack.id)).toBe(pack);
    expect(findTopupPackage('free-money')).toBeUndefined();
    expect(findTopupPackage('')).toBeUndefined();
    expect(CUSTOM_TOPUP_ID).toBe('custom');
    expect(findTopupPackage(CUSTOM_TOPUP_ID)).toBeUndefined();
  });

  it('explains a refused amount', () => {
    expect(() => topupVirtualAmount(100)).toThrow('Top-ups are whole naira from ₦500');
  });
});

describe('paying in dollars', () => {
  it('has the documented defaults and exchange-rate range', () => {
    expect(DEFAULT_USD_RATE_NGN).toBe(1_500);
    expect([USD_RATE_MIN_NGN, USD_RATE_MAX_NGN]).toEqual([500, 5_000]);
    expect(DEFAULT_TOPUP_MAX_PER_PAYMENT_USD).toBe(5_000);
    expect(TOPUP_USD_QUICK_PICKS).toEqual([1, 5, 10, 25, 50]);
    expect(CENTS_PER_DOLLAR).toBe(100);
    expect(isPaymentCurrency('NGN')).toBe(true);
    expect(isPaymentCurrency('USD')).toBe(true);
    expect(isPaymentCurrency('usd')).toBe(false);
    expect(isPaymentCurrency('GBP')).toBe(false);
  });

  it('accepts only whole-naira exchange rates from ₦500 to ₦5,000', () => {
    expect(isValidUsdRateNgn(500)).toBe(true);
    expect(isValidUsdRateNgn(5_000)).toBe(true);
    expect(isValidUsdRateNgn(499)).toBe(false);
    expect(isValidUsdRateNgn(5_001)).toBe(false);
    expect(isValidUsdRateNgn(1_500.5)).toBe(false);
    expect(isValidUsdRateNgn(Number.NaN)).toBe(false);
  });

  it('credits a dollar top-up exactly what the same value in naira credits, tier included', () => {
    expect(topupVirtualAmountUsd(1, 1_500)).toBe(topupVirtualAmount(1_500));
    expect(topupVirtualAmountUsd(1, 1_500)).toBe(1_500 * 350 * K);
    expect(topupVirtualAmountUsd(10, 1_500)).toBe(15_000 * 500 * K);
    // $1 at the lowest rate is exactly the ₦500 minimum.
    expect(topupVirtualAmountUsd(1, 500)).toBe(150_000 * K);
    // Tier boundaries reached through the rate: $2 × ₦1,250 = ₦2,500 (400/₦1), $2 × ₦1,249 = ₦2,498 (350/₦1).
    expect(topupVirtualAmountUsd(2, 1_250)).toBe(2_500 * 400 * K);
    expect(topupVirtualAmountUsd(2, 1_249)).toBe(2_498 * 350 * K);
    expect(topupVirtualAmountUsd(DEFAULT_TOPUP_MAX_PER_PAYMENT_USD, USD_RATE_MAX_NGN)).toBe(25_000_000 * 500 * K);
    expect(Number.isSafeInteger(topupVirtualAmountUsd(DEFAULT_TOPUP_MAX_PER_PAYMENT_USD, USD_RATE_MAX_NGN))).toBe(true);
    for (const dollars of TOPUP_USD_QUICK_PICKS) expect(topupVirtualAmountUsd(dollars, 1_600)).toBe(topupVirtualAmount(dollars * 1_600));
  });

  it('never credits less for paying more dollars', () => {
    let previous = 0;
    for (let dollars = 1; dollars <= 200; dollars += 1) {
      const credited = topupVirtualAmountUsd(dollars, 1_500);
      expect(credited).toBeGreaterThan(previous);
      previous = credited;
    }
  });

  it('refuses dollar top-ups under $1, over the maximum, not whole dollars, or at an invalid rate', () => {
    expect(() => topupVirtualAmountUsd(0, 1_500)).toThrow(RangeError);
    expect(() => topupVirtualAmountUsd(1.5, 1_500)).toThrow(RangeError);
    expect(() => topupVirtualAmountUsd(10, 499)).toThrow(RangeError);
    expect(() => topupVirtualAmountUsd(10, 5_001)).toThrow(RangeError);
    expect(topupUsdAmountProblem(1)).toBeNull();
    expect(topupUsdAmountProblem(5_000)).toBeNull();
    expect(topupUsdAmountProblem(0)).toMatch(/start at \$1/);
    expect(topupUsdAmountProblem(5_001)).toMatch(/at most \$5,000/);
    expect(topupUsdAmountProblem(60, 50)).toMatch(/at most \$50/);
    expect(topupUsdAmountProblem(2.5)).toMatch(/whole dollar/);
  });

  it('prices naira in dollars rounded UP to the cent, never worth less than the naira price', () => {
    expect(usdCentsForKobo(150_000, 1_500)).toBe(100); // ₦1,500 = $1 exactly
    expect(usdCentsForKobo(150_001, 1_500)).toBe(101);
    expect(usdCentsForKobo(149_999, 1_500)).toBe(100);
    expect(usdCentsForKobo(1_000_000, 1_500)).toBe(667); // ₦10,000 = $6.666… → $6.67
    expect(usdCentsForKobo(3_500_000, 1_500)).toBe(2_334); // ₦35,000 → $23.34
    expect(usdCentsForKobo(0, 1_500)).toBe(0);
    expect(usdCentsForKobo(40_000_000_000, 500)).toBe(80_000_000); // ₦400m at ₦500 = $800,000
    for (const [kobo, rate] of [
      [200_000, 1_500],
      [10_000_000_000, 1_499],
      [7_777_700, 4_999],
      [123_456_700, 777],
    ] as const) {
      const cents = usdCentsForKobo(kobo, rate);
      expect(koboForUsdCents(cents, rate)).toBeGreaterThanOrEqual(kobo);
      expect(koboForUsdCents(cents - 1, rate)).toBeLessThan(kobo);
    }
    expect(() => usdCentsForKobo(100.5, 1_500)).toThrow(RangeError);
    expect(() => usdCentsForKobo(-100, 1_500)).toThrow(RangeError);
    expect(() => usdCentsForKobo(100, 0)).toThrow(RangeError);
  });

  it('formats dollars and either currency', () => {
    expect(formatUsdCents(1_000)).toBe('$10');
    expect(formatUsdCents(667)).toBe('$6.67');
    expect(formatUsdCents(105)).toBe('$1.05');
    expect(formatUsdCents(500_000)).toBe('$5,000');
    expect(formatUsdCents(-150)).toBe('-$1.50');
    expect(formatPaymentAmount('USD', 2_334)).toBe('$23.34');
    expect(formatPaymentAmount('NGN', 250_000)).toBe('₦2,500');
  });
});
