import type { ClickTargetDto, TrackViewsRequest } from '@insidelife/shared';
import { api } from '@/common/api/http';

/**
 * Ad views and links (public endpoints; signed-in players are attributed by the server). Views follow the rules in
 * shared `catalog/ad-views.ts`; the server re-checks each one against where it last saw the player.
 */
export const adTrackingApi = {
  views: (body: TrackViewsRequest) => api.post<void>('/promotions/views', body),
  /** The advertiser's (validated) link, opened behind the "You're leaving Inside Life" screen. */
  click: (campaignId: string) => api.post<ClickTargetDto>('/promotions/clicks', { campaignId }),
};

/** Only plain web links leave the game. */
export function safeExternalUrl(url: string, base: string): URL | null {
  try {
    const parsed = new URL(url, base);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null;
  } catch {
    return null;
  }
}
