'use client';

import type { LiveBillboardsDto } from '@insidelife/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';

/**
 * The public live ads feed: creatives running on billboards and street spots, and the phone's Sponsored apps. Shared
 * by the 3D world and the phone (one request, one cache). A missing endpoint or an error means house ads everywhere.
 */
export function useLiveAds() {
  return useQuery({
    queryKey: queryKeys.domain('promotions', 'billboards', 'live'),
    queryFn: () => api.get<LiveBillboardsDto>('/promotions/billboards/live', { anonymous: true }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
