import type { PaymentCurrency, PaymentMethod } from '@insidelife/shared';

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
  /** The transaction amount (Flutterwave `amount`), in minor units of `currency` (kobo, cents). */
  readonly amountMinor: number;
  /** What the customer was actually charged (Flutterwave `charged_amount`, fees included), minor units; null when missing. */
  readonly chargedAmountMinor: number | null;
  /** As the gateway reports it, upper-cased (`NGN`, `USD`…); '' when missing. Never assumed. */
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
  readonly currency: PaymentCurrency;
  /** The price in minor units of `currency` (kobo, cents). */
  readonly amountMinor: number;
  /** `card`: the hosted checkout. `applepay` / `googlepay`: a wallet checkout (USD only). */
  readonly method: PaymentMethod;
  readonly description: string;
  /**
   * Where the hosted checkout sends the browser back: the callback page on the player's own origin when it is one of
   * ours, else PAYMENT_CALLBACK_URL (`checkoutReturnUrl`). The sandbox's checkout is relative and ignores it.
   */
  readonly redirectUrl: string;
  readonly metadata: Readonly<Record<string, string | null>>;
}

export interface GatewayRefundInput {
  readonly reference: string;
  /** Gateway transaction id of the charge to refund (null for the sandbox). */
  readonly transactionId: string | null;
  /** Partial refunds only, in minor units of the payment's currency; omit to refund in full. */
  readonly amountMinor?: number;
  /** Shown in the gateway dashboard. */
  readonly comments: string;
}

/** A refund the gateway accepted (Flutterwave refunds take 3-15 working days to reach the payer after this). */
export interface GatewayRefund {
  readonly refundId: string;
  /** In minor units of the refunded transaction's currency. */
  readonly amountMinor: number;
  /** Gateway wording (`completed`, `processing`, `completed-mpgs`, `failed`…), kept for audit. See `refundStateOf`. */
  readonly status: string;
}

/** A refund as read back from the gateway, with the transaction it refunds. */
export interface GatewayRefundRecord extends GatewayRefund {
  readonly transactionId: string | null;
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
  /** Read a refund back by its id (confirms a refund webhook, re-checks a pending one). Null when unknown; absent on the sandbox. */
  fetchRefund?(refundId: string): Promise<GatewayRefundRecord | null>;
  /**
   * The latest refund of a transaction created since `since`, or null. Used when a refund call timed out or a process
   * died mid-call, to learn whether the gateway took it before declaring it failed. Absent on the sandbox.
   */
  findRefund?(transactionId: string, since: Date): Promise<GatewayRefundRecord | null>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
