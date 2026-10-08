import type { ReactNode } from 'react';
import { Money } from '@/common/components';
import { cn } from '@/common/utils/cn';

export interface ChargesBreakdownProps {
  readonly amount: number;
  readonly fee: number;
  readonly stampDuty: number;
  readonly extra?: ReadonlyArray<{ readonly label: string; readonly value: ReactNode }>;
  readonly className?: string;
}

/** Amount, bank charge, stamp duty and the total that leaves your cash — always visible before you commit. */
export function ChargesBreakdown({ amount, fee, stampDuty, extra = [], className }: ChargesBreakdownProps) {
  return (
    <dl className={cn('grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm', className)}>
      <dt className="text-text-soft">Amount</dt>
      <dd className="tabular text-right font-bold">
        <Money amount={amount} />
      </dd>
      <dt className="text-text-soft">Transfer fee</dt>
      <dd className="tabular text-right">{fee === 0 ? 'Free' : <Money amount={fee} />}</dd>
      <dt className="text-text-soft">Stamp duty</dt>
      <dd className="tabular text-right">{stampDuty === 0 ? 'None' : <Money amount={stampDuty} />}</dd>
      <div aria-hidden className="col-span-2 my-0.5 border-t border-line" />
      <dt className="font-bold">Total from your cash</dt>
      <dd className="type-figure text-right">
        <Money amount={amount + fee + stampDuty} />
      </dd>
      {extra.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-text-soft">{row.label}</dt>
          <dd className="tabular text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
