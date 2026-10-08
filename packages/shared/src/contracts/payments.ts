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
 * `initialized` → checkout started; `success` → Paystack confirmed the charge (the only terminal state);
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
  /** Paystack channel (`card`, `bank_transfer`, `ussd`…), `sandbox` locally. */
  readonly channel: string | null;
  readonly createdAt: string;
  readonly verifiedAt: string | null;
  /** Top-up details when `purpose === 'topup'`. */
  readonly topup: { readonly packageId: TopupPackageId; readonly label: string; readonly virtualAmount: number } | null;
}

export interface CheckoutStartedDto {
  readonly reference: string;
  /** Paystack hosted checkout, or `/payments/sandbox?reference=…` when the server runs the local sandbox. */
  readonly authorizationUrl: string;
  readonly sandbox: boolean;
}

export interface PaymentVerificationDto {
  readonly payment: PaymentDto;
  /** True when this call delivered the purchase (false if it was already delivered or isn't paid yet). */
  readonly fulfilledNow: boolean;
}

// ----- Top-ups -------------------------------------------------------------------------------------------------

export interface TopupCatalogDto {
  readonly packages: readonly TopupPackage[];
  /** Real-naira cap per account per real UTC day (top-ups only). */
  readonly dailyLimitNgn: number;
  /** Real naira already committed today (successful + in-flight top-ups). */
  readonly spentTodayNgn: number;
  readonly remainingTodayNgn: number;
  readonly sandbox: boolean;
}

export interface CreateTopupRequest {
  readonly packageId: TopupPackageId;
}

export interface TopupStartedDto extends CheckoutStartedDto {
  readonly package: TopupPackage;
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
