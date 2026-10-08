'use client';

import { Disc3, Play } from 'lucide-react';
import { findVenue, koboToNaira, type ClubPlayOrderDto, type ClubTrackDto, type ContentRule, type IsoDate } from '@insidelife/shared';
import { Button, Money } from '@/common/components';
import { useNow } from '@/common/hooks/use-now';
import { formatDuration, formatRange } from '../../services/rules';
import { STATUS_META } from '../../services/status';
import { StatusBadge } from '../shared';
import { OrderForm } from './OrderForm';

export interface TrackCardProps {
  readonly track: ClubTrackDto;
  readonly today: IsoDate;
  readonly rules: readonly ContentRule[];
  readonly ordering: boolean;
  readonly onOrder: (open: boolean) => void;
}

const BOOKABLE = new Set(['draft', 'completed', 'cancelled', 'refunded', 'refund-due', 'rejected']);

/** One song: listen, its plays, every rotation booked and what each is doing. */
export function TrackCard({ track, today, rules, ordering, onOrder }: TrackCardProps) {
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
        <ul className="flex flex-col divide-y divide-line rounded-card bg-paper-2 px-3 text-sm">
          {track.orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </ul>
      )}
      {ordering ? (
        <OrderForm track={track} today={today} rules={rules} onCancel={() => onOrder(false)} />
      ) : canBook ? (
        <Button variant={track.orders.length === 0 ? 'danfo' : 'paper'} onClick={() => onOrder(true)}>
          {track.orders.length === 0 ? 'Book club plays' : 'Book another run'}
        </Button>
      ) : null}
    </li>
  );
}

function OrderRow({ order }: { readonly order: ClubPlayOrderDto }) {
  const where = order.allClubs ? 'All clubs' : order.clubs.map((id) => findVenue(id)?.name ?? id).join(', ');
  const now = useNow();
  const holdOpen = order.holdExpiresAt !== null && Date.parse(order.holdExpiresAt) > now;
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-bold">{order.productName}</span>
        <StatusBadge status={order.status} />
      </div>
      <p className="text-xs text-text-soft">
        {where} · {formatRange(order.startDate, order.endDate)} · <Money amount={koboToNaira(order.amountKobo)} /> · {order.plays.toLocaleString('en-NG')} plays
      </p>
      {order.rejectionReason ? (
        <p className="text-xs">
          <span className="font-bold">Moderator:</span> “{order.rejectionReason}” {order.status === 'refund-due' ? STATUS_META['refund-due'].next : ''}
        </p>
      ) : (
        order.status === 'in-review' && <p className="text-xs text-text-soft">{STATUS_META['in-review'].next}</p>
      )}
      {order.status === 'pending-payment' && order.checkoutUrl && holdOpen && (
        <Button size="sm" className="self-start" onClick={() => order.checkoutUrl && window.location.assign(order.checkoutUrl)}>
          Finish payment
        </Button>
      )}
    </li>
  );
}
