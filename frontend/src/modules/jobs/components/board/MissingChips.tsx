'use client';

import { ArrowUpRight } from 'lucide-react';
import { useUi } from '@/common/game/ui-store';
import { cn } from '@/common/utils/cn';
import type { RequirementChip } from '../../services/job-rules';

/**
 * Missing requirements as readable chips. Chips that another app can fix (School, Shop, Motors) open it.
 * `limit` collapses the rest into "+n more".
 */
export function MissingChips({
  chips,
  limit,
  interactive = false,
}: {
  readonly chips: readonly RequirementChip[];
  readonly limit?: number;
  readonly interactive?: boolean;
}) {
  const openPhone = useUi((state) => state.openPhone);
  if (chips.length === 0) return null;
  const shown = limit === undefined ? chips : chips.slice(0, limit);
  const rest = chips.length - shown.length;
  const base = 'inline-flex max-w-full items-center gap-1 rounded-chip px-2 py-1 text-xs font-bold';
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Missing requirements">
      {shown.map((chip) => (
        <li key={chip.key} className="max-w-full">
          {interactive && chip.app ? (
            <button
              type="button"
              onClick={() => chip.app && openPhone(chip.app)}
              title={chip.hint}
              className={cn(base, 'bg-okada-soft text-okada ring-1 ring-okada/20 hover:ring-okada/50')}
            >
              <span className="truncate">{chip.text}</span>
              <ArrowUpRight size={13} aria-hidden className="shrink-0" />
              <span className="sr-only">— {chip.hint}</span>
            </button>
          ) : (
            <span className={cn(base, 'bg-okada-soft text-okada')} title={chip.hint}>
              <span className="truncate">{chip.text}</span>
            </span>
          )}
        </li>
      ))}
      {rest > 0 && (
        <li>
          <span className={cn(base, 'bg-paper-3 text-text-soft')}>+{rest} more</span>
        </li>
      )}
    </ul>
  );
}
