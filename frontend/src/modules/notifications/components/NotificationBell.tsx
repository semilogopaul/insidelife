'use client';

import { Bell } from 'lucide-react';
import { gameEvents } from '@/common/game/game-events';
import { useSnapshot } from '@/common/game/snapshot';
import { useNotificationCenterStore } from '../hooks/use-center-store';

/** HUD bell with the unread count from the snapshot. Opens the notification centre. */
export function NotificationBell() {
  const unread = useSnapshot().data?.unreadNotifications ?? 0;
  const setOpen = useNotificationCenterStore((state) => state.setOpen);
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <button
      type="button"
      onClick={() => {
        gameEvents.emit('sfx', { id: 'ui-open' });
        setOpen(true);
      }}
      aria-label={label}
      className="glass relative grid size-12 place-items-center rounded-card text-on-ink hover:brightness-110"
    >
      <Bell size={20} aria-hidden className={unread > 0 ? 'text-danfo' : undefined} />
      {unread > 0 && (
        <span aria-hidden className="tabular absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-okada px-1 text-2xs font-bold text-white ring-2 ring-ink">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
