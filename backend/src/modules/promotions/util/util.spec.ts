import { CachedValue } from './cached-value.js';
import { assertExpectedPrice, assertExpectedStart } from './dates.js';

/** A load we can finish by hand, to interleave it with invalidations. */
function controllable() {
  const pending: Array<(value: string) => void> = [];
  let calls = 0;
  const load = () =>
    new Promise<string>((resolve) => {
      calls += 1;
      pending.push(resolve);
    });
  return { load, pending, calls: () => calls };
}

describe('CachedValue', () => {
  it('shares one load between concurrent readers and caches it for the TTL', async () => {
    const source = controllable();
    const cache = new CachedValue(60_000, source.load);
    const [a, b] = [cache.get(), cache.get()];
    source.pending[0]?.('v1');
    expect(await Promise.all([a, b])).toEqual(['v1', 'v1']);
    expect(await cache.get()).toBe('v1');
    expect(source.calls()).toBe(1);
  });

  it('never serves data loaded before an invalidation to a reader who comes after it', async () => {
    const source = controllable();
    const cache = new CachedValue(60_000, source.load);
    const early = cache.get(); // load #1 starts (reads the old rate)
    cache.invalidate(); // the rate changes while load #1 is in flight
    const late = cache.get(); // must not join load #1
    expect(source.calls()).toBe(2);
    source.pending[1]?.('new');
    source.pending[0]?.('old'); // the older load finishes last…
    expect(await early).toBe('old');
    expect(await late).toBe('new');
    // …and doesn't overwrite the newer value.
    expect(await cache.get()).toBe('new');
    expect(source.calls()).toBe(2);
  });

  it('reloads on the next read after an invalidation', async () => {
    const source = controllable();
    const cache = new CachedValue(60_000, source.load);
    const first = cache.get();
    source.pending[0]?.('v1');
    await first;
    cache.invalidate();
    const second = cache.get();
    source.pending[1]?.('v2');
    expect(await second).toBe('v2');
  });
});

describe('expected price and dates', () => {
  it('refuses a booking whose price changed since the buyer saw it, with the new quote', () => {
    expect(() => assertExpectedPrice(undefined, { weekPriceKobo: 1_750_000, totalKobo: 3_500_000, blockPriceKobo: 1_750_000, blockDays: 7 })).not.toThrow();
    expect(() => assertExpectedPrice(3_500_000, { weekPriceKobo: 1_750_000, totalKobo: 3_500_000, blockPriceKobo: 1_750_000, blockDays: 7 })).not.toThrow();
    let refused: unknown = null;
    try {
      assertExpectedPrice(3_500_000, { weekPriceKobo: 2_000_000, totalKobo: 4_000_000, blockPriceKobo: 2_000_000, blockDays: 7 });
    } catch (error) {
      refused = error;
    }
    expect(refused).toMatchObject({
      errorCode: 'PRICE_CHANGED',
      message: 'The price just changed to ₦40,000 (₦20,000 a week). Check it and pay again',
      details: ['weekPriceKobo=2000000', 'totalKobo=4000000'],
    });
  });

  it('quotes 3-day blocks in the price-changed message', () => {
    expect(() => assertExpectedPrice(4_300_000, { weekPriceKobo: 12_000_000, totalKobo: 5_150_000, blockPriceKobo: 5_150_000, blockDays: 3 })).toThrow(
      'The price just changed to ₦51,500 (₦51,500 per 3 days). Check it and pay again',
    );
  });

  it('refuses a booking whose start moved since the buyer saw it', () => {
    expect(() => assertExpectedStart('2026-10-09', '2026-10-09', 'Lekki Toll Gate')).not.toThrow();
    expect(() => assertExpectedStart('2026-10-09', '2026-10-15', 'Lekki Toll Gate')).toThrow(/next free start is now Thu 15 Oct/);
  });
});
