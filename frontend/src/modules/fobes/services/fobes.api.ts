import type { FobesListDto, FobesListId, FobesMeDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const fobesApi = {
  list: (list: FobesListId, page: number) => api.get<FobesListDto>(`/fobes/lists/${list}`, { query: { page } }),
  me: () => api.get<FobesMeDto>('/fobes/me'),
};
