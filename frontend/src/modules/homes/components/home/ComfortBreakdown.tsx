import type { HomeComfortDto } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';
import { comfortRows } from '../../services/homes-rules';

const SCALE = 15;

/**
 * Where home comfort comes from: each part as a bar from a centre line (right = helps, left = hurts), the signed
 * number beside it, and the net total.
 */
export function ComfortBreakdown({ comfort }: { readonly comfort: HomeComfortDto }) {
  const rows = comfortRows(comfort);
  return (
    <div className="rounded-card bg-paper-2 p-3.5">
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => {
          const width = Math.min(50, (Math.abs(row.value) / SCALE) * 50);
          return (
            <li key={row.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
              <span>{row.label}</span>
              <span className={cn('tabular text-right font-bold', row.value < 0 && 'text-okada')}>
                {row.value > 0 ? '+' : row.value < 0 ? '−' : ''}
                {Math.abs(row.value).toFixed(1)}
              </span>
              <span aria-hidden className="relative col-span-2 h-1.5 rounded-full bg-paper-3">
                <span className="absolute inset-y-0 left-1/2 w-px bg-text-faint" />
                <span
                  className={cn(
                    'absolute inset-y-0 rounded-full',
                    row.value >= 0 ? 'left-1/2 bg-naira' : 'right-1/2 bg-okada',
                  )}
                  style={{ width: `${width}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex items-baseline justify-between border-t border-line pt-2.5">
        <span className="text-sm font-bold">Net comfort at home</span>
        <span className={cn('type-figure text-xl', comfort.total < 0 && 'text-okada')}>
          {comfort.total > 0 ? '+' : comfort.total < 0 ? '−' : ''}
          {Math.abs(comfort.total).toFixed(1)}
        </span>
      </p>
      <p className="mt-1 text-xs text-text-soft">Comfort decides how well you rest and recover at home.</p>
    </div>
  );
}
