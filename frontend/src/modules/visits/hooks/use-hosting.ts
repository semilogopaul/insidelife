'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HostingDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { visitsKey } from '@/common/visits';
import { hostingApi } from '../services/hosting.api';

/** Under the visits key, so a `character:invalidate` nudge refreshes it with the visits. */
export const hostingKey = queryKeys.domain('visits', 'hosting');

/** The Host sheet: guests inside, the menu priced for them, what's on the table. */
export function useHosting(enabled: boolean) {
  return useQuery<HostingDto>({
    queryKey: hostingKey,
    queryFn: hostingApi.view,
    enabled,
    staleTime: 5_000,
    refetchInterval: enabled ? 15_000 : false,
  });
}

/** Serve a treat; the room (people + treats), the visit cards and your cash and needs refresh. */
export function useServeTreat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: hostingApi.serve,
    onSuccess: (result) => {
      client.setQueryData(hostingKey, result.hosting);
      void client.invalidateQueries({
        queryKey: visitsKey,
        predicate: (query) => query.queryKey[2] !== 'hosting',
      });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}

/** A guest's thanks (free). */
export function useThankHost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: hostingApi.thank,
    onSuccess: () => void client.invalidateQueries({ queryKey: visitsKey }),
  });
}
