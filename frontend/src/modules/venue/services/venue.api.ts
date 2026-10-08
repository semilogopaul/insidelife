import type { CharacterSnapshotDto, ExitResultDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const venueApi = {
  startAction: (actionId: string, durationMinutes: number) => api.post<CharacterSnapshotDto>('/characters/me/actions', { actionId, durationMinutes }),
  exit: () => api.post<ExitResultDto>('/characters/me/exits'),
};
