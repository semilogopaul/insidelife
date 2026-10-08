import { formatNaira, formatNairaCompact } from '@insidelife/shared';
import { cn } from '@/common/utils/cn';

export interface MoneyProps {
  readonly amount: number;
  readonly compact?: boolean;
  /** Colour positive green / negative red and show a sign. */
  readonly signed?: boolean;
  readonly className?: string;
}

/** Naira amounts, always tabular so the HUD never jitters. */
export function Money({ amount, compact = false, signed = false, className }: MoneyProps) {
  const text = compact ? formatNairaCompact(Math.abs(amount)) : formatNaira(Math.abs(amount));
  const sign = signed ? (amount > 0 ? '+' : amount < 0 ? '−' : '') : amount < 0 ? '−' : '';
  return (
    <span
      className={cn('tabular whitespace-nowrap', signed && amount > 0 && 'text-naira', signed && amount < 0 && 'text-okada', className)}
      title={formatNaira(amount)}
    >
      {sign}
      {text}
    </span>
  );
}
