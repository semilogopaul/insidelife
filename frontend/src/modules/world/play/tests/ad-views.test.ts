import { AD_VIEW_BATCH_MAX, AD_VIEW_DEDUPE_GAME_MINUTES, AD_VIEW_DWELL_MS, AD_VIEW_MAX_AGE_MS } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { AdViewTracker } from '../billboards/ad-views';

/** Server clock and game minute for an observation (game minute 600 = 10:00 on day 0). */
const at = (serverNow: number, gameMinute = 600) => ({ serverNow, gameMinute });

describe('ad view tracking', () => {
  it('records a creative after a continuous dwell in view, once, stamped when the dwell completed', () => {
    const tracker = new AdViewTracker();
    expect(tracker.observe('tmb', 'c1', true, 600, at(1_000))).toBe(false);
    tracker.observe('tmb', 'c1', false, 250, at(1_250));
    tracker.observe('tmb', 'c1', true, 600, at(1_850));
    expect(tracker.queued).toBe(0);
    expect(tracker.observe('tmb', 'c1', true, AD_VIEW_DWELL_MS - 600, at(2_250))).toBe(true);
    expect(tracker.queued).toBe(1);
    tracker.observe('tmb', 'c1', true, 5_000, at(7_250));
    expect(tracker.takeBatch(0, 7_250)).toEqual([{ slotId: 'tmb', campaignId: 'c1', seenAt: 2_250 }]);
  });

  it('ignores house ads and starts over when the creative rotates', () => {
    const tracker = new AdViewTracker();
    tracker.observe('toll', null, true, 5_000, at(0));
    expect(tracker.queued).toBe(0);
    tracker.observe('toll', 'a', true, 800, at(800));
    tracker.observe('toll', 'b', true, 800, at(1_600));
    expect(tracker.queued).toBe(0);
    tracker.observe('toll', 'b', true, 300, at(1_900));
    expect(tracker.takeBatch(0, 1_900)?.map((view) => view.campaignId)).toEqual(['b']);
  });

  it('counts a campaign once per game hour, wherever it is seen', () => {
    const tracker = new AdViewTracker();
    const hour = AD_VIEW_DEDUPE_GAME_MINUTES;
    expect(tracker.observe('board-a', 'c0', true, AD_VIEW_DWELL_MS, at(0, 10 * hour + 5))).toBe(true);
    // Same campaign on another board, same game hour: not counted again.
    expect(tracker.observe('board-b', 'c0', true, AD_VIEW_DWELL_MS, at(10_000, 10 * hour + 50))).toBe(false);
    // Next game hour: counts again.
    tracker.observe('board-b', 'c0', false, 250, at(11_000, 11 * hour));
    expect(tracker.observe('board-b', 'c0', true, AD_VIEW_DWELL_MS, at(12_000, 11 * hour + 1))).toBe(true);
    expect(tracker.queued).toBe(2);
    expect(tracker.record({ slotId: 'lagos-tv', campaignId: 'c0', seenAt: 13_000 }, 11 * hour + 30)).toBe(false);
  });

  it(`flushes at most every 20 s, in batches of ≤ ${AD_VIEW_BATCH_MAX}`, () => {
    const tracker = new AdViewTracker();
    for (let i = 0; i < AD_VIEW_BATCH_MAX + 8; i++) tracker.observe(`slot${i}`, `c${i}`, true, AD_VIEW_DWELL_MS, at(0));
    expect(tracker.takeBatch(0, 0)).toHaveLength(AD_VIEW_BATCH_MAX);
    expect(tracker.takeBatch(10_000, 10_000)).toBeNull();
    expect(tracker.takeBatch(20_000, 20_000)).toHaveLength(8);
  });

  it('puts a failed batch back for the next flush and drops views the server would call stale', () => {
    const tracker = new AdViewTracker();
    tracker.observe('s', 'x', true, AD_VIEW_DWELL_MS, at(0));
    const batch = tracker.takeBatch(0, 0)!;
    tracker.restore(batch);
    tracker.restore(batch);
    expect(tracker.takeBatch(20_000, 20_000)).toEqual([{ slotId: 's', campaignId: 'x', seenAt: 0 }]);
    tracker.restore(batch);
    expect(tracker.takeBatch(40_000, AD_VIEW_MAX_AGE_MS + 1)).toBeNull();
    expect(tracker.queued).toBe(0);
  });
});
