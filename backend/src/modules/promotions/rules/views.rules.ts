import {
  AD_VIEW_MAX_AGE_MS,
  AD_VIEW_RADIUS_METRES,
  MAX_PLAUSIBLE_SPEED,
  adGroundDistance,
  distanceToPolyline,
  type AdSpotGeometry,
  type AdSurface,
  type WorldPoint,
} from '@insidelife/shared';
import type { PlayerFix } from '../../../common/ports/player-position.port.js';

/** Metres of slack for network jitter, spawn snapping and the size of a board. */
export const VIEW_SLACK_METRES = 25;
/** A `seenAt` this far in the future (clock skew) still counts. */
const FUTURE_SKEW_MS = 5_000;
/** Views a player can report a real minute; the rest are dropped (a script can't flood the counts). */
export const VIEW_REPORTS_PER_MINUTE = 60;

const isStreetLocation = (locationId: string): boolean => locationId.startsWith('street:');

/** What the server knows about the viewer when the view arrives. */
export interface ViewerState {
  /** Character location: a venue id, `home:<id>` or `street:<district>`. */
  readonly locationId: string;
  /** On a booked ride right now. */
  readonly riding: boolean;
  /** Last accepted open-world position (null when not out in the city). */
  readonly fix: PlayerFix | null;
  /** The ride's route when riding (null when unknown). */
  readonly ride: readonly WorldPoint[] | null;
}

export type ViewVerdict = 'count' | 'stale' | 'too-far' | 'not-there';

/**
 * Could this player really have seen this ad when they say they did? Physical boards: their last accepted position must
 * be within the view radius plus how far they could have moved between that fix and the view (at the fastest plausible
 * speed for how they were moving), or the board must sit along the ride they're on. Lagos TV: they must be indoors (a
 * home or a venue). Phone apps: any signed-in player with a living character (the app is on everyone's phone).
 */
export function judgeView(input: {
  readonly surface: AdSurface;
  readonly spot: AdSpotGeometry | null;
  readonly seenAt: number;
  readonly now: number;
  readonly viewer: ViewerState;
}): ViewVerdict {
  const { surface, spot, seenAt, now, viewer } = input;
  if (!Number.isFinite(seenAt) || seenAt > now + FUTURE_SKEW_MS || seenAt < now - AD_VIEW_MAX_AGE_MS) return 'stale';
  switch (surface) {
    case 'phone':
      return 'count';
    case 'tv':
      return !viewer.riding && viewer.locationId.length > 0 && !isStreetLocation(viewer.locationId) ? 'count' : 'not-there';
    case 'street': {
      if (!spot) return 'not-there';
      if (viewer.fix) {
        const seconds = Math.abs(seenAt - viewer.fix.at) / 1000;
        const reach = AD_VIEW_RADIUS_METRES + MAX_PLAUSIBLE_SPEED[viewer.fix.mode] * seconds + VIEW_SLACK_METRES;
        if (adGroundDistance(spot, viewer.fix) <= reach) return 'count';
        if (!viewer.riding) return 'too-far';
      }
      if (viewer.riding && viewer.ride) return distanceToPolyline(spot.position, viewer.ride) <= AD_VIEW_RADIUS_METRES + VIEW_SLACK_METRES ? 'count' : 'too-far';
      return 'not-there';
    }
  }
}

/** How many of `reported` views fit under the per-minute cap, given `before` already reported this minute. */
export function viewsAllowed(before: number, reported: number, limit: number = VIEW_REPORTS_PER_MINUTE): number {
  return Math.max(0, Math.min(reported, limit - before));
}
