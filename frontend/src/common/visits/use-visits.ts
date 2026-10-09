'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HomePeopleDto, VisitsDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { visitsApi } from './visits.api';

export const visitsKey = queryKeys.domain('visits');
const peopleKey = (hostId: string) => queryKeys.domain('visits', 'people', hostId);

/** Open invites and visits, yours and to you. Refreshed when the server nudges (`character:invalidate`). */
export function useVisits(enabled = true) {
  return useQuery<VisitsDto>({
    queryKey: visitsKey,
    queryFn: visitsApi.list,
    enabled,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

/** Invite, accept, decline, end: each refreshes the visits list and the snapshot (you may have been sent home). */
export function useVisitActions() {
  const client = useQueryClient();
  const settle = (): void => {
    void client.invalidateQueries({ queryKey: visitsKey });
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
  };
  return {
    invite: useMutation({ mutationFn: visitsApi.invite, onSuccess: settle }),
    accept: useMutation({ mutationFn: visitsApi.accept, onSuccess: settle }),
    decline: useMutation({ mutationFn: visitsApi.decline, onSuccess: settle }),
    end: useMutation({ mutationFn: visitsApi.end, onSuccess: settle }),
  };
}

/** Who else is in a home (host and guests) while you're in it; polled so arrivals show up. */
export function useHomePeople(hostId: string | null) {
  return useQuery<HomePeopleDto>({
    queryKey: peopleKey(hostId ?? ''),
    queryFn: () => visitsApi.people(hostId ?? ''),
    enabled: hostId !== null,
    refetchInterval: 8_000,
    retry: false,
  });
}
