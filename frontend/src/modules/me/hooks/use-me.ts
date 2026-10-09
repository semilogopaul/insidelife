'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeaderboardBoardId, SocialPrivacyDto, UpdateSocialPrivacyRequest } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { useSession } from '@/common/auth/session-store';
import { disconnectSocket } from '@/common/realtime/socket';
import { meApi } from '../services/me.api';

const privacyKey = queryKeys.domain('social', 'privacy');

/** Your public profile as others see it (shared key with the Gist app's profile sheet). */
export function useMyProfile(handle: string | null) {
  return useQuery({
    queryKey: queryKeys.domain('social', 'profile', (handle ?? '').toLowerCase()),
    queryFn: () => meApi.profile(handle ?? ''),
    enabled: handle !== null,
    staleTime: 60_000,
  });
}

export function useLeaderboard(board: LeaderboardBoardId) {
  return useQuery({ queryKey: queryKeys.domain('social', 'leaderboard', board), queryFn: () => meApi.leaderboard(board), staleTime: 60_000 });
}

export function usePrivacy() {
  return useQuery({ queryKey: privacyKey, queryFn: meApi.privacy, staleTime: 5 * 60_000 });
}

/** Optimistic privacy toggle (rolls back on error). */
export function useUpdatePrivacy() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateSocialPrivacyRequest) => meApi.updatePrivacy(patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: privacyKey });
      const previous = client.getQueryData<SocialPrivacyDto>(privacyKey);
      if (previous) client.setQueryData<SocialPrivacyDto>(privacyKey, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(privacyKey, context.previous);
    },
    onSuccess: (privacy) => {
      client.setQueryData(privacyKey, privacy);
      void client.invalidateQueries({ queryKey: queryKeys.domain('social', 'profile') });
      void client.invalidateQueries({ queryKey: queryKeys.domain('social', 'leaderboard') });
    },
  });
}

/**
 * Delete my account. On success the server has already ended every session; this drops the socket and the local
 * session (the page that follows leaves for the landing page).
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: meApi.deleteAccount,
    onSuccess: () => {
      disconnectSocket();
      useSession.getState().clear();
    },
  });
}

