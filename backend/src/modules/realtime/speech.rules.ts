import { SPEECH_MAX_LENGTH } from '@insidelife/shared';
import { containsContactNumber, containsLink } from '../../common/moderation/contact-details.js';
import { maskProfanity } from '../../common/moderation/profanity.js';
import { normaliseChatText } from './chat-moderation.js';

/**
 * Speech bubbles: what a player may say out loud to the people around them, and how often. Pure; the service applies
 * them (and the Redis copy of the rate limit below).
 */

export type SpeechCheck =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** Anything this long is refused before it's even cleaned (the client caps input at SPEECH_MAX_LENGTH). */
const RAW_LIMIT = SPEECH_MAX_LENGTH * 4;

const refuse = (code: string, message: string): SpeechCheck => ({ ok: false, code, message });

/**
 * Clean a line and decide whether it can go over your head: control characters out, whitespace collapsed, at most
 * SPEECH_MAX_LENGTH characters, no links and no phone or account numbers (refused: strangers read bubbles), swear
 * words masked like chat.
 */
export function checkSpeech(raw: unknown): SpeechCheck {
  if (typeof raw !== 'string' || raw.length > RAW_LIMIT) {
    return typeof raw === 'string' ? refuse('SPEECH_TOO_LONG', `Keep it to ${SPEECH_MAX_LENGTH} characters or fewer`) : refuse('EMPTY_MESSAGE', 'Type something first');
  }
  const text = normaliseChatText(raw);
  if (!text) return refuse('EMPTY_MESSAGE', 'Type something first');
  if (text.length > SPEECH_MAX_LENGTH) return refuse('SPEECH_TOO_LONG', `Keep it to ${SPEECH_MAX_LENGTH} characters or fewer`);
  if (containsLink(text)) return refuse('SPEECH_LINK', 'Links can’t go in a speech bubble');
  if (containsContactNumber(text)) return refuse('SPEECH_NUMBER', 'Keep phone and account numbers to yourself — strangers can read bubbles');
  return { ok: true, text: maskProfanity(text) };
}

/** One line every `intervalMs`, with up to `burst` back to back. */
export interface SpeechRate {
  readonly intervalMs: number;
  readonly burst: number;
}

export const SPEECH_RATE: SpeechRate = { intervalMs: 2_000, burst: 5 };

export type SpeechSlot = { readonly allowed: true; readonly tat: number } | { readonly allowed: false; readonly retryInMs: number };

/**
 * The rate limit as GCRA (a token bucket kept as one timestamp, the "theoretical arrival time" of the next line):
 * `burst` lines straight away, then one per `intervalMs`. Returns the new timestamp to store, or how long to wait.
 * `SpeechService` runs the same arithmetic atomically in Redis.
 */
export function nextSpeechSlot(tat: number | null, now: number, rate: SpeechRate = SPEECH_RATE): SpeechSlot {
  const start = Math.max(tat ?? now, now);
  const tolerance = rate.intervalMs * (rate.burst - 1);
  if (start - now > tolerance) return { allowed: false, retryInMs: start - now - tolerance };
  return { allowed: true, tat: start + rate.intervalMs };
}

/** `nextSpeechSlot` in Redis (KEYS[1] = the speaker's timestamp; ARGV = now, interval, tolerance). 0 = allowed. */
export const SPEECH_SLOT_SCRIPT = `
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local tolerance = tonumber(ARGV[3])
local tat = tonumber(redis.call('GET', KEYS[1]) or '0')
if tat < now then tat = now end
if tat - now > tolerance then return tat - now - tolerance end
redis.call('SET', KEYS[1], tat + interval, 'PX', tat + interval - now)
return 0
`;
