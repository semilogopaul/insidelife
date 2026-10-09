'use client';

import { useQuery } from '@tanstack/react-query';
import type { DmThreadDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';

/** DM threads (the Messages app and Gist → DMs), shared so the phone and HUD can show unread badges. */
export const dmThreadsKey = queryKeys.domain('gist', 'dm-threads');

export const fetchDmThreads = (): Promise<DmThreadDto[]> => api.get<DmThreadDto[]>('/chat/dms');

export function useDmThreads(enabled = true) {
  return useQuery({ queryKey: dmThreadsKey, queryFn: fetchDmThreads, staleTime: 30_000, enabled });
}

/** Conversations with a message you haven't read (refreshed when a DM arrives). */
export function useUnreadDms(enabled = true): number {
  const { data } = useDmThreads(enabled);
  return (data ?? []).filter((thread) => thread.unread).length;
}
