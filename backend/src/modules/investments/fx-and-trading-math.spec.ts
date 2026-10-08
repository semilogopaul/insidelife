import { FX_SPREAD, MICRO_UNITS_PER_UNIT, brokerFee, fxRates, quoteFx } from '@insidelife/shared';
import { FxAllowanceService } from './fx-allowance.service.js';
import { ceilMoney, floorMoney, quoteBuy, quoteSell, toMicroUnits } from './trading-math.js';

describe('FX spread maths', () => {
  const mid = 1_360;

  it('buys at mid + 2% and sells at mid − 2%, in exact kobo', () => {
    expect(fxRates(mid)).toEqual({ mid, buyKobo: 138_720, sellKobo: 133_280 });
    expect(FX_SPREAD).toBe(0.02);
  });

  it('quotes buys by naira (never overspends) and by dollars (cost rounded up)', () => {
    const byNaira = quoteFx('buy-usd', { naira: 100_000 }, mid);
    expect(byNaira).toEqual({ side: 'buy-usd', usdCents: 7_208, naira: 99_990, rateKobo: 138_720 });
    expect(byNaira.naira).toBeLessThanOrEqual(100_000);
    expect(quoteFx('buy-usd', { usdCents: 10_000 }, mid)).toMatchObject({ usdCents: 10_000, naira: 138_720 });
    expect(quoteFx('buy-usd', { usdCents: 1 }, mid).naira).toBe(14); // ₦13.872 rounds up
  });

  it('quotes sells by dollars (proceeds rounded down) and by naira target (at least that much)', () => {
    expect(quoteFx('sell-usd', { usdCents: 10_000 }, mid)).toMatchObject({ usdCents: 10_000, naira: 133_280 });
    expect(quoteFx('sell-usd', { usdCents: 1 }, mid).naira).toBe(13); // ₦13.328 rounds down
    const target = quoteFx('sell-usd', { naira: 50_000 }, mid);
    expect(target.naira).toBeGreaterThanOrEqual(50_000);
    expect(target.naira - 50_000).toBeLessThan(14);
  });

  it('a buy-then-sell round trip always loses ~4% and never makes money', () => {
    for (const naira of [1_000, 7_777, 100_000, 12_345_678, 999_999_999]) {
      for (const rate of [900, 1_360, 1_701.5, 2_400]) {
        const bought = quoteFx('buy-usd', { naira }, rate);
        const sold = quoteFx('sell-usd', { usdCents: bought.usdCents }, rate);
        expect(sold.naira).toBeLessThan(bought.naira);
        if (naira >= 100_000) expect(1 - sold.naira / bought.naira).toBeCloseTo(1 - 0.98 / 1.02, 3);
      }
    }
  });

  it('counts USDT purchases against the dollar allowance', () => {
    expect(FxAllowanceService.usdtCents(MICRO_UNITS_PER_UNIT)).toBe(100);
    expect(FxAllowanceService.usdtCents(1)).toBe(1);
    expect(FxAllowanceService.isDollarProxy('USDT')).toBe(true);
    expect(FxAllowanceService.isDollarProxy('BTC')).toBe(false);
  });
});

describe('order maths', () => {
  it('rounds money safely around float noise', () => {
    expect(ceilMoney(99_999.99999999999)).toBe(100_000);
    expect(floorMoney(100_000.00000000001)).toBe(100_000);
    expect(ceilMoney(100.2)).toBe(101);
    expect(floorMoney(100.8)).toBe(100);
  });

  it('buys by amount without exceeding it and charges the broker fee on top', () => {
    const quote = quoteBuy('stock', 93.96, { amountNaira: 100_000 });
    expect(quote.gross).toBeLessThanOrEqual(100_000);
    expect(quote.gross).toBeGreaterThan(99_999);
    expect(quote.fee).toBe(1_500);
    expect(quoteBuy('crypto', 133_280_000, { amountNaira: 50_000 }).fee).toBe(500);
    expect(brokerFee('stock', 1_001)).toBe(16);
  });

  it('buys by units at ceil(units × price)', () => {
    expect(quoteBuy('stock', 62.5, { microUnits: toMicroUnits(10) })).toEqual({ microUnits: 10_000_000, gross: 625, fee: 10 });
    expect(quoteBuy('crypto', 0.3353, { microUnits: toMicroUnits(1_000.123456) }).gross).toBe(336);
  });

  it('sells release cost basis pro rata and report realised gains', () => {
    const held = toMicroUnits(100);
    const half = quoteSell('stock', 120, held, 10_150, { microUnits: toMicroUnits(50) });
    expect(half).toEqual({ microUnits: 50_000_000, gross: 6_000, fee: 90, costPortion: 5_075, realizedGain: 835 });
    const all = quoteSell('stock', 80, held, 10_150, { amountNaira: 1_000_000 });
    expect(all).toMatchObject({ microUnits: held, gross: 8_000, costPortion: 10_150 });
    expect(all.realizedGain).toBe(8_000 - 120 - 10_150);
  });

  it('a round trip at the same price always loses the two fees', () => {
    for (const price of [0.3353, 8.2, 62, 410, 98_000_000]) {
      const buy = quoteBuy('stock', price, { amountNaira: 250_000 });
      const sell = quoteSell('stock', price, buy.microUnits, buy.gross + buy.fee, { microUnits: buy.microUnits });
      expect(sell.realizedGain).toBeLessThan(0);
      expect(sell.gross).toBeLessThanOrEqual(buy.gross);
    }
  });
});
