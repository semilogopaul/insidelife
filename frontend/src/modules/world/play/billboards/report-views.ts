import { ApiError } from '@/common/api/api-error';
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

/**
 * Sends the views that are due (`force`: everything queued, e.g. on leaving). A network or server failure puts them
 * back for the next flush; a batch the server refuses as invalid (4xx) is dropped, so it can't be retried forever.
 */
export function flushWorldAdViews(force = false): void {
  const batch = worldAdViews.takeBatch(Date.now(), gameClock.serverNow(), force);
  if (!batch) return;
  adTrackingApi.views({ views: batch }).catch((error: unknown) => {
    const refused = error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429;
    if (!refused) worldAdViews.restore(batch);
  });
}
