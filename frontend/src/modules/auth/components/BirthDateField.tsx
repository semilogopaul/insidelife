'use client';

import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/common/utils/cn';
import type { BirthDateParts } from '../lib/birth-date';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface BirthDateFieldProps {
  readonly value: BirthDateParts;
  readonly onChange: (value: BirthDateParts) => void;
  readonly error?: string | null;
}

const box =
  'h-12 w-full rounded-card bg-paper-2 px-3.5 text-[1rem] text-text ring-1 ring-line transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ink';

/**
 * Date of birth as day / month / year: the most reliable pattern for a date people know by heart (no calendar to
 * scroll back through decades), with the browser's `bday-*` autofill.
 */
export function BirthDateField({ value, onChange, error }: BirthDateFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const invalid = error ? 'ring-2 ring-okada' : undefined;
  return (
    <fieldset aria-describedby={hintId} className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-bold text-text">Date of birth</legend>
      <div className="grid grid-cols-[4.25rem_minmax(0,1fr)_5.5rem] gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-day`} className="text-xs text-text-soft">
            Day
          </label>
          <input
            id={`${id}-day`}
            inputMode="numeric"
            autoComplete="bday-day"
            maxLength={2}
            placeholder="DD"
            value={value.day}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange({ ...value, day: event.target.value.replace(/\D/g, '') })}
            className={cn(box, invalid)}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${id}-month`} className="text-xs text-text-soft">
            Month
          </label>
          <div className="relative">
            <select
              id={`${id}-month`}
              autoComplete="bday-month"
              value={value.month}
              aria-invalid={error ? true : undefined}
              onChange={(event) => onChange({ ...value, month: event.target.value })}
              className={cn(box, 'appearance-none truncate pr-9', !value.month && 'text-text-faint', invalid)}
            >
              <option value="" disabled>
                Month
              </option>
              {MONTHS.map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={18}
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-soft"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-year`} className="text-xs text-text-soft">
            Year
          </label>
          <input
            id={`${id}-year`}
            inputMode="numeric"
            autoComplete="bday-year"
            maxLength={4}
            placeholder="YYYY"
            value={value.year}
            aria-invalid={error ? true : undefined}
            onChange={(event) => onChange({ ...value, year: event.target.value.replace(/\D/g, '') })}
            className={cn(box, invalid)}
          />
        </div>
      </div>
      <p id={hintId} className={cn('text-sm', error ? 'text-okada' : 'text-text-soft')}>
        {error ?? 'You must be 13 or older. Never shown to other players.'}
      </p>
    </fieldset>
  );
}
