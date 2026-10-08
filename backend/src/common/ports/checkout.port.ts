/**
 * Generic real-money checkout (Paystack). The payments module owns the gateway; other domains (top-ups, billboard
 * ads, club plays) start checkouts and register a fulfiller for their purpose. The payments module guarantees a
 * fulfiller is invoked once per successful payment; fulfillers must still be idempotent by `reference`.
 */
export const CHECKOUT_PURPOSES = ['topup', 'billboard', 'club-play'] as const;
export type CheckoutPurpose = (typeof CHECKOUT_PURPOSES)[number];

export interface CheckoutRequest {
  readonly userId: string;
  readonly email: string;
  readonly characterId: string | null;
  readonly purpose: CheckoutPurpose;
  /** Real money in kobo. */
  readonly amountKobo: number;
  /** Shown on the Paystack checkout. */
  readonly description: string;
  /** Id of the thing being bought (package id, ad campaign id, club-play order id). */
  readonly subjectId: string;
}

export interface CheckoutSession {
  readonly reference: string;
  /** Paystack hosted checkout URL (or the local sandbox page in development). */
  readonly authorizationUrl: string;
}

export interface PaidCheckout {
  readonly reference: string;
  readonly userId: string;
  readonly characterId: string | null;
  readonly purpose: CheckoutPurpose;
  readonly subjectId: string;
  readonly amountKobo: number;
  readonly paidAt: Date;
}

export interface CheckoutFulfiller {
  readonly purpose: CheckoutPurpose;
  fulfill(payment: PaidCheckout): Promise<void>;
}

export interface CheckoutPort {
  start(request: CheckoutRequest): Promise<CheckoutSession>;
  registerFulfiller(fulfiller: CheckoutFulfiller): void;
}

export const CHECKOUT_PORT = Symbol('CHECKOUT_PORT');
