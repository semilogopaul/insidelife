import { describe, expect, it } from 'vitest';
import { ImpressionTracker } from '../billboards/impressions';

describe('billboard impression batching', () => {
  it('counts a creative after a continuous second in view, once', () => {
    const tracker = new ImpressionTracker();
    tracker.observe('tmb', 'c1', true, 600, 0);
    tracker.observe('tmb', 'c1', false, 250, 250);
    tracker.observe('tmb', 'c1', true, 600, 500);
    expect(tracker.queued).toBe(0);
    tracker.observe('tmb', 'c1', true, 500, 750);
    expect(tracker.queued).toBe(1);
    tracker.observe('tmb', 'c1', true, 5000, 1000);
    expect(tracker.queued).toBe(1);
  });

  it('ignores house ads and starts over when the creative rotates', () => {
    const tracker = new ImpressionTracker();
    tracker.observe('toll', null, true, 5000, 0);
    expect(tracker.queued).toBe(0);
    tracker.observe('toll', 'a', true, 800, 0);
    tracker.observe('toll', 'b', true, 800, 800);
    expect(tracker.queued).toBe(0);
    tracker.observe('toll', 'b', true, 300, 1100);
    expect(tracker.takeBatch(1100)).toEqual(['b']);
  });

  it('flushes at most every 20 s, in batches of ≤ 32, and skips campaigns already sent this hour', () => {
    const tracker = new ImpressionTracker();
    for (let i = 0; i < 40; i++) tracker.observe(`slot${i}`, `c${i}`, true, 1000, 0);
    const first = tracker.takeBatch(0);
    expect(first).toHaveLength(32);
    expect(tracker.takeBatch(10_000)).toBeNull();
    expect(tracker.takeBatch(20_000)).toHaveLength(8);
    // Seen again within the hour: not re-sent.
    tracker.observe('again', 'c0', true, 1000, 30_000);
    expect(tracker.queued).toBe(0);
    tracker.observe('later', 'c0', true, 1000, 3_700_000);
    expect(tracker.queued).toBe(1);
  });

  it('puts a failed batch back for the next flush', () => {
    const tracker = new ImpressionTracker();
    tracker.observe('s', 'x', true, 1000, 0);
    const batch = tracker.takeBatch(0)!;
    tracker.restore(batch);
    expect(tracker.takeBatch(20_000)).toEqual(['x']);
  });
});
