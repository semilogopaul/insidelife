'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Check, CircleSlash, Hourglass, RotateCcw, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatNaira, type PaymentDto } from '@insidelife/shared';
import { errorMessage } from '@/common/api/api-error';
import { Button, Money, Spinner } from '@/common/components';
import { useUi } from '@/common/game/ui-store';
import { checkErrorAlert } from '@/common/payments';
import { cn } from '@/common/utils/cn';
import { usePaymentVerification } from '../../hooks/use-payment-verification';
import { useStartTopup } from '../../hooks/use-topups';
import { useWallet } from '../../hooks/use-wallet';
import { isPaymentReference, outcomeCopy, type PaymentOutcome } from '../../services/payment-status';
import { CashBurst } from './CashBurst';
import { CheckoutShell, SessionGate } from './CheckoutShell';

/**
 * Where Flutterwave sends the browser back: `/payments/callback?status=…&tx_ref=…&transaction_id=…` (the sandbox uses
 * `?reference=…`), on the origin the player started from. Nothing in the URL is trusted: the server verifies the
 * charge with Flutterwave (idempotent). Then we celebrate a success, explain a failure and offer the way back into the
 * game. Never a dead end for a payment that might be paid: if the check errors or stays pending, we say it's safe,
 * offer "Check again" and "Back to Lagos", and keep checking automatically (server reconciler + the game's recovery).
 */
export function PaymentCallback() {
  const params = useSearchParams();
  const reference = params.get('tx_ref') ?? params.get('reference');
  const transactionId = params.get('transaction_id') ?? undefined;
  const closed = params.get('status') === 'cancelled';
  const query = new URLSearchParams({ tx_ref: reference ?? '', ...(transactionId ? { transaction_id: transactionId } : {}), ...(closed ? { status: 'cancelled' } : {}) });
  return (
    <CheckoutShell label="Payment">
      <SessionGate returnTo={`/payments/callback?${query.toString()}`}>
        {isPaymentReference(reference) ? (
          <Verification reference={reference} transactionId={transactionId && /^\d{1,20}$/.test(transactionId) ? transactionId : undefined} closed={closed} />
        ) : (
          <NoReference />
        )}
      </SessionGate>
    </CheckoutShell>
  );
}

const OUTCOME_ICON: Readonly<Record<PaymentOutcome, { readonly icon: LucideIcon; readonly className: string }>> = {
  delivered: { icon: Check, className: 'bg-naira text-white' },
  delivering: { icon: Hourglass, className: 'bg-danfo text-ink' },
  pending: { icon: Hourglass, className: 'bg-danfo text-ink' },
  failed: { icon: X, className: 'bg-okada text-white' },
  abandoned: { icon: CircleSlash, className: 'bg-paper-3 text-text' },
};

interface VerificationProps {
  readonly reference: string;
  readonly transactionId?: string;
  /** Flutterwave said the checkout was closed (a hint for the copy only; the server still checks). */
  readonly closed: boolean;
}

