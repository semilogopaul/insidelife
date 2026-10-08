import type { CheckUpResponseDto, HealthViewDto, HmoPlanId, TreatmentResponseDto } from '@insidelife/shared';
import { api } from '@/common/api/http';

/** Health endpoints (all under /api/v1/health). */
export const healthApi = {
  view: () => api.get<HealthViewDto>('/health'),
  /** Treat a condition (or an antenatal visit: the pregnancy id) at the pharmacy/hospital you're inside. */
  treat: (conditionId: string) => api.post<TreatmentResponseDto>('/health/treatments', { conditionId }),
  checkUp: () => api.post<CheckUpResponseDto>('/health/check-ups'),
  joinHmo: (planId: HmoPlanId) => api.post<HealthViewDto>('/health/insurance', { planId }),
  cancelHmo: () => api.delete<HealthViewDto>('/health/insurance'),
};
