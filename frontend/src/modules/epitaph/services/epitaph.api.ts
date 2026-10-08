import type { LastLifeDto, SuccessionDto } from '@insidelife/shared';
import { ApiError } from '@/common/api/api-error';
import { api } from '@/common/api/http';

export const epitaphApi = {
  /** The life that just ended, or null when there has never been one. */
  async lastLife(): Promise<LastLifeDto | null> {
    try {
      return await api.get<LastLifeDto>('/characters/me/last-life');
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
  legacy: () => api.get<SuccessionDto[]>('/family/legacy'),
};
