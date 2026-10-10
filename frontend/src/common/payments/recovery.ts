import { formatNaira, type PaymentDto, type PaymentVerificationDto } from '@insidelife/shared';
import { ApiError } from '@/common/api/api-error';

const MINUTE_MS = 60_000;

/** How the game looks for payments that may have landed while the player was away (pure rules, tested). */
export const RECOVERY = {
  /** Unconfirmed checkouts younger than this are checked (the server stops looking after a day). */
  maxAgeMs: 24 * 60 * MINUTE_MS,
  /** Failed or closed ones only while this young: a payer who retried on the same checkout, or a slow bank. */
  failedMaxAgeMs: 30 * MINUTE_MS,
  /** At most this many payments per scan, newest first. */
  maxPerScan: 3,
  /** The same payment is checked at most this often. */
  perPaymentEveryMs: 30_000,
  /** Focus and visibility usually fire together: one scan covers both. */
  scanEveryMs: 5_000,
} as const;

/** Could this payment still turn out paid (and so be worth checking now)? */
export function isRecoverable(payment: Pick<PaymentDto, 'status' | 'createdAt'>, now: number): boolean {
  const age = now - Date.parse(payment.createdAt);
  if (Number.isNaN(age)) return false;
  switch (payment.status) {
    case 'initialized':
      return age <= RECOVERY.maxAgeMs;
    case 'failed':
    case 'abandoned':
      return age <= RECOVERY.failedMaxAgeMs;
    case 'success':
      return false;
  }
}

/**
 * The payments to check now: the newest few that could still be paid (`isRecoverable`), minus any checked in the last
 * 30 s (`lastCheckedAt`: reference → epoch ms).
 */
export function paymentsToRecover(payments: readonly PaymentDto[], now: number, lastCheckedAt: ReadonlyMap<string, number>): PaymentDto[] {
  return payments
    .filter((payment) => isRecoverable(payment, now))
    .toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, RECOVERY.maxPerScan)
    .filter((payment) => now - (lastCheckedAt.get(payment.reference) ?? Number.NEGATIVE_INFINITY) >= RECOVERY.perPaymentEveryMs);
}

/** Forget checks older than the throttle window (keeps the memo small). */
export function pruneChecks(lastCheckedAt: Map<string, number>, now: number): void {
  for (const [reference, at] of lastCheckedAt) if (now - at >= RECOVERY.perPaymentEveryMs) lastCheckedAt.delete(reference);
}

/** At most one scan every few seconds (focus + visibilitychange arrive together). */
export function shouldScan(lastScanAt: number | null, now: number): boolean {
  return lastScanAt === null || now - lastScanAt >= RECOVERY.scanEveryMs;
}

/** This check delivered the purchase (or found it delivered since we last looked). */
export function isNewlyDelivered(before: Pick<PaymentDto, 'fulfilled'>, result: PaymentVerificationDto): boolean {
  return result.fulfilledNow || (result.payment.fulfilled && !before.fulfilled);
}

/** The check moved the payment on (paid, delivered, failed…): cached views of it are stale. */
export function paymentChanged(before: Pick<PaymentDto, 'status' | 'fulfilled'>, after: Pick<PaymentDto, 'status' | 'fulfilled'>): boolean {
  return before.status !== after.status || before.fulfilled !== after.fulfilled;
}

/** What a payment bought, for alerts: the in-game naira of a top-up, else its description without our brand prefix. */
export function purchaseSummary(payment: Pick<PaymentDto, 'topup' | 'description'>): string {
  if (payment.topup) return `${formatNaira(payment.topup.virtualAmount)} added to your wallet`;
  const text = payment.description.replace(/^Inside Life\s+/i, '').trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : 'Your purchase is on its way';
}

export interface PaymentAlert {
  readonly title: string;
  readonly body: string;
  readonly tone: 'good' | 'bad' | 'neutral';
  readonly amount?: number;
}

/** The alert for a payment that just landed. */
export function deliveredAlert(payment: PaymentDto): PaymentAlert {
  return { title: 'Payment confirmed', body: purchaseSummary(payment), tone: 'good', amount: payment.topup?.virtualAmount };
}

/** A check that couldn't finish, in words a payer can act on. Never says "not paid": we just don't know yet. */
export function checkErrorAlert(error: unknown): PaymentAlert {
  const reassurance = 'If you paid, it’s safe: we keep checking with Flutterwave and credit it the moment it’s confirmed.';
  if (error instanceof ApiError) {
    if (error.code === 'RATE_LIMITED') return { title: 'Give it a moment', body: `You’ve checked a lot just now. ${reassurance}`, tone: 'neutral' };
    if (error.code === 'PAYMENT_CHECK_UNAVAILABLE' || error.status === 502 || error.status === 503 || error.status === 504) {
      return { title: 'Couldn’t reach Flutterwave', body: `Try again in a moment. ${reassurance}`, tone: 'neutral' };
    }
    if (error.code === 'NETWORK') return { title: 'You’re offline', body: `Check your connection and try again. ${reassurance}`, tone: 'neutral' };
    if (error.status === 404) {
      return { title: 'Not a payment on this account', body: `Sign in with the account you paid from to see it. ${reassurance}`, tone: 'neutral' };
    }
  }
  return { title: 'Couldn’t check that payment', body: `Try again in a moment. ${reassurance}`, tone: 'neutral' };
}