function Verification({ reference, transactionId, closed }: VerificationProps) {
  const verification = usePaymentVerification(reference, true, transactionId);
  const reduceMotion = useReducedMotion();

  if (verification.isPending) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
        <Spinner size={28} className="text-text-soft" />
        <p className="type-title text-xl">Confirming your payment…</p>
        <p className="text-sm text-text-soft">Checking with Flutterwave. This takes a few seconds.</p>
      </div>
    );
  }
  if (!verification.data || !verification.outcome) {
    // The first check couldn't finish (Flutterwave unreachable, offline, rate limited…): we don't know yet, so no verdict.
    const alert = checkErrorAlert(verification.error);
    return (
      <div className="flex flex-col items-center py-4 text-center" aria-live="polite">
        <span className="grid size-20 place-items-center rounded-full bg-danfo text-ink">
          <Hourglass size={40} strokeWidth={2.6} aria-hidden />
        </span>
        <h1 className="type-title mt-5 text-2xl">{alert.title}</h1>
        <p className="mt-2 max-w-xs text-sm text-text-soft">{alert.body}</p>
        <p className="mt-2 max-w-xs text-sm text-text-soft">It’s safe to leave this page: the game checks again when you’re back.</p>
        <div className="mt-5 flex w-full flex-col gap-2">
          <Button block loading={verification.isFetching} onClick={verification.checkAgain} icon={<RotateCcw size={18} aria-hidden />}>
            Check again
          </Button>
          <BackToLagos payment={null} />
        </div>
      </div>
    );
  }

  const { payment } = verification.data;
  // Closed on Flutterwave's page and nothing paid: say so instead of "waiting for your bank".
  const outcome = closed && verification.outcome === 'pending' ? 'abandoned' : verification.outcome;
  const copy = outcomeCopy(outcome === 'abandoned' ? { ...payment, status: 'abandoned' } : payment);
  const { icon: Icon, className } = OUTCOME_ICON[outcome];
  const waiting = outcome === 'pending' || outcome === 'delivering';
  // A later poll failed: the last answer stays on screen and polling goes on, but say why it may look stuck.
  const pollTrouble = verification.isError ? checkErrorAlert(verification.error) : null;

  return (
    <div className="flex flex-col items-center text-center" aria-live="polite">
      <div className="relative mt-2">
        {outcome === 'delivered' && <CashBurst />}
        <motion.span
          className={cn('relative grid size-20 place-items-center rounded-full', className)}
          initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 20 }}
        >
          <Icon size={40} strokeWidth={2.6} aria-hidden className={waiting && !reduceMotion ? 'animate-pulse' : undefined} />
        </motion.span>
      </div>
      <h1 className="type-title mt-5 text-[1.9rem] leading-tight">{copy.title}</h1>
      <p className="mt-2 max-w-xs text-sm text-text-soft">{copy.body}</p>

      {outcome === 'delivered' && payment.purpose === 'topup' && <NewBalance />}

      <dl className="mt-5 grid w-full grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-card bg-paper-2 p-3.5 text-left text-sm">
        <dt className="text-text-soft">For</dt>
        <dd className="text-right font-bold">{payment.topup ? `${payment.topup.label} (${formatNaira(payment.topup.virtualAmount)} in-game)` : payment.description}</dd>
        <dt className="text-text-soft">{outcome === 'delivered' || outcome === 'delivering' ? 'You paid' : 'Amount'}</dt>
        <dd className="tabular text-right">
          <Money amount={payment.amountNgn} /> {payment.channel === 'sandbox' ? '(test)' : ''}
        </dd>
        <dt className="text-text-soft">Reference</dt>
        <dd className="tabular truncate text-right text-xs text-text-faint" title={payment.reference}>
          {payment.reference.slice(0, 8).toUpperCase()}
        </dd>
      </dl>

      <div className="mt-5 flex w-full flex-col gap-2">
        {waiting && (
          <>
            {pollTrouble ? (
              <p className="text-sm text-text-soft" role="status">
                {pollTrouble.title}. {pollTrouble.body}
              </p>
            ) : verification.exhausted ? (
              <p className="text-sm text-text-soft">
                Still waiting for Flutterwave. It’s safe to go back to Lagos: we keep checking automatically and credit you the moment it’s confirmed.
              </p>
            ) : (
              <p className="flex items-center justify-center gap-2 text-sm text-text-soft" role="status">
                <Spinner size={14} /> Checking again every few seconds…
              </p>
            )}
            <Button variant="paper" block icon={<RotateCcw size={18} aria-hidden />} loading={verification.isFetching} onClick={verification.checkAgain}>
              Check again
            </Button>
          </>
        )}
        {(outcome === 'failed' || outcome === 'abandoned') && (
          <>
            <Retry payment={payment} />
            {/* Paid anyway (a slow transfer, a retry on the same checkout)? A late payment still counts. */}
            <Button variant="paper" block icon={<RotateCcw size={18} aria-hidden />} loading={verification.isFetching} onClick={verification.checkAgain}>
              I’ve paid: check again
            </Button>
          </>
        )}
        <BackToLagos payment={payment} primary={outcome === 'delivered'} />
      </div>
    </div>
  );
}

function NewBalance() {
  const wallet = useWallet();
  return (
    <p className="mt-4 rounded-full bg-naira-soft px-4 py-1.5 text-sm font-bold text-naira">
      New balance {wallet.data ? <Money amount={wallet.data.balance} /> : '…'}
    </p>
  );
}

function Retry({ payment }: { readonly payment: PaymentDto }) {
  const start = useStartTopup();
  if (payment.purpose !== 'topup' || !payment.topup) return null;
  // The same pack, or the same custom amount (re-quoted by the server).
  const again = payment.topup.packageId ? { packageId: payment.topup.packageId } : { amountNgn: payment.amountNgn };
  return (
    <>
      {start.isError && (
        <p role="alert" className="rounded-card bg-okada-soft p-3 text-sm text-okada">
          {errorMessage(start.error)}
        </p>
      )}
      <Button size="lg" block loading={start.isPending || start.isSuccess} onClick={() => start.mutate(again)} icon={<RotateCcw size={18} aria-hidden />}>
        Try again
      </Button>
    </>
  );
}

/** Back into the world, with the phone open where this purchase lives (Bank, or Promote for ads and tracks). */
function BackToLagos({ payment, primary = false }: { readonly payment: PaymentDto | null; readonly primary?: boolean }) {
  const router = useRouter();
  const openPhone = useUi((state) => state.openPhone);
  const go = (): void => {
    if (payment?.purpose === 'billboard') openPhone('promote', 'campaigns');
    else if (payment?.purpose === 'club-play') openPhone('promote', 'tracks');
    else if (payment) openPhone('bank');
    router.push('/play');
  };
  return (
    <Button size="lg" variant={primary ? 'danfo' : 'ink'} block onClick={go}>
      Back to Lagos
    </Button>
  );
}

function NoReference() {
  return (
    <div className="py-4 text-center">
      <p className="type-title text-2xl">No payment to check</p>
      <p className="mt-2 text-sm text-text-soft">This page needs a payment reference from checkout. Your payments are listed in Bank → Top up.</p>
      <Link href="/play" className="mt-5 inline-flex h-12 items-center rounded-card bg-ink px-5 font-bold text-on-ink">
        Back to Lagos
      </Link>
    </div>
  );
}
