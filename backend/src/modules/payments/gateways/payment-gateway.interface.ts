export type GatewayProvider = 'flutterwave' | 'sandbox';

/** Normalised charge status. Flutterwave's `pending`/`processing`/anything unknown map to `pending`. */
export type GatewayChargeStatus = 'success' | 'failed' | 'abandoned' | 'pending';

/** Flat, JSON-safe audit data kept on the payment row. Never secrets, card numbers, tokens or customer contact. */
export type GatewayDetails = Readonly<Record<string, string | number | boolean | null>>;

/** What the gateway says about a transaction (always read back from its API, never taken from a redirect). */
export interface GatewayCharge {
  /** Our payment reference (Flutterwave `tx_ref`). */
  readonly reference: string;
  /** The gateway's own transaction id (Flutterwave `data.id`); needed for refunds. */
  readonly transactionId: string | null;
  readonly status: GatewayChargeStatus;
  readonly amountKobo: number;
  readonly currency: string;
  readonly channel: string | null;
  readonly paidAt: Date | null;
  readonly details: GatewayDetails;
}

export interface GatewayInitializeInput {
  readonly reference: string;
  /** Our payment row id (sent as checkout metadata for support lookups). */
  readonly paymentId: string;
  readonly email: string;
  readonly customerName: string;
  readonly amountKobo: number;
  readonly description: string;
  readonly metadata: Readonly<Record<string, string | null>>;
}

export interface GatewayRefundInput {
  readonly reference: string;
  /** Gateway transaction id of the charge to refund (null for the sandbox). */
  readonly transactionId: string | null;
  /** Partial refunds only; omit to refund in full. */
  readonly amountKobo?: number;
  /** Shown in the gateway dashboard. */
  readonly comments: string;
}

/** A refund the gateway accepted (Flutterwave refunds take 3-15 working days to reach the payer after this). */
export interface GatewayRefund {
  readonly refundId: string;
  readonly amountKobo: number;
  /** Gateway wording (`completed`, `processing`, `completed-mpgs`…), kept for audit. */
  readonly status: string;
}

/** A hosted-checkout payment provider. */
export interface PaymentGateway {
  readonly provider: GatewayProvider;
  initialize(input: GatewayInitializeInput): Promise<{ readonly authorizationUrl: string }>;
  /** Look a payment up by our reference. Null when the provider has never seen it. */
  verify(reference: string): Promise<GatewayCharge | null>;
  /** Look a transaction up by the gateway's own id (from the redirect or a webhook). Null when unknown. */
  verifyTransaction(transactionId: string): Promise<GatewayCharge | null>;
  /** Ask the gateway to send money back to the payer. Throws `ExternalServiceException` when it refuses. */
  refund(input: GatewayRefundInput): Promise<GatewayRefund>;
  /** Read a refund back by its id (confirms a refund webhook). Null when unknown; absent on the sandbox. */
  fetchRefund?(refundId: string): Promise<(GatewayRefund & { readonly transactionId: string | null }) | null>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
