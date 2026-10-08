'use client';

import { CheckCircle2, ChevronDown, Lock } from 'lucide-react';
import { useState } from 'react';
import type { LifeGoalDto, NextChapterPreviewDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, Section, Spinner } from '@/common/components';
import { useGoalDirections, useProgression } from '../hooks/use-goals';
import { ChapterHeader } from './ChapterHeader';
import { DailyWelcomeCard } from './DailyWelcomeCard';
import { GoalCard } from './GoalCard';

/** The current chapter, what to do next, what's done, and a peek at what comes after. */
export function GoalsTab() {
  const progression = useProgression();
  const directions = useGoalDirections();

  if (progression.isPending) {
    return (
      <div className="grid place-items-center py-16 text-text-soft">
        <Spinner />
      </div>
    );
  }
  if (progression.isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-okada">{errorMessage(progression.error)}</p>
        <Button variant="paper" size="sm" onClick={() => void progression.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  const data = progression.data;
  return (
    <div className="flex flex-col gap-5">
      <DailyWelcomeCard status={data.dailyWelcome} />
      <ChapterHeader chapter={data.chapter} chapters={data.chapters} clout={data.clout} />
      <Section title="Up next" aside={data.activeGoals.length > 0 ? `${data.activeGoals.length} active` : undefined}>
        {data.activeGoals.length === 0 ? (
          <p className="rounded-card bg-paper-2 p-3.5 text-sm text-text-soft">
            {data.legacyComplete ? 'Every Life Goal is done. Legend. Keep living — the city isn’t finished with you.' : 'New goals unlock as your life moves on.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {data.activeGoals.map((goal) => (
              <li key={goal.id}>
                <GoalCard goal={goal} onDirections={directions} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      {data.nextChapter && <NextChapter preview={data.nextChapter} />}
      <CompletedGoals goals={data.completedGoals} />
    </div>
  );
}

function NextChapter({ preview }: { readonly preview: NextChapterPreviewDto }) {
  return (
    <section aria-label={`Next: chapter ${preview.number}`} className="rounded-card border-2 border-dashed border-line p-3.5">
      <p className="flex items-center gap-1.5 text-xs font-bold text-text-soft">
        <Lock size={13} aria-hidden /> Chapter {preview.number} unlocks next
      </p>
      <p className="type-title mt-1 text-xl">{preview.title}</p>
      <p className="text-sm text-text-soft">{preview.tagline}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {preview.goals.map((goal) => (
          <li key={goal.id} className="rounded-chip bg-paper-2 px-2 py-1 text-xs font-bold text-text-soft">
            {goal.title}
            {goal.optional ? ' (optional)' : ''}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompletedGoals({ goals }: { readonly goals: readonly LifeGoalDto[] }) {
  const [open, setOpen] = useState(false);
  if (goals.length === 0) return null;
  const shown = open ? goals : goals.slice(-3);
  return (
    <Section title="Done" aside={`${goals.length} complete`}>
      <ul className="flex flex-col gap-1.5">
        {shown.map((goal) => (
          <li key={goal.id} className="flex items-center gap-2.5 rounded-card bg-paper-2 px-3 py-2.5">
            <CheckCircle2 size={20} aria-hidden className="shrink-0 text-naira" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{goal.title}</span>
              {goal.completedPathId && <span className="block truncate text-xs text-text-soft">{goal.paths.find((path) => path.id === goal.completedPathId)?.label}</span>}
            </span>
            {goal.granted && goal.granted.cash > 0 && <Money amount={goal.granted.cash} compact className="text-xs font-bold text-naira" />}
            {goal.granted && goal.granted.clout > 0 && <span className="text-xs font-bold text-text-soft">+{goal.granted.clout}</span>}
          </li>
        ))}
      </ul>
      {goals.length > 3 && (
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-1 self-start text-sm font-bold text-text-soft hover:text-text">
          <ChevronDown size={16} aria-hidden className={open ? 'rotate-180' : undefined} />
          {open ? 'Show fewer' : `Show all ${goals.length}`}
        </button>
      )}
    </Section>
  );
}
