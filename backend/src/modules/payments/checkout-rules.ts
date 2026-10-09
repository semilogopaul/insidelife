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
 * Flutterwave's rule for a paid checkout: `status === 'successful'`, `tx_ref` is ours, `currency === 'NGN'` and
 * `amount >= expected`.
 * - `success` is terminal: a confirmed payment is never downgraded (later reports are ignored here).
 * - A success only counts when reference and currency match and at least the price was paid — a cheaper charge on
 *   someone else's reference must never deliver the expensive pack.
 * - `failed`/`abandoned` rows can still become `success` (customers retry on the same checkout).
 */
export function decideCharge(expected: ExpectedPayment, charge: Pick<GatewayCharge, 'reference' | 'status' | 'amountKobo' | 'currency'>): ChargeDecision {
  if (expected.status === 'success') return { kind: 'already-paid' };
  if (charge.reference !== expected.reference) return { kind: 'mismatch', reason: 'reference_mismatch' };
  switch (charge.status) {
    case 'success':
      if (charge.currency !== expected.currency) return { kind: 'mismatch', reason: 'currency_mismatch' };
      if (charge.amountKobo < expected.amountKobo) return { kind: 'mismatch', reason: 'amount_mismatch' };
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
 * on request) may be claimed; `sending` is someone else's claim; `refunded` is final.
 */
export function claimRefund(payment: { readonly status: PaymentStatus; readonly refundStatus: PaymentRefundStatus | null }): RefundClaim {
  if (payment.status !== 'success') return { kind: 'not-refundable', reason: 'The payment never went through, so there is nothing to refund' };
  switch (payment.refundStatus) {
    case 'refunded':
      return { kind: 'already-refunded' };
    case 'sending':
      return { kind: 'in-flight' };
    case null:
    case 'due':
    case 'failed':
      return { kind: 'send' };
  }
}

/** Start of the current real UTC day (daily real-money caps and transfer limits reset at 00:00 UTC). */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
