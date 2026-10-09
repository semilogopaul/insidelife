import type { NightOutDto, NightOutRequest, NightOutResultDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

const venuePath = (venueId: string): string => `/venues/${encodeURIComponent(venueId)}`;

/** Club nights (shared: Gist's Night out panel buys, the HUD banner and the 3D room read what's playing). */
export const nightOutApi = {
  view: (venueId: string) => api.get<NightOutDto>(`${venuePath(venueId)}/night-out`),
  buy: (venueId: string, body: NightOutRequest) => api.post<NightOutResultDto>(`${venuePath(venueId)}/moments`, body),
};
