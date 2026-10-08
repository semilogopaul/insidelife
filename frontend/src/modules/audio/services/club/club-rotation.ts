import { api } from '@/common/api/http';
import type { ClubTrack } from '../../types/audio';

/**
 * Club rotation API (`GET /promotions/club-rotation?venueId=`) — approved, player-paid tracks to interleave with
 * the club's house groove. The contract may still move, so parsing is defensive: it accepts a bare array,
 * `{ tracks }` or `{ items }`, and either naming (`audioUrl`/`url`, `artistName`/`artist`, `trackId`/`id`).
 */

const MAX_TRACKS = 24;
const FALLBACK_DURATION_SEC = 180;

type UnknownRecord = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

const firstString = (record: UnknownRecord, keys: readonly string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
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

export function parseClubRotation(payload: unknown, origin: string): ClubTrack[] {
  const list: unknown = Array.isArray(payload)
    ? payload
    : isRecord(payload)
      ? (payload.tracks ?? payload.items ?? (isRecord(payload.data) ? (payload.data.tracks ?? payload.data.items) : undefined))
      : undefined;
  if (!Array.isArray(list)) return [];
  const tracks: ClubTrack[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!isRecord(item)) continue;
    const trackId = firstString(item, ['trackId', 'id']);
    const rawUrl = firstString(item, ['audioUrl', 'url', 'src']);
    const url = rawUrl ? safeMediaUrl(rawUrl, origin) : null;
    if (!trackId || !url || seen.has(trackId)) continue;
    seen.add(trackId);
    const duration = Number(item.durationSeconds ?? item.duration);
    tracks.push({
      trackId,
      url,
      artist: (firstString(item, ['artistName', 'artist']) ?? 'Unknown artist').slice(0, 80),
      title: (firstString(item, ['title', 'name']) ?? 'Untitled').slice(0, 120),
      durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.min(duration, 600) : FALLBACK_DURATION_SEC,
    });
    if (tracks.length >= MAX_TRACKS) break;
  }
  return tracks;
}

/** Tolerates 404/empty/offline: any failure is "no paid tracks right now". */
export async function fetchClubRotation(venueId: string, signal?: AbortSignal): Promise<ClubTrack[]> {
  try {
    const payload = await api.get<unknown>('/promotions/club-rotation', { query: { venueId }, signal });
    return parseClubRotation(payload, window.location.origin);
  } catch {
    return [];
  }
}

/** `POST /promotions/plays` once per play (after ≥ 30 s). Fire-and-forget; failures are ignored. */
export function reportClubPlay(trackId: string, venueId: string): void {
  void api.post<void>('/promotions/plays', { trackId, venueId }).catch(() => undefined);
}

/** Seconds of playback after which a paid play counts (contract: "played ≥ 30 s in a club"). */
export const PLAY_REPORT_AFTER_SEC = 30;
