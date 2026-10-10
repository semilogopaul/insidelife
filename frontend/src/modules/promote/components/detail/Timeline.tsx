import { Check, Circle, CircleDot } from 'lucide-react';
import type { PromotionTimelineStep, PromotionTimelineStepDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

const STEP_LABEL: Readonly<Record<PromotionTimelineStep, string>> = {
  paid: 'Paid',
  'in-review': 'In review',
  approved: 'Approved',
  live: 'Live',
  ended: 'Ended',
  rejected: 'Taken down',
  'refund-due': 'Refund on the way',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

const when = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const day = new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

/** Midnight (Lagos) steps read as a day; everything else as a day and time on the player's clock. */
function dateLabel(iso: string): string {
  const date = new Date(iso);
  const lagosMidnight = date.getUTCHours() === 23 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;
  return lagosMidnight ? day.format(date) : when.format(date);
}

/** Paid → in review → approved → live → ended (or the way off it, with the reason), as an ordered list. */
export function Timeline({ steps }: { readonly steps: readonly PromotionTimelineStepDto[] }) {
  return (
    <ol className="flex flex-col" aria-label="What happened to it">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const Icon = step.state === 'done' ? Check : step.state === 'current' ? CircleDot : Circle;
        const bad = step.step === 'rejected' || step.step === 'refund-due';
        return (
          <li key={`${step.step}-${index}`} className="grid grid-cols-[1.75rem_1fr] gap-x-2.5" aria-current={step.state === 'current' ? 'step' : undefined}>
            <span className="flex flex-col items-center">
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-full',
                  step.state === 'done' && 'bg-naira text-white',
                  step.state === 'current' && (bad ? 'bg-okada text-white' : 'bg-danfo text-ink'),
                  step.state === 'next' && 'bg-paper-2 text-text-faint ring-1 ring-line',
                )}
              >
                <Icon size={15} strokeWidth={2.6} aria-hidden />
              </span>
              {!last && <span aria-hidden className={cn('my-0.5 w-0.5 flex-1', step.state === 'done' ? 'bg-naira' : 'bg-line')} />}
            </span>
            <div className={cn('min-w-0 pb-3.5', step.state === 'next' && 'text-text-soft')}>
              <p className="font-bold leading-7">
                {STEP_LABEL[step.step]}
                <span className="sr-only">{step.state === 'done' ? ' (done)' : step.state === 'current' ? ' (now)' : ' (next)'}</span>
              </p>
              {step.at && <p className="text-xs text-text-soft">{step.state === 'next' ? `From ${dateLabel(step.at)}` : dateLabel(step.at)}</p>}
              {step.note && <p className={cn('mt-0.5 text-sm', bad ? 'text-okada' : 'text-text-soft')}>{step.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
