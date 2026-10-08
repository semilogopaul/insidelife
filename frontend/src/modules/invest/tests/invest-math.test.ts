import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, brokerFee } from '@insidelife/shared';
import { formatChange, formatUnitPrice, formatUnits, parseUsdInput, previewDeposit, previewFx, previewTrade } from '../services/invest-math';

describe('formatting', () => {
  it('shows kobo for cheap prices and whole naira for big ones', () => {
    expect(formatUnitPrice(23.9)).toBe('₦23.90');
    expect(formatUnitPrice(98_450_120.4)).toBe('₦98,450,120');
  });

  it('always signs changes', () => {
    expect(formatChange(0.0123)).toBe('+1.23%');
    expect(formatChange(-0.4)).toBe('−40.00%');
    expect(formatChange(1.5)).toBe('+150%');
    expect(formatChange(0)).toBe('0.00%');
  });

  it('trims units', () => {
    expect(formatUnits(2054.2345)).toBe('2,054.23');
    expect(formatUnits(0.000123)).toBe('0.000123');
  });
});

describe('previewTrade', () => {
  const buy = { side: 'buy' as const, kind: 'stock' as const, price: 24, cash: 100_000, heldUnits: 0 };

  it('charges the broker fee on top of a buy', () => {
    const preview = previewTrade(50_000, buy);
    expect(preview.gross).toBe(50_000);
    expect(preview.fee).toBe(brokerFee('stock', 50_000));
    expect(preview.net).toBe(50_750);
    expect(preview.units).toBeCloseTo(2083.333333, 5);
    expect(preview.problem).toBeNull();
  });

  it('flags small orders and missing cash', () => {
    expect(previewTrade(500, buy).problem).toMatch(/smallest order/);
    expect(previewTrade(99_000, buy).problem).toMatch(/Not enough cash/);
    expect(previewTrade(null, buy)).toMatchObject({ net: 0, problem: null });
  });

  it('deducts the fee from a sale and caps units at what you hold', () => {
    const sell = { side: 'sell' as const, kind: 'crypto' as const, price: 1_000, cash: 0, heldUnits: 10 };
    const preview = previewTrade(20_000, sell);
    expect(preview.units).toBe(10);
    expect(preview.gross).toBe(10_000);
    expect(preview.net).toBe(10_000 - brokerFee('crypto', 10_000));
    expect(previewTrade(5_000, { ...sell, heldUnits: 0 }).problem).toMatch(/don’t own/);
  });
});

describe('previewDeposit', () => {
  it('projects interest after 10% tax and the maturity date', () => {
    const now = 1_000 * MINUTES_PER_DAY;
    const preview = previewDeposit('tbill', 500_000, 0.1152, 91, now);
    expect(preview.grossInterest).toBe(14_560);
    expect(preview.tax).toBe(1_456);
    expect(preview.payout).toBe(513_104);
    expect(preview.maturesAt).toBe(now + 91 * MINUTES_PER_DAY);
    expect(preview.earlyBreakPenalty).toBe(2_500);
    expect(preview.problem).toBeNull();
  });

  it('enforces product minimums and handles open-ended funds', () => {
    expect(previewDeposit('fixed-deposit', 50_000, 0.1, 91, 0).problem).toMatch(/start from ₦100,000/);
    const mmf = previewDeposit('money-market', 100_000, 0.09, null, 0);
    expect(mmf.maturesAt).toBeNull();
    expect(mmf.earlyBreakPenalty).toBe(0);
  });
});

describe('FX', () => {
  it('quotes buys and sells with the spread, rounding for the desk', () => {
    const buy = previewFx('buy-usd', 150_000, 1_407)!;
    expect(buy.rate).toBeCloseTo(1_435.14, 2);
    expect(buy.usdCents).toBe(10_451);
    expect(buy.naira).toBeLessThanOrEqual(150_000);
    const sell = previewFx('sell-usd', 10_000, 1_407)!;
    expect(sell.rate).toBeCloseTo(1_378.86, 2);
    expect(sell.naira).toBe(137_886);
    expect(previewFx('buy-usd', null, 1_407)).toBeNull();
  });

  it('parses dollar input into cents', () => {
    expect(parseUsdInput('12.5')).toBe(1_250);
    expect(parseUsdInput('$1,000.999')).toBe(100_099);
    expect(parseUsdInput('.')).toBeNull();
    expect(parseUsdInput('0')).toBeNull();
  });
});
