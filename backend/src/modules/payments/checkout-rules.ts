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
  readonly amountKobo: number;
  readonly currency: string;
  readonly status: PaymentStatus;
}

/**
 * Flutterwave's rule for a paid checkout: `status === 'successful'`, `tx_ref` is ours, `currency === 'NGN'`,
 * `amount >= expected` and `charged_amount >= expected`.
 * - `success` is terminal: a confirmed payment is never downgraded (later reports are ignored here).
 * - A success only counts when reference and currency match and at least the price was paid and charged — a cheaper
 *   charge on someone else's reference must never deliver the expensive pack. A missing `charged_amount` counts as
 *   not charged (fail closed: the reconciler re-checks the row).
 * - `failed`/`abandoned` rows can still become `success` (customers retry on the same checkout).
 */
export function decideCharge(
  expected: ExpectedPayment,
  charge: Pick<GatewayCharge, 'reference' | 'status' | 'amountKobo' | 'chargedAmountKobo' | 'currency'>,
): ChargeDecision {
  if (expected.status === 'success') return { kind: 'already-paid' };
  if (charge.reference !== expected.reference) return { kind: 'mismatch', reason: 'reference_mismatch' };
  switch (charge.status) {
    case 'success':
      if (charge.currency !== expected.currency) return { kind: 'mismatch', reason: 'currency_mismatch' };
      if (charge.amountKobo < expected.amountKobo) return { kind: 'mismatch', reason: 'amount_mismatch' };
      if (charge.chargedAmountKobo === null || charge.chargedAmountKobo < expected.amountKobo) return { kind: 'mismatch', reason: 'amount_mismatch' };
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
  readonly amountKobo: number;
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

// ----- Reconciler schedule ----------------------------------------------------------------------------------------

const MINUTE_MS = 60_000;

/**
 * When an unconfirmed checkout is next checked with the gateway, by age: 10 min, 30 min, 2 h, 6 h and 23 h after it
 * started; null after the fifth check (the 24 h expiry does one last check before abandoning it). Spreading the checks
 * keeps the oldest unpaid rows from hogging every sweep.
 */
export const CHECK_SCHEDULE_MINUTES: readonly number[] = [10, 30, 120, 360, 1_380];

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
