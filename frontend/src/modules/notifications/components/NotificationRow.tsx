import { formatClock12, formatDate, type NotificationDto } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { KIND_META, timeAgo } from './kind-meta';

/** One alert in the centre: icon by kind, title, body, money and when it happened (real and game time). */
export function NotificationRow({ notification }: { readonly notification: NotificationDto }) {
  const meta = KIND_META[notification.kind];
  const Icon = meta.icon;
  return (
    <article className={cn('flex gap-3 rounded-card px-3 py-3', notification.read ? 'bg-paper' : 'bg-paper-2')}>
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', meta.tile)}>
        <Icon size={18} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold leading-snug">
            {!notification.read && <span className="sr-only">Unread: </span>}
            {notification.title}
          </h3>
          {notification.amount !== undefined && notification.amount !== 0 && (
            <Money amount={notification.amount} compact signed className="type-figure shrink-0 text-sm" />
          )}
        </div>
        <p className="mt-0.5 text-sm leading-snug text-text-soft">{notification.body}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-text-faint">
          <span className="font-bold text-text-soft">{meta.label}</span>
          <span>{timeAgo(notification.createdAt)}</span>
          <span>
            {formatDate(notification.gameMinute)}, {formatClock12(notification.gameMinute)}
          </span>
        </p>
      </div>
      {!notification.read && <span aria-hidden className="mt-1.5 size-2.5 shrink-0 rounded-full bg-danfo ring-2 ring-ink/10" />}
    </article>
  );
}
