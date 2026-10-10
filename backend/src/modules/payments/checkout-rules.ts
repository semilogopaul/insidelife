import type { PaymentStatus } from '@insidelife/shared';
import type { PaymentRefundStatus } from './entities/payment.entity.js';
import type { GatewayCharge } from './gateways/payment-gateway.interface.js';

/** What to do with a payment row given what the gateway reports. Pure, so the money-critical branching is testable. */
export type ChargeDecision =
  | { readonly kind: 'record-success' }
  | { readonly kind: 'already-paid' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'not-paid'; readonly status: Extract<PaymentStatus, 'failed' | 'abandoned'>; readonly reason: string }
  | { readonly kind: 'mismatch'; readonly reason: 'reference_mismatch' | 'currency_mismatch' | 'amount_mismatch' };

export interface ExpectedPayment {
  readonly reference: string;
  /** The price in minor units of `currency` (kobo for NGN, cents for USD). */
  readonly amountMinor: number;
  /** The currency the checkout charges in (`NGN` or `USD`). */
  readonly currency: string;
  readonly status: PaymentStatus;
}

/**
 * Flutterwave's rule for a paid checkout: `status === 'successful'`, `tx_ref` is ours, `currency` is exactly the
 * checkout's (NGN or USD), and `amount >= expected` and `charged_amount >= expected`, both in that currency.
 * - A charge in another currency never counts, whatever its amount: $25 is not ₦25, and ₦2,500 is not $2,500.
 * - `success` is terminal: a confirmed payment is never downgraded (later reports are ignored here).
 * - A success only counts when reference and currency match and at least the price was paid and charged — a cheaper
 *   charge on someone else's reference must never deliver the expensive pack. A missing `charged_amount` counts as
 *   not charged (fail closed: the reconciler re-checks the row).
 * - `failed`/`abandoned` rows can still become `success` (customers retry on the same checkout).
 */
export function decideCharge(
  expected: ExpectedPayment,
  charge: Pick<GatewayCharge, 'reference' | 'status' | 'amountMinor' | 'chargedAmountMinor' | 'currency'>,
): ChargeDecision {
  if (expected.status === 'success') return { kind: 'already-paid' };
  if (charge.reference !== expected.reference) return { kind: 'mismatch', reason: 'reference_mismatch' };
  switch (charge.status) {
    case 'success':
      if (!expected.currency || charge.currency !== expected.currency) return { kind: 'mismatch', reason: 'currency_mismatch' };
      if (!Number.isSafeInteger(expected.amountMinor) || expected.amountMinor <= 0) return { kind: 'mismatch', reason: 'amount_mismatch' };
      if (charge.amountMinor < expected.amountMinor) return { kind: 'mismatch', reason: 'amount_mismatch' };
      if (charge.chargedAmountMinor === null || charge.chargedAmountMinor < expected.amountMinor) return { kind: 'mismatch', reason: 'amount_mismatch' };
      return { kind: 'record-success' };
    case 'failed':
      return { kind: 'not-paid', status: 'failed', reason: 'charge_failed' };
    case 'abandoned':
      return { kind: 'not-paid', status: 'abandoned', reason: 'checkout_abandoned' };
    case 'pending':
      return { kind: 'pending' };
  }
}

export type RefundClaim =
  /** Mark it `sending` and call the gateway. */
  | { readonly kind: 'send' }
  | { readonly kind: 'already-refunded' }
  /** Another worker holds the claim and is talking to the gateway right now. */
  | { readonly kind: 'in-flight' }
  | { readonly kind: 'not-refundable'; readonly reason: string };

/**
 * Exactly-once refunds: only a paid payment can be refunded, once. `due` (owed) and `failed` (refused earlier, retried
 * on request) may be claimed; `sending` is someone else's claim and `pending` is with the gateway; `refunded` is final.
 */
export function claimRefund(payment: { readonly status: PaymentStatus; readonly refundStatus: PaymentRefundStatus | null }): RefundClaim {
  if (payment.status !== 'success') return { kind: 'not-refundable', reason: 'The payment never went through, so there is nothing to refund' };
  switch (payment.refundStatus) {
    case 'refunded':
      return { kind: 'already-refunded' };
    case 'sending':
    case 'pending':
      return { kind: 'in-flight' };
    case null:
    case 'due':
    case 'failed':
      return { kind: 'send' };
  }
}

// ----- Refund reports ---------------------------------------------------------------------------------------------

/** A refund as the gateway reports it (API response, webhook, re-check), with its state normalised. */
export interface RefundReport {
  readonly refundId: string;
  /** In minor units of the payment's currency (Flutterwave refunds in the charge's currency). */
  readonly amountMinor: number;
  readonly state: 'completed' | 'pending' | 'failed';
  /** The gateway's own wording, stored for audit. */
  readonly gatewayStatus: string;
}

export interface RefundRecord {
  readonly refundStatus: PaymentRefundStatus | null;
  readonly refundId: string | null;
  readonly refundGatewayStatus: string | null;
}

export type RefundReportDecision =
  /** Nothing new (same refund, same state), or a stale `pending` after the refund completed. */
  | { readonly kind: 'ignore' }
  /** The gateway took the refund but hasn't finished it: payment → `pending`. Nothing is settled yet. */
  | { readonly kind: 'pending' }
  /** Final: payment → `refunded`, and the purpose settles it (claw back, take down) once. */
  | { readonly kind: 'completed'; readonly additional: boolean }
  /** The refund didn't go through: payment → `failed` (ops refund by hand). `reverted`: it had been recorded completed. */
  | { readonly kind: 'failed'; readonly reverted: boolean };

