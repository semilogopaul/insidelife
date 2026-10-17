'use client';

import { cn } from '@/common/utils/cn';
import { PALETTE, liveryLabel } from '../services/hangar-rules';

/** A radio group of paint swatches for one livery colour (base or accent); the chosen colour's name is read out. */
export function LiverySwatches({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-xs font-bold text-text-soft">{liveryLabel(value)}</span>
      </div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {PALETTE.map((colour) => {
          const selected = colour.id === value;
          return (
            <button
              key={colour.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={colour.label}
              title={colour.label}
              onClick={() => onChange(colour.id)}
              className={cn(
                'grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-paper-2 transition',
                selected ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-text-faint',
              )}
            >
              <span className="size-6 rounded-full ring-1 ring-ink/20" style={{ background: colour.hex }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
