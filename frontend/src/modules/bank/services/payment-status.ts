import { formatNaira, type PaymentDto, type PaymentPurpose } from '@insidelife/shared';

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

/** Headline + one line for the callback screen, in the voice of the game. */
export function outcomeCopy(payment: PaymentDto): OutcomeCopy {
  const outcome = paymentOutcome(payment);
  const credited = payment.topup ? formatNaira(payment.topup.virtualAmount) : null;
  switch (outcome) {
    case 'delivered':
      if (payment.purpose === 'topup') return { title: `${credited} added to your wallet`, body: 'Payment confirmed. Go and enjoy Lagos.' };
      if (payment.purpose === 'billboard') return { title: 'Payment confirmed', body: 'Your billboard is now in review. A moderator checks every ad before it goes up.' };
      return { title: 'Payment confirmed', body: 'Your track is now in review. Once approved, the DJs add it to rotation.' };
    case 'delivering':
      return { title: 'Paid. Delivering now…', body: 'Paystack confirmed your payment. We’re finishing the delivery; this usually takes a few seconds.' };
    case 'pending':
      return { title: 'Waiting for confirmation', body: 'Your bank hasn’t confirmed the payment yet. Bank transfers and USSD can take a minute.' };
    case 'failed':
      return { title: 'Payment didn’t go through', body: 'You weren’t charged. Try again, or use another card or bank.' };
    case 'abandoned':
      return { title: 'Checkout was closed', body: 'You left checkout before paying, so nothing was charged.' };
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

/** Paystack and the sandbox give UUID references; anything else in the URL is ignored. */
export function isPaymentReference(value: string | null): value is string {
  return value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
