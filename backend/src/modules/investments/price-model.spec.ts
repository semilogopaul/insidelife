import {
  DAYS_PER_YEAR,
  INSTRUMENTS,
  brownianAt,
  depositRate,
  economyOn,
  exDividendCount,
  findInstrument,
  isDividendRecordDay,
  priceOn,
  withholdingTax,
  worldEventsForYear,
  type InstrumentDefinition,
} from '@insidelife/shared';

const WORLD = 'eko-o-ni-baje';
const SEEDS = Array.from({ length: 400 }, (_, i) => `market-seed-${i}`);
const stocks = INSTRUMENTS.filter((instrument) => instrument.kind === 'stock');

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const sd = (values: readonly number[]): number => {
  const m = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};
const median = (values: readonly number[]): number => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** One-year total return (price + dividend, before WHT) starting mid-January of year `y`. */
const yearlyTotalReturn = (instrument: InstrumentDefinition, y: number, marketSeed: string): number => {
  const start = y * DAYS_PER_YEAR + 10;
  const end = start + DAYS_PER_YEAR;
  const priceReturn = priceOn(instrument.id, end, WORLD, marketSeed) / priceOn(instrument.id, start, WORLD, marketSeed);
  return priceReturn / (1 - instrument.dividendYield) ** (exDividendCount(instrument, end) - exDividendCount(instrument, start)) - 1;
};

describe('priceOn determinism', () => {
  it('returns the same price for the same inputs regardless of query order or cache state', () => {
    const forward = [0, 1, 50, 845, 3_000, 9_999].map((day) => priceOn('EKOTRUST', day, WORLD, 'secret'));
    const backward = [9_999, 3_000, 845, 50, 1, 0].map((day) => priceOn('EKOTRUST', day, WORLD, 'secret')).toReversed();
    expect(backward).toEqual(forward);
    expect(priceOn('EKOTRUST', 0, WORLD, 'secret')).toBe(62);
  });

  it('depends on the market seed, so the public world seed alone cannot predict prices', () => {
    expect(priceOn('NAIJATEL', 900, WORLD, 'secret-a')).not.toBe(priceOn('NAIJATEL', 900, WORLD, 'secret-b'));
  });

  it('evaluates far-future days without iterating from day 0', () => {
    const started = performance.now();
    const price = priceOn('PAYSTREAM', 2_000_000, WORLD, `cold-${Date.now()}`);
    expect(Number.isFinite(price) && price > 0).toBe(true);
    expect(performance.now() - started).toBeLessThan(20);
  });

  it('builds a consistent Brownian path: W(0)=0 and increments have the right variance', () => {
    expect(brownianAt('s', 'X', 0)).toBe(0);
    const daily = SEEDS.map((seed) => brownianAt(seed, 'X', 1_001) - brownianAt(seed, 'X', 1_000));
    const yearly = SEEDS.map((seed) => brownianAt(seed, 'X', 1_000 + DAYS_PER_YEAR) - brownianAt(seed, 'X', 1_000));
    expect(sd(daily)).toBeGreaterThan(0.85);
    expect(sd(daily)).toBeLessThan(1.15);
    expect(sd(yearly) / Math.sqrt(DAYS_PER_YEAR)).toBeGreaterThan(0.85);
    expect(sd(yearly) / Math.sqrt(DAYS_PER_YEAR)).toBeLessThan(1.15);
  });

  it('throws for unknown instruments and clamps negative days', () => {
    expect(() => priceOn('NOPE', 1, WORLD)).toThrow(RangeError);
    expect(priceOn('AFRICEM', -50, WORLD, 'x')).toBe(priceOn('AFRICEM', 0, WORLD, 'x'));
  });
});

