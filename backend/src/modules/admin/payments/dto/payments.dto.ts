import { IsIn, IsOptional } from 'class-validator';
import { PAYMENT_PURPOSES, PAYMENT_STATUSES, type PaymentCurrency, type PaymentPurpose, type PaymentStatus } from '@insidelife/shared';
import type { Page } from '../../../../common/utils/paging.js';
import { AdminListQueryDto } from '../../common/list-query.dto.js';

/** `GET /v1/admin/payments`. `from`/`to` filter when the checkout started. */
export class PaymentsQueryDto extends AdminListQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  readonly status?: PaymentStatus;

  @IsOptional()
  @IsIn(PAYMENT_PURPOSES)
  readonly purpose?: PaymentPurpose;

  /** Only payments whose ad/track order was refunded or is waiting for a refund. */
  @IsOptional()
  @IsIn(['refund-due', 'refunded', 'any'])
  readonly refund?: 'refund-due' | 'refunded' | 'any';

  @IsOptional()
  @IsIn(['createdAt', 'amount', 'verifiedAt'])
  readonly sort?: 'createdAt' | 'amount' | 'verifiedAt';
}

export interface AdminPaymentRowDto {
  readonly id: string;
  readonly reference: string;
  readonly purpose: PaymentPurpose;
  readonly subjectId: string;
  readonly description: string;
  /** Naira value of the charge (USD: cents × `ngnPerUsd`): what totals and revenue add up. */
  readonly amountKobo: number;
  /** What was charged: `amountMinor` in `currency`'s minor units (kobo, cents). */
  readonly currency: PaymentCurrency;
  readonly amountMinor: number;
  /** Dollar payments: the ₦ per $1 the price was converted at. */
  readonly ngnPerUsd: number | null;
  readonly status: PaymentStatus;
  readonly provider: string;
  readonly channel: string | null;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly verifiedAt: string | null;
  readonly fulfilledAt: string | null;
  readonly user: { readonly id: string; readonly email: string | null };
  readonly character: { readonly id: string; readonly handle: string } | null;
  /** For ads and club orders: where the order stands when it was refused after payment. */
  readonly refund: 'refund-due' | 'refunded' | null;
}

/** A page of payments plus the confirmed total of everything matching the filters. */
export interface AdminPaymentsPageDto extends Page<AdminPaymentRowDto> {
  /** Naira value of the confirmed payments (dollar payments at the rate they were charged at). */
  readonly successKobo: number;
}
