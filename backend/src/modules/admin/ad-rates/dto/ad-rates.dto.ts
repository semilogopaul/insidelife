import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AD_MAX_PRICE_KOBO, AD_MIN_PRICE_KOBO, type UpdateAdRateRequest } from '@insidelife/shared';

export class UpdateAdRateDto implements UpdateAdRateRequest {
  /** Whole naira in kobo (the service re-checks): ₦2,000 to ₦100M. */
  @IsInt()
  @Min(AD_MIN_PRICE_KOBO)
  @Max(AD_MAX_PRICE_KOBO)
  readonly priceKobo: number;

  /** Why the price changed (shown in the audit log). */
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  readonly reason: string;
}
