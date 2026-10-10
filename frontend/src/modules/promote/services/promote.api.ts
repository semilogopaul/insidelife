import type {
  AdCampaignDetailDto,
  AdCampaignDto,
  BillboardSlotId,
  BillboardSlotsDto,
  CampaignCheckoutDto,
  ClubOrderCheckoutDto,
  ClubOrderDetailDto,
  ClubTrackDto,
  CreateCampaignRequest,
  CreateClubOrderRequest,
  CreativeDto,
} from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';
import { uploadMultipart, type UploadOptions } from '@/common/api/upload';

export const promoteApi = {
  slots: () => api.get<BillboardSlotsDto>('/promotions/slots'),
  uploadCreative: (slotId: BillboardSlotId, file: File, options?: UploadOptions) => uploadMultipart<CreativeDto>('/promotions/creatives', file, { slotId }, options),
  createCampaign: (body: CreateCampaignRequest) => api.post<CampaignCheckoutDto>('/promotions/campaigns', body),
  campaigns: () => api.get<AdCampaignDto[]>('/promotions/campaigns'),
  campaign: (id: string) => api.get<AdCampaignDetailDto>(`/promotions/campaigns/${encodeURIComponent(id)}`),
  cancelCampaign: (id: string) => api.delete<void>(`/promotions/campaigns/${encodeURIComponent(id)}`),
  uploadTrack: (fields: { readonly artistName: string; readonly title: string }, file: File, options?: UploadOptions) =>
    uploadMultipart<ClubTrackDto>('/promotions/tracks', file, fields, options),
  tracks: () => api.get<ClubTrackDto[]>('/promotions/tracks'),
  orderRotation: (trackId: string, body: CreateClubOrderRequest) => api.post<ClubOrderCheckoutDto>(`/promotions/tracks/${encodeURIComponent(trackId)}/orders`, body),
  clubOrder: (id: string) => api.get<ClubOrderDetailDto>(`/promotions/club-orders/${encodeURIComponent(id)}`),
};

export const promoteKeys = {
  all: queryKeys.domain('promote'),
  slots: queryKeys.domain('promote', 'slots'),
  campaigns: queryKeys.domain('promote', 'campaigns'),
  campaign: (id: string) => queryKeys.domain('promote', 'campaign', id),
  tracks: queryKeys.domain('promote', 'tracks'),
  clubOrder: (id: string) => queryKeys.domain('promote', 'club-order', id),
} as const;
