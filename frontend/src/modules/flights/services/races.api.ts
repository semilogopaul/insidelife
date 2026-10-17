import type { RaceResultDto, RacesOverviewDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { tapOnce } from '@/common/api/tap-once';

export const racesApi = {
  overview: () => api.get<RacesOverviewDto>('/races'),
  create: (friendIds: readonly string[]) =>
    tapOnce(`race:${friendIds.toSorted().join(',')}`, (idempotencyKey) => api.post<RaceResultDto>('/races', { friendIds, idempotencyKey })),
  accept: (raceId: string) => api.post<RaceResultDto>(`/races/${encodeURIComponent(raceId)}/acceptance`),
  decline: (raceId: string) => api.post<RaceResultDto>(`/races/${encodeURIComponent(raceId)}/decline`),
  cancel: (raceId: string) => api.post<RaceResultDto>(`/races/${encodeURIComponent(raceId)}/cancellation`),
};
