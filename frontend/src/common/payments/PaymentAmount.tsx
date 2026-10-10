import { formatNaira, formatUsdCents, type PaymentCurrency } from '@insidelife/shared';
import { Money } from '@/common/components/Money';
import { cn } from '@/common/utils/cn';

export interface PaymentAmountProps {
  /** What was charged, in `currency`'s minor units (kobo for NGN, cents for USD). */
  readonly currency: PaymentCurrency;
  readonly minor: number;
  /** A dollar charge's naira value (kobo), shown muted after it; ignored for naira. */
  readonly nairaKobo?: number | null;
  readonly className?: string;
}

/** A real-money amount in the currency it was paid in: "₦150,000", or "$100" (with "₦150,000" muted when given). */
export function PaymentAmount({ currency, minor, nairaKobo = null, className }: PaymentAmountProps) {
  if (currency !== 'USD') return <Money amount={minor / 100} className={className} />;
  return (
    <span className={cn('tabular whitespace-nowrap', className)}>
      {formatUsdCents(minor)}
      {nairaKobo !== null && <span className="text-[0.85em] font-normal text-text-soft"> ({formatNaira(nairaKobo / 100)})</span>}
    </span>
  );
}
