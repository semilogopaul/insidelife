'use client';

import { billboardPlacement, findBillboardSlot, type BillboardSlot, type BillboardSlotId, type BillboardWorldPlacement, type LiveBillboardsDto } from '@insidelife/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';
import { currentBillboard, type BillboardContent } from './billboard-content';

/** Live billboard creatives (public). A missing endpoint or an error simply means house ads everywhere. */
export function useLiveBillboards() {
  return useQuery({
    queryKey: queryKeys.domain('promotions', 'billboards', 'live'),
    queryFn: () => api.get<LiveBillboardsDto>('/promotions/billboards/live', { anonymous: true }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export interface BillboardHandle {
  readonly slotId: BillboardSlotId;
  readonly placement: BillboardWorldPlacement | null;
  readonly slot: BillboardSlot | undefined;
  /** What the board shows at this instant (call on tap; never per frame in React state). */
  readonly current: () => BillboardContent;
}

/**
 * For the play layer: where a board is and what it shows when the player taps it (open the link behind the
 * "You're leaving Inside Life" screen, or the phone's Promote app for house ads). The world itself never acts on taps.
 */
export function useBillboardAt(slotId: BillboardSlotId): BillboardHandle {
  const { data } = useLiveBillboards();
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);
  const current = useCallback(() => currentBillboard(slotId, latest.current, Date.now()), [slotId]);
  return { slotId, placement: billboardPlacement(slotId), slot: findBillboardSlot(slotId), current };
}
