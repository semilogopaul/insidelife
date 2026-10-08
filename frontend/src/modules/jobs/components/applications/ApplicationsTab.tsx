'use client';

import { Inbox } from 'lucide-react';
import type { JobApplicationDto, JobApplicationStatus } from '@insidelife/shared';
import { Badge, Button, EmptyState } from '@/common/components';
import { useGameMinute } from '@/common/game/use-game-clock';
import { cn } from '@/common/utils/cn';
import { useJobBoard } from '../../hooks/use-jobs-data';
import { gameDateTime, relativeGameTime } from '@/common/utils/game-time';
import { ErrorState, LoadingRows } from '@/common/components';

const STATUS: Record<
  JobApplicationStatus,
  { readonly tone: 'good' | 'bad' | 'warn' | 'info' | 'neutral'; readonly label: string }
> = {
  pending: { tone: 'info', label: 'Under review' },
  interview: { tone: 'warn', label: 'Interview' },
  accepted: { tone: 'good', label: 'Hired' },
  rejected: { tone: 'bad', label: 'Not this time' },
  declined: { tone: 'neutral', label: 'You declined' },
};

/** Every application with a status timeline: applied → interview → decision. */
export function ApplicationsTab({ onBrowse }: { readonly onBrowse: () => void }) {
  const board = useJobBoard();
  const now = useGameMinute(15_000);
  if (board.isPending) return <LoadingRows />;
  if (board.isError) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />;

  const applications = [...board.data.applications].sort((a, b) => b.appliedAt - a.appliedAt);
  if (applications.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No applications yet"
        body="Apply from the job board — employers reply within a few game days."
        action={<Button onClick={onBrowse}>Find a job</Button>}
      />
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {applications.map((application) => (
        <ApplicationCard key={application.id} application={application} now={now} />
      ))}
    </ul>
  );
}

function ApplicationCard({
  application,
  now,
}: {
  readonly application: JobApplicationDto;
  readonly now: number;
}) {
  const status = STATUS[application.status];
  const decided = application.decidedAt !== null;
  const steps: ReadonlyArray<{
    readonly label: string;
    readonly when: string;
    readonly state: 'done' | 'current' | 'todo';
  }> = [
    { label: 'Applied', when: gameDateTime(application.appliedAt, now), state: 'done' },
    ...(application.interview
      ? [
          {
            label: 'Interview',
            when: 'Check your life-event cards',
            state: decided ? 'done' : 'current',
          } as const,
        ]
      : []),
    {
      label: decided ? status.label : 'Decision',
      when:
        decided && application.decidedAt !== null
          ? gameDateTime(application.decidedAt, now)
          : `Expected ${relativeGameTime(application.decisionExpectedBy, now)}`,
      state: decided ? 'done' : application.interview ? 'todo' : 'current',
    },
  ];

  return (
    <li className="rounded-card bg-paper-2 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold">{application.jobTitle}</p>
          <p className="truncate text-sm text-text-soft">{application.employer}</p>
        </div>
        <Badge tone={status.tone} className="shrink-0">
          {status.label}
        </Badge>
      </div>
      <ol className="mt-3 flex flex-col gap-0" aria-label="Application progress">
        {steps.map((step, index) => (
          <li key={step.label} className="relative flex gap-3 pb-3 last:pb-0">
            {index < steps.length - 1 && (
              <span aria-hidden className="absolute left-1.25 top-4 h-[calc(100%-0.75rem)] w-0.5 bg-line" />
            )}
            <span
              aria-hidden
              className={cn(
                'relative mt-1 size-3 shrink-0 rounded-full ring-2',
                step.state === 'done'
                  ? 'bg-ink ring-ink'
                  : step.state === 'current'
                    ? 'bg-danfo ring-danfo-deep'
                    : 'bg-paper ring-line',
              )}
            />
            <span className="min-w-0 text-sm">
              <span className={cn('font-bold', step.state === 'todo' && 'text-text-soft')}>{step.label}</span>
              <span className="block text-xs text-text-soft">{step.when}</span>
            </span>
          </li>
        ))}
      </ol>
      {application.message && (
        <p className="mt-3 border-t border-line pt-2.5 text-sm text-text-soft">“{application.message}”</p>
      )}
    </li>
  );
}
