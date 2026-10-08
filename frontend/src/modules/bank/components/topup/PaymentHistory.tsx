'use client';

import { CreditCard, Megaphone, Music } from 'lucide-react';
import type { PaymentDto, PaymentPurpose } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Badge, Button, Money, Spinner, toast } from '@/common/components';
import { usePaymentHistory, useVerifyPayment } from '../../hooks/use-topups';
import { OUTCOME_LABELS, paymentOutcome, type PaymentOutcome } from '../../services/payment-status';

const PURPOSE_ICONS: Readonly<Record<PaymentPurpose, typeof CreditCard>> = { topup: CreditCard, billboard: Megaphone, 'club-play': Music };
const OUTCOME_TONES: Readonly<Record<PaymentOutcome, 'good' | 'warn' | 'bad' | 'neutral'>> = {
  delivered: 'good',
  delivering: 'warn',
  pending: 'warn',
  failed: 'bad',
  abandoned: 'neutral',
};

const realDate = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Every real-money payment on the account, with a status check for anything still pending. */
export function PaymentHistory({ onRetry }: { readonly onRetry: (payment: PaymentDto) => void }) {
  const history = usePaymentHistory();
  const verify = useVerifyPayment();

  if (history.isPending) return <Spinner className="text-text-soft" />;
  if (history.isError) return <p className="text-sm text-okada">{errorMessage(history.error)}</p>;
  if (history.data.length === 0) return <p className="text-sm text-text-soft">No payments yet. Real-money purchases show up here with their status.</p>;

  return (
    <ul className="flex flex-col divide-y divide-line">
      {history.data.map((payment) => {
        const outcome = paymentOutcome(payment);
        const Icon = PURPOSE_ICONS[payment.purpose];
        const checking = verify.isPending && verify.variables === payment.reference;
        return (
          <li key={payment.reference} className="flex items-start gap-3 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-paper-2 text-text-soft">
              <Icon size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{payment.topup?.label ?? payment.description}</p>
              <p className="text-xs text-text-soft">
                {realDate.format(new Date(payment.createdAt))}
                {payment.channel === 'sandbox' ? ' · test payment' : payment.channel ? ` · ${payment.channel.replace('_', ' ')}` : ''}
              </p>
              {payment.topup && outcome === 'delivered' && (
                <p className="text-xs font-bold text-naira">
                  +<Money amount={payment.topup.virtualAmount} compact /> in-game
                </p>
              )}
              {(outcome === 'pending' || outcome === 'delivering') && (
                <Button
                  variant="paper"
                  size="sm"
                  className="mt-1.5"
                  loading={checking}
                  onClick={() =>
                    verify.mutate(payment.reference, {
                      onSuccess: (result) => {
                        const next = paymentOutcome(result.payment);
                        toast({
                          title: next === 'delivered' ? 'Payment confirmed' : next === 'pending' ? 'Still waiting for your bank' : OUTCOME_LABELS[next],
                          tone: next === 'delivered' ? 'good' : next === 'failed' ? 'bad' : 'neutral',
                          amount: next === 'delivered' ? result.payment.topup?.virtualAmount : undefined,
                        });
                      },
                      onError: (error) => toast({ title: 'Couldn’t check that payment', body: errorMessage(error), tone: 'bad' }),
                    })
                  }
                >
                  Check status
                </Button>
              )}
              {(outcome === 'failed' || outcome === 'abandoned') && payment.purpose === 'topup' && (
                <Button variant="paper" size="sm" className="mt-1.5" onClick={() => onRetry(payment)}>
                  Try again
                </Button>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xs text-text-faint">You paid</p>
              <p className="type-figure text-sm">
                <Money amount={payment.amountNgn} />
              </p>
              <Badge tone={OUTCOME_TONES[outcome]} className="mt-1">
                {OUTCOME_LABELS[outcome]}
              </Badge>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
