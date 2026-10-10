import { gameClock } from '@/common/game/game-clock';
import { adTrackingApi } from '@/common/promotions/ad-tracking';
import { AdViewTracker } from './ad-views';

/**
 * The page's ad views from the 3D world (street boards outside, Lagos TV indoors). One tracker for the page, so walking
 * into a venue and out again (which remounts the world layers) never counts the same ad twice in a game hour.
 */
export const worldAdViews = new AdViewTracker();

/** The clock stamp for an observation right now. */
export const adViewClock = (): { readonly serverNow: number; readonly gameMinute: number } => ({ serverNow: gameClock.serverNow(), gameMinute: gameClock.now() });

/** Sends the views that are due (`force`: everything queued, e.g. on leaving), putting them back if the request fails. */
export function flushWorldAdViews(force = false): void {
  const batch = worldAdViews.takeBatch(Date.now(), gameClock.serverNow(), force);
  if (batch) adTrackingApi.views({ views: batch }).catch(() => worldAdViews.restore(batch));
}