describe('return calibration over simulated years', () => {
  it('stocks return ~9-14%/yr on average (price + dividends) with 25-45% volatility', () => {
    for (const stock of stocks) {
      const returns = SEEDS.flatMap((seed) => [1, 2, 3].map((y) => yearlyTotalReturn(stock, y, seed)));
      expect(mean(returns), stock.id).toBeGreaterThan(0.05);
      expect(mean(returns), stock.id).toBeLessThan(0.2);
      expect(sd(returns), stock.id).toBeGreaterThan(0.2);
      expect(sd(returns), stock.id).toBeLessThan(0.6);
    }
  });

  it('a patient, diversified stock portfolio beats idle cash (0%) over ten years but stays far below a career', () => {
    const multiples = SEEDS.slice(0, 200).map((seed) => {
      const perStock = stocks.map((stock) => {
        const start = 10;
        const end = start + 10 * DAYS_PER_YEAR;
        const price = priceOn(stock.id, end, WORLD, seed) / priceOn(stock.id, start, WORLD, seed);
        return price / (1 - stock.dividendYield) ** (exDividendCount(stock, end) - exDividendCount(stock, start));
      });
      return mean(perStock);
    });
    const cagr = median(multiples) ** (1 / 10) - 1;
    expect(cagr).toBeGreaterThan(0.04);
    expect(cagr).toBeLessThan(0.16);
    // ₦10m at that rate pays well under an entry graduate salary (₦180-350k/month).
    expect((10_000_000 * cagr) / 12).toBeLessThan(180_000);
  });

  it('crypto is far wilder than stocks and the memecoin bleeds out between pumps', () => {
    const btc = findInstrument('BTC');
    const jollof = findInstrument('JOLLOF');
    const ekotrust = findInstrument('EKOTRUST');
    if (!btc || !jollof || !ekotrust) throw new RangeError('catalog changed');
    const vol = (instrument: InstrumentDefinition): number => sd(SEEDS.map((seed) => Math.log(1 + yearlyTotalReturn(instrument, 2, seed))));
    expect(vol(btc)).toBeGreaterThan(1.5 * vol(ekotrust));
    expect(vol(jollof)).toBeGreaterThan(vol(btc));
    const jollofMultiples = SEEDS.map((seed) => priceOn('JOLLOF', 5 * DAYS_PER_YEAR, WORLD, seed) / priceOn('JOLLOF', 0, WORLD, seed));
    expect(median(jollofMultiples)).toBeLessThan(0.5);
  });

  it('T-bills pay around 11% and beat savings; WHT takes 10% of interest', () => {
    const rates = Array.from({ length: 50 }, (_, i) => economyOn(WORLD, i * 37));
    expect(mean(rates.map((economy) => depositRate('tbill', 364, economy)))).toBeGreaterThan(0.09);
    expect(mean(rates.map((economy) => depositRate('tbill', 364, economy)))).toBeLessThan(0.13);
    for (const economy of rates) expect(depositRate('tbill', 364, economy)).toBeGreaterThan(economy.savingsRate);
    expect(withholdingTax(110_000)).toBe(11_000);
  });

  it('USDT tracks the dollar rate', () => {
    for (const day of [0, 400, 845, 2_000]) {
      const ratio = priceOn('USDT', day, WORLD, 'x') / economyOn(WORLD, day).usdRate;
      expect(ratio).toBeGreaterThan(0.98);
      expect(ratio).toBeLessThan(1.02);
    }
  });
});

describe('world events and dividends', () => {
  const devaluation = (() => {
    for (let year = 2027; year < 2200; year++) {
      const event = worldEventsForYear(WORLD, year).find((candidate) => candidate.kind === 'devaluation');
      if (event) return event;
    }
    throw new RangeError('no devaluation found');
  })();
  const startDay = Math.floor(devaluation.startsAt / 1440);

  it('a devaluation lifts the naira price of dollar-priced crypto and oil stocks, and hurts FMCG', () => {
    const across = (id: string): number =>
      mean(SEEDS.slice(0, 100).map((seed) => Math.log(priceOn(id, startDay + 3, WORLD, seed) / priceOn(id, startDay - 3, WORLD, seed))));
    expect(economyOn(WORLD, startDay + 3).usdRate).toBeGreaterThan(economyOn(WORLD, startDay - 3).usdRate * 1.15);
    expect(across('USDT')).toBeGreaterThan(0.15);
    expect(across('BTC')).toBeGreaterThan(0.1);
    expect(across('LAGOONPET')).toBeGreaterThan(0.03);
    expect(across('EKOFOODS')).toBeLessThan(-0.02);
  });

  it('pays dividends on the record date and drops the price by the yield on the ex-date (no free lunch)', () => {
    const ekotrust = findInstrument('EKOTRUST');
    if (!ekotrust) throw new RangeError('catalog changed');
    const recordDays = Array.from({ length: 3 * DAYS_PER_YEAR }, (_, day) => day).filter((day) => isDividendRecordDay(ekotrust, day));
    expect(recordDays).toEqual([103, 463, 823]);
    expect(exDividendCount(ekotrust, 103)).toBe(0);
    expect(exDividendCount(ekotrust, 104)).toBe(1);
    // Buying on the record date and selling the next morning loses the dividend's worth of price.
    const drop = mean(SEEDS.slice(0, 200).map((seed) => priceOn('EKOTRUST', 104, WORLD, seed) / priceOn('EKOTRUST', 103, WORLD, seed)));
    expect(drop).toBeLessThan(1 - ekotrust.dividendYield / 2);
  });
});
