import { createHmac, timingSafeEqual } from 'node:crypto';
import { CHAT_VOICE_MAX_SECONDS, type ChatMediaKind, type ChatVoiceType } from '@insidelife/shared';
import type { MediaExtension } from '../../../common/storage/storage.service.js';

/** The recorder stops a few frames after the client's 90-second timer. */
export const VOICE_TOLERANCE_MS = 1_500;
export const VOICE_MIN_MS = 500;
/** Voice notes and photos each, per sender per (real) day. */
export const MEDIA_DAILY_LIMIT = 60;
/** Signed links last a few hours and are rounded to the hour so refetches reuse the browser cache. */
export const MEDIA_LINK_TTL_MS = 6 * 3_600_000;

export const VOICE_EXTENSION: Readonly<Record<ChatVoiceType, MediaExtension>> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
};

export function voiceLengthProblem(durationMs: number | null): string | null {
  if (durationMs === null || !Number.isFinite(durationMs))
    return 'We couldn’t read that voice note. Record it again';
  if (durationMs < VOICE_MIN_MS) return 'That voice note is too short';
  if (durationMs > CHAT_VOICE_MAX_SECONDS * 1000 + VOICE_TOLERANCE_MS)
    return `Voice notes can be at most ${formatVoiceDuration(CHAT_VOICE_MAX_SECONDS * 1000)} long`;
  return null;
}

export function formatVoiceDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** What the DM list shows for a voice note or photo. */
export function mediaPreview(kind: ChatMediaKind, durationMs: number | null): string {
  return kind === 'voice' ? `Voice note ${formatVoiceDuration(durationMs ?? 0)}` : 'Photo';
}

/** Expiry for a link minted at `now`: at least the TTL, rounded up to the next hour. */
export function linkExpiry(now: number): number {
  return Math.ceil((now + MEDIA_LINK_TTL_MS) / 3_600_000) * 3_600_000;
}

export function signMediaLink(secret: string, messageId: string, expiresAt: number): string {
  return createHmac('sha256', secret).update(`chat-media:${messageId}:${expiresAt}`).digest('base64url');
}

export function verifyMediaLink(
  secret: string,
  messageId: string,
  expiresAt: number,
  signature: string,
  now: number,
): boolean {
  if (!Number.isSafeInteger(expiresAt) || expiresAt < now) return false;
  const expected = Buffer.from(signMediaLink(secret, messageId, expiresAt));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
