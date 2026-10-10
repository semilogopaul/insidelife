import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AD_MAX_PRICE_KOBO, RATE_CARD_MIN_KOBO, type UpdateAdRateRequest } from '@insidelife/shared';

export class UpdateAdRateDto implements UpdateAdRateRequest {
  /** Whole naira in kobo; the service checks the range of each key (ads ₦2,000 to ₦100M, `usd-rate` ₦500 to ₦5,000 per $1). */
  @IsInt()
  @Min(RATE_CARD_MIN_KOBO)
  @Max(AD_MAX_PRICE_KOBO)
  readonly priceKobo: number;

  /** Why the price changed (shown in the audit log). */
  @IsString()
  @MinLength(5)
  @MaxLength(300)
  readonly reason: string;
}
