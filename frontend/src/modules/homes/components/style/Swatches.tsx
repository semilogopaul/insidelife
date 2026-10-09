'use client';

import { useId } from 'react';
import { cn } from '@/common/utils/cn';

export interface SwatchOption<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly hex: string;
  /** Small print under the label (e.g. a price per m²). */
  readonly note?: string;
}

/** A row of colour chips as a native radio group (keyboard and screen readers work as usual). */
export function Swatches<Id extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  readonly legend: string;
  readonly options: readonly SwatchOption<Id>[];
  readonly value: Id | null;
  readonly onChange: (id: Id) => void;
}) {
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-bold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.id}
            className="group flex w-[4.25rem] cursor-pointer flex-col items-center gap-1 text-center"
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              style={{ backgroundColor: option.hex }}
              className={cn(
                'size-10 rounded-full ring-1 ring-line transition-shadow peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
                value === option.id && 'ring-4 ring-danfo',
              )}
            />
            <span className="text-2xs font-bold leading-tight text-text-soft">{option.label}</span>
            {option.note && <span className="text-2xs leading-tight text-text-faint">{option.note}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
