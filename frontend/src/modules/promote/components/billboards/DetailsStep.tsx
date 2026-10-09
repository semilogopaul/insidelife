'use client';

import { CalendarDays, Lock, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { PROMOTION_TITLE_MAX, formatNaira, type BillboardSlotDto, type CreativeDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, TextField } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useCreateCampaign } from '../../hooks/use-promote';
import { addDays, firstOpenStart, formatDay, formatRange, quoteBillboard, rangeAvailability, validateDisplayText, validateLink, validateTitle } from '../../services/rules';
import type { SlotCatalog } from '../../services/slot-views';

/** Phone apps: the one-line pitch on the app page (the server allows the same). */
const TAGLINE_MAX = 60;
import { ContentRules } from '../shared';
import { AvailabilityCalendar } from './AvailabilityCalendar';

const LENGTHS = [1, 3, 7, 14, 30] as const;

export interface DetailsStepProps {
  readonly slot: BillboardSlotDto;
  readonly catalog: SlotCatalog;
  readonly creative: CreativeDto;
}

/** Title, https link, start date and length (with the weekly discount), the rules, then pay. */
export function DetailsStep({ slot, catalog, creative }: DetailsStepProps) {
  const isApp = slot.kind === 'phone-app';
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [link, setLink] = useState('https://');
  const [touched, setTouched] = useState({ title: false, tagline: false, link: false });
  const [days, setDays] = useState(7);
  const [start, setStart] = useState(() => firstOpenStart(slot.availability, catalog.today, 7) ?? catalog.today);
  const [accepted, setAccepted] = useState(false);
  const create = useCreateCampaign();

  const titleCheck = validateTitle(title);
  const taglineCheck = isApp ? validateDisplayText(tagline, 'Tagline', 3, TAGLINE_MAX) : null;
  const linkCheck = validateLink(link);
  const quote = quoteBillboard(slot.pricePerDayKobo, days);
  const range = rangeAvailability(slot.availability, start, days);
  const lastStart = addDays(catalog.today, catalog.maxLeadDays);
  const dateProblem = start < catalog.today ? 'Pick today or a later date.' : start > lastStart ? `Bookings can start up to ${formatDay(lastStart)}.` : range.fullDays.length > 0 ? `The board is full on ${range.fullDays.map(formatDay).join(', ')}. Pick other dates.` : null;
  const ready = titleCheck.ok && (taglineCheck?.ok ?? true) && linkCheck.ok && quote !== null && dateProblem === null && accepted;
  const leaving = create.isPending || create.isSuccess;

  const pay = (): void => {
    if (!ready || !titleCheck.ok || !linkCheck.ok) return;
    create.mutate({
      slotId: slot.id,
      creativeKey: creative.creativeKey,
      title: titleCheck.value,
      ...(taglineCheck?.ok ? { tagline: taglineCheck.value } : {}),
      linkUrl: linkCheck.value,
      startDate: start,
      days,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={isApp ? 'App name' : 'Ad title'}
        value={title}
        maxLength={PROMOTION_TITLE_MAX}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => setTouched((state) => ({ ...state, title: true }))}
        error={touched.title && !titleCheck.ok ? titleCheck.reason : null}
        hint={
          isApp
            ? `Shown under your icon on every player’s phone. Keep it short. ${PROMOTION_TITLE_MAX - title.length} characters left.`
            : `What players and moderators see as the ad’s name. ${PROMOTION_TITLE_MAX - title.length} characters left.`
        }
        placeholder={isApp ? 'Mama Put' : 'Mama Put Jollof — now in Yaba'}
      />
      {isApp && taglineCheck && (
        <TextField
          label="Tagline"
          value={tagline}
          maxLength={TAGLINE_MAX}
          onChange={(event) => setTagline(event.target.value)}
          onBlur={() => setTouched((state) => ({ ...state, tagline: true }))}
          error={touched.tagline && !taglineCheck.ok ? taglineCheck.reason : null}
          hint={`One line on your app page. ${TAGLINE_MAX - tagline.length} characters left.`}
          placeholder="Hot jollof delivered in Yaba in 30 minutes"
        />
      )}
      <TextField
        label="Link"
        type="url"
        inputMode="url"
        autoCapitalize="none"
        spellCheck={false}
        value={link}
        onChange={(event) => setLink(event.target.value)}
        onBlur={() => setTouched((state) => ({ ...state, link: true }))}
        error={touched.link && !linkCheck.ok ? linkCheck.reason : null}
        hint="Opens behind a “You’re leaving Inside Life” screen. https only, full address, no shorteners."
      />

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 flex items-center gap-1.5 text-sm font-bold">
          <CalendarDays size={16} aria-hidden /> When should it run?
        </legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Number of days">
          {LENGTHS.map((length) => (
            <button
              key={length}
              type="button"
              aria-pressed={days === length}
              onClick={() => setDays(length)}
              className={cn('h-9 rounded-full px-3 text-sm font-bold ring-1', days === length ? 'bg-ink text-on-ink ring-ink' : 'bg-paper ring-line hover:bg-paper-2')}
            >
              {length === 1 ? '1 day' : length === 7 ? '1 week' : length === 14 ? '2 weeks' : `${length} days`}
            </button>
          ))}
          <label className="flex h-9 items-center gap-1.5 rounded-full bg-paper px-3 text-sm ring-1 ring-line">
            <span className="sr-only">Custom number of days</span>
            <input
              type="number"
              min={catalog.minDays}
              max={catalog.maxDays}
              value={days}
              onChange={(event) => setDays(Math.min(catalog.maxDays, Math.max(catalog.minDays, Math.round(Number(event.target.value) || catalog.minDays))))}
              className="w-10 bg-transparent text-center font-bold tabular-nums focus:outline-none"
            />
            days
          </label>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span className="font-bold">Start date</span>
          <input
            type="date"
            min={catalog.today}
            max={lastStart}
            value={start}
            onChange={(event) => event.target.value && setStart(event.target.value)}
            className="h-10 rounded-card bg-paper-2 px-3 font-bold ring-1 ring-line"
          />
        </label>
        <AvailabilityCalendar days={slot.availability} selection={{ start, days }} onPick={setStart} />
        <p className={cn('flex gap-1.5 text-sm', dateProblem ? 'font-bold text-okada' : 'text-text-soft')}>
          {dateProblem && <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />}
          {dateProblem ??
            `Runs ${formatRange(start, addDays(start, days))}.${range.unknownDays > 0 ? ` ${range.unknownDays} of those days are past the calendar above — we confirm them when you pay.` : ''}`}
        </p>
      </fieldset>

      {quote && (
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 rounded-card bg-paper p-3.5 text-sm ring-1 ring-line">
          <dt className="text-text-soft">
            <Money amount={quote.unitNaira} /> × {days} {days === 1 ? 'day' : 'days'}
          </dt>
          <dd className="tabular text-right">
            <Money amount={quote.subtotalNaira} />
          </dd>
          <dt className="text-text-soft">Weekly discount ({catalog.weeklyDiscountPercent}% off full weeks)</dt>
          <dd className="tabular text-right text-naira">{quote.discountNaira > 0 ? <>−<Money amount={quote.discountNaira} /></> : '—'}</dd>
          <div aria-hidden className="col-span-2 my-0.5 border-t border-line" />
          <dt className="self-center font-bold">Total (real money)</dt>
          <dd className="type-figure text-right text-2xl">
            <Money amount={quote.totalNaira} />
          </dd>
          {quote.discountNaira === 0 && days < 7 && (
            <dd className="col-span-2 text-xs text-text-soft">Book 7 days or more and every full week is {catalog.weeklyDiscountPercent}% cheaper.</dd>
          )}
        </dl>
      )}

      <ContentRules rules={catalog.rules} scope="billboard" accepted={accepted} onAccept={setAccepted} />

      {create.isError && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(create.error)}
        </p>
      )}
      <div className="sticky bottom-0 -mx-1 bg-paper px-1 pb-1 pt-2">
        <Button size="lg" block icon={<Lock size={18} aria-hidden />} disabled={!ready} loading={leaving} onClick={pay}>
          {leaving ? 'Opening checkout…' : quote ? `Pay ${formatNaira(quote.totalNaira)}` : 'Pay'}
        </Button>
        <p className="mt-1.5 text-center text-xs text-text-soft">
          {!titleCheck.ok || !linkCheck.ok ? 'Add a title and an https link to continue.' : !accepted ? 'Tick the rules box to continue.' : 'Your spot is held for 30 minutes while you pay. Full refund if it isn’t approved.'}
        </p>
      </div>
    </div>
  );
}
