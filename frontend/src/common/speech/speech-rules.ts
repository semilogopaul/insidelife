import { isStreetLocation, type ChatSaidDto } from '@insidelife/shared';

/** Bubbles stay up at least this long, longer for longer lines, never more than the max. */
export const BUBBLE_MIN_MS = 6_000;
export const BUBBLE_MAX_MS = 10_000;
const BUBBLE_MS_PER_CHAR = 40;

/** The Nearby log keeps this many lines, for this long. */
export const NEARBY_MAX_LINES = 30;
export const NEARBY_KEEP_MS = 10 * 60_000;
/** The transient feed (Talk closed) shows lines this fresh, at most this many. */
export const FEED_MS = 12_000;
export const FEED_MAX_LINES = 3;

/** How long a line's bubble stays over the speaker's head (6–10 s; longer lines a bit longer). */
export function bubbleDurationMs(text: string): number {
  return Math.min(BUBBLE_MAX_MS, Math.max(BUBBLE_MIN_MS, BUBBLE_MIN_MS + text.length * BUBBLE_MS_PER_CHAR - 1_200));
}

/** Where the player is, as far as hearing goes. */
export interface Earshot {
  /** Venue id, `home:<id>` or `street:<district>`; null before the snapshot loads. */
  readonly locationId: string | null;
  /** On the street or riding through the city. */
  readonly outside: boolean;
}

export function earshotOf(locationId: string | null, travelling: boolean): Earshot {
  return { locationId, outside: travelling || (locationId !== null && isStreetLocation(locationId)) };
}

/**
 * Whether a line belongs on this player's screen. The server already picked the audience; this drops what arrives
 * after you've moved on (a street line once you're indoors: your socket keeps its last street cells for a while).
 * Your own lines always show.
 */
export function audible(line: Pick<ChatSaidDto, 'scope' | 'locationId' | 'characterId'>, here: Earshot, selfId: string | null): boolean {
  if (selfId !== null && line.characterId === selfId) return true;
  if (here.locationId === null) return false;
  return line.scope === 'street' ? here.outside : !here.outside && line.locationId === here.locationId;
}
