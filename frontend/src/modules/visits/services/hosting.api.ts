import type { HostingDto, HostingResultDto, ServeTreatRequest } from '@insidelife/shared';
import { api } from '@/common/api/http';

/** Treating guests at home (host) and saying thanks (guest). */
export const hostingApi = {
  view: () => api.get<HostingDto>('/visits/hosting'),
  serve: (body: ServeTreatRequest) => api.post<HostingResultDto>('/visits/treats', body),
  thank: (visitId: string) => api.post<void>(`/visits/${visitId}/thanks`, {}),
};
