import type { PaymentStatus } from '@insidelife/shared';
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
 * - `success` is terminal: a confirmed payment is never downgraded (later `failed`/`reversed` reports are ignored here).
 * - A success only counts when reference, currency and amount match what we asked Paystack to charge — a cheaper
 *   charge on someone else's reference must never deliver the expensive pack.
 * - `failed`/`abandoned` rows can still become `success` (customers retry on the same checkout).
 */
export function decideCharge(expected: ExpectedPayment, charge: Pick<GatewayCharge, 'reference' | 'status' | 'amountKobo' | 'currency'>): ChargeDecision {
  if (expected.status === 'success') return { kind: 'already-paid' };
  if (charge.reference !== expected.reference) return { kind: 'mismatch', reason: 'reference_mismatch' };
  switch (charge.status) {
    case 'success':
      if (charge.currency !== expected.currency) return { kind: 'mismatch', reason: 'currency_mismatch' };
      if (charge.amountKobo !== expected.amountKobo) return { kind: 'mismatch', reason: 'amount_mismatch' };
      return { kind: 'record-success' };
    case 'failed':
      return { kind: 'not-paid', status: 'failed', reason: 'charge_failed' };
    case 'reversed':
      return { kind: 'not-paid', status: 'failed', reason: 'charge_reversed' };
    case 'abandoned':
      return { kind: 'not-paid', status: 'abandoned', reason: 'checkout_abandoned' };
    case 'pending':
      return { kind: 'pending' };
  }
}

/** Start of the current real UTC day (daily real-money caps and transfer limits reset at 00:00 UTC). */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
