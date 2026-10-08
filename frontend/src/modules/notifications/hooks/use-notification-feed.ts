'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CharacterSnapshotDto, NotificationDto } from '@insidelife/shared';
import { queryKeys } from '@/common/api/query-keys';
import { notificationsApi } from '../services/notifications.api';

export const notificationFeedKey = [...queryKeys.notifications, 'feed'] as const;

/** Paged notification history, newest first. `queryKeys.notifications` invalidations refresh it too. */
export function useNotificationFeed(enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: notificationFeedKey,
    queryFn: ({ pageParam }) => notificationsApi.page(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    staleTime: 10_000,
  });
  const items: readonly NotificationDto[] = query.data?.pages.flatMap((page) => page.items) ?? [];
  return { ...query, items };
}

/** Mark everything read: clears the HUD badge immediately, then lets the server confirm. */
export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onMutate: () => {
      client.setQueryData<CharacterSnapshotDto>(queryKeys.snapshot, (snapshot) => (snapshot ? { ...snapshot, unreadNotifications: 0 } : snapshot));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.notifications });
      void client.invalidateQueries({ queryKey: queryKeys.snapshot });
    },
  });
}
