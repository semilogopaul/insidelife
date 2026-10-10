'use client';

import { ChevronRight, Disc3, Play } from 'lucide-react';
import { koboToNaira, runLengthLabel, type ClubPlayOrderDto, type ClubSongOfferDto, type ClubTrackDto, type ContentRule } from '@insidelife/shared';
import { Button, Money } from '@/common/components';
import { formatDuration, formatRange } from '../../services/rules';
import { PendingPayment } from '../detail/PendingPayment';
import { StatusBadge } from '../shared';
import { OrderForm } from './OrderForm';

export interface TrackCardProps {
  readonly track: ClubTrackDto;
  /** Today's song price, start dates and plays guarantee (null while loading). */
  readonly offer: ClubSongOfferDto | null;
  readonly rules: readonly ContentRule[];
  readonly ordering: boolean;
  readonly onOrder: (open: boolean) => void;
  /** Open a run's page (times, plays, listeners, receipt). */
  readonly onOpenOrder: (orderId: string) => void;
}

const BOOKABLE = new Set(['draft', 'completed', 'cancelled', 'refunded', 'refund-due', 'rejected']);

/** One song: listen, its plays, every run booked (tap one for everything about it). */
export function TrackCard({ track, offer, rules, ordering, onOrder, onOpenOrder }: TrackCardProps) {
  const canBook = !track.removed && BOOKABLE.has(track.status);
  return (
    <li className="flex flex-col gap-3 rounded-sheet p-4 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-danfo">
          <Disc3 size={22} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{track.title}</p>
          <p className="truncate text-sm text-text-soft">{track.artistName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-text-soft">
            <span>{formatDuration(track.durationSeconds)}</span>
            <span className="inline-flex items-center gap-0.5">
              <Play size={11} aria-hidden /> {track.plays.toLocaleString('en-NG')} plays
            </span>
          </p>
        </div>
        <StatusBadge status={track.status} />
      </div>
      {track.removed ? (
        <p className="rounded-card bg-okada-soft p-3 text-sm text-okada">This song was removed after review. Upload it again to book a new rotation.</p>
      ) : (
        <audio controls preload="none" src={track.audioUrl} className="h-10 w-full" aria-label={`${track.title} by ${track.artistName}`}>
          <track kind="captions" />
        </audio>
      )}
      {track.orders.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-card bg-paper-2 text-sm">
          {track.orders.map((order) => (
            <OrderRow key={order.id} order={order} onOpen={() => onOpenOrder(order.id)} />
          ))}
        </ul>
      )}
      {ordering ? (
        <OrderForm track={track} offer={offer} rules={rules} onCancel={() => onOrder(false)} />
      ) : canBook ? (
        <Button variant={track.orders.length === 0 ? 'danfo' : 'paper'} onClick={() => onOrder(true)}>
          {track.orders.length === 0 ? 'Book club plays' : 'Book another run'}
        </Button>
      ) : null}
    </li>
  );
}

function OrderRow({ order, onOpen }: { readonly order: ClubPlayOrderDto; readonly onOpen: () => void }) {
  return (
    <li className="flex flex-col">
      <button type="button" onClick={onOpen} className="flex items-center gap-2 px-3 py-2.5 text-left hover:bg-paper-3" aria-label={`Run of ${formatRange(order.startDate, order.endDate)}: open its plays and times`}>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-bold">{formatRange(order.startDate, order.endDate)}</span>
            <StatusBadge status={order.status} />
          </span>
          <span className="block text-xs text-text-soft">
            {runLengthLabel(order.days)} · <Money amount={koboToNaira(order.amountKobo)} /> · {order.plays.toLocaleString('en-NG')} plays · heard by{' '}
            {order.listeners.toLocaleString('en-NG')}
          </span>
          {order.rejectionReason && <span className="block text-xs">Moderator: “{order.rejectionReason}”</span>}
        </span>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-text-faint" />
      </button>
      {order.status === 'pending-payment' && (
        <div className="px-3 pb-2.5">
          <PendingPayment compact paymentReference={order.paymentReference} checkoutUrl={order.checkoutUrl} holdExpiresAt={order.holdExpiresAt} />
        </div>
      )}
    </li>
  );
}
