import { createHmac } from 'node:crypto';

/**
 * Count each viewer at most once per item per real hour (impressions, clicks, plays). Viewers are reduced to an
 * hour-scoped keyed hash before they reach Redis, so the store holds no user ids and nothing links across hours.
 */

export const TRACKING_KINDS = ['impression', 'view', 'click', 'play'] as const;
export type TrackingKind = (typeof TRACKING_KINDS)[number];

const HOUR_MS = 3_600_000;

/** Minimal set-membership store (Redis SADD + EXPIRE in production, a Map in tests). */
export interface DedupeStore {
  /** Add `member` to each key's set; resolves, per entry, whether the member was new. Keys expire after `ttlSeconds`. */
  addMembers(entries: ReadonlyArray<{ readonly key: string; readonly member: string }>, ttlSeconds: number): Promise<boolean[]>;
}

export function hourIndex(nowMs: number): number {
  return Math.floor(nowMs / HOUR_MS);
}

/** Seconds until the end of the current hour plus a minute of slack for clock skew between instances. */
export function secondsLeftInHour(nowMs: number): number {
  return Math.ceil((HOUR_MS - (nowMs % HOUR_MS)) / 1000) + 60;
}

export class ViewDeduper {
  constructor(
    private readonly store: DedupeStore,
    private readonly secret: string,
  ) {}

  /** Opaque, hour-scoped viewer token (64 bits is plenty for de-duplication within one item and hour). */
  viewerToken(viewerId: string, hour: number): string {
    return createHmac('sha256', this.secret).update(`promotions:${hour}:${viewerId}`).digest('base64url').slice(0, 11);
  }

  /** The subset of `subjectIds` this viewer had not been counted for in the current hour (input order, no repeats). */
  async firstSeen(kind: TrackingKind, viewerId: string, subjectIds: readonly string[], nowMs: number = Date.now()): Promise<string[]> {
    return this.firstSeenIn(kind, viewerId, subjectIds, { index: hourIndex(nowMs), ttlSeconds: secondsLeftInHour(nowMs) });
  }

  /**
   * The same within any bucket (e.g. a game hour: `index` = game minute / 60): keys expire after `ttlSeconds`, which
   * must cover the rest of the bucket.
   */
  async firstSeenIn(kind: TrackingKind, viewerId: string, subjectIds: readonly string[], bucket: { readonly index: number; readonly ttlSeconds: number }): Promise<string[]> {
    const unique = [...new Set(subjectIds)];
    if (unique.length === 0) return [];
    const member = this.viewerToken(viewerId, bucket.index);
    const added = await this.store.addMembers(
      unique.map((id) => ({ key: `promo:${kind}:${bucket.index}:${id}`, member })),
      bucket.ttlSeconds,
    );
    return unique.filter((_, index) => added[index] === true);
  }
}

/**
 * Stable, opaque id of one character for one promotion (unique viewers and listeners): keyed, so it can't be reversed,
 * and salted with the subject, so the same player can't be linked across promotions.
 */
export function audienceHash(secret: string, subjectId: string, characterId: string): string {
  return createHmac('sha256', secret).update(`audience:${subjectId}:${characterId}`).digest('base64url').slice(0, 22);
}
