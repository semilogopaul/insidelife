import { IsOptional, Matches } from 'class-validator';
import type { PaymentVerificationRequest } from '@insidelife/shared';

export class VerifyPaymentDto implements PaymentVerificationRequest {
  /** Flutterwave's `transaction_id` from the redirect (a hint only; the server reads the charge back from the API). */
  @IsOptional()
  @Matches(/^\d{1,20}$/, { message: 'transactionId must be the numeric id from the checkout redirect' })
  readonly transactionId?: string;
}
