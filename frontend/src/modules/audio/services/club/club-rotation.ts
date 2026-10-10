import { api } from '@/common/api/http';
import type { ScheduledClubTrack } from '../../types/audio';

/**
 * The club schedule (`GET /promotions/club-schedule?venueId=`): the paid songs that play in this club and exactly when
 * (server clock). The server publishes it from the shared schedule, so what plays here is what the artist's Promote
 * app says and what the server counts. Parsing is defensive: anything malformed or unsafe is dropped.
 */

const MAX_PLAYS = 24;
const MAX_DURATION_SEC = 600;

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (record: UnknownRecord, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const finite = (record: UnknownRecord, key: string): number | null => {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : null;
};

/** Only http(s) on any origin, or same-origin paths. Rejects javascript:, data:, blob: etc. */
export function safeMediaUrl(raw: string, origin: string): string | null {
  try {
    const url = new URL(raw, origin);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    // Never downgrade an https page to http media (mixed content would be blocked anyway).
    if (url.protocol === 'http:' && origin.startsWith('https:') && url.origin !== origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

export interface ClubSchedule {
  readonly venueId: string;
  readonly plays: readonly ScheduledClubTrack[];
  /** Ask again before this (server clock, ms). */
  readonly untilMs: number;
}

/** A schedule response, cleaned: plays for this club, in time order, with safe media URLs and sane durations. */
export function parseClubSchedule(payload: unknown, venueId: string, origin: string): ClubSchedule | null {
  if (!isRecord(payload) || !Array.isArray(payload.plays)) return null;
  const untilMs = finite(payload, 'untilMs');
  if (untilMs === null) return null;
  const plays: ScheduledClubTrack[] = [];
  const seen = new Set<number>();
  for (const item of payload.plays) {
    if (!isRecord(item)) continue;
    const slotIndex = finite(item, 'slotIndex');
    const startsAtMs = finite(item, 'startsAtMs');
    const durationSeconds = finite(item, 'durationSeconds');
    const trackId = text(item, 'trackId');
    const rawUrl = text(item, 'audioUrl');
    const url = rawUrl ? safeMediaUrl(rawUrl, origin) : null;
    if (slotIndex === null || startsAtMs === null || durationSeconds === null || durationSeconds <= 0 || !trackId || !url || seen.has(slotIndex)) continue;
    if ((text(item, 'venueId') ?? venueId) !== venueId) continue;
    seen.add(slotIndex);
    plays.push({
      slotIndex,
      startsAtMs,
      trackId,
      url,
      artist: (text(item, 'artistName') ?? 'Unknown artist').slice(0, 80),
      title: (text(item, 'title') ?? 'Untitled').slice(0, 120),
      durationSeconds: Math.min(durationSeconds, MAX_DURATION_SEC),
    });
    if (plays.length >= MAX_PLAYS) break;
  }
  return { venueId, untilMs, plays: plays.toSorted((a, b) => a.startsAtMs - b.startsAtMs) };
}

/** Tolerates 404/empty/offline: a failure is null (the DJ keeps game music and asks again later). */
export async function fetchClubSchedule(venueId: string, signal?: AbortSignal): Promise<ClubSchedule | null> {
  try {
    const payload = await api.get<unknown>('/promotions/club-schedule', { query: { venueId }, signal, anonymous: true });
    return parseClubSchedule(payload, venueId, window.location.origin);
  } catch {
    return null;
  }
}

/** The play that should be sounding at `nowMs` (started, and more than `tailMs` from its end), if any. */
export function playAt(plays: readonly ScheduledClubTrack[], nowMs: number, tailMs = 1_500): ScheduledClubTrack | null {
  return plays.find((play) => play.startsAtMs <= nowMs && nowMs < play.startsAtMs + play.durationSeconds * 1000 - tailMs) ?? null;
}

/** The next play to start after `nowMs`, if any. */
export function nextPlayAfter(plays: readonly ScheduledClubTrack[], nowMs: number): ScheduledClubTrack | null {
  return plays.find((play) => play.startsAtMs > nowMs) ?? null;
}
