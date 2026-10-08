'use client';

import { Lock } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import {
  CLUB_PLAY_MAX_LEAD_DAYS,
  CLUB_PLAY_PRODUCTS,
  DISTRICTS,
  clubPlayVenues,
  formatNaira,
  koboToNaira,
  type ClubPlayProductId,
  type ClubTrackDto,
  type ContentRule,
  type IsoDate,
} from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useOrderRotation } from '../../hooks/use-promote';
import { addDays, formatRange } from '../../services/rules';
import { ContentRules } from '../shared';

export interface OrderFormProps {
  readonly track: ClubTrackDto;
  readonly today: IsoDate;
  readonly rules: readonly ContentRule[];
  readonly onCancel: () => void;
}

/** Choose one club or all of them, how long, when to start — then pay. */
export function OrderForm({ track, today, rules, onCancel }: OrderFormProps) {
  const groupId = useId();
  const clubs = useMemo(() => clubPlayVenues(), []);
  const [productId, setProductId] = useState<ClubPlayProductId>('all-clubs-3d');
  const [club, setClub] = useState(clubs[0]?.id ?? '');
  const [start, setStart] = useState(today);
  const [accepted, setAccepted] = useState(false);
  const order = useOrderRotation();
  const product = CLUB_PLAY_PRODUCTS.find((item) => item.id === productId) ?? CLUB_PLAY_PRODUCTS[0]!;
  const single = product.scope === 'single-club';
  const lastStart = addDays(today, CLUB_PLAY_MAX_LEAD_DAYS);
  const ready = accepted && (!single || club !== '') && start >= today && start <= lastStart;
  const leaving = order.isPending || order.isSuccess;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {(['all-clubs', 'single-club'] as const).map((scope) => (
        <fieldset key={scope}>
          <legend className="mb-1.5 text-sm font-bold">{scope === 'all-clubs' ? `Every club in Lagos (${clubs.length})` : 'One club'}</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {CLUB_PLAY_PRODUCTS.filter((item) => item.scope === scope).map((item) => (
              <label
                key={item.id}
                className={cn(
                  'flex cursor-pointer flex-col items-center rounded-card px-1 py-2 text-center ring-1 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-danfo',
                  productId === item.id ? 'bg-ink text-on-ink ring-ink' : 'bg-paper ring-line hover:bg-paper-3',
                )}
              >
                <input type="radio" name={groupId} value={item.id} checked={productId === item.id} onChange={() => setProductId(item.id)} className="sr-only" />
                <span className="text-sm font-bold">
                  {item.days} {item.days === 1 ? 'day' : 'days'}
                </span>
                <span className={cn('type-figure text-sm', productId === item.id ? 'text-danfo' : '')}>
                  <Money amount={koboToNaira(item.priceKobo)} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-text-soft">{product.description}</p>

      {single && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-bold">Which club?</span>
          <select value={club} onChange={(event) => setClub(event.target.value)} className="h-11 rounded-card bg-paper px-3 ring-1 ring-line">
            {clubs.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name} — {DISTRICTS[venue.districtId].name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="font-bold">Start</span>
        <input type="date" min={today} max={lastStart} value={start} onChange={(event) => event.target.value && setStart(event.target.value)} className="h-10 rounded-card bg-paper px-3 font-bold ring-1 ring-line" />
      </label>
      <p className="text-xs text-text-soft">Plays {formatRange(start, addDays(start, product.days))} (Lagos time), after a moderator approves the song.</p>

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
          onClick={() => order.mutate({ trackId: track.id, body: { productId, clubs: single ? [club] : ['all'], startDate: start } })}
        >
          {leaving ? 'Opening checkout…' : `Pay ${formatNaira(koboToNaira(product.priceKobo))}`}
        </Button>
      </div>
    </div>
  );
}
