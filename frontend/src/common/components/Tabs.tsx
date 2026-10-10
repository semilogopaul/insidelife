'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

export interface TabItem<T extends string> {
  readonly id: T;
  readonly label: ReactNode;
  readonly badge?: number;
}

export interface TabsProps<T extends string> {
  readonly items: readonly TabItem<T>[];
  readonly value: T;
  readonly onChange: (id: T) => void;
  readonly label: string;
  readonly className?: string;
  /** Stable id for the guided walkthrough (`data-tour` on the tab list). */
  readonly tour?: string;
}

/** Accessible segmented tabs (arrow keys move between tabs). Content is rendered by the caller. */
export function Tabs<T extends string>({ items, value, onChange, label, className, tour }: TabsProps<T>) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length;
    const item = items[next];
    if (item) {
      onChange(item.id);
      refs.current[next]?.focus();
    }
  };
  return (
    <div role="tablist" aria-label={label} data-tour={tour} className={cn('-mx-1 flex gap-1 overflow-x-auto px-1 pb-1', className)}>
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={`${id}-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKey(event, index)}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold transition-colors',
              selected ? 'bg-ink text-on-ink' : 'bg-paper-2 text-text-soft hover:text-text',
            )}
          >
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="tabular grid min-w-5 place-items-center rounded-full bg-danfo px-1 text-2xs text-ink">{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
