import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RefCountCache } from '../core/refcount-cache';

describe('RefCountCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const disposed: string[] = [];
    const cache = new RefCountCache<{ key: string }>({ create: (key) => ({ key }), dispose: (value) => disposed.push(value.key), graceMs: 100 });
    return { cache, disposed };
  };

  it('shares one value between holders and disposes after the last release + grace', () => {
    const { cache, disposed } = make();
    const a = cache.acquire('k');
    const b = cache.acquire('k');
    expect(a).toBe(b);
    cache.release('k');
    vi.advanceTimersByTime(500);
    expect(disposed).toEqual([]);
    cache.release('k');
    vi.advanceTimersByTime(99);
    expect(disposed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(disposed).toEqual(['k']);
    expect(cache.size).toBe(0);
  });

  it('cancels disposal when re-acquired within the grace period (StrictMode remounts)', () => {
    const { cache, disposed } = make();
    const first = cache.acquire('k');
    cache.release('k');
    vi.advanceTimersByTime(50);
    expect(cache.acquire('k')).toBe(first);
    vi.advanceTimersByTime(500);
    expect(disposed).toEqual([]);
  });

  it('evicts values obtained during render that nobody retains', () => {
    const { cache, disposed } = make();
    cache.obtain('ghost');
    vi.advanceTimersByTime(100);
    expect(disposed).toEqual(['ghost']);
    cache.obtain('kept');
    cache.acquire('kept');
    vi.advanceTimersByTime(1000);
    expect(disposed).toEqual(['ghost']);
  });
});
