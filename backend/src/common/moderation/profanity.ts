/**
 * The short list of slurs, swear words and scam bait that player text may not carry (chat masks them; things shown in
 * bold to a whole room, like DJ shoutouts, are refused). Shared by the chat and social modules.
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

/** Replace every blocked word with asterisks of the same length. */
export function maskProfanity(text: string): string {
  let masked = text;
  for (const pattern of BLOCKED_PATTERNS) masked = masked.replace(pattern, (match) => '*'.repeat(match.length));
  return masked;
}

export function containsProfanity(text: string): boolean {
  return maskProfanity(text) !== text;
}