/**
 * What a reported refund does to a payment. Only `completed` is final. A later `failed` for the refund we track
 * reverts it (even after `completed`: the purpose must undo its settlement); a status change for the same refund id
 * is never dropped as a duplicate; a refund with another id is a further (partial) refund.
 */
export function decideRefundReport(record: RefundRecord, report: RefundReport): RefundReportDecision {
  const sameRefund = record.refundId === report.refundId;
  // The refund we track: this id, or ours whose id we don't know yet (the API call is in flight).
  const tracked = sameRefund || record.refundStatus === 'sending';
  switch (report.state) {
    case 'completed':
      if (sameRefund && record.refundStatus === 'refunded') return { kind: 'ignore' };
      // Another completed refund on top of an earlier completed one is a further partial refund.
      return { kind: 'completed', additional: !sameRefund && record.refundStatus === 'refunded' };
    case 'pending':
      if (sameRefund && (record.refundStatus === 'pending' || record.refundStatus === 'refunded')) return { kind: 'ignore' };
      if (!sameRefund && record.refundStatus === 'refunded') return { kind: 'ignore' };
      return { kind: 'pending' };
    case 'failed':
      if (!tracked) return { kind: 'ignore' };
      if (record.refundStatus === 'failed' && sameRefund) return { kind: 'ignore' };
      return { kind: 'failed', reverted: sameRefund && record.refundStatus === 'refunded' };
  }
}

// ----- Where checkout sends the player back -----------------------------------------------------------------------

/** `scheme://authority` and nothing else: no userinfo (`@`), path, query, fragment, backslash or whitespace. */
const BARE_ORIGIN = /^https?:\/\/[^/?#@\\\s]+$/i;
const DEFAULT_CALLBACK_PATH = '/payments/callback';

/**
 * The canonical form of a bare http(s) origin (scheme and host lower-cased, default port dropped, trailing slashes
 * ignored), or null for anything else: a path, query, fragment, credentials, another scheme, junk. `httpsOnly`
 * refuses http too (the live site).
 */
export function canonicalOrigin(value: string | null | undefined, httpsOnly = false): string | null {
  if (typeof value !== 'string' || value.length > 255) return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!BARE_ORIGIN.test(trimmed) || !URL.canParse(trimmed)) return null;
  const url = new URL(trimmed);
  if (url.protocol !== 'https:' && (httpsOnly || url.protocol !== 'http:')) return null;
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  return url.origin;
}

/**
 * Flutterwave's `redirect_url` for a checkout: the callback page (PAYMENT_CALLBACK_URL's path) on the origin the player
 * is using, when that origin is exactly one of ours (`allowedOrigins` = CORS_ORIGINS, compared canonically), so a
 * player on a phone, a second domain or a dev tunnel comes back to a page they can reach. Anything else (missing,
 * malformed, not listed, http when `httpsOnly`) gets `callbackUrl` unchanged: a checkout can never be pointed at
 * someone else's site.
 */
export function checkoutReturnUrl(
  origin: string | null | undefined,
  allowedOrigins: readonly string[],
  callbackUrl: string,
  options: { readonly httpsOnly: boolean } = { httpsOnly: false },
): string {
  const candidate = canonicalOrigin(origin, options.httpsOnly);
  if (!candidate || !allowedOrigins.some((allowed) => canonicalOrigin(allowed) === candidate)) return callbackUrl;
  const callback = URL.canParse(callbackUrl) ? new URL(callbackUrl) : null;
  return `${candidate}${callback ? `${callback.pathname}${callback.search}` : DEFAULT_CALLBACK_PATH}`;
}

// ----- Reconciler schedule ----------------------------------------------------------------------------------------

const MINUTE_MS = 60_000;
/** The first gateway check of an unconfirmed checkout: most payments are done by then (lost webhook, player gone). */
const FIRST_CHECK_MINUTES = 2;
export const FIRST_CHECK_AFTER_MS = FIRST_CHECK_MINUTES * MINUTE_MS;

/**
 * When an unconfirmed checkout is checked with the gateway, by age: 2 min, 10 min, 30 min, 2 h, 6 h and 23 h after it
 * started (`start()` schedules the first; entry n is the next look after n checks); null after the sixth check (the
 * 24 h expiry does one last check before abandoning it). Spreading the checks keeps the oldest unpaid rows from
 * hogging every sweep. The player can also ask at any time ("I've paid: check now").
 */
export const CHECK_SCHEDULE_MINUTES: readonly number[] = [FIRST_CHECK_MINUTES, 10, 30, 120, 360, 1_380];

export function nextCheckAt(createdAt: Date, attemptsDone: number): Date | null {
  const minutes = CHECK_SCHEDULE_MINUTES[attemptsDone];
  return minutes === undefined ? null : new Date(createdAt.getTime() + minutes * MINUTE_MS);
}

/** After a failed delivery attempt: retry in 1, 5, 15, 60 min, then every 6 h, so a stuck payment can't block others. */
export function fulfilmentRetryAt(now: Date, attempts: number): Date {
  const minutes = [1, 5, 15, 60][attempts - 1] ?? 360;
  return new Date(now.getTime() + minutes * MINUTE_MS);
}

/** Start of the current real UTC day (daily real-money caps and transfer limits reset at 00:00 UTC). */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
