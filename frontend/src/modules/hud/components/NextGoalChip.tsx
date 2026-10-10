'use client';

import { Check, Flag, Navigation } from 'lucide-react';
import { PressButton } from '@/common/components';
import { formatDistance, type GoalGuide } from '@/common/goal-guide';
import { cn } from '@/common/utils/cn';

/**
 * "Next goal": the current Life Goal and its next concrete step with a big Go (GPS, or the right phone app).
 * Tapping the card opens Goals. Compact inside places (one line); outside it shows the goal title above the step.
 * With no goal step it suggests something to do instead (a job, a friend, a place nearby).
 */
export function NextGoalChip({ guide, compact }: { readonly guide: GoalGuide; readonly compact: boolean }) {
  const { step } = guide;
  if (!step) return null;
  const distance = step.kind === 'goal-place' || step.kind === 'suggestion' ? step.metres : null;
  const detail = `${step.text}${distance !== null && distance > 30 ? ` · ${formatDistance(distance)}` : ''}`;
  const hasPlace = (step.kind === 'goal-place' || step.kind === 'suggestion') && step.venueId !== null;
  const goLabel = guide.navigating ? 'On it' : hasPlace ? 'Go' : 'Open';
  return (
    <section aria-label={guide.isGoal ? 'Next goal' : 'Something to do'} data-testid="next-goal-chip" className="glass flex max-w-[min(21rem,100%)] items-stretch overflow-hidden rounded-card text-on-ink">
      <button type="button" onClick={guide.openGoals} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left" aria-label={`${guide.isGoal ? 'Next goal' : 'Idea'}: ${guide.title}. ${detail}. Open Goals`}>
        <Flag size={compact ? 15 : 18} aria-hidden className="shrink-0 text-danfo" />
        <span className="min-w-0">
          {!compact && <span className="block text-2xs font-bold uppercase tracking-wide text-danfo">{guide.isGoal ? 'Next goal' : 'Something to do'}</span>}
          <span className={cn('type-title block truncate leading-tight', compact ? 'text-sm' : 'text-base')}>{guide.title}</span>
          {!compact && <span className="block truncate text-xs text-on-ink-soft">{detail}</span>}
        </span>
      </button>
      <PressButton
        onPress={guide.go}
        aria-label={`${goLabel}: ${detail}`}
        className={cn('flex min-w-14 shrink-0 items-center justify-center gap-1 px-3 font-bold', guide.navigating ? 'bg-naira text-white' : 'bg-danfo text-ink', compact ? 'min-h-11 text-sm' : 'min-h-12 text-base')}
      >
        {guide.navigating ? <Check size={16} aria-hidden /> : <Navigation size={16} aria-hidden />}
        {goLabel}
      </PressButton>
    </section>
  );
}
