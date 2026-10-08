'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HealthViewDto, HmoPlanId } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { healthApi } from '../services/health.api';
import { useCurrentPlace } from '@/common/hooks/use-current-place';

/** Health view, keyed by where you are (`here` and "nearest clinic" depend on it). */
export function useHealth() {
  const { locationId } = useCurrentPlace();
  return useQuery({
    queryKey: queryKeys.domain('health', locationId ?? 'unknown'),
    queryFn: healthApi.view,
    // Moving between places changes the key: keep showing the last view while the new one loads.
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useHealthCommands() {
  const client = useQueryClient();
  const { locationId } = useCurrentPlace();
  const key = queryKeys.domain('health', locationId ?? 'unknown');
  const write = (view: HealthViewDto): void => {
    client.setQueryData(key, view);
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
  };
  return {
    treat: useMutation({ mutationFn: healthApi.treat, onSuccess: (result) => write(result.health) }),
    checkUp: useMutation({ mutationFn: healthApi.checkUp, onSuccess: (result) => write(result.health) }),
    joinHmo: useMutation({ mutationFn: (planId: HmoPlanId) => healthApi.joinHmo(planId), onSuccess: write }),
    cancelHmo: useMutation({ mutationFn: healthApi.cancelHmo, onSuccess: write }),
  };
}
