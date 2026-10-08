'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '@/common/utils/cn';
import type { StageStatus } from '../../services/school-rules';

export interface StopProps {
  readonly index: number;
  readonly status: StageStatus;
  readonly title: string;
  /** One line shown when collapsed ("7 credits · Maths & English ✓"). */
  readonly summary: ReactNode;
  readonly last?: boolean;
  /** Anchor for "scroll to this stop" links. */
  readonly id?: string;
  readonly children?: ReactNode;
}

/**
 * One stop on the school route (like a bus route map): done stops are ticked and collapsed, the current stop is
 * open, later stops say what unlocks them.
 */
export function Stop({ index, status, title, summary, last = false, id, children }: StopProps) {
  const [open, setOpen] = useState(status === 'current');
  const bodyId = useId();
  const expandable = children !== undefined && children !== null;
  return (
    <li id={id} className="relative flex scroll-mt-14 gap-3.5">
      {!last && (
        <span
          aria-hidden
          className={cn('absolute left-3.5 top-8 bottom-0 w-0.5', status === 'done' ? 'bg-ink' : 'bg-line')}
        />
      )}
      <span
        aria-hidden
        className={cn(
          'tabular relative z-1 mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
          status === 'done' && 'bg-ink text-on-ink',
          status === 'current' && 'bg-danfo text-ink ring-4 ring-danfo-soft',
          status === 'todo' && 'bg-paper text-text-faint ring-2 ring-line',
        )}
      >
        {status === 'done' ? <Check size={15} strokeWidth={3} /> : index}
      </span>
      <div className={cn('min-w-0 flex-1', last ? 'pb-1' : 'pb-6')}>
        <button
          type="button"
          disabled={!expandable}
          aria-expanded={expandable ? open : undefined}
          aria-controls={expandable ? bodyId : undefined}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start justify-between gap-2 text-left disabled:cursor-default"
        >
          <span className="min-w-0">
            <span
              className={cn('type-title block text-lg leading-tight', status === 'todo' && 'text-text-soft')}
            >
              {title}
              <span className="sr-only">
                {status === 'done' ? ' (done)' : status === 'current' ? ' (you are here)' : ' (later)'}
              </span>
            </span>
            <span className="mt-0.5 block text-sm text-text-soft">{summary}</span>
          </span>
          {expandable && (
            <ChevronDown
              size={18}
              aria-hidden
              className={cn('mt-1 shrink-0 text-text-faint transition-transform', open && 'rotate-180')}
            />
          )}
        </button>
        {expandable && open && (
          <div id={bodyId} className="mt-3">
            {children}
          </div>
        )}
      </div>
    </li>
  );
}
