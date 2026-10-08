import type { AchievementsOverviewDto, DailyWelcomeResultDto, ProgressionOverviewDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const goalsApi = {
  overview: () => api.get<ProgressionOverviewDto>('/progression'),
  achievements: () => api.get<AchievementsOverviewDto>('/progression/achievements'),
  claimDailyWelcome: () => api.post<DailyWelcomeResultDto>('/progression/daily-welcome'),
};
