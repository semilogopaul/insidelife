import type { ReactNode } from 'react';
import { Money } from './Money';
import { cn } from '@/common/utils/cn';

export interface ReceiptLine {
  readonly label: ReactNode;
  /** Positive = adds to the total, negative = deducted. */
  readonly amount: number;
  readonly note?: ReactNode;
  /** `muted` lines are informational (e.g. refundable caution, employer pension) and styled softer. */
  readonly muted?: boolean;
}

export interface ReceiptProps {
  readonly lines: readonly ReceiptLine[];
  readonly total?: { readonly label: ReactNode; readonly amount: number };
  readonly caption?: ReactNode;
  readonly className?: string;
}

/**
 * A money breakdown set like a POS slip: dotted leaders, tabular figures and a double rule above the total.
 * Used for payslips, rent upfront, school fees and anything else that costs more than one line.
 */
export function Receipt({ lines, total, caption, className }: ReceiptProps) {
  return (
    <div className={cn('rounded-card bg-paper-2 px-3.5 py-3', className)}>
      <dl className="flex flex-col gap-1.5 text-sm">
        {lines.map((line, index) => (
          <div key={index} className={cn('flex items-baseline gap-2', line.muted && 'text-text-soft')}>
            <dt className="shrink-0">
              {line.label}
              {line.note && <span className="block text-xs text-text-faint">{line.note}</span>}
            </dt>
            <span
              aria-hidden
              className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted border-text-faint/60"
            />
            <dd className={cn('shrink-0 font-bold', line.amount < 0 && 'text-okada')}>
              <Money amount={line.amount} />
            </dd>
          </div>
        ))}
      </dl>
      {total && (
        <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t-[3px] border-double border-ink pt-2">
          <span className="font-bold">{total.label}</span>
          <Money amount={total.amount} className="type-figure text-xl" />
        </div>
      )}
      {caption && <p className="mt-2 text-xs text-text-soft">{caption}</p>}
    </div>
  );
}
