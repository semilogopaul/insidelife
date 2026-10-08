import { Controller, Headers, HttpCode, HttpStatus, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { PAYSTACK_SIGNATURE_HEADER } from './paystack-signature.js';
import { PaystackWebhookService } from './paystack-webhook.service.js';

/**
 * `POST /api/v1/payments/paystack/webhook` — configure this URL in the Paystack dashboard. Public (Paystack has no
 * JWT) and unthrottled (Paystack retries bursts); authenticity comes from the HMAC signature over the raw body
 * (`rawBody: true` in main.ts). Invalid signature → 401; authentic events → 200 regardless of outcome.
 */
@Public()
@SkipThrottle()
@Controller({ path: 'payments/paystack', version: '1' })
export class PaystackWebhookController {
  constructor(private readonly webhooks: PaystackWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers(PAYSTACK_SIGNATURE_HEADER) signature: string | undefined,
  ): Promise<{ received: true }> {
    const rawBody = request.rawBody;
    this.webhooks.assertAuthentic(rawBody, signature);
    await this.webhooks.process(rawBody);
    return { received: true };
  }
}
