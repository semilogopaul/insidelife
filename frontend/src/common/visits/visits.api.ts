import type { HomePeopleDto, VisitDto, VisitsDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

/** Home visits (shared: the profile sheet invites, the HUD card answers, the world draws the door and the guests). */
export const visitsApi = {
  list: () => api.get<VisitsDto>('/visits'),
  invite: (handle: string) => api.post<VisitDto>('/visits', { handle }),
  accept: (id: string) => api.post<VisitDto>(`/visits/${id}/acceptance`, {}),
  decline: (id: string) => api.post<void>(`/visits/${id}/decline`, {}),
  end: (id: string) => api.delete<void>(`/visits/${id}`),
  people: (hostId: string) => api.get<HomePeopleDto>(`/visits/homes/${hostId}/people`),
};
