import type { MarkRefundedRequest, ModerationCampaignDto, ModerationClubOrderDto, ModerationQueueDto, RejectPromotionRequest } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';

export type ModerationKind = 'campaigns' | 'club-orders';

const base = '/admin/moderation';

/** Admin review endpoints (role `admin`; everyone else gets 403). */
export const moderationApi = {
  queue: () => api.get<ModerationQueueDto>(`${base}/queue`),
  approve: (kind: ModerationKind, id: string) => api.post<ModerationCampaignDto | ModerationClubOrderDto>(`${base}/${kind}/${encodeURIComponent(id)}/approve`),
  reject: (kind: ModerationKind, id: string, body: RejectPromotionRequest) =>
    api.post<ModerationCampaignDto | ModerationClubOrderDto>(`${base}/${kind}/${encodeURIComponent(id)}/reject`, body),
  refunded: (kind: ModerationKind, id: string, body: MarkRefundedRequest) =>
    api.post<ModerationCampaignDto | ModerationClubOrderDto>(`${base}/${kind}/${encodeURIComponent(id)}/refunded`, body),
};

export const moderationKeys = {
  queue: queryKeys.domain('admin', 'moderation-queue'),
} as const;
