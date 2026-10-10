import type { VenueDefinition } from '@insidelife/shared';

/** "Your song is on now" at most this often per order (the first play of a run is always announced). */
export const PLAY_NOTICE_EVERY_MS = 30 * 60_000;
/** Only plays that started this recently are announced (a sweep catching up after downtime stays quiet). */
export const PLAY_NOTICE_FRESH_MS = 90_000;

export interface PlayNoticeInput {
  /** The order's first recorded play. */
  readonly firstPlay: boolean;
  readonly startedAt: number;
  readonly now: number;
  readonly lastNoticeAt: number | null;
  readonly ownerOnline: boolean;
  /** The owner's character could get through this club's door (age, clout). */
  readonly canEnter: boolean;
}

/**
 * Should the artist hear about this play? The first play of a run always (so they know it started); after that only
 * while they're online, at a club they can get into, at most every half hour, and only for a play that just started.
 */
export function shouldAnnouncePlay(input: PlayNoticeInput): boolean {
  if (input.now - input.startedAt > PLAY_NOTICE_FRESH_MS) return false;
  if (input.firstPlay) return true;
  if (!input.ownerOnline || !input.canEnter) return false;
  return input.lastNoticeAt === null || input.now - input.lastNoticeAt >= PLAY_NOTICE_EVERY_MS;
}

/** Whether a character can get past this venue's door (clout gates). */
export function canEnterVenue(venue: Pick<VenueDefinition, 'minStatus'> | undefined, status: number): boolean {
  return venue !== undefined && status >= (venue.minStatus ?? 0);
}
