'use client';

import { ReceiptText } from 'lucide-react';
import { useMemo } from 'react';
import type { LedgerEntryDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, EmptyState, Money, Spinner } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useInfiniteSentinel } from '../../hooks/use-infinite-sentinel';
import { groupByDay } from '../../services/statement';
import { StatementEntry } from './StatementEntry';

export interface StatementListProps {
  readonly entries: readonly LedgerEntryDto[];
  readonly isPending: boolean;
  readonly error: unknown;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => void;
  readonly refetch: () => void;
  /** Stop after N entries (the home screen preview) instead of scrolling forever. */
  readonly limit?: number;
  readonly emptyHint?: string;
}

/** Statement grouped by game day under sticky day headings, loading older pages as you scroll. */
export function StatementList({ entries, isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch, limit, emptyHint }: StatementListProps) {
  const now = useGameMinute(60_000);
  const visible = limit === undefined ? entries : entries.slice(0, limit);
  const days = useMemo(() => groupByDay(visible, now), [visible, now]);
  const infinite = limit === undefined && hasNextPage;
  const sentinel = useInfiniteSentinel<HTMLDivElement>(() => {
    if (!isFetchingNextPage) fetchNextPage();
  }, infinite);

  if (isPending) return <StatementSkeleton />;
  if (error && entries.length === 0) {
    return (
      <div className="rounded-card bg-okada-soft p-4 text-sm">
        <p className="font-bold text-okada">Couldn’t load your statement</p>
        <p className="mt-1 text-text-soft">{errorMessage(error)}</p>
        <Button variant="paper" size="sm" className="mt-3" onClick={refetch}>
          Try again
        </Button>
      </div>
    );
  }
  if (days.length === 0) return <EmptyState icon={ReceiptText} title="No transactions here" body={emptyHint ?? 'Money in and out shows up here.'} />;

  return (
    <div className="flex flex-col">
      {days.map((day) => (
        <section key={day.dayIndex} aria-label={day.label}>
          <h4 className="sticky top-0 z-10 -mx-1 flex items-baseline justify-between bg-paper/95 px-1 py-1.5 text-xs font-bold text-text-soft backdrop-blur">
            <span>{day.label}</span>
            <span className="tabular">
              <span className="sr-only">Net for the day </span>
              <Money amount={day.net} signed compact />
            </span>
          </h4>
          <ul className="divide-y divide-line">
            {day.entries.map((entry) => (
              <StatementEntry key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>
      ))}
      {infinite && (
        <div ref={sentinel} className="grid place-items-center py-4 text-text-soft">
          {isFetchingNextPage ? (
            <Spinner />
          ) : (
            <Button variant="paper" size="sm" onClick={fetchNextPage}>
              Load older
            </Button>
          )}
        </div>
      )}
      {limit === undefined && !hasNextPage && entries.length > 8 && <p className="py-4 text-center text-xs text-text-faint">That’s everything since you were born.</p>}
    </div>
  );
}

function StatementSkeleton() {
  return (
    <ul aria-label="Loading statement" className="flex flex-col gap-3 py-2">
      {[0, 1, 2, 3].map((row) => (
        <li key={row} className="flex items-center gap-3">
          <span className="size-10 animate-pulse rounded-full bg-paper-2" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3.5 w-2/3 animate-pulse rounded bg-paper-2" />
            <span className="block h-3 w-1/3 animate-pulse rounded bg-paper-2" />
          </span>
          <span className="h-4 w-16 animate-pulse rounded bg-paper-2" />
        </li>
      ))}
    </ul>
  );
}
