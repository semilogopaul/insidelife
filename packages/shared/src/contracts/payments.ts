import type { TopupPackage, TopupPackageId } from '../catalog/payments.js';

/**
 * Payments API contracts — owned by the payments domain. Also hosts the extra wallet types (the core wallet DTOs
 * — WalletDto, TransferRequest, TransferResultDto, LedgerEntryDto — live in contracts/core.ts).
 */

// ----- Checkout (generic real-money payments) ------------------------------------------------------------------

/** What a real-money payment buys. Top-ups are one purpose; billboard ads and club plays are others. */
export const PAYMENT_PURPOSES = ['topup', 'billboard', 'club-play'] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

/**
 * `initialized` → checkout started; `success` → Flutterwave confirmed the charge (the only terminal state);
 * `failed` / `abandoned` → not paid (a later successful charge on the same reference still counts).
 */
export const PAYMENT_STATUSES = ['initialized', 'success', 'failed', 'abandoned'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentDto {
  readonly reference: string;
  readonly purpose: PaymentPurpose;
  /** Package id, ad campaign id or club-play order id. */
  readonly subjectId: string;
  readonly description: string;
  /** Real naira (may carry kobo decimals). */
  readonly amountNgn: number;
  readonly amountKobo: number;
  readonly status: PaymentStatus;
  /** The purchase was delivered (wallet credited, ad scheduled…). */
  readonly fulfilled: boolean;
  /** How it was paid (`card`, `bank_transfer`, `ussd`…), `sandbox` locally. */
  readonly channel: string | null;
  readonly createdAt: string;
  readonly verifiedAt: string | null;
  /** Real naira refunded to the payer (0 when nothing was refunded). */
  readonly refundedNgn: number;
  /** Top-up details when `purpose === 'topup'`. */
  readonly topup: TopupDetailsDto | null;
}

/** What a top-up payment buys: the quoted rate is fixed when checkout starts and kept on the payment. */
export interface TopupDetailsDto {
  /** The pack bought, or null for a custom amount. */
  readonly packageId: TopupPackageId | null;
  /** The pack's label, or "Custom top-up". */
  readonly label: string;
  /** Game naira per real ₦1 quoted at checkout. */
  readonly ratePerNaira: number;
  /** In-game naira credited (or to be credited): the verified real amount × the quoted rate. */
  readonly virtualAmount: number;
}

export interface CheckoutStartedDto {
  readonly reference: string;
  /** Flutterwave hosted checkout, or `/payments/sandbox?reference=…` when the server runs the local sandbox. */
  readonly authorizationUrl: string;
  readonly sandbox: boolean;
}

/**
 * `POST /v1/payments/:reference/verification` (and the top-up variant). After checkout Flutterwave sends the browser
 * back with `?status&tx_ref&transaction_id`; pass `transaction_id` along. The server verifies it with Flutterwave
 * either way (the redirect itself is never trusted).
 */
export interface PaymentVerificationRequest {
  /** Flutterwave's numeric transaction id from the redirect, when there is one. */
  readonly transactionId?: string;
}

export interface PaymentVerificationDto {
  readonly payment: PaymentDto;
  /** True when this call delivered the purchase (false if it was already delivered or isn't paid yet). */
  readonly fulfilledNow: boolean;
}

// ----- Top-ups -------------------------------------------------------------------------------------------------

export interface TopupCatalogDto {
  /** Quick picks. Any whole amount from `minNgn` to `maxPerPaymentNgn` can also be paid (see `topupVirtualAmount`). */
  readonly packages: readonly TopupPackage[];
  readonly minNgn: number;
  readonly maxPerPaymentNgn: number;
  /** Real-naira cap per account per real UTC day, or null when there is none (the default). */
  readonly dailyLimitNgn: number | null;
  /** Real naira already committed today (successful + in-flight top-ups). */
  readonly spentTodayNgn: number;
  /** Null when there is no daily cap. */
  readonly remainingTodayNgn: number | null;
  readonly sandbox: boolean;
}

/** `POST /v1/payments/topups`: a pack (`packageId`) or a custom whole-naira amount (`amountNgn`), not both. */
export interface CreateTopupRequest {
  readonly packageId?: TopupPackageId;
  readonly amountNgn?: number;
}

export interface TopupStartedDto extends CheckoutStartedDto {
  /** The price, rate and in-game naira quoted (credited once Flutterwave confirms the payment). */
  readonly topup: TopupDetailsDto & { readonly priceNgn: number };
}

export interface TopupVerificationDto extends PaymentVerificationDto {
  /** Cash balance after the credit (null when the purchase isn't delivered). */
  readonly balance: number | null;
}

// ----- Extra wallet types --------------------------------------------------------------------------------------

export const SAVINGS_TRANSFER_DIRECTIONS = ['deposit', 'withdraw'] as const;
export type SavingsTransferDirection = (typeof SAVINGS_TRANSFER_DIRECTIONS)[number];

/** Move money between cash and the savings account (`deposit` = cash → savings). Responds with the WalletDto. */
export interface SavingsTransferRequest {
  readonly direction: SavingsTransferDirection;
  readonly amount: number;
  /** Optional client UUID; retries with the same key move the money once. */
  readonly idempotencyKey?: string;
}

/** Query for `GET /v1/wallet/statement`. */
export interface StatementQuery {
  /** ISO timestamp from the previous page's `nextCursor`. */
  readonly cursor?: string;
  /** 1-100, default 30. */
  readonly limit?: number;
}
