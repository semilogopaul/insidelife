import type { LifeEventDto, LifeEventOutcomeDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const lifeEventsApi = {
  pending: () => api.get<LifeEventDto[]>('/life-events'),
  choose: (id: string, choiceId: string) => api.post<LifeEventOutcomeDto>(`/life-events/${id}/choices`, { choiceId }),
};
