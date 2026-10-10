'use client';

import { RefreshCw } from 'lucide-react';
import { errorMessage } from '@/common/api/api-error';
import { Button, toast } from '@/common/components';
import { useNow } from '@/common/hooks/use-now';
import { checkPayment } from '@/common/payments';
import { useCheckPayment } from '../../hooks/use-promote';

const clock = new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' });

export interface PendingPaymentProps {
  readonly paymentReference: string | null;
  readonly checkoutUrl: string | null;
  readonly holdExpiresAt: string | null;
  /** Cancel the booking (ads only); asked only after a check says it isn't paid. */
  readonly onCancel?: () => Promise<void>;
  readonly compact?: boolean;
}

/**
 * An order still waiting for its payment. Never a dead end: "I've paid: check now" asks Flutterwave at once (a payment
 * that reached them is delivered there and then), "Finish payment" reopens checkout while the spot is held, and
 * cancelling checks first, so a payment that landed is never thrown away.
 */
export function PendingPayment({ paymentReference, checkoutUrl, holdExpiresAt, onCancel, compact = false }: PendingPaymentProps) {
  const now = useNow();
  const check = useCheckPayment();
  const holdOpen = holdExpiresAt !== null && Date.parse(holdExpiresAt) > now;

  const cancel = async (): Promise<void> => {
    if (!onCancel) return;
    try {
      if (paymentReference) {
        const result = await checkPayment(paymentReference);
        if (result.payment.status === 'success') {
          toast({ title: 'You’ve already paid', body: 'Your payment came through, so this booking is going to review. Nothing to cancel.', tone: 'good' });
          check.reset();
          return;
        }
      }
      await onCancel();
      toast({ title: 'Booking cancelled', body: 'Nothing was charged.', tone: 'neutral' });
    } catch (error) {
      toast({ title: 'Couldn’t cancel', body: errorMessage(error), tone: 'bad' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <p className="text-sm text-text-soft">
          {holdOpen
            ? `Your spot is held until ${clock.format(new Date(holdExpiresAt ?? 0))}. Paid already? Check now: it can take a minute to reach us.`
            : 'Paid already? Check now. If the payment went through it still counts, even after the hold.'}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {paymentReference && (
          <Button size="sm" icon={<RefreshCw size={15} aria-hidden />} loading={check.isPending} onClick={() => check.mutate(paymentReference)}>
            I’ve paid: check now
          </Button>
        )}
        {checkoutUrl && holdOpen && (
          <Button size="sm" variant="paper" onClick={() => window.location.assign(checkoutUrl)}>
            Finish payment
          </Button>
        )}
        {onCancel && (
          <Button size="sm" variant="paper" onClick={() => void cancel()}>
            Cancel booking
          </Button>
        )}
      </div>
    </div>
  );
}
