import { LAND_TITLES, LAND_TITLE_IDS } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { oddsPerYear } from '../../services/homes-rules';

const MAX_DISPUTE = 0.2;

/**
 * "What do the papers mean?" — the four Lagos land titles from safest to riskiest: what you pay (vs a C of O plot)
 * and how often omonile or the bulldozers come calling.
 */
export function TitleLadder() {
  return (
    <details className="group rounded-card bg-paper-2 open:pb-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
        What do the papers mean? C of O vs survey
        <span aria-hidden className="text-text-faint transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ol className="flex flex-col gap-3 px-3.5 pb-3 pt-1">
        {LAND_TITLE_IDS.map((id) => {
          const title = LAND_TITLES[id];
          const risk = title.disputePerYear + title.demolitionPerYear;
          return (
            <li key={id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{title.label}</span>
                <span className="tabular shrink-0 text-xs font-bold text-text-soft">
                  {Math.round(title.priceMultiplier * 100)}% of C of O price
                </span>
              </div>
              <p className="text-xs text-text-soft">{title.blurb}</p>
              <div className="mt-1.5 flex flex-col gap-1">
                <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-paper-3">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      risk >= 0.1 ? 'bg-okada' : risk >= 0.03 ? 'bg-danfo' : 'bg-naira',
                    )}
                    style={{ width: `${Math.min(100, (risk / MAX_DISPUTE) * 100)}%` }}
                  />
                </span>
                <span className="text-xs">
                  Wahala: {oddsPerYear(title.disputePerYear)}
                  {title.demolitionPerYear > 0 &&
                    ` · demolition ${oddsPerYear(title.demolitionPerYear).toLowerCase()}`}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
