import type { ChatChannelKind } from '@insidelife/shared';

/** Lagos-wide chat. */
export const GLOBAL_CHANNEL = 'global';
/** The server trims messages to this length. */
export const CHAT_MAX_LENGTH = 280;

/** Direct-message channel between two characters: `dm:<a>:<b>` with the ids sorted (same for both sides). */
export function dmChannel(a: string, b: string): string {
  return `dm:${[a, b].sort().join(':')}`;
}

/** Chat for the venue you're inside. */
export function venueChannel(locationId: string): string {
  return `venue:${locationId}`;
}

export function channelKind(channel: string): ChatChannelKind | null {
  if (channel === GLOBAL_CHANNEL) return 'global';
  if (channel.startsWith('venue:') && channel.length > 'venue:'.length) return 'venue';
  if (/^dm:[^:]+:[^:]+$/.test(channel)) return 'dm';
  return null;
}

/** The other participant of a DM channel (null if `meId` isn't in it or it isn't a DM). */
export function dmPartnerId(channel: string, meId: string): string | null {
  if (channelKind(channel) !== 'dm') return null;
  const [, a, b] = channel.split(':');
  if (a === meId) return b ?? null;
  if (b === meId) return a ?? null;
  return null;
}

export type MessagePart = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'mention'; readonly handle: string };

const MENTION = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g;

/** Split a message into text and @mentions (handles are 3-20 letters, numbers or _). */
export function parseMentions(body: string): readonly MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION)) {
    const lead = match[1] ?? '';
    const start = (match.index ?? 0) + lead.length;
    if (start > last) parts.push({ kind: 'text', text: body.slice(last, start) });
    parts.push({ kind: 'mention', handle: (match[2] ?? '').toLowerCase() });
    last = start + 1 + (match[2]?.length ?? 0);
  }
  if (last < body.length) parts.push({ kind: 'text', text: body.slice(last) });
  return parts;
}

export function mentionsHandle(body: string, handle: string): boolean {
  const target = handle.toLowerCase();
  return parseMentions(body).some((part) => part.kind === 'mention' && part.handle === target);
}

/** The @mention being typed at the caret, for autocomplete: `{ query: 'tol', start: 6 }`. */
export function mentionAtCaret(text: string, caret: number): { readonly query: string; readonly start: number } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([A-Za-z0-9_]{0,20})$/.exec(before);
  if (!match) return null;
  return { query: (match[2] ?? '').toLowerCase(), start: caret - (match[2]?.length ?? 0) - 1 };
}

/** Replace the mention being typed with `@handle ` and return the new text and caret. */
export function completeMention(text: string, start: number, caret: number, handle: string): { readonly text: string; readonly caret: number } {
  const insert = `@${handle} `;
  return { text: `${text.slice(0, start)}${insert}${text.slice(caret)}`, caret: start + insert.length };
}
