'use client';

import type { ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

export interface ChipOption<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  readonly count?: number;
}

export interface FilterChipsProps<T extends string> {
  readonly options: readonly ChipOption<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  /** Accessible name of the filter group. */
  readonly label: string;
  readonly className?: string;
}

/** Single-select filter chips (toggle buttons, not tabs: they filter the list below rather than swap panels). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: FilterChipsProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1', className)}
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-chip px-3 text-sm font-bold ring-1 transition-colors',
              active
                ? 'bg-danfo-soft text-ink ring-danfo'
                : 'bg-paper text-text-soft ring-line hover:text-text',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span className="tabular text-xs font-bold opacity-70">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
