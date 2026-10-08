'use client';

import { Inbox, Megaphone, Music, RefreshCw, ShieldAlert, Undo2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import type { ModerationQueueDto } from '@insidelife/shared';
import { ApiError, errorMessage } from '@/common/api/api-error';
import { Button, EmptyState, Spinner, Wordmark, toast } from '@/common/components';
import { useSession } from '@/common/auth/session-store';
import { cn } from '@/common/utils/cn';
import { useDecision, useModerationQueue, type Decision } from '../hooks/use-moderation';
import { itemKey, itemsFor, nextSelection, type QueueItem, type QueueSection } from '../services/queue';
import { DecisionPanel } from './DecisionPanel';
import { ItemDetail } from './ItemDetail';
import { QueueList } from './QueueList';
import { RefundPanel } from './RefundPanel';

const SECTIONS: ReadonlyArray<{ readonly id: QueueSection; readonly label: string; readonly icon: LucideIcon; readonly empty: string }> = [
  { id: 'campaigns', label: 'Ads to review', icon: Megaphone, empty: 'No billboard ads waiting. New paid ads appear here.' },
  { id: 'club-orders', label: 'Club tracks', icon: Music, empty: 'No songs waiting for review.' },
  { id: 'refunds', label: 'Refunds due', icon: Undo2, empty: 'Nothing to refund. Rejected paid items land here.' },
];

/**
 * /admin/moderation: review paid billboard ads and club plays, reject with a reason (and refund), and record
 * refunds done in Paystack. Access is decided by the API (403 → "Moderators only").
 */
export function ModerationConsole() {
  const status = useSession((state) => state.status);
  const email = useSession((state) => state.user?.email);
  const queue = useModerationQueue();

  return (
    <main className="flex min-h-dvh flex-col bg-paper text-text">
      <header className="flex items-center gap-3 bg-ink px-4 py-3 text-on-ink sm:gap-4 sm:px-6">
        <Link href="/play" aria-label="Back to Inside Life" className="text-white">
          <Wordmark size="sm" className="whitespace-nowrap" />
        </Link>
        <span aria-hidden className="h-6 w-px bg-white/20" />
        <h1 className="type-title truncate text-xl">Moderation</h1>
        <span className="flex-1" />
        {email && <span className="hidden text-sm text-on-ink-soft sm:inline">Signed in as {email}</span>}
        {queue.data && (
          <Button variant="ghost" size="sm" icon={<RefreshCw size={16} aria-hidden className={cn(queue.isFetching && 'animate-spin')} />} onClick={() => void queue.refetch()}>
            Refresh
          </Button>
        )}
      </header>
      {status === 'unknown' || (status === 'authenticated' && queue.isPending) ? (
        <div className="grid flex-1 place-items-center text-text-soft">
          <Spinner size={28} />
        </div>
      ) : status === 'anonymous' || (queue.error instanceof ApiError && queue.error.status === 401) ? (
        <Gate title="Sign in to moderate" body="Use your moderator account." action={<SignInLink />} />
      ) : queue.error instanceof ApiError && queue.error.status === 403 ? (
        <Gate icon={ShieldAlert} title="Moderators only" body="This account can’t review ads or tracks. If you should have access, ask an admin to add your email." action={<Link href="/play" className="font-bold underline">Back to Lagos</Link>} />
      ) : queue.isError ? (
        <Gate title="Couldn’t load the queue" body={errorMessage(queue.error)} action={<Button onClick={() => void queue.refetch()}>Try again</Button>} />
      ) : queue.data ? (
        <Workspace queue={queue.data} />
      ) : null}
    </main>
  );
}

function Workspace({ queue }: { readonly queue: ModerationQueueDto }) {
  const [section, setSection] = useState<QueueSection>('campaigns');
  const [selected, setSelected] = useState<string | null>(null);
  const decision = useDecision();
  const items = useMemo(() => itemsFor(queue, section), [queue, section]);
  const current = items.find((item) => itemKey(item) === selected) ?? items[0] ?? null;
  const counts: Readonly<Record<QueueSection, number>> = {
    campaigns: queue.campaigns.length,
    'club-orders': queue.clubOrders.length,
    refunds: queue.refundsDue.campaigns.length + queue.refundsDue.clubOrders.length,
  };

  const decide = (choice: Decision): void => {
    const removed = `${choice.kind}:${choice.id}`;
    const before = items;
    decision.mutate(choice, {
      onSuccess: () => {
        toast({
          title: choice.action === 'approve' ? 'Approved' : choice.action === 'reject' ? (choice.refund ? 'Rejected — refund due' : 'Rejected without refund') : 'Marked refunded',
          body: choice.action === 'approve' ? 'It goes live on its start date and the buyer is told.' : 'The buyer has been notified.',
          tone: choice.action === 'approve' || choice.action === 'refunded' ? 'good' : 'neutral',
        });
        setSelected(nextSelection(before, before.filter((item) => itemKey(item) !== removed), removed));
      },
    });
  };

  return (
    <div className="grid flex-1 grid-cols-1 lg:grid-cols-[22rem_1fr] xl:grid-cols-[26rem_1fr]">
      <aside className="flex flex-col gap-3 border-line p-4 lg:sticky lg:top-0 lg:h-[calc(100dvh-3.75rem)] lg:overflow-y-auto lg:border-r">
        <nav aria-label="Queues" className="grid grid-cols-3 gap-1.5 lg:grid-cols-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? 'page' : undefined}
              onClick={() => {
                setSection(id);
                setSelected(null);
                decision.reset();
              }}
              className={cn('flex items-center gap-2.5 rounded-card px-3 py-2.5 text-left text-sm font-bold', section === id ? 'bg-ink text-on-ink' : 'bg-paper-2 hover:bg-paper-3')}
            >
              <Icon size={18} aria-hidden className="hidden shrink-0 sm:block" />
              <span className="min-w-0 flex-1 leading-tight">{label}</span>
              <span className={cn('tabular grid min-w-6 shrink-0 place-items-center rounded-full px-1.5 text-xs', counts[id] > 0 ? 'bg-danfo text-ink' : section === id ? 'bg-white/10' : 'bg-paper-3 text-text-soft')}>{counts[id]}</span>
            </button>
          ))}
        </nav>
        {items.length > 0 && <p className="px-1 text-xs text-text-soft">Soonest start first. Use ↑ ↓ (or j / k) in the list to move.</p>}
        {items.length > 0 && (
          <QueueList
            items={items}
            selected={current ? itemKey(current) : null}
            onSelect={(key) => {
              setSelected(key);
              decision.reset();
            }}
            label={SECTIONS.find((entry) => entry.id === section)?.label ?? 'Queue'}
          />
        )}
      </aside>
      <section aria-label="Review" className="min-w-0 p-6 xl:p-8">
        {current ? (
          <Review key={itemKey(current)} item={current} section={section} busy={decision.isPending} error={decision.error} onDecide={decide} />
        ) : (
          <EmptyState icon={Inbox} title="All clear" body={SECTIONS.find((entry) => entry.id === section)?.empty} />
        )}
      </section>
    </div>
  );
}

function Review({ item, section, busy, error, onDecide }: { readonly item: QueueItem; readonly section: QueueSection; readonly busy: boolean; readonly error: unknown; readonly onDecide: (decision: Decision) => void }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <ItemDetail item={item} />
      {section === 'refunds' ? (
        <RefundPanel kind={item.kind} id={item.id} busy={busy} error={error} onDecide={onDecide} />
      ) : (
        <DecisionPanel kind={item.kind} id={item.id} busy={busy} error={error} onDecide={onDecide} />
      )}
    </div>
  );
}

function Gate({ icon: Icon = ShieldAlert, title, body, action }: { readonly icon?: LucideIcon; readonly title: string; readonly body: string; readonly action: ReactNode }) {
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-paper-2 text-text-soft">
          <Icon size={26} aria-hidden />
        </span>
        <h2 className="type-title mt-3 text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-text-soft">{body}</p>
        <div className="mt-5">{action}</div>
      </div>
    </div>
  );
}

function SignInLink() {
  return (
    <Link href="/sign-in?next=/admin/moderation" className="inline-flex h-11 items-center rounded-card bg-danfo px-5 font-bold text-ink shadow-[0_3px_0_var(--color-danfo-deep)]">
      Sign in
    </Link>
  );
}
