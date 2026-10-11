import { describe, expect, it } from 'vitest';
import { INCOME_MULTIPLIER as K, TOPUP_PACKAGES, topupVirtualAmount, type TopupUsdCatalogDto } from '@insidelife/shared';
import { previewTopupAmount, previewTopupUsd } from '../services/topup-amount';

const open = { maxPerPaymentNgn: 10_000_000, remainingTodayNgn: null };

describe('custom top-up preview', () => {
  it('shows what an amount buys at the rate of the largest pack it reaches', () => {
    expect(previewTopupAmount(750, open)).toEqual({ amountNgn: 750, ratePerNaira: 300 * K, virtualAmount: 225_000 * K, problem: null });
    expect(previewTopupAmount(7_000, open)).toMatchObject({ ratePerNaira: 440 * K, virtualAmount: 3_080_000 * K });
    expect(previewTopupAmount(50_000, open)).toMatchObject({ ratePerNaira: 500 * K, virtualAmount: 25_000_000 * K });
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

describe('dollar top-up preview', () => {
  const usd: TopupUsdCatalogDto = { ngnPerUsd: 1_500, methods: ['card'], minChargeCents: 100, minUsd: 1, maxPerPaymentUsd: 5_000, quickPicksUsd: [1, 5, 10, 25, 50] };

  it('credits what the same value in naira credits', () => {
    expect(previewTopupUsd(5, usd, null)).toEqual({ dollars: 5, nairaValue: 7_500, virtualAmount: topupVirtualAmount(7_500), problem: null });
    expect(previewTopupUsd(1, usd, null).virtualAmount).toBe(topupVirtualAmount(1_500));
  });

  it('explains dollar amounts that can’t be paid', () => {
    expect(previewTopupUsd(null, usd, null)).toEqual({ dollars: null, nairaValue: null, virtualAmount: null, problem: null });
    expect(previewTopupUsd(0, usd, null)).toMatchObject({ virtualAmount: null, problem: 'Dollar top-ups start at $1' });
    expect(previewTopupUsd(5_001, usd, null)).toMatchObject({ virtualAmount: null, problem: 'One dollar top-up can be at most $5,000' });
    expect(previewTopupUsd(5, { ...usd, minUsd: 10 }, null).problem).toBe('Dollar top-ups start at $10');
  });

  it('counts toward a daily cap at the naira value', () => {
    expect(previewTopupUsd(5, usd, 7_500).problem).toBeNull();
    expect(previewTopupUsd(6, usd, 7_500)).toMatchObject({ virtualAmount: null, problem: 'You can top up ₦7,500 more today (up to $5)' });
  });
});
