'use client';

import { formatDate, formatNairaCompact, type FobesListId, type FobesMeDto, type FobesPositionDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { positionLines } from '../services/fobes-format';

function positionFor(me: FobesMeDto, list: FobesListId): FobesPositionDto | null {
  if (list === 'self-made') return me.selfMadeList;
  if (list === 'under-30') return me.under30;
  return me.richList;
}

/** Pinned under the list: where you stand (even far outside the top 100), the gap to the next place, and your week. */
export function YourPosition({ me, list }: { readonly me: FobesMeDto; readonly list: FobesListId }) {
  const position = positionFor(me, list);
  const lines = position ? positionLines(position) : { headline: 'Past 30', detail: 'This list is for the young ones. The Rich List is still yours to climb.' };
  const week = me.week;
  return (
    <section aria-label="Your position" className="sticky bottom-0 -mx-1 flex flex-col gap-0.5 rounded-card bg-noir px-4 py-2.5 text-on-ink shadow-[var(--shadow-lift)]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="type-title text-lg text-gold">{lines.headline}</p>
        {position && <p className="type-figure text-sm">{formatNairaCompact(position.worth)}</p>}
      </div>
      <p className="text-sm text-on-ink-soft">
        {lines.detail}
        {week && (
          <>
            {' · Your week '}
            <span className={cn('font-bold', week.change >= 0 ? 'text-[#7fe0ad]' : 'text-[#ff9b8c]')}>
              {week.change >= 0 ? '+' : '-'}
              {formatNairaCompact(Math.abs(week.change))}
              {week.pct !== null && ` (${week.pct >= 0 ? '+' : ''}${week.pct}%)`}
            </span>
            <span className="sr-only"> since {formatDate(week.since)}</span>
          </>
        )}
      </p>
      {!me.showExactWealth && <p className="text-2xs text-on-ink-soft">Others see your band, not your figure (Me → Settings → Privacy).</p>}
    </section>
  );
}
