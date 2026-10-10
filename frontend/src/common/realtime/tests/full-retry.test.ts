import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FULL_RETRY_MAX_MS, FULL_RETRY_MIN_MS, createFullRetry, fullRetryDelayMs } from '../full-retry';

describe('full-retry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('jitters the wait between 20 and 40 seconds', () => {
    expect(fullRetryDelayMs(() => 0)).toBe(FULL_RETRY_MIN_MS);
    expect(fullRetryDelayMs(() => 0.5)).toBe(30_000);
    expect(fullRetryDelayMs(() => 0.999999)).toBeLessThanOrEqual(FULL_RETRY_MAX_MS);
    for (let i = 0; i < 100; i++) {
      const wait = fullRetryDelayMs();
      expect(wait).toBeGreaterThanOrEqual(FULL_RETRY_MIN_MS);
      expect(wait).toBeLessThanOrEqual(FULL_RETRY_MAX_MS);
    }
  });

  it('shows the full state, reconnects after the wait and keeps retrying until placed', () => {
    const connect = vi.fn();
    const setFull = vi.fn();
    const retry = createFullRetry({ connect, setFull, random: () => 0 });
    retry.onFull();
    expect(setFull).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(FULL_RETRY_MIN_MS - 1);
    expect(connect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(connect).toHaveBeenCalledTimes(1);
    // Still full: another event, another wait; the state never flickers off.
    retry.onFull();
    vi.advanceTimersByTime(FULL_RETRY_MIN_MS);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(setFull).not.toHaveBeenCalledWith(false);
    retry.onPlaced();
    expect(setFull).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(FULL_RETRY_MAX_MS * 2);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('stops retrying when the game no longer wants a connection', () => {
    const connect = vi.fn();
    const retry = createFullRetry({ connect, setFull: vi.fn() });
    retry.onFull();
    retry.cancel();
    vi.advanceTimersByTime(FULL_RETRY_MAX_MS * 2);
    expect(connect).not.toHaveBeenCalled();
  });
});
