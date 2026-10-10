import type { OnboardingDto, TourOutcome } from '@insidelife/shared';
import { api } from '@/common/api/http';

export const tourApi = {
  get: () => api.get<OnboardingDto>('/account/onboarding'),
  done: (outcome: TourOutcome) => api.post<OnboardingDto>('/account/onboarding/tour', { outcome }),
};
