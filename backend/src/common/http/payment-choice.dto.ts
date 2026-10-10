import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  PAYMENT_CURRENCIES,
  PAYMENT_METHODS,
  USD_RATE_MAX_NGN,
  USD_RATE_MIN_NGN,
  type PaymentChoice,
  type PaymentCurrency,
  type PaymentMethod,
} from '@insidelife/shared';

/**
 * How a player asks to pay (top-ups, ads, club songs): shape checks only. Whether dollars and wallets are on, and
 * whether the rate still matches, are decided by the services.
 */
export class PaymentChoiceDto implements PaymentChoice {
  @IsOptional()
  @IsIn(PAYMENT_CURRENCIES)
  readonly currency?: PaymentCurrency;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  readonly method?: PaymentMethod;

  /** The ₦ per $1 the player was shown (dollar payments). */
  @IsOptional()
  @IsInt()
  @Min(USD_RATE_MIN_NGN)
  @Max(USD_RATE_MAX_NGN)
  readonly expectedNgnPerUsd?: number;
}
