import type { ClickTargetDto, TrackImpressionsRequest } from '@insidelife/shared';
import { api } from '@/common/api/http';

/** Ad impressions and clicks (public endpoints; signed-in players are attributed by the server). */
export const adTrackingApi = {
  impressions: (body: TrackImpressionsRequest) => api.post<void>('/promotions/impressions', body),
  /** Records the click and returns the advertiser's (validated) link. */
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
