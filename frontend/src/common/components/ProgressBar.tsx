import { cn } from '@/common/utils/cn';

/** Determinate progress with an accessible label. */
export function ProgressBar({ value, max = 100, label, tone = 'danfo', className }: { readonly value: number; readonly max?: number; readonly label: string; readonly tone?: 'danfo' | 'naira' | 'okada' | 'ink'; readonly className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const fill = { danfo: 'bg-danfo', naira: 'bg-naira', okada: 'bg-okada', ink: 'bg-ink' }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} className={cn('h-2 w-full overflow-hidden rounded-full bg-paper-3', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
