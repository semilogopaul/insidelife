import { maskProfanity } from '../../common/moderation/profanity.js';

/**
 * Lightweight chat hygiene: trims, collapses whitespace, strips control characters and masks a short list of slurs
 * and scam bait (`common/moderation/profanity.ts`). Real moderation (reports, mutes) sits on top of this.
 */

// Strips C0/C1 control characters, zero-width characters and bidi overrides (Trojan Source) from chat.
// oxlint-disable-next-line eslint/no-control-regex -- matching control characters is the point here
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g;

export const MAX_CHAT_LENGTH = 280;

/** Control characters out, whitespace collapsed, trimmed (no length cap, no masking). */
export function normaliseChatText(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
}

export function sanitiseChat(raw: string): string {
  return maskProfanity(normaliseChatText(raw).slice(0, MAX_CHAT_LENGTH));
}
