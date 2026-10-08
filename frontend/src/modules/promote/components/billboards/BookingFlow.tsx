'use client';

import { Eye, MapPin } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { BILLBOARD_FORMAT_SPECS, DISTRICTS, koboToNaira, type BillboardSlotDto, type BillboardSlotsDto, type CreativeDto } from '@insidelife/shared';
import { Button, Money } from '@/common/components';
import { StepHeader } from '../shared';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { CreativeStep } from './CreativeStep';
import { DetailsStep } from './DetailsStep';
import { FormatGlyph, availabilitySummary } from './SlotCard';

type Step = 'board' | 'creative' | 'details';
const STEP_TITLES: Readonly<Record<Step, string>> = { board: 'Board', creative: 'Your image', details: 'Dates & payment' };

/** Board details → upload the creative → title, link, dates, rules, pay. */
export function BookingFlow({ slot, catalog, onExit }: { readonly slot: BillboardSlotDto; readonly catalog: BillboardSlotsDto; readonly onExit: () => void }) {
  const [step, setStep] = useState<Step>('board');
  const [creative, setCreative] = useState<CreativeDto | null>(null);
  const back = (): void => (step === 'board' ? onExit() : setStep(step === 'details' ? 'creative' : 'board'));
  const index = (['board', 'creative', 'details'] as const).indexOf(step);

  return (
    <div className="flex flex-col gap-4 pb-2">
      <StepHeader
        title={step === 'board' ? slot.name : STEP_TITLES[step]}
        onBack={back}
        backLabel={step === 'board' ? 'Back to all boards' : 'Previous step'}
        aside={<span className="shrink-0 text-xs font-bold text-text-soft">Step {index + 1} of 3</span>}
      />
      {step === 'board' && <BoardDetail slot={slot} onBook={() => setStep('creative')} />}
      {step === 'creative' && <CreativeStep slot={slot} creative={creative} onUploaded={setCreative} onNext={() => setStep('details')} />}
      {step === 'details' && creative && <DetailsStep slot={slot} catalog={catalog} creative={creative} />}
    </div>
  );
}

function BoardDetail({ slot, onBook }: { readonly slot: BillboardSlotDto; readonly onBook: () => void }) {
  const spec = BILLBOARD_FORMAT_SPECS[slot.format];
  const full = slot.availability.every((day) => day.booked >= day.capacity);
  return (
    <>
      <div className="flex items-start gap-3 rounded-sheet bg-ink p-4 text-on-ink">
        <FormatGlyph format={slot.format} className="text-danfo" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-xs font-bold text-on-ink-soft">
            <MapPin size={12} aria-hidden /> {DISTRICTS[slot.districtId].name} · {slot.placement}
          </p>
          <p className="mt-1 text-sm">{slot.description}</p>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Fact label="Per day" value={<Money amount={koboToNaira(slot.pricePerDayKobo)} />} />
        <Fact label="Per week" value={<Money amount={koboToNaira(slot.weekPriceKobo)} />} />
        <Fact label="Ads share it" value={`Up to ${slot.maxConcurrentAds}`} />
      </dl>
      <p className="text-sm text-text-soft">
        {spec.label} {spec.aspect} board, {spec.width} × {spec.height} px. Ads take turns every 10 seconds. Prices are real money, per real day (Lagos time).
        {slot.liveCount > 0 && (
          <span className="ml-1 inline-flex items-center gap-1 font-bold text-text">
            <Eye size={13} aria-hidden /> {slot.liveCount} live now.
          </span>
        )}
      </p>
      <section aria-label="Availability">
        <h4 className="mb-2 flex items-baseline justify-between text-sm font-bold">
          Next 4 weeks <span className="text-xs font-normal text-text-soft">{availabilitySummary(slot)}</span>
        </h4>
        <AvailabilityCalendar days={slot.availability} />
      </section>
      <div className="sticky bottom-0 -mx-1 bg-paper px-1 pb-1 pt-2">
        <Button size="lg" block disabled={full} onClick={onBook}>
          {full ? 'Fully booked — try another board' : 'Book this board'}
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
