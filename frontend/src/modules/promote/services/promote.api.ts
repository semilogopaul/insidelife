import type {
  AdCampaignDto,
  BillboardSlotId,
  BillboardSlotsDto,
  CampaignCheckoutDto,
  ClubOrderCheckoutDto,
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
  cancelCampaign: (id: string) => api.delete<void>(`/promotions/campaigns/${encodeURIComponent(id)}`),
  uploadTrack: (fields: { readonly artistName: string; readonly title: string }, file: File, options?: UploadOptions) =>
    uploadMultipart<ClubTrackDto>('/promotions/tracks', file, fields, options),
  tracks: () => api.get<ClubTrackDto[]>('/promotions/tracks'),
  orderRotation: (trackId: string, body: CreateClubOrderRequest) => api.post<ClubOrderCheckoutDto>(`/promotions/tracks/${encodeURIComponent(trackId)}/orders`, body),
};

export const promoteKeys = {
  slots: queryKeys.domain('promote', 'slots'),
  campaigns: queryKeys.domain('promote', 'campaigns'),
  tracks: queryKeys.domain('promote', 'tracks'),
} as const;
