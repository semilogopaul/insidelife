/**
 * Generic real-money checkout (Flutterwave). The payments module owns the gateway; other domains (top-ups, billboard
 * ads, club plays) start checkouts and register a fulfiller for their purpose. The payments module guarantees a
 * fulfiller is invoked once per successful payment; fulfillers must still be idempotent by `reference`.
 */
export const CHECKOUT_PURPOSES = ['topup', 'billboard', 'club-play'] as const;
export type CheckoutPurpose = (typeof CHECKOUT_PURPOSES)[number];

export interface CheckoutRequest {
  readonly userId: string;
  readonly email: string;
  /** Name on the hosted checkout (the player's @handle); a neutral default when unknown. */
  readonly customerName?: string;
  readonly characterId: string | null;
  readonly purpose: CheckoutPurpose;
  /** Real money in kobo. */
  readonly amountKobo: number;
  /** Shown on the hosted checkout. */
  readonly description: string;
  /** Id of the thing being bought (package id or `custom`, ad campaign id, club-play order id). */
  readonly subjectId: string;
  /** Top-ups: game naira per real ₦1 quoted now, stored on the payment (later rate changes never touch it). */
  readonly topupRate?: number;
}

export interface CheckoutSession {
  readonly reference: string;
  /** Flutterwave hosted checkout URL (or the local sandbox page in development). */
  readonly authorizationUrl: string;
}

export interface PaidCheckout {
  readonly reference: string;
  readonly userId: string;
  readonly characterId: string | null;
  readonly purpose: CheckoutPurpose;
  readonly subjectId: string;
  /** The price quoted at checkout. */
  readonly amountKobo: number;
  /** What the gateway verified as paid (never less than `amountKobo`). Deliver from this, not from anything the client said. */
  readonly paidKobo: number;
  /** Top-ups: the rate quoted at checkout (null for other purposes, and for top-ups made before custom amounts). */
  readonly topupRate: number | null;
  readonly paidAt: Date;
}

/**
 * What a fulfiller did with a payment. `refund` = nothing was delivered and the payer gets their money back (the
 * slot filled up, the dates passed, a second payment for something already paid…). The payments module sends that
 * refund after the fulfilment commits, then calls `onRefunded`.
 */
export type FulfilmentResult = { readonly kind: 'delivered' } | { readonly kind: 'refund'; readonly reason: string };

/** A refund that reached the gateway: sent by us, or made by ops in the gateway dashboard (reported by webhook). */
export interface CheckoutRefund {
  readonly refundId: string;
  readonly amountKobo: number;
  readonly source: 'api' | 'dashboard';
  readonly reason: string | null;
  /** The purchase had been delivered when the refund was recorded (a refund before delivery cancels the delivery). */
  readonly delivered: boolean;
}

export interface CheckoutFulfiller {
  readonly purpose: CheckoutPurpose;
  fulfill(payment: PaidCheckout): Promise<FulfilmentResult>;
  /**
   * A refund of this payment completed (the gateway's final state). Called once per refund id, and again only if
   * that refund failed and later completed after all. Must be idempotent by refund id (it may be retried after a crash).
   */
  onRefunded?(payment: PaidCheckout, refund: CheckoutRefund): Promise<void>;
  /**
   * A refund we were tracking failed at the gateway. `wasCompleted`: it had been reported completed (and `onRefunded`
   * ran), so the purpose must undo its settlement (e.g. put the item back under "refunds due") — without taking
   * anything twice if it completes later after all.
   */
  onRefundFailed?(payment: PaidCheckout, refund: CheckoutRefund, wasCompleted: boolean): Promise<void>;
}

export type RefundOutcome =
  /** The gateway completed the refund (final). */
  | { readonly kind: 'refunded'; readonly refund: CheckoutRefund }
  /** The gateway took the refund and is processing it; `onRefunded` follows when it completes (webhook or re-check). */
  | { readonly kind: 'pending'; readonly refundId: string }
  /** Already refunded earlier (same result as `refunded`, nothing sent now). */
  | { readonly kind: 'already-refunded'; readonly refund: CheckoutRefund }
  /** Another call is sending this payment's refund right now, or the gateway is still processing it. */
  | { readonly kind: 'in-progress' }
  /** The gateway refused or couldn't be reached: ops refund by hand and mark it (the manual fallback). */
  | { readonly kind: 'failed'; readonly reason: string }
  /** Nothing to refund: unknown reference or the payment never succeeded. */
  | { readonly kind: 'not-refundable'; readonly reason: string };

export interface CheckoutPort {
  start(request: CheckoutRequest): Promise<CheckoutSession>;
  registerFulfiller(fulfiller: CheckoutFulfiller): void;
  /**
   * Refund a successful payment in full through the gateway, at most once per payment (idempotent: a second call
   * reports the first refund). `refunded`: the gateway completed it and the purpose's `onRefunded` has already run.
   * `pending`: the gateway is processing it; `onRefunded` runs when it completes (webhook or the reconciler's re-check),
   * or `onRefundFailed` if it fails.
   */
  refund(reference: string, reason: string): Promise<RefundOutcome>;
}

export const CHECKOUT_PORT = Symbol('CHECKOUT_PORT');
