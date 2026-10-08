import type { CharacterSnapshotDto, CreateCharacterRequest } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const creatorApi = {
  handleAvailable: (handle: string) => api.get<{ available: boolean }>(`/characters/handles/${encodeURIComponent(handle)}/availability`),
  create: (body: CreateCharacterRequest) => api.post<CharacterSnapshotDto>('/characters', body),
};
