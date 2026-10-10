'use client';

import { useState } from 'react';
import { PAINT_FINISH_LABELS, VEHICLE_PAINTS, formatNairaCompact, type VehiclePaintId } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';

/**
 * Paint picker: a radio group of swatches (name read out, visible on hover/focus and below). Premium finishes
 * (metallic, pearl, matte, special order) show a gold dot and their extra cost. Every car comes in every colour, so the
 * car's signature paints show first and "+N colours" opens the rest.
 */
const SIGNATURE_COUNT = 6;

export function PaintSwatches({
  paints,
  value,
  onChange,
  label,
  fees = {},
}: {
  readonly paints: readonly VehiclePaintId[];
  readonly value: VehiclePaintId;
  readonly onChange: (paint: VehiclePaintId) => void;
  readonly label: string;
  /** Extra cost per paint (missing = free). */
  readonly fees?: Readonly<Partial<Record<VehiclePaintId, number>>>;
}) {
  const fee = fees[value] ?? 0;
  const [all, setAll] = useState(false);
  const signature = paints.slice(0, SIGNATURE_COUNT);
  // The chosen paint always stays visible, even when it's one of the extra colours.
  const shown = all ? paints : signature.includes(value) ? signature : [...signature, value];
  const hidden = paints.length - shown.length;
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {shown.map((paint) => {
          const selected = paint === value;
          return (
            <button
              key={paint}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${VEHICLE_PAINTS[paint].label}${fees[paint] ? `, ${PAINT_FINISH_LABELS[VEHICLE_PAINTS[paint].finish].toLowerCase()}, plus ${formatNairaCompact(fees[paint] ?? 0)}` : ''}`}
              title={VEHICLE_PAINTS[paint].label}
              onClick={() => onChange(paint)}
              className={cn(
                'relative grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-paper-2 transition',
                selected ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-text-faint',
              )}
            >
              <span
                className="size-6 rounded-full ring-1 ring-ink/20"
                style={{ background: VEHICLE_PAINTS[paint].hex }}
              />
              {(fees[paint] ?? 0) > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-danfo ring-2 ring-paper-2" />}
            </button>
          );
        })}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="h-8 rounded-full px-2.5 text-xs font-bold text-ink ring-1 ring-line hover:bg-paper-3"
          >
            +{hidden} colours
          </button>
        )}
      </div>
      <span className="min-w-0 text-xs font-bold leading-tight text-text-soft">
        {VEHICLE_PAINTS[value].label}
        {fee > 0 && (
          <span className="block font-normal">
            {PAINT_FINISH_LABELS[VEHICLE_PAINTS[value].finish]} · +<Money amount={fee} compact />
          </span>
        )}
      </span>
    </div>
  );
}
