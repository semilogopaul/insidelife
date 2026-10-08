'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/common/api/query-keys';
import { useSnapshot } from '@/common/game/snapshot';
import { lifeEventsApi } from '../services/life-events.api';

/** Pending life events (fetched only when the snapshot says some are waiting). */
export function usePendingLifeEvents() {
  const pendingCount = useSnapshot().data?.pendingEvents ?? 0;
  const query = useQuery({ queryKey: queryKeys.lifeEvents, queryFn: lifeEventsApi.pending, enabled: pendingCount > 0, staleTime: 10_000 });
  return { ...query, pendingCount, events: pendingCount > 0 ? (query.data ?? []) : [] };
}

export function useChooseLifeEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, choiceId }: { readonly id: string; readonly choiceId: string }) => lifeEventsApi.choose(id, choiceId),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.lifeEvents });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}
