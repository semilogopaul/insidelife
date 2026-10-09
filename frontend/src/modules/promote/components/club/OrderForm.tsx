'use client';

import { Lock, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CLUB_PLAY_PRODUCT, clubPlayVenues, formatNaira, koboToNaira, type ClubSongOfferDto, type ClubTrackDto, type ContentRule } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money } from '@/common/components';
import { useOrderRotation } from '../../hooks/use-promote';
import { addDays, formatRunDays } from '../../services/rules';
import { ContentRules } from '../shared';

export interface OrderFormProps {
  readonly track: ClubTrackDto;
  /** Today's price and start date (null while loading). */
  readonly offer: ClubSongOfferDto | null;
  readonly rules: readonly ContentRule[];
  readonly onCancel: () => void;
}

/** One product: a song in every club and lounge for 7 days, from the rotation's next free day. Check the dates, pay. */
export function OrderForm({ track, offer, rules, onCancel }: OrderFormProps) {
  const clubs = useMemo(() => clubPlayVenues(), []);
  const [accepted, setAccepted] = useState(false);
  const order = useOrderRotation();
  const product = CLUB_PLAY_PRODUCT;
  const start = offer?.startDate ?? null;
  const priceKobo = offer?.priceKobo ?? product.priceKobo;
  const ready = accepted && start !== null;
  const leaving = order.isPending || order.isSuccess;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-3 rounded-card bg-ink px-3.5 py-3 text-on-ink">
        <div>
          <p className="text-sm font-bold">Every club and lounge in Lagos ({clubs.length})</p>
          <p className="text-xs text-on-ink-soft">{product.days} days in rotation, every play counted</p>
        </div>
        <span className="type-figure text-lg text-danfo">
          <Money amount={koboToNaira(priceKobo)} />
        </span>
      </div>
      <p className={start ? 'text-sm font-bold' : 'flex gap-1.5 text-sm font-bold text-okada'} aria-live="polite">
        {!start && <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />}
        {offer === null
          ? 'Checking the rotation…'
          : start
            ? `Plays ${formatRunDays(start, addDays(start, product.days))} (Lagos time)`
            : 'Every club’s rotation is full for the next month. Try again in a few days.'}
      </p>
      <p className="text-xs text-text-soft">
        Your song starts on the next day every club has room, after a moderator approves it. Not approved? Your payment is refunded automatically.
      </p>

      <ContentRules rules={rules} scope="music" accepted={accepted} onAccept={setAccepted} />
      {order.isError && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(order.error)}
        </p>
      )}
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <Button variant="paper" size="lg" onClick={onCancel}>
          Not now
        </Button>
        <Button
          size="lg"
          icon={<Lock size={18} aria-hidden />}
          disabled={!ready}
          loading={leaving}
          onClick={() => start && order.mutate({ trackId: track.id, body: { productId: product.id, clubs: ['all'], expectedStartDate: start } })}
        >
          {leaving ? 'Opening checkout…' : `Pay ${formatNaira(koboToNaira(priceKobo))}`}
        </Button>
      </div>
    </div>
  );
}
