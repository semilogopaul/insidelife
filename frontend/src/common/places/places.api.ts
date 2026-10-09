import type { CharacterSnapshotDto, ExitResultDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

/** Doing things where you are: start an action (the server prices and plans it) or step outside. */
export const placesApi = {
  startAction: (actionId: string, durationMinutes: number) =>
    api.post<CharacterSnapshotDto>('/characters/me/actions', { actionId, durationMinutes }),
  exit: () => api.post<ExitResultDto>('/characters/me/exits'),
};
