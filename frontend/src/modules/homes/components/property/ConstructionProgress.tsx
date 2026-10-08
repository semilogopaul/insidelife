import { Check, Hammer, PauseCircle } from 'lucide-react';
import { formatDate, type ConstructionDto, type GameMinute } from '@insidelife/shared';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { relativeGameTime } from '@/common/utils/game-time';
import { constructionMilestones } from '../../services/homes-rules';

/** Site progress as a track with the four milestones the contractor reports (foundation → finishing). */
export function ConstructionProgress({
  construction,
  now,
}: {
  readonly construction: ConstructionDto;
  readonly now: GameMinute;
}) {
  const milestones = constructionMilestones(construction.progress);
  const pct = Math.round(construction.progress * 100);
  return (
    <div className="flex flex-col gap-3 rounded-card bg-paper p-3 ring-1 ring-line">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-bold">
          {construction.stalled ? (
            <PauseCircle size={16} aria-hidden className="text-okada" />
          ) : (
            <Hammer size={16} aria-hidden className="text-danfo-deep" />
          )}
          {construction.stalled ? 'Work has stopped' : 'Building'}
        </span>
        <span className="tabular font-bold">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${construction.label} construction`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="relative h-2.5 rounded-full bg-paper-3"
      >
        <div
          className={cn('h-full rounded-full', construction.stalled ? 'bg-okada' : 'bg-danfo')}
          style={{ width: `${pct}%` }}
        />
        {milestones.slice(0, -1).map((milestone) => (
          <span
            key={milestone.label}
            aria-hidden
            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper"
            style={{ left: `${milestone.at * 100}%` }}
          />
        ))}
      </div>
      <ol className="grid grid-cols-4 gap-1 text-center text-2xs font-bold">
        {milestones.map((milestone) => (
          <li
            key={milestone.label}
            className={cn(
              'flex flex-col items-center gap-0.5',
              milestone.done ? 'text-text' : 'text-text-faint',
            )}
          >
            <span
              className={cn(
                'grid size-4 place-items-center rounded-full',
                milestone.done ? 'bg-ink text-on-ink' : 'bg-paper-3',
              )}
            >
              {milestone.done && <Check size={10} strokeWidth={3} aria-hidden />}
            </span>
            {milestone.label}
            <span className="sr-only">{milestone.done ? ' done' : ' to do'}</span>
          </li>
        ))}
      </ol>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-text-soft">Paid so far</dt>
          <dd className="font-bold">
            <Money amount={construction.costPaid} compact /> of <Money amount={construction.budget} compact />
          </dd>
        </div>
        <div>
          <dt className="text-text-soft">Handover</dt>
          <dd className="font-bold">
            {formatDate(construction.estimatedCompletionAt)} (
            {relativeGameTime(construction.estimatedCompletionAt, now)})
          </dd>
        </div>
      </dl>
      {construction.stalled && (
        <p className="text-xs font-bold text-okada">
          The contractor needs <Money amount={construction.nextMilestoneAmount} /> for the next stage. Keep it
          in your account — it’s collected automatically.
        </p>
      )}
      {construction.pendingOverrun > 0 && (
        <p className="text-xs text-okada">
          Cost overrun: materials went up by <Money amount={construction.pendingOverrun} />.
        </p>
      )}
    </div>
  );
}
