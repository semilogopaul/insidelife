import { describe, expect, it } from 'vitest';
import { TOPUP_PACKAGES } from '@insidelife/shared';
import { previewTopupAmount } from '../services/topup-amount';

const open = { maxPerPaymentNgn: 10_000_000, remainingTodayNgn: null };

describe('custom top-up preview', () => {
  it('shows what an amount buys at the rate of the largest pack it reaches', () => {
    expect(previewTopupAmount(750, open)).toEqual({ amountNgn: 750, ratePerNaira: 300, virtualAmount: 225_000, problem: null });
    expect(previewTopupAmount(7_000, open)).toMatchObject({ ratePerNaira: 440, virtualAmount: 3_080_000 });
    expect(previewTopupAmount(50_000, open)).toMatchObject({ ratePerNaira: 500, virtualAmount: 25_000_000 });
  });

  it('matches every pack at the pack price', () => {
    for (const pack of TOPUP_PACKAGES) expect(previewTopupAmount(pack.priceNgn, open).virtualAmount).toBe(pack.virtualAmount);
  });

  it('explains amounts that can’t be paid', () => {
    expect(previewTopupAmount(null, open)).toEqual({ amountNgn: null, ratePerNaira: null, virtualAmount: null, problem: null });
    expect(previewTopupAmount(300, open)).toMatchObject({ virtualAmount: null, problem: 'Top-ups start at ₦500' });
    expect(previewTopupAmount(10_000_001, open).problem).toBe('One top-up can be at most ₦10,000,000');
    expect(previewTopupAmount(6_000, { maxPerPaymentNgn: 10_000_000, remainingTodayNgn: 5_000 }).problem).toBe('You can top up ₦5,000 more today');
  });
});
