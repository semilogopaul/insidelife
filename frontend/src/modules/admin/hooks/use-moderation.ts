'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/common/auth/session-store';
import { moderationApi, moderationKeys, type ModerationKind } from '../services/moderation.api';

/** The review queue (refreshes every 30 s so two moderators don't step on each other for long). */
export function useModerationQueue() {
  const authenticated = useSession((state) => state.status === 'authenticated');
  return useQuery({ queryKey: moderationKeys.queue, queryFn: moderationApi.queue, enabled: authenticated, refetchInterval: 30_000, staleTime: 10_000 });
}

export type Decision =
  | { readonly action: 'approve'; readonly kind: ModerationKind; readonly id: string }
  | { readonly action: 'reject'; readonly kind: ModerationKind; readonly id: string; readonly reason: string; readonly refund: boolean }
  | { readonly action: 'refunded'; readonly kind: ModerationKind; readonly id: string; readonly note: string };

export function useDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (decision: Decision) => {
      if (decision.action === 'approve') return moderationApi.approve(decision.kind, decision.id);
      if (decision.action === 'reject') return moderationApi.reject(decision.kind, decision.id, { reason: decision.reason.trim(), refund: decision.refund });
      return moderationApi.refunded(decision.kind, decision.id, { note: decision.note.trim() || undefined });
    },
    onSettled: () => client.invalidateQueries({ queryKey: moderationKeys.queue }),
  });
}
