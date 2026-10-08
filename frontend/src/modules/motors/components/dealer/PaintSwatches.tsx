'use client';

import { VEHICLE_PAINTS, type VehiclePaintId } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

/** Paint picker: a radio group of swatches (name read out, visible on hover/focus and below). */
export function PaintSwatches({
  paints,
  value,
  onChange,
  label,
}: {
  readonly paints: readonly VehiclePaintId[];
  readonly value: VehiclePaintId;
  readonly onChange: (paint: VehiclePaintId) => void;
  readonly label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {paints.map((paint) => {
          const selected = paint === value;
          return (
            <button
              key={paint}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={VEHICLE_PAINTS[paint].label}
              title={VEHICLE_PAINTS[paint].label}
              onClick={() => onChange(paint)}
              className={cn(
                'grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-paper-2 transition',
                selected ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-text-faint',
              )}
            >
              <span
                className="size-6 rounded-full ring-1 ring-ink/20"
                style={{ background: VEHICLE_PAINTS[paint].hex }}
              />
            </button>
          );
        })}
      </div>
      <span className="min-w-0 truncate text-xs font-bold text-text-soft">{VEHICLE_PAINTS[value].label}</span>
    </div>
  );
}
