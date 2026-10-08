/**
 * Billboard impression batching. A paid creative counts once it has been on screen, within range, for a continuous
 * second; counted campaigns queue up and are flushed at most every 20 s (≤ 32 ids per request, the API's limit).
 * The server de-duplicates per viewer per hour, so the client also skips campaigns it already sent this hour.
 */

export interface ImpressionOptions {
  readonly dwellMs: number;
  readonly flushIntervalMs: number;
  readonly resendAfterMs: number;
  readonly maxBatch: number;
}

export const DEFAULT_IMPRESSION_OPTIONS: ImpressionOptions = { dwellMs: 1000, flushIntervalMs: 20_000, resendAfterMs: 60 * 60_000, maxBatch: 32 };

export class ImpressionTracker {
  private readonly options: ImpressionOptions;
  /** Per board: the campaign being watched and for how long (ms). */
  private readonly watching = new Map<string, { campaignId: string | null; dwell: number; counted: boolean }>();
  private readonly pending: string[] = [];
  private readonly sentAt = new Map<string, number>();
  private lastFlush = Number.NEGATIVE_INFINITY;

  constructor(options: Partial<ImpressionOptions> = {}) {
    this.options = { ...DEFAULT_IMPRESSION_OPTIONS, ...options };
  }

  /**
   * Report a board for the elapsed `dtMs`: whether it was in view (on screen, facing the viewer, within range) and
   * which paid campaign it shows (null for house ads).
   */
  observe(slotId: string, campaignId: string | null, inView: boolean, dtMs: number, nowMs: number): void {
    let entry = this.watching.get(slotId);
    if (!entry) {
      entry = { campaignId, dwell: 0, counted: false };
      this.watching.set(slotId, entry);
    }
    if (entry.campaignId !== campaignId) {
      entry.campaignId = campaignId;
      entry.dwell = 0;
      entry.counted = false;
    }
    if (!inView || !campaignId) {
      entry.dwell = 0;
      entry.counted = false;
      return;
    }
    entry.dwell += dtMs;
    if (entry.counted || entry.dwell < this.options.dwellMs) return;
    entry.counted = true;
    const sent = this.sentAt.get(campaignId);
    if (sent !== undefined && nowMs - sent < this.options.resendAfterMs) return;
    if (!this.pending.includes(campaignId)) this.pending.push(campaignId);
  }

  /** Campaign ids to send now (rate-limited), or null. Marks them as sent. */
  takeBatch(nowMs: number): string[] | null {
    if (this.pending.length === 0 || nowMs - this.lastFlush < this.options.flushIntervalMs) return null;
    const batch = this.pending.splice(0, this.options.maxBatch);
    for (const id of batch) this.sentAt.set(id, nowMs);
    this.lastFlush = nowMs;
    return batch;
  }

  /** Put a failed batch back so the next flush retries it. */
  restore(batch: readonly string[]): void {
    for (const id of batch) {
      this.sentAt.delete(id);
      if (!this.pending.includes(id)) this.pending.push(id);
    }
  }

  get queued(): number {
    return this.pending.length;
  }
}
