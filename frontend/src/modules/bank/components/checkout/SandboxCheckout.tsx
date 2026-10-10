'use client';

import { useMutation } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatNaira, formatPaymentAmount, type PaymentDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, Spinner } from '@/common/components';
import { PaymentAmount } from '@/common/payments';
import { usePaymentHistory } from '../../hooks/use-topups';
import { bankApi } from '../../services/bank.api';
import { isPaymentReference, paymentOutcome, PURPOSE_LABELS } from '../../services/payment-status';
import { CheckoutShell, SessionGate } from './CheckoutShell';

/**
 * Local development checkout (the server returns this page instead of Flutterwave when it runs the sandbox gateway).
 * The buttons decide the outcome; then we hop to the same callback a real Flutterwave redirect lands on.
 */
export function SandboxCheckout() {
  const params = useSearchParams();
  const reference = params.get('reference');
  const returnTo = `/payments/sandbox?reference=${encodeURIComponent(reference ?? '')}`;
  return (
    <CheckoutShell label="Test checkout">
      <TestModeBanner />
      <SessionGate returnTo={returnTo}>
        {isPaymentReference(reference) ? <SandboxBody reference={reference} /> : <Missing />}
      </SessionGate>
    </CheckoutShell>
  );
}

function TestModeBanner() {
  return (
    <div className="-mx-6 -mt-6 mb-5 flex items-center gap-3 bg-danfo px-6 py-3 text-ink">
      <FlaskConical size={22} aria-hidden className="shrink-0" />
      <div>
        <p className="font-bold leading-tight">Test checkout — no real money</p>
        <p className="text-xs">This page only exists on development servers. Nothing is charged.</p>
      </div>
    </div>
  );
}

function SandboxBody({ reference }: { readonly reference: string }) {
  const router = useRouter();
  const history = usePaymentHistory();
  const decide = useMutation({
    mutationFn: (outcome: 'succeed' | 'fail') => bankApi.sandbox(reference, outcome),
    onSuccess: () => router.replace(`/payments/callback?reference=${encodeURIComponent(reference)}`),
  });

  if (history.isPending) {
    return (
      <div className="grid place-items-center py-10 text-text-soft">
        <Spinner size={24} />
      </div>
    );
  }
  if (history.isError) return <p className="text-sm text-okada">{errorMessage(history.error)}</p>;
  const payment = history.data.find((item) => item.reference === reference);
  if (!payment) return <Missing />;
  const done = paymentOutcome(payment) !== 'pending';

  return (
    <div className="flex flex-col gap-5">
      <PaymentSummary payment={payment} />
      {decide.isError && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(decide.error)}
        </p>
      )}
      {done ? (
        <Button size="lg" block onClick={() => router.replace(`/payments/callback?reference=${encodeURIComponent(reference)}`)}>
          This payment is already settled — see result
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button size="lg" block loading={decide.isPending && decide.variables === 'succeed'} disabled={decide.isPending} onClick={() => decide.mutate('succeed')}>
            Pay {formatPaymentAmount(payment.currency, payment.amountMinor)} (simulate success)
          </Button>
          <Button size="lg" variant="paper" block loading={decide.isPending && decide.variables === 'fail'} disabled={decide.isPending} onClick={() => decide.mutate('fail')}>
            Simulate failure
          </Button>
          <Link href="/play" className="mt-1 text-center text-sm font-bold text-text-soft underline-offset-2 hover:underline">
            Leave without paying
          </Link>
        </div>
      )}
    </div>
  );
}

function PaymentSummary({ payment }: { readonly payment: PaymentDto }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-text-soft">For</dt>
      <dd className="text-right font-bold">{payment.topup?.label ?? PURPOSE_LABELS[payment.purpose]}</dd>
      {!payment.topup && (
        <>
          <dt className="text-text-soft">Description</dt>
          <dd className="text-right">{payment.description}</dd>
        </>
      )}
      {payment.topup && (
        <>
          <dt className="text-text-soft">You get</dt>
          <dd className="text-right font-bold text-naira">
            <Money amount={payment.topup.virtualAmount} /> in-game
          </dd>
        </>
      )}
      <div aria-hidden className="col-span-2 border-t border-line" />
      <dt className="self-center font-bold">Amount</dt>
      <dd className="type-figure text-right text-3xl">
        <PaymentAmount currency={payment.currency} minor={payment.amountMinor} />
      </dd>
      {payment.currency === 'USD' && (
        <>
          <dt className="text-text-soft">In naira</dt>
          <dd className="tabular text-right text-text-soft">
            {formatNaira(payment.amountNgn)}
            {payment.ngnPerUsd ? ` at ${formatNaira(payment.ngnPerUsd)} per $1` : ''}
          </dd>
        </>
      )}
      <dt className="text-text-soft">Reference</dt>
      <dd className="truncate text-right text-xs text-text-faint" title={payment.reference}>
        {payment.reference}
      </dd>
    </dl>
  );
}

function Missing() {
  return (
    <div className="py-4 text-center">
      <p className="type-title text-2xl">We can’t find this checkout</p>
      <p className="mt-2 text-sm text-text-soft">The link may be incomplete, or it belongs to another account. Start the payment again from your phone.</p>
      <Link href="/play" className="mt-5 inline-flex h-12 items-center rounded-card bg-ink px-5 font-bold text-on-ink">
        Back to Lagos
      </Link>
    </div>
  );
}
