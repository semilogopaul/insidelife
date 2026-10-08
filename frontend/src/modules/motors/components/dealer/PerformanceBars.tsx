import type { VehiclePerformance } from '@insidelife/shared';
import { performanceBars } from '../../services/motors-rules';

/** Four short bars: top speed, 0–100, handling, braking (longer = better), each with its real number. */
export function PerformanceBars({ performance }: { readonly performance: VehiclePerformance }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {performanceBars(performance).map((bar) => (
        <div key={bar.key} className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-text-soft">{bar.label}</dt>
            <dd className="tabular font-bold">{bar.value}</dd>
          </div>
          <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-3">
            <div
              className="h-full rounded-full bg-ink"
              style={{ width: `${Math.max(6, bar.ratio * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </dl>
  );
}
