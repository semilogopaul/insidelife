import type {
  BusinessExitDto,
  BusinessesViewDto,
  CharacterSnapshotDto,
  EmploymentViewDto,
  InventoryDto,
  JobApplicationDto,
  JobBoardDto,
  JobDetailDto,
  OwnedBusinessDto,
  PromotionResultDto,
  ResignationResultDto,
  StartBusinessRequest,
} from '@insidelife/shared';
import { api } from '@/common/api/http';

const id = (value: string): string => encodeURIComponent(value);

/** Careers + businesses endpoints (all under /api/v1). */
export const jobsApi = {
  board: () => api.get<JobBoardDto>('/jobs'),
  detail: (jobId: string) => api.get<JobDetailDto>(`/jobs/${id(jobId)}`),
  apply: (jobId: string) => api.post<JobApplicationDto>(`/jobs/${id(jobId)}/applications`),

  employment: () => api.get<EmploymentViewDto>('/employment'),
  requestPromotion: () => api.post<PromotionResultDto>('/employment/promotion-requests'),
  requestLeave: (days: number) => api.post<EmploymentViewDto>('/employment/leave', { days }),
  resign: () => api.delete<ResignationResultDto>('/employment'),

  businesses: () => api.get<BusinessesViewDto>('/businesses'),
  startBusiness: (body: StartBusinessRequest) => api.post<OwnedBusinessDto>('/businesses', body),
  expandBusiness: (businessId: string) =>
    api.post<OwnedBusinessDto>(`/businesses/${id(businessId)}/expansions`),
  sellBusiness: (businessId: string) => api.post<BusinessExitDto>(`/businesses/${id(businessId)}/sale`),
  closeBusiness: (businessId: string) => api.delete<BusinessExitDto>(`/businesses/${id(businessId)}`),

  /** Belongings (for the freelance hint: laptop tag). */
  inventory: () => api.get<InventoryDto>('/inventory'),
  /** Start a timed action (freelance gig, manage business) — answers with a fresh snapshot. */
  startAction: (actionId: string, durationMinutes: number) =>
    api.post<CharacterSnapshotDto>('/characters/me/actions', { actionId, durationMinutes }),
};
