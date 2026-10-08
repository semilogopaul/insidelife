'use client';

import { Disc3 } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { koboToNaira } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { itemKey, KIND_LABEL, type QueueItem } from '../services/queue';

export interface QueueListProps {
  readonly items: readonly QueueItem[];
  readonly selected: string | null;
  readonly onSelect: (key: string) => void;
  readonly label: string;
}

const dateFormat = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const day = (iso: string): string => dateFormat.format(new Date(`${iso}T00:00:00Z`));

/** Keyboard listbox: ↑/↓ or j/k move, Home/End jump. Selection follows focus (the detail pane updates). */
export function QueueList({ items, selected, onSelect, label }: QueueListProps) {
  const id = useId();
  const list = useRef<HTMLUListElement>(null);
  const index = items.findIndex((item) => itemKey(item) === selected);

  useEffect(() => {
    if (selected) list.current?.querySelector(`[data-key="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const onKey = (event: KeyboardEvent<HTMLUListElement>): void => {
    if (items.length === 0) return;
    const move = (to: number): void => {
      event.preventDefault();
      const item = items[Math.max(0, Math.min(items.length - 1, to))];
      if (item) onSelect(itemKey(item));
    };
    if (event.key === 'ArrowDown' || event.key === 'j') move(index + 1);
    else if (event.key === 'ArrowUp' || event.key === 'k') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(items.length - 1);
  };

  return (
    <ul
      ref={list}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      aria-activedescendant={selected ? `${id}-${selected}` : undefined}
      onKeyDown={onKey}
      className="flex flex-col gap-1 rounded-card p-1 focus-visible:outline-offset-0"
    >
      {items.map((item) => {
        const key = itemKey(item);
        const active = key === selected;
        const owner = item.kind === 'campaigns' ? item.campaign.ownerHandle : item.order.ownerHandle;
        const amount = item.kind === 'campaigns' ? item.campaign.amountKobo : item.order.amountKobo;
        const start = item.kind === 'campaigns' ? item.campaign.startDate : item.order.startDate;
        return (
          <li
            key={key}
            id={`${id}-${key}`}
            data-key={key}
            role="option"
            aria-selected={active}
            onClick={() => onSelect(key)}
            className={cn('flex cursor-pointer items-center gap-3 rounded-card p-2.5', active ? 'bg-ink text-on-ink' : 'hover:bg-paper-2')}
          >
            {item.kind === 'campaigns' ? (
              <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded-chip bg-paper-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- moderator thumbnail from the media server */}
                <img src={item.campaign.creativeUrl} alt="" className="absolute inset-0 size-full object-cover" />
              </span>
            ) : (
              <span className={cn('grid h-10 w-16 shrink-0 place-items-center rounded-chip', active ? 'bg-white/10 text-danfo' : 'bg-paper-3 text-ink')}>
                <Disc3 size={20} aria-hidden />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold">{item.kind === 'campaigns' ? item.campaign.title : `${item.order.track.title} — ${item.order.track.artistName}`}</span>
              <span className={cn('block truncate text-xs', active ? 'text-on-ink-soft' : 'text-text-soft')}>
                {KIND_LABEL[item.kind]} · {owner ? `@${owner}` : 'no character'} · starts {day(start)}
              </span>
            </span>
            <span className="type-figure shrink-0 text-sm">
              <Money amount={koboToNaira(amount)} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
