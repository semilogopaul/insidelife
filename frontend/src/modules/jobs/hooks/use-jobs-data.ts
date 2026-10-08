'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmploymentViewDto, StartBusinessRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { jobsApi } from '../services/jobs.api';

export const jobsKeys = {
  board: queryKeys.domain('jobs', 'board'),
  detail: (jobId: string) => queryKeys.domain('jobs', 'detail', jobId),
  employment: queryKeys.domain('employment'),
  businesses: queryKeys.domain('businesses'),
  inventory: queryKeys.domain('inventory'),
} as const;

/** Job board (listings with eligibility, plus your open applications). */
export function useJobBoard() {
  return useQuery({ queryKey: jobsKeys.board, queryFn: jobsApi.board, refetchInterval: 30_000 });
}

export function useJobDetail(jobId: string | null) {
  return useQuery({
    queryKey: jobsKeys.detail(jobId ?? ''),
    queryFn: () => jobsApi.detail(jobId ?? ''),
    enabled: jobId !== null,
  });
}

export function useEmployment() {
  return useQuery({ queryKey: jobsKeys.employment, queryFn: jobsApi.employment, refetchInterval: 30_000 });
}

export function useBusinesses() {
  return useQuery({ queryKey: jobsKeys.businesses, queryFn: jobsApi.businesses });
}

export function useInventoryTags() {
  return useQuery({
    queryKey: jobsKeys.inventory,
    queryFn: jobsApi.inventory,
    select: (inventory) => inventory.tags,
  });
}

/** Invalidate the snapshot (wallet, HUD) plus the given domain keys after a command. */
function useRefresh() {
  const client = useQueryClient();
  return (...keys: ReadonlyArray<readonly unknown[]>): void => {
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    for (const key of keys) void client.invalidateQueries({ queryKey: key });
  };
}

export function useApply() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: jobsApi.apply,
    onSuccess: (_, jobId) => refresh(jobsKeys.board, jobsKeys.detail(jobId), jobsKeys.employment),
  });
}

export function useEmploymentCommands() {
  const client = useQueryClient();
  const refresh = useRefresh();
  const writeView = (view: EmploymentViewDto): void => {
    client.setQueryData(jobsKeys.employment, view);
    refresh(jobsKeys.board);
  };
  const promotion = useMutation({
    mutationFn: jobsApi.requestPromotion,
    onSuccess: (result) => {
      client.setQueryData<EmploymentViewDto>(jobsKeys.employment, (view) =>
        view ? { ...view, employment: result.employment } : view,
      );
      refresh(jobsKeys.board);
    },
  });
  const leave = useMutation({ mutationFn: jobsApi.requestLeave, onSuccess: writeView });
  const resign = useMutation({ mutationFn: jobsApi.resign, onSuccess: (result) => writeView(result.view) });
  return { promotion, leave, resign };
}

export function useBusinessCommands() {
  const refresh = useRefresh();
  const done = (): void => refresh(jobsKeys.businesses, jobsKeys.inventory);
  return {
    start: useMutation({
      mutationFn: (body: StartBusinessRequest) => jobsApi.startBusiness(body),
      onSuccess: done,
    }),
    expand: useMutation({ mutationFn: jobsApi.expandBusiness, onSuccess: done }),
    sell: useMutation({ mutationFn: jobsApi.sellBusiness, onSuccess: done }),
    close: useMutation({ mutationFn: jobsApi.closeBusiness, onSuccess: done }),
  };
}
