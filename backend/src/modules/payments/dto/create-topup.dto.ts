import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TOPUP_MIN_NGN, TOPUP_MIN_USD, TOPUP_PACKAGE_IDS, type CreateTopupRequest, type TopupPackageId } from '@insidelife/shared';
import { PaymentChoiceDto } from '../../../common/http/payment-choice.dto.js';

/**
 * Shape checks only: "a pack or an amount, not both", the currency matching the amount and the configured maxima are
 * checked in TopupsService.
 */
export class CreateTopupDto extends PaymentChoiceDto implements CreateTopupRequest {
  @IsOptional()
  @IsIn(TOPUP_PACKAGE_IDS)
  readonly packageId?: TopupPackageId;

  /** Whole real naira. */
  @IsOptional()
  @IsInt()
  @Min(TOPUP_MIN_NGN)
  @Max(100_000_000)
  readonly amountNgn?: number;

  /** Whole US dollars (with `currency: 'USD'`). */
  @IsOptional()
  @IsInt()
  @Min(TOPUP_MIN_USD)
  @Max(100_000)
  readonly amountUsd?: number;
}
