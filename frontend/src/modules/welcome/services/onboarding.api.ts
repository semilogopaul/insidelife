import type { OnboardingDto, WelcomeReaction } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const onboardingApi = {
  get: () => api.get<OnboardingDto>('/account/onboarding'),
  answerWelcome: (reaction: WelcomeReaction) => api.post<OnboardingDto>('/account/onboarding/welcome', { reaction }),
  announcementSeen: (id: string) => api.post<OnboardingDto>('/account/onboarding/announcement', { id }),
  featuredSeen: () => api.post<OnboardingDto>('/account/onboarding/featured'),
};
