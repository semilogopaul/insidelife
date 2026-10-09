'use client';

import { CalendarDays, Lock, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { PROMOTION_TITLE_MAX, formatNaira, type BillboardSlotDto, type CreativeDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, TextField } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { useCreateCampaign } from '../../hooks/use-promote';
import { addDays, formatRunDays, quoteWeeks, validateDisplayText, validateLink, validateTitle } from '../../services/rules';
import type { SlotCatalog } from '../../services/slot-views';
import { ContentRules } from '../shared';

/** Phone apps: the one-line pitch on the app page (the server allows the same). */
const TAGLINE_MAX = 60;

const weeksLabel = (weeks: number): string => (weeks === 1 ? '1 week' : `${weeks} weeks`);

export interface DetailsStepProps {
  readonly slot: BillboardSlotDto;
  readonly catalog: SlotCatalog;
  readonly creative: CreativeDto;
}

/** Title, https link, how many weeks (the run starts on the slot's next free day), the rules, then pay. */
export function DetailsStep({ slot, catalog, creative }: DetailsStepProps) {
  const isApp = slot.kind === 'phone-app';
  const [title, setTitle] = useState('');
  const [tagline, setTagline] = useState('');
  const [link, setLink] = useState('https://');
  const [touched, setTouched] = useState({ title: false, tagline: false, link: false });
  const [weeks, setWeeks] = useState(1);
  const [accepted, setAccepted] = useState(false);
  const create = useCreateCampaign();

  const titleCheck = validateTitle(title);
  const taglineCheck = isApp ? validateDisplayText(tagline, 'Tagline', 3, TAGLINE_MAX) : null;
  const linkCheck = validateLink(link);
  const quote = quoteWeeks(slot.weekPriceKobo, weeks);
  const start = slot.nextStarts[weeks - 1] ?? null;
  const ready = titleCheck.ok && (taglineCheck?.ok ?? true) && linkCheck.ok && quote !== null && start !== null && accepted;
  const leaving = create.isPending || create.isSuccess;

  const pay = (): void => {
    if (!ready || !titleCheck.ok || !linkCheck.ok || !start) return;
    create.mutate({
      slotId: slot.id,
      creativeKey: creative.creativeKey,
      title: titleCheck.value,
      ...(taglineCheck?.ok ? { tagline: taglineCheck.value } : {}),
      linkUrl: linkCheck.value,
      weeks,
      expectedStartDate: start,
      ...(quote ? { expectedPriceKobo: quote.totalKobo } : {}),
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
          <CalendarDays size={16} aria-hidden /> How many weeks?
        </legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Number of weeks">
          {Array.from({ length: catalog.maxWeeks }, (_, index) => index + 1).map((length) => (
            <button
              key={length}
              type="button"
              aria-pressed={weeks === length}
              onClick={() => setWeeks(length)}
              className={cn('h-9 rounded-full px-3 text-sm font-bold ring-1', weeks === length ? 'bg-ink text-on-ink ring-ink' : 'bg-paper ring-line hover:bg-paper-2')}
            >
              {weeksLabel(length)}
            </button>
          ))}
        </div>
        <p className={cn('flex gap-1.5 text-sm', start ? 'font-bold' : 'font-bold text-okada')} aria-live="polite">
          {!start && <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />}
          {start
            ? `Runs ${formatRunDays(start, addDays(start, weeks * 7))}`
            : `No room for ${weeksLabel(weeks)} in the next two months. Try fewer weeks or another board.`}
        </p>
        {start && (
          <p className="text-xs text-text-soft">
            Your ad starts on this board’s next free day ({start === catalog.today ? 'today' : 'the day the earlier booking ends'}) and runs for the
            weeks you pick, back to back.
          </p>
        )}
      </fieldset>

      {quote && (
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 rounded-card bg-paper p-3.5 text-sm ring-1 ring-line">
          <dt className="text-text-soft">
            <Money amount={quote.weekNaira} /> × {weeksLabel(quote.weeks)}
          </dt>
          <dd className="tabular text-right">
            <Money amount={quote.totalNaira} />
          </dd>
          <div aria-hidden className="col-span-2 my-0.5 border-t border-line" />
          <dt className="self-center font-bold">Total (real money)</dt>
          <dd className="type-figure text-right text-2xl">
            <Money amount={quote.totalNaira} />
          </dd>
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
