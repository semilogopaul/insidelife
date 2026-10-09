import { Ban, CalendarCheck } from 'lucide-react';
import { DISTRICTS, koboToNaira, type BillboardFormat, type BillboardSlotDto, type IsoDate } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { nextFreeLabel } from '../../services/rules';

const TIER_LABEL = { premium: 'Premium', high: 'High traffic', standard: 'Standard', local: 'Local' } as const;

/** The board's real shape (3:1, 2:3, 1:1) drawn small, so formats read at a glance. */
export function FormatGlyph({ format, className }: { readonly format: BillboardFormat; readonly className?: string }) {
  const size = format === 'landscape' ? 'h-3.5 w-10.5' : format === 'portrait' ? 'h-9 w-6' : format === 'wide' ? 'h-5.5 w-10' : 'h-7 w-7';
  return (
    <span aria-hidden className={cn('grid h-9 w-11 shrink-0 place-items-center', className)}>
      <span className={cn('block rounded-[3px] border-2 border-current', size)} />
    </span>
  );
}

/** A board in the list: shape, place, traffic tier, price per 7 days and when a booking made now would start. */
export function SlotCard({ slot, today, onOpen }: { readonly slot: BillboardSlotDto; readonly today: IsoDate; readonly onOpen: () => void }) {
  const next = slot.nextStarts[0] ?? null;
  const soldOut = next === null;
  return (
    <button type="button" onClick={onOpen} className="flex h-full w-full flex-col gap-2 rounded-sheet bg-paper-2 p-3.5 text-left ring-1 ring-transparent transition-colors hover:bg-paper-3 hover:ring-line">
      <span className="flex items-start justify-between gap-2">
        <FormatGlyph format={slot.format} className="text-ink" />
        <span className={cn('rounded-chip px-1.5 py-0.5 text-2xs font-bold', slot.tier === 'premium' ? 'bg-ink text-danfo' : 'bg-paper text-text-soft ring-1 ring-line')}>{TIER_LABEL[slot.tier]}</span>
      </span>
      <span className="min-h-10">
        <span className="line-clamp-2 font-bold leading-tight">{slot.name}</span>
        <span className="block text-xs text-text-soft">{slot.districtId ? DISTRICTS[slot.districtId].name : 'Citywide'}</span>
      </span>
      <span className="mt-auto">
        <span className="type-figure text-lg">
          <Money amount={koboToNaira(slot.weekPriceKobo)} />
        </span>
        <span className="text-xs text-text-soft"> /week</span>
      </span>
      <span className={cn('flex items-center gap-1 text-2xs', soldOut ? 'font-bold text-okada' : next === today ? 'font-bold text-naira' : 'text-text-soft')}>
        {soldOut ? <Ban size={11} aria-hidden /> : <CalendarCheck size={11} aria-hidden />}
        {nextFreeLabel(next, today)}
      </span>
    </button>
  );
}
