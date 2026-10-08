import { DISTRICTS, type JobListingDto } from '@insidelife/shared';
import { Badge } from '@/common/components';
import { cn } from '@/common/utils/cn';
import { chanceLabel, payRangeLabel, type RequirementChip } from '../../services/job-rules';
import { MissingChips } from './MissingChips';

/** Status words for a listing (applied, interview, your job, eligibility). */
export function listingBadge(job: Pick<JobListingDto, 'current' | 'application' | 'eligible'>): {
  readonly tone: 'good' | 'info' | 'warn' | 'neutral';
  readonly text: string;
} {
  if (job.current) return { tone: 'info', text: 'Your job' };
  if (job.application?.status === 'interview') return { tone: 'warn', text: 'Interview' };
  if (job.application?.status === 'pending') return { tone: 'info', text: 'Applied' };
  return job.eligible ? { tone: 'good', text: 'Eligible' } : { tone: 'neutral', text: 'Not yet' };
}

/** One listing on the board: what it pays, when and where, your odds or what's missing. */
export function JobRow({
  job,
  chips,
  onOpen,
}: {
  readonly job: JobListingDto;
  readonly chips: readonly RequirementChip[];
  readonly onOpen: () => void;
}) {
  const badge = listingBadge(job);
  const where = job.workplace.mode === 'remote' ? 'Remote' : DISTRICTS[job.workplace.districtId].name;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 py-3.5 text-left hover:bg-paper-2/60 focus-visible:bg-paper-2"
      >
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-card bg-paper-2 text-2xl"
        >
          {job.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate font-bold leading-tight">{job.title}</span>
              <span className="block truncate text-sm text-text-soft">{job.employer}</span>
            </span>
            {job.eligible && !job.current && !job.application ? (
              <span className="shrink-0 text-right leading-none">
                <span className="type-figure block text-lg">{chanceLabel(job.estimatedChance)}</span>
                <span className="text-2xs font-bold text-text-soft">chance</span>
              </span>
            ) : (
              <Badge tone={badge.tone} className="shrink-0">
                {badge.text}
              </Badge>
            )}
          </span>
          <span className="mt-1.5 block text-sm font-bold">{payRangeLabel(job.payRange)}</span>
          <span className="block truncate text-xs text-text-soft">
            {job.schedule.label} · {where}
          </span>
          {chips.length > 0 && (
            <span className={cn('mt-2 block')}>
              <MissingChips chips={chips} limit={3} />
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
