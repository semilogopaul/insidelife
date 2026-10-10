'use client';

import { Eye, MapPin } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { AD_SLOT_KIND_LABELS, BILLBOARD_FORMAT_SPECS, DISTRICTS, koboToNaira, type BillboardSlotDto, type CreativeDto, type IsoDate } from '@insidelife/shared';
import { blocksLabel, formatDay, nextFreeLabel } from '../../services/rules';
import type { SlotCatalog } from '../../services/slot-views';
import { Button, Money } from '@/common/components';
import { StepHeader } from '../shared';
import { CreativeStep } from './CreativeStep';
import { DetailsStep, type DetailsPrefill } from './DetailsStep';
import { FormatGlyph } from './SlotCard';

type Step = 'board' | 'creative' | 'details';
const STEP_TITLES: Readonly<Record<Step, string>> = { board: 'Board', creative: 'Your image', details: 'Dates & payment' };

/** "Run it again": the earlier booking's image (when it can be reused here) and words. */
export interface BookingRerun extends DetailsPrefill {
  readonly creative: CreativeDto | null;
}

/** Board details → upload the creative → title, link, how long, rules, pay. A re-run starts at the details. */
export function BookingFlow({ slot, catalog, onExit, rerun }: { readonly slot: BillboardSlotDto; readonly catalog: SlotCatalog; readonly onExit: () => void; readonly rerun?: BookingRerun }) {
  const reusable = rerun?.creative && rerun.creative.format === slot.format ? rerun.creative : null;
  const [step, setStep] = useState<Step>(reusable ? 'details' : 'board');
  const [creative, setCreative] = useState<CreativeDto | null>(reusable);
  const back = (): void => (step === 'board' ? onExit() : setStep(step === 'details' ? 'creative' : 'board'));
  const index = (['board', 'creative', 'details'] as const).indexOf(step);

  return (
    <div className="flex flex-col gap-4 pb-2">
      <StepHeader
        title={step === 'board' ? slot.name : STEP_TITLES[step]}
        onBack={back}
        backLabel={step === 'board' ? 'Back' : 'Previous step'}
        aside={<span className="shrink-0 text-xs font-bold text-text-soft">Step {index + 1} of 3</span>}
      />
      {rerun && step === 'details' && <p className="rounded-card bg-paper-2 p-3 text-sm">Running it again with the same image and words. Change anything you like; the price is today’s.</p>}
      {step === 'board' && <BoardDetail slot={slot} today={catalog.today} onBook={() => setStep('creative')} />}
      {step === 'creative' && <CreativeStep slot={slot} creative={creative} onUploaded={setCreative} onNext={() => setStep('details')} />}
      {step === 'details' && creative && <DetailsStep slot={slot} catalog={catalog} creative={creative} prefill={rerun} />}
    </div>
  );
}

function BoardDetail({ slot, today, onBook }: { readonly slot: BillboardSlotDto; readonly today: IsoDate; readonly onBook: () => void }) {
  const spec = BILLBOARD_FORMAT_SPECS[slot.format];
  const next = slot.nextStarts[0] ?? null;
  const full = next === null;
  const short = slot.blockDays !== 7;
  return (
    <>
      <div className="flex items-start gap-3 rounded-sheet bg-ink p-4 text-on-ink">
        <FormatGlyph format={slot.format} className="text-danfo" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-xs font-bold text-on-ink-soft">
            <MapPin size={12} aria-hidden /> {slot.districtId ? DISTRICTS[slot.districtId].name : 'Citywide'} · {AD_SLOT_KIND_LABELS[slot.kind]}
          </p>
          <p className="mt-1 text-sm">{slot.description}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Fact label={short ? `Per ${slot.blockDays} days` : 'Per week'} value={<Money amount={koboToNaira(slot.blockPriceKobo)} />} />
        <Fact label="Ads share it" value={`Up to ${slot.maxConcurrentAds}`} />
        <Fact label="Starts" value={full ? 'Fully booked' : next <= today ? 'Today' : formatDay(next)} />
      </dl>
      <p className="text-sm text-text-soft">
        {spec.label} {spec.aspect} board, {spec.width} × {spec.height} px. Ads take turns every 10 seconds.{' '}
        {short
          ? `A premium spot, so it’s sold in ${slot.blockDays}-day blocks (up to ${blocksLabel(slot.maxBlocks, slot.blockDays)} in one booking): `
          : `Sold in weeks of 7 days in a row (up to ${blocksLabel(slot.maxBlocks, slot.blockDays)}): `}
        real days, Lagos time, real money.
        {slot.liveCount > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 font-bold text-text">
            <Eye size={13} aria-hidden /> {slot.liveCount} live now.
          </span>
        )}
      </p>
      <p className="rounded-card bg-paper-2 p-3 text-sm">
        <span className="font-bold">{nextFreeLabel(next, today)}.</span>{' '}
        {full
          ? 'Every day in the next two months is taken. Try another spot.'
          : 'Your ad starts on the next free day and runs for the blocks you pick, back to back. You don’t pick days.'}
      </p>
      <div className="sticky bottom-0 -mx-1 bg-paper px-1 pb-1 pt-2">
        <Button size="lg" block disabled={full} onClick={onBook}>
          {full ? 'Fully booked — try another spot' : 'Book this spot'}
        </Button>
      </div>
    </>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="rounded-card bg-paper-2 px-2 py-2">
      <dt className="text-2xs font-bold text-text-soft">{label}</dt>
      <dd className="type-figure mt-0.5 text-sm">{value}</dd>
    </div>
  );
}
