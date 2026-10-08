import type { JobLevelDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { formatPay } from '../../services/job-rules';

/** The ladder from entry title to the top, with pay and what each step demands. */
export function CareerLadder({
  ladder,
  currentLevel,
}: {
  readonly ladder: readonly JobLevelDto[];
  readonly currentLevel: number | null;
}) {
  return (
    <ol className="relative flex flex-col" aria-label="Career ladder">
      {ladder.map((level, index) => {
        const current = currentLevel === level.index;
        const last = index === ladder.length - 1;
        const wait = index > 0 ? (ladder[index - 1]?.minYears ?? 0) : 0;
        const when =
          index === 0
            ? 'Entry level'
            : wait > 0
              ? `After ${wait} yr${wait === 1 ? '' : 's'} a level down`
              : 'Next step up';
        return (
          <li key={level.index} className="relative flex gap-3 pb-3.5 last:pb-0">
            {!last && (
              <span aria-hidden className="absolute left-2.75 top-6 h-[calc(100%-1rem)] w-0.5 bg-line" />
            )}
            <span
              aria-hidden
              className={cn(
                'tabular relative z-1 grid size-6 shrink-0 place-items-center rounded-full text-2xs font-bold',
                current ? 'bg-danfo text-ink' : 'bg-paper-3 text-text-soft',
              )}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn('truncate font-bold', current && 'text-ink')}>
                  {level.title}
                  {current && <span className="ml-1.5 text-xs font-bold text-danfo-deep">You’re here</span>}
                </p>
                <p className="tabular shrink-0 text-sm font-bold">{formatPay(level.pay, level.currency)}</p>
              </div>
              <p className="text-xs text-text-soft">
                {when}
                {level.gates.length > 0 && ` · needs ${level.gates.join(', ')}`}
                {level.breakout && ' · breakout only'}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
