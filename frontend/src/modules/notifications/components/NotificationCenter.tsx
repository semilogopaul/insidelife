'use client';

import { BellOff, CheckCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { errorMessage } from '@/common/api/api-error';
import { Button, EmptyState, Sheet, Spinner } from '@/common/components';
import { useSnapshot } from '@/common/game/snapshot';
import { useNotificationCenterStore } from '../hooks/use-center-store';
import { useMarkAllRead, useNotificationFeed } from '../hooks/use-notification-feed';
import { NotificationRow } from './NotificationRow';

/**
 * Everything that happened to you, newest first, with infinite scroll. Mount once at the composition root; the HUD
 * bell (`NotificationBell`) opens it.
 */
export function NotificationCenter() {
  const open = useNotificationCenterStore((state) => state.open);
  const setOpen = useNotificationCenterStore((state) => state.setOpen);
  const unread = useSnapshot().data?.unreadNotifications ?? 0;
  const feed = useNotificationFeed(open);
  const markAll = useMarkAllRead();
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  useEffect(() => {
    const node = sentinel.current;
    if (!open || !node || !hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [open, hasNextPage, isFetchingNextPage, fetchNextPage, feed.items.length]);

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      title="Notifications"
      description={unread > 0 ? `${unread} unread` : 'You’re all caught up.'}
      size="md"
    >
      <div className="flex flex-col gap-3 pb-2">
        {unread > 0 && (
          <Button
            variant="paper"
            size="sm"
            className="self-end"
            icon={<CheckCheck size={16} aria-hidden />}
            loading={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </Button>
        )}
        {feed.isPending && (
          <div className="grid place-items-center py-10 text-text-soft">
            <Spinner />
          </div>
        )}
        {feed.isError && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-okada">{errorMessage(feed.error)}</p>
            <Button variant="paper" size="sm" onClick={() => void feed.refetch()}>
              Try again
            </Button>
          </div>
        )}
        {feed.isSuccess && feed.items.length === 0 && (
          <EmptyState icon={BellOff} title="Nothing yet" body="Salary alerts, family gist and invitations will land here." />
        )}
        <ul className="flex flex-col gap-1.5" aria-label="Notifications">
          {feed.items.map((notification) => (
            <li key={notification.id}>
              <NotificationRow notification={notification} />
            </li>
          ))}
        </ul>
        <div ref={sentinel} aria-hidden className="h-4" />
        {isFetchingNextPage && (
          <div className="grid place-items-center py-3 text-text-soft">
            <Spinner />
          </div>
        )}
        {feed.isSuccess && !hasNextPage && feed.items.length > 8 && <p className="py-2 text-center text-xs text-text-faint">That’s everything.</p>}
      </div>
    </Sheet>
  );
}
