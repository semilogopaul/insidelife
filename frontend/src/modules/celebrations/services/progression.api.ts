import type { MilestoneAcknowledgementDto, MilestoneMomentDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const celebrationsApi = {
  pendingMilestones: () => api.get<MilestoneMomentDto[]>('/progression/milestones'),
  acknowledge: (id: string) => api.post<MilestoneAcknowledgementDto>(`/progression/milestones/${id}/acknowledgement`),
};
