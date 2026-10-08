'use client';

import { Briefcase } from 'lucide-react';
import type { EmploymentHistoryDto } from '@insidelife/shared';
import { Badge, Button, EmptyState, Money, Section } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { useEmployment } from '../../hooks/use-jobs-data';
import { ErrorState, LoadingRows } from '@/common/components';
import { LeaveAndResign } from './LeaveAndResign';
import { PayCard } from './PayCard';
import { PerformanceCard } from './PerformanceCard';
import { PromotionCard } from './PromotionCard';
import { ShiftHero } from './ShiftHero';

const END_REASON: Record<EmploymentHistoryDto['reason'], string> = {
  resigned: 'Resigned',
  fired: 'Sacked',
  'moved-on': 'Moved on',
  japa: 'Japa',
  deceased: 'Passed on',
};

/** Your current job: next shift, pay, attendance, promotion, leave and the exit. */
export function MyJobTab({ onBrowse }: { readonly onBrowse: () => void }) {
  const query = useEmployment();
  const now = useGameMinute(15_000);

  if (query.isPending) return <LoadingRows />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const { employment, history } = query.data;

  if (!employment) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState
          icon={Briefcase}
          title="No work yet"
          body="Hustles take anybody from 16 — POS stands, bukas, Balogun. Graduate jobs need school first."
          action={<Button onClick={onBrowse}>Find a job</Button>}
        />
        <History history={history} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ShiftHero employment={employment} now={now} />
      <header className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-card bg-paper-2 text-2xl"
        >
          {employment.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="type-title text-2xl leading-tight">{employment.title}</h3>
          <p className="text-sm text-text-soft">
            {employment.employer} · {employment.industry}
          </p>
        </div>
        <Badge tone="info" className="shrink-0">
          Level {employment.level + 1} of {employment.levels}
        </Badge>
      </header>
      <PayCard employment={employment} now={now} />
      <PerformanceCard employment={employment} />
      <PromotionCard employment={employment} now={now} />
      <LeaveAndResign employment={employment} />
      <History history={history} />
    </div>
  );
}

function History({ history }: { readonly history: readonly EmploymentHistoryDto[] }) {
  if (history.length === 0) return null;
  return (
    <Section title="Work history">
      <ul className="flex flex-col divide-y divide-line">
        {history.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-bold">{entry.title}</span>
              <span className="block truncate text-text-soft">
                {entry.employer} · {entry.years.toFixed(1)} yrs · {END_REASON[entry.reason]}
              </span>
            </span>
            <Money amount={entry.totalEarned} compact className="shrink-0 font-bold" />
          </li>
        ))}
      </ul>
    </Section>
  );
}
