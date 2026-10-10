'use client';

import { CalendarDays, Lock, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { CLUB_PLAY_PRODUCT, formatNaira, formatUsdCents, koboToNaira, type ClubSongOfferDto, type ClubTrackDto, type ContentRule, type UsdPaymentOptionsDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money } from '@/common/components';
import { dollarPriceFor, dollarUnavailableReason, PAYMENT_METHOD_LABELS, PayInPicker, paymentChoiceBody, usePaymentChoice } from '@/common/payments';
import { cn } from '@/common/utils/cn';
import { useOrderRotation } from '../../hooks/use-promote';
import { blocksLabel, quoteBlocks, runSummary } from '../../services/rules';
import { songGuaranteeLine } from '../../services/song-value';
import { ContentRules } from '../shared';

export interface OrderFormProps {
  readonly track: ClubTrackDto;
  /** Today's price, start dates and plays guarantee (null while loading). */
  readonly offer: ClubSongOfferDto | null;
  readonly rules: readonly ContentRule[];
  /** Paying in dollars, when the server offers it (null: naira only). */
  readonly usd: UsdPaymentOptionsDto | null;
  readonly onCancel: () => void;
}

/**
 * One product: a song in every club and lounge, ₦5,000 a day sold by the week (1–4 weeks), from the rotation's next
 * free day, with a guaranteed number of plays a day. Check the dates and the guarantee, pay.
 */
export function OrderForm({ track, offer, rules, usd, onCancel }: OrderFormProps) {
  const [weeks, setWeeks] = useState(1);
  const [accepted, setAccepted] = useState(false);
  const order = useOrderRotation();
  const product = CLUB_PLAY_PRODUCT;
  const weekPriceKobo = offer?.weekPriceKobo ?? product.priceKobo;
  const quote = quoteBlocks(weekPriceKobo, weeks, 7);
  const dollarPrice = quote ? dollarPriceFor(quote.totalKobo, usd) : null;
  const payment = usePaymentChoice(usd, dollarPrice !== null && !dollarPrice.belowMinimum);
  const inDollars = payment.currency === 'USD' && dollarPrice !== null;
  const start = offer?.nextStarts[weeks - 1] ?? null;
  const ready = accepted && start !== null && quote !== null;
  const leaving = order.isPending || order.isSuccess;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <div className="rounded-card bg-ink px-3.5 py-3 text-on-ink">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold">Every club and lounge in Lagos{offer ? ` (${offer.clubs})` : ''}</p>
          <span className="type-figure shrink-0 text-lg text-danfo">
            <Money amount={koboToNaira(weekPriceKobo)} />
            <span className="text-xs text-on-ink-soft"> /week</span>
          </span>
        </div>
        {offer && <p className="mt-1 text-sm text-on-ink-soft">{songGuaranteeLine(offer, track.durationSeconds)}</p>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <CalendarDays size={16} aria-hidden /> How many weeks?
        </legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Number of weeks">
          {Array.from({ length: offer?.maxWeeks ?? 4 }, (_, index) => index + 1).map((length) => (
            <button
              key={length}
              type="button"
              aria-pressed={weeks === length}
              onClick={() => setWeeks(length)}
              className={cn('h-9 rounded-full px-3 text-sm font-bold ring-1', weeks === length ? 'bg-ink text-on-ink ring-ink' : 'bg-paper ring-line hover:bg-paper-2')}
            >
              {blocksLabel(length, 7)}
            </button>
          ))}
        </div>
      </fieldset>
      <p className={start ? 'text-sm font-bold' : 'flex gap-1.5 text-sm font-bold text-okada'} aria-live="polite">
        {!start && offer !== null && <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />}
        {offer === null
          ? 'Checking the rotation…'
          : start
            ? `${runSummary(start, weeks * 7).replace('Runs', 'Plays')} (Lagos time)`
            : `Every lane of the rotation is booked for the next month for ${blocksLabel(weeks, 7)}. Try fewer weeks, or again in a few days.`}
      </p>
      <p className="text-xs text-text-soft">
        Only {offer?.lanes ?? 12} songs play at once, so every booked song gets its plays. Yours starts on the first day a place frees up for the whole
        run, after a moderator approves it. Not approved? Your payment is refunded automatically.
      </p>

      {quote && (
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 rounded-card bg-paper p-3 text-sm ring-1 ring-line">
          <dt className="text-text-soft">
            <Money amount={quote.blockNaira} /> a week × {quote.blocks}
          </dt>
          <dd className="type-figure text-right text-lg">
            <Money amount={quote.totalNaira} />
          </dd>
          {inDollars && (
            <>
              <dt className="font-bold">You pay in dollars</dt>
              <dd className="type-figure text-right text-lg">{formatUsdCents(dollarPrice.cents)}</dd>
            </>
          )}
        </dl>
      )}

      {quote && (
        <PayInPicker
          usd={usd}
          payment={payment}
          nairaPrice={formatNaira(quote.totalNaira)}
          dollarPrice={dollarPrice ? formatUsdCents(dollarPrice.cents) : null}
          dollarNote={dollarUnavailableReason(dollarPrice, usd)}
        />
      )}

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
          onClick={() =>
            start &&
            quote &&
            order.mutate({
              trackId: track.id,
              body: { productId: product.id, weeks, clubs: ['all'], expectedStartDate: start, expectedPriceKobo: quote.totalKobo, ...paymentChoiceBody(payment, usd) },
            })
          }
        >
          {leaving
            ? 'Opening checkout…'
            : inDollars
              ? `Pay ${formatUsdCents(dollarPrice.cents)}${payment.method !== 'card' ? ` with ${PAYMENT_METHOD_LABELS[payment.method]}` : ''}`
              : `Pay ${formatNaira(quote?.totalNaira ?? koboToNaira(weekPriceKobo))}`}
        </Button>
        <p className="mt-1.5 text-center text-xs text-text-soft">Flutterwave adds its small processing fee at checkout.</p>
      </div>
    </div>
  );
}
