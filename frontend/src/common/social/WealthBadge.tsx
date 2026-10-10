import { WEALTH_CLASS_COPY, type WealthClass } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

/**
 * The profile's nepo/lapo badge with a short explainer, so players know why a name is gold or blue. Wording comes
 * from the shared catalog; the colours are tokens that read on light surfaces.
 */
export function WealthBadge({ wealthClass, className }: { readonly wealthClass: WealthClass; readonly className?: string }) {
  const copy = WEALTH_CLASS_COPY[wealthClass];
  return (
    <div
      data-wealth-class={wealthClass}
      className={cn('rounded-card p-3', wealthClass === 'nepo' ? 'bg-nepo-soft' : 'bg-lapo-soft', className)}
    >
      <p className={cn('text-sm font-bold', wealthClass === 'nepo' ? 'text-nepo' : 'text-lapo')}>{copy.badge}</p>
      <p className="mt-0.5 text-xs text-text-soft">{copy.explainer}</p>
    </div>
  );
}
