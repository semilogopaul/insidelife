/**
 * Lightweight chat hygiene: trims, collapses whitespace, strips control characters and masks a short list of slurs
 * and scam bait. Real moderation (reports, mutes) sits on top of this.
 */
const BLOCKED_PATTERNS: readonly RegExp[] = [
  /\bf+u+c+k+\w*/gi,
  /\bs+h+i+t+\w*/gi,
  /\bb+i+t+c+h+\w*/gi,
  /\bmumu\b/gi,
  /\bod[eo]\b/gi,
  /\bash[ae]wo\b/gi,
  /\bdouble\s+your\s+money\b/gi,
];

// Strips C0/C1 control characters, zero-width characters and bidi overrides (Trojan Source) from chat.
// oxlint-disable-next-line eslint/no-control-regex -- matching control characters is the point here
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

export const MAX_CHAT_LENGTH = 280;

export function sanitiseChat(raw: string): string {
  let body = raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
  for (const pattern of BLOCKED_PATTERNS) body = body.replace(pattern, (match) => '*'.repeat(match.length));
  return body;
}
