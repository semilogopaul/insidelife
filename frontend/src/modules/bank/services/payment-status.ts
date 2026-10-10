import { formatNaira, formatPaymentAmount, type PaymentDto, type PaymentPurpose } from '@insidelife/shared';
import { deliveredAlert, type PaymentAlert } from '@/common/payments';

/**
 * What a payment's state means to the player after checkout. `success` + `fulfilled` is the only "done" state;
 * a paid-but-undelivered payment is still being delivered (the server retries), never a failure.
 */
export type PaymentOutcome = 'delivered' | 'delivering' | 'pending' | 'failed' | 'abandoned';

export function paymentOutcome(payment: Pick<PaymentDto, 'status' | 'fulfilled'>): PaymentOutcome {
  if (payment.status === 'success') return payment.fulfilled ? 'delivered' : 'delivering';
  if (payment.status === 'initialized') return 'pending';
  return payment.status;
}

export const PURPOSE_LABELS: Readonly<Record<PaymentPurpose, string>> = {
  topup: 'Top-up',
  billboard: 'Billboard ad',
  'club-play': 'Club play',
};

export interface OutcomeCopy {
  readonly title: string;
  readonly body: string;
}

/** Money went back to the payer (an ad or song that wasn't approved, a sold-out slot, or a refund by support). */
export const isRefunded = (payment: Pick<PaymentDto, 'refundedMinor'>): boolean => payment.refundedMinor > 0;

/** What went back, in the currency it was paid in: "₦300,000" or "$200". */
const refundedLabel = (payment: Pick<PaymentDto, 'currency' | 'refundedMinor'>): string => formatPaymentAmount(payment.currency, payment.refundedMinor);

/** Headline + one line for the callback screen, in the voice of the game. */
export function outcomeCopy(payment: PaymentDto): OutcomeCopy {
  const outcome = paymentOutcome(payment);
  const credited = payment.topup ? formatNaira(payment.topup.virtualAmount) : null;
  if (isRefunded(payment)) {
    return { title: 'Payment refunded', body: `${refundedLabel(payment)} went back to your card or bank. It can take a few working days to show.` };
  }
  switch (outcome) {
    case 'delivered':
      if (payment.purpose === 'topup') return { title: `${credited} added to your wallet`, body: 'Payment confirmed. Go and enjoy Lagos.' };
      if (payment.purpose === 'billboard') return { title: 'Payment confirmed', body: 'Your billboard is now in review. A moderator checks every ad before it goes up.' };
      return { title: 'Payment confirmed', body: 'Your track is now in review. Once approved, the DJs add it to rotation.' };
    case 'delivering':
      return { title: 'Paid. Delivering now…', body: 'Flutterwave confirmed your payment. We’re finishing the delivery; this usually takes a few seconds.' };
    case 'pending':
      return {
        title: 'Waiting for confirmation',
        body: 'Flutterwave hasn’t confirmed the payment yet. Bank transfers and USSD can take a few minutes. If you paid, it’s safe: we keep checking and credit it automatically.',
      };
    case 'failed':
      return { title: 'Payment didn’t go through', body: 'You weren’t charged. Try again, or use another card or bank. Paid anyway? Check again: a payment that lands later still counts.' };
    case 'abandoned':
      return { title: 'Checkout was closed', body: 'You left checkout before paying, so nothing was charged. Paid anyway? Check again: a payment that lands later still counts.' };
  }
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * Does this history row offer "I've paid: check now"? Anything not yet confirmed: pending ones, and failed or closed
 * ones for a day (a late payment still counts, and the server keeps checking that long).
 */
export function offersPaidCheck(payment: Pick<PaymentDto, 'status' | 'createdAt'>, now: number): boolean {
  if (payment.status === 'initialized') return true;
  if (payment.status === 'success') return false;
  return now - Date.parse(payment.createdAt) <= DAY_MS;
}

/** The alert after "I've paid: check now": what Flutterwave says now, and never a dead end for a payment that may be paid. */
export function checkResultAlert(payment: PaymentDto): PaymentAlert {
  if (isRefunded(payment)) return { title: 'Payment refunded', body: `${refundedLabel(payment)} went back to your card or bank.`, tone: 'neutral' };
  const safe = 'If you paid, it’s safe: we keep checking with Flutterwave and credit it the moment it’s confirmed.';
  switch (paymentOutcome(payment)) {
    case 'delivered':
      return deliveredAlert(payment);
    case 'delivering':
      return { title: 'Paid. Delivering now…', body: 'Flutterwave confirmed it. It lands in a few seconds.', tone: 'good' };
    case 'pending':
      return { title: 'Not confirmed yet', body: `Flutterwave hasn’t confirmed this payment yet. ${safe}`, tone: 'neutral' };
    case 'failed':
      return { title: 'Flutterwave says it didn’t go through', body: `You weren’t charged for that attempt. ${safe}`, tone: 'neutral' };
    case 'abandoned':
      return { title: 'No payment found yet', body: `Flutterwave has no completed payment for this checkout. ${safe}`, tone: 'neutral' };
  }
}

/** Short status label for payment history rows. */
export const OUTCOME_LABELS: Readonly<Record<PaymentOutcome, string>> = {
  delivered: 'Paid',
  delivering: 'Delivering',
  pending: 'Pending',
  failed: 'Failed',
  abandoned: 'Not completed',
};

/** Our payment references (Flutterwave's `tx_ref`, or the sandbox's) are UUIDs; anything else in the URL is ignored. */
export function isPaymentReference(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
