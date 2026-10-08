export type GatewayProvider = 'paystack' | 'sandbox';

/** Normalised charge status. Paystack's `ongoing`/`pending`/`processing`/`queued` all map to `pending`. */
export type GatewayChargeStatus = 'success' | 'failed' | 'abandoned' | 'reversed' | 'pending';

/** Flat, JSON-safe audit data kept on the payment row. Never secrets, authorization codes or card numbers. */
export type GatewayDetails = Readonly<Record<string, string | number | boolean | null>>;

/** What the gateway says about a transaction (verify API or signed webhook). */
export interface GatewayCharge {
  readonly reference: string;
  readonly status: GatewayChargeStatus;
  readonly amountKobo: number;
  readonly currency: string;
  readonly channel: string | null;
  readonly paidAt: Date | null;
  readonly details: GatewayDetails;
}

export interface GatewayInitializeInput {
  readonly reference: string;
  readonly email: string;
  readonly amountKobo: number;
  readonly description: string;
  readonly metadata: Readonly<Record<string, string | null>>;
}

/** A hosted-checkout payment provider. */
export interface PaymentGateway {
  readonly provider: GatewayProvider;
  initialize(input: GatewayInitializeInput): Promise<{ readonly authorizationUrl: string }>;
  /** Null when the provider has never heard of the reference. */
  verify(reference: string): Promise<GatewayCharge | null>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
