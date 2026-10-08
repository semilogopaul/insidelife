import type { ReactNode } from 'react';
import { cn } from '@/common/utils/cn';

/** A labelled figure (balance, CGPA, salary). The figure uses the wide display face. */
export function StatTile({ label, value, hint, tone = 'paper', className }: { readonly label: string; readonly value: ReactNode; readonly hint?: ReactNode; readonly tone?: 'paper' | 'ink' | 'danfo'; readonly className?: string }) {
  return (
    <div
      className={cn(
        'rounded-card p-3.5',
        tone === 'paper' && 'bg-paper-2 text-text',
        tone === 'ink' && 'bg-ink text-on-ink',
        tone === 'danfo' && 'bg-danfo text-ink',
        className,
      )}
    >
      <p className={cn('text-xs font-bold', tone === 'ink' ? 'text-on-ink-soft' : 'opacity-75')}>{label}</p>
      <p className="type-figure mt-0.5 truncate text-2xl">{value}</p>
      {hint && <p className={cn('mt-0.5 text-xs', tone === 'ink' ? 'text-on-ink-soft' : 'opacity-75')}>{hint}</p>}
    </div>
  );
}
