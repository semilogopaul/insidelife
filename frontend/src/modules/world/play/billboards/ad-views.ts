import { AD_VIEW_BATCH_MAX, AD_VIEW_DEDUPE_GAME_MINUTES, AD_VIEW_DWELL_MS, AD_VIEW_MAX_AGE_MS, type AdViewReport } from '@insidelife/shared';

/**
 * Client side of ad views (rules in shared `catalog/ad-views.ts`). A surface decides when a running ad was *seen* — a
 * board: the player within range, on the printed side, the face on screen for `AD_VIEW_DWELL_MS`; a TV: the ad on a
 * screen in view for the same moment — and the queue reports it once per campaign per game hour, in batches of at most
 * `AD_VIEW_BATCH_MAX`, at most every `flushIntervalMs`. `seenAt` is the server clock when the view completed; views the
 * server would refuse as stale are dropped instead of sent.
 */

export interface AdViewOptions {
  readonly dwellMs: number;
  readonly flushIntervalMs: number;
  readonly maxBatch: number;
  readonly dedupeGameMinutes: number;
  /** Server-clock age after which a queued view is no longer worth sending. */
  readonly maxAgeMs: number;
}

export const DEFAULT_AD_VIEW_OPTIONS: AdViewOptions = {
  dwellMs: AD_VIEW_DWELL_MS,
  flushIntervalMs: 20_000,
  maxBatch: AD_VIEW_BATCH_MAX,
  dedupeGameMinutes: AD_VIEW_DEDUPE_GAME_MINUTES,
  maxAgeMs: AD_VIEW_MAX_AGE_MS,
};

/** When an observation happened: the server clock (for `seenAt`) and the game minute (for the hourly de-duplication). */
export interface AdViewClock {
  readonly serverNow: number;
  readonly gameMinute: number;
}

export class AdViewTracker {
  private readonly options: AdViewOptions;
  /** Per surface (slot id, or a TV): the campaign being watched and for how long (ms). */
  private readonly watching = new Map<string, { campaignId: string | null; dwell: number; counted: boolean }>();
  private readonly pending: AdViewReport[] = [];
  /** Campaign → the game-hour bucket it was last counted in. */
  private readonly countedIn = new Map<string, number>();
  private lastFlush = Number.NEGATIVE_INFINITY;

  constructor(options: Partial<AdViewOptions> = {}) {
    this.options = { ...DEFAULT_AD_VIEW_OPTIONS, ...options };
  }

  /**
   * Report a surface for the elapsed `dtMs`: whether its ad was in view and which paid campaign it shows (null for house
   * ads and channel cards). A view is recorded the moment the campaign has been in view for the dwell time, continuously.
   * Returns true when this observation recorded a view.
   */
  observe(slotId: string, campaignId: string | null, inView: boolean, dtMs: number, clock: AdViewClock): boolean {
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
      return false;
    }
    entry.dwell += dtMs;
    if (entry.counted || entry.dwell < this.options.dwellMs) return false;
    entry.counted = true;
    return this.record({ slotId, campaignId, seenAt: Math.round(clock.serverNow) }, clock.gameMinute);
  }

  /** Record a view directly (surfaces with their own "seen" rule). False when the campaign was already counted this game hour. */
  record(view: AdViewReport, gameMinute: number): boolean {
    const bucket = Math.floor(gameMinute / this.options.dedupeGameMinutes);
    if (this.countedIn.get(view.campaignId) === bucket) return false;
    this.countedIn.set(view.campaignId, bucket);
    this.pending.push(view);
    return true;
  }

  /**
   * Views to send now (at most every `flushIntervalMs` unless `force`, e.g. when leaving the place; ≤ `maxBatch`), or
   * null. Stale views are dropped.
   */
  takeBatch(nowMs: number, serverNow: number, force = false): AdViewReport[] | null {
    this.dropStale(serverNow);
    if (this.pending.length === 0 || (!force && nowMs - this.lastFlush < this.options.flushIntervalMs)) return null;
    this.lastFlush = nowMs;
    return this.pending.splice(0, this.options.maxBatch);
  }

  /** Put a failed batch back so the next flush retries it (they stay counted for their hour). */
  restore(batch: readonly AdViewReport[]): void {
    for (const view of batch) if (!this.pending.some((other) => other.campaignId === view.campaignId && other.seenAt === view.seenAt)) this.pending.push(view);
  }

  get queued(): number {
    return this.pending.length;
  }

  private dropStale(serverNow: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) if (serverNow - (this.pending[i] as AdViewReport).seenAt > this.options.maxAgeMs) this.pending.splice(i, 1);
  }
}
