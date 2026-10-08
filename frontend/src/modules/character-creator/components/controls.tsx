'use client';

import { Check } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

interface FieldsetProps {
  readonly legend: string;
  readonly hint?: ReactNode;
  readonly children: ReactNode;
}

function Fieldset({ legend, hint, children }: FieldsetProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 flex w-full items-baseline justify-between gap-3 text-sm font-bold text-text">
        <span>{legend}</span>
        {hint && <span className="text-xs font-normal text-text-soft">{hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

export interface SwatchesProps {
  readonly label: string;
  readonly values: readonly string[];
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  /** Accessible names per swatch (defaults to "<label> n of m"). */
  readonly names?: readonly string[];
}

/** Colour swatches as a radio group (arrow keys move, 44 px targets). */
export function Swatches({ label, values, selected, onSelect, names }: SwatchesProps) {
  const name = useId();
  return (
    <Fieldset legend={label}>
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={label}>
        {values.map((color, index) => {
          const checked = selected === index;
          return (
            <label key={`${color}-${index}`} className="relative grid size-11 cursor-pointer place-items-center">
              <input
                type="radio"
                name={name}
                className="peer sr-only"
                checked={checked}
                onChange={() => onSelect(index)}
                aria-label={names?.[index] ?? `${label} ${index + 1} of ${values.length}`}
              />
              <span
                className={cn(
                  'size-11 rounded-full ring-2 ring-offset-2 ring-offset-paper transition-[box-shadow,transform] duration-150 peer-focus-visible:ring-danfo peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink',
                  checked ? 'scale-105 ring-ink' : 'ring-transparent hover:ring-line',
                )}
                style={{ background: color }}
              />
              {checked && <Check size={16} strokeWidth={3} className="pointer-events-none absolute text-white mix-blend-difference" aria-hidden />}
            </label>
          );
        })}
      </div>
    </Fieldset>
  );
}

export interface ChipsProps<T extends string> {
  readonly label: string;
  readonly options: ReadonlyArray<{ readonly id: T; readonly label: string }>;
  readonly selected: T;
  readonly onSelect: (id: T) => void;
  readonly hint?: ReactNode;
  readonly tone?: 'ink' | 'ankara';
}

/** Single-choice chips as a radio group. */
export function Chips<T extends string>({ label, options, selected, onSelect, hint, tone = 'ink' }: ChipsProps<T>) {
  const name = useId();
  return (
    <Fieldset legend={label} hint={hint}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const checked = selected === option.id;
          return (
            <label key={option.id} className="relative cursor-pointer">
              <input type="radio" name={name} className="peer sr-only" checked={checked} onChange={() => onSelect(option.id)} />
              <span
                className={cn(
                  'inline-flex h-11 items-center rounded-full px-4 text-sm font-bold capitalize ring-1 transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-danfo',
                  checked ? (tone === 'ankara' ? 'bg-ankara text-white ring-ankara' : 'bg-ink text-on-ink ring-ink') : 'bg-paper-2 text-text ring-line hover:bg-paper-3',
                )}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </Fieldset>
  );
}

/** The three steps as stops on a danfo route. */
export function StepRoute({ steps, current }: { readonly steps: readonly string[]; readonly current: number }) {
  return (
    <ol className="relative flex items-start justify-between" aria-label="Steps">
      <span aria-hidden className="absolute left-3 right-3 top-[11px] h-0 border-t-2 border-dashed border-line" />
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'next';
        return (
          <li key={label} className="relative z-10 flex flex-col items-center gap-1.5" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full text-xs font-black ring-2',
                state === 'current' && 'bg-danfo text-ink ring-ink',
                state === 'done' && 'bg-ink text-on-ink ring-ink',
                state === 'next' && 'bg-paper text-text-faint ring-line',
              )}
            >
              {state === 'done' ? <Check size={13} strokeWidth={3.5} aria-hidden /> : index + 1}
            </span>
            <span className={cn('text-xs font-bold', state === 'next' ? 'text-text-faint' : 'text-text')}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
