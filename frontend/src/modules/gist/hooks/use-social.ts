'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProposalRequest, ReportPlayerRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { gistApi } from '../services/gist.api';
import { gistKeys } from '../services/gist-keys';

export function useFriends() {
  return useQuery({ queryKey: gistKeys.friends, queryFn: gistApi.friends, staleTime: 20_000, refetchInterval: 60_000 });
}

export function useBlocked(enabled: boolean) {
  return useQuery({ queryKey: gistKeys.blocked, queryFn: gistApi.blocked, enabled, staleTime: 60_000 });
}

export function usePlayerProfile(handle: string | null) {
  return useQuery({ queryKey: gistKeys.profile(handle ?? ''), queryFn: () => gistApi.profile(handle ?? ''), enabled: handle !== null, staleTime: 30_000 });
}

export function usePlayerSearch(query: string) {
  const trimmed = query.trim().replace(/^@/, '');
  return useQuery({ queryKey: gistKeys.search(trimmed), queryFn: () => gistApi.search(trimmed), enabled: trimmed.length >= 2, staleTime: 30_000 });
}

export function useVenuePlayers(venueId: string | null) {
  return useQuery({
    queryKey: gistKeys.venuePlayers(venueId ?? ''),
    queryFn: () => gistApi.venuePlayers(venueId ?? ''),
    enabled: venueId !== null,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useRelationships(enabled: boolean) {
  return useQuery({ queryKey: gistKeys.relationships, queryFn: gistApi.relationships, enabled, staleTime: 30_000 });
}

/** Any friendship change refreshes the friend list, profiles and (for mood/social effects) the snapshot. */
function useSocialInvalidation() {
  const client = useQueryClient();
  return (): void => {
    void client.invalidateQueries({ queryKey: gistKeys.friends });
    void client.invalidateQueries({ queryKey: gistKeys.profiles });
    void client.invalidateQueries({ queryKey: queryKeys.snapshot });
  };
}

export function useFriendActions() {
  const invalidate = useSocialInvalidation();
  const client = useQueryClient();
  const options = { onSettled: invalidate };
  return {
    request: useMutation({ mutationFn: gistApi.requestFriend, ...options }),
    accept: useMutation({ mutationFn: gistApi.acceptFriend, ...options }),
    decline: useMutation({ mutationFn: gistApi.declineFriend, ...options }),
    remove: useMutation({ mutationFn: gistApi.removeFriend, ...options }),
    block: useMutation({
      mutationFn: gistApi.block,
      onSettled: () => {
        invalidate();
        void client.invalidateQueries({ queryKey: gistKeys.blocked });
      },
    }),
    unblock: useMutation({
      mutationFn: gistApi.unblock,
      onSettled: () => {
        invalidate();
        void client.invalidateQueries({ queryKey: gistKeys.blocked });
      },
    }),
    report: useMutation({
      mutationFn: (body: ReportPlayerRequest) => gistApi.report(body),
      onSettled: () => {
        invalidate();
        void client.invalidateQueries({ queryKey: gistKeys.blocked });
      },
    }),
  };
}

export function usePropose() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ handle, body }: { readonly handle: string; readonly body: CreateProposalRequest }) => gistApi.propose(handle, body),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.domain('family') });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}
