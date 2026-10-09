'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NightOutRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { addOwnMoment, nightOutApi, nightOutKey } from '@/common/night-out';

/** Buy a bottle, a shoutout or an experience. Your own banner shows at once; cash and the menu refresh. */
export function useBuyNightOut(venueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: NightOutRequest) => nightOutApi.buy(venueId, body),
    onSuccess: (result) => addOwnMoment(result.moment),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
      void client.invalidateQueries({ queryKey: nightOutKey(venueId) });
    },
  });
}
