import type { CheckUpResponseDto, HealthViewDto, HmoPlanId, TreatmentResponseDto, TreatmentMethod } from '@insidelife/shared';
import { api } from '@/common/api/http';

/** Health endpoints (all under /api/v1/health). */
export const healthApi = {
  view: () => api.get<HealthViewDto>('/health'),
  /** Treat a condition (or an antenatal visit: the pregnancy id) at the pharmacy/hospital you're inside. */
  treat: ({ conditionId, method = 'tablets' }: { conditionId: string; method?: TreatmentMethod }) =>
    api.post<TreatmentResponseDto>('/health/treatments', { conditionId, method }),
  checkUp: () => api.post<CheckUpResponseDto>('/health/check-ups'),
  joinHmo: (planId: HmoPlanId) => api.post<HealthViewDto>('/health/insurance', { planId }),
  cancelHmo: () => api.delete<HealthViewDto>('/health/insurance'),
};
