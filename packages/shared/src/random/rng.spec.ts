import { describe, expect, it } from 'vitest';
import { createRng, hashString, rngFor } from './rng.js';

describe('seeded rng', () => {
  it('is deterministic for the same key', () => {
    const a = rngFor('seed', 'illness', 42);
    const b = rngFor('seed', 'illness', 42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('differs across keys', () => {
    expect(rngFor('seed', 'illness', 42).next()).not.toBe(rngFor('seed', 'illness', 43).next());
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('respects ranges and weights', () => {
    const rng = createRng('ranges');
    for (let i = 0; i < 1000; i++) {
      const value = rng.int(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 10_000; i++) counts[rng.weighted([{ value: 'a' as const, weight: 9 }, { value: 'b' as const, weight: 1 }])]++;
    expect(counts.a / 10_000).toBeGreaterThan(0.85);
    expect(counts.a / 10_000).toBeLessThan(0.95);
  });

  it('rejects impossible picks', () => {
    expect(() => createRng('x').pick([])).toThrow(RangeError);
    expect(() => createRng('x').weighted([{ value: 1, weight: 0 }])).toThrow(RangeError);
  });
});
