import { Ban } from 'lucide-react';
import { DISTRICTS, koboToNaira, type BillboardFormat, type BillboardSlotDto } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { dayState, formatDay } from '../../services/rules';

const TIER_LABEL = { premium: 'Premium', high: 'High traffic', standard: 'Standard', local: 'Local' } as const;

/** The board's real shape (3:1, 2:3, 1:1) drawn small, so formats read at a glance. */
export function FormatGlyph({ format, className }: { readonly format: BillboardFormat; readonly className?: string }) {
  const size = format === 'landscape' ? 'h-3.5 w-10.5' : format === 'portrait' ? 'h-9 w-6' : 'h-7 w-7';
  return (
    <span aria-hidden className={cn('grid h-9 w-11 shrink-0 place-items-center', className)}>
      <span className={cn('block rounded-[3px] border-2 border-current', size)} />
    </span>
  );
}

/** 28-day occupancy in one thin strip (summary only; the text beside it carries the meaning). */
export function AvailabilityStrip({ slot }: { readonly slot: BillboardSlotDto }) {
  return (
    <span aria-hidden className="flex h-2 gap-px">
      {slot.availability.map((day) => {
        const state = dayState(day);
        return <span key={day.date} className={cn('flex-1 first:rounded-l-full last:rounded-r-full', state === 'full' ? 'bg-okada' : state === 'filling' ? 'bg-danfo' : 'bg-naira/35')} />;
      })}
    </span>
  );
}

export function availabilitySummary(slot: BillboardSlotDto): string {
  const open = slot.availability.filter((day) => dayState(day) !== 'full');
  const filling = slot.availability.filter((day) => dayState(day) === 'filling').length;
  if (open.length === 0) return 'Fully booked for 4 weeks';
  if (open.length === slot.availability.length) return filling > 0 ? `Space every day · ${filling} days filling up` : 'Free every day for 4 weeks';
  const first = open[0];
  return `${open.length} of ${slot.availability.length} days free${first && first.date !== slot.availability[0]?.date ? ` · next from ${formatDay(first.date)}` : ''}`;
}

/** A board in the list: shape, place, traffic tier, price per real day and the 4-week strip. */
export function SlotCard({ slot, onOpen }: { readonly slot: BillboardSlotDto; readonly onOpen: () => void }) {
  const soldOut = slot.availability.every((day) => dayState(day) === 'full');
  return (
    <button type="button" onClick={onOpen} className="flex h-full w-full flex-col gap-2 rounded-sheet bg-paper-2 p-3.5 text-left ring-1 ring-transparent transition-colors hover:bg-paper-3 hover:ring-line">
      <span className="flex items-start justify-between gap-2">
        <FormatGlyph format={slot.format} className="text-ink" />
        <span className={cn('rounded-chip px-1.5 py-0.5 text-2xs font-bold', slot.tier === 'premium' ? 'bg-ink text-danfo' : 'bg-paper text-text-soft ring-1 ring-line')}>{TIER_LABEL[slot.tier]}</span>
      </span>
      <span className="min-h-10">
        <span className="line-clamp-2 font-bold leading-tight">{slot.name}</span>
        <span className="block text-xs text-text-soft">{DISTRICTS[slot.districtId].name}</span>
      </span>
      <span className="mt-auto">
        <span className="type-figure text-lg">
          <Money amount={koboToNaira(slot.pricePerDayKobo)} />
        </span>
        <span className="text-xs text-text-soft"> /day</span>
      </span>
      <AvailabilityStrip slot={slot} />
      <span className={cn('flex items-center gap-1 text-2xs', soldOut ? 'font-bold text-okada' : 'text-text-soft')}>
        {soldOut && <Ban size={11} aria-hidden />}
        {availabilitySummary(slot)}
      </span>
    </button>
  );
}
