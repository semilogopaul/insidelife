import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { FLUTTERWAVE_HASH_HEADER } from './flutterwave-webhook-hash.js';
import { FlutterwaveWebhookService } from './flutterwave-webhook.service.js';

/**
 * `POST /api/v1/payments/flutterwave/webhook` — set this URL in the Flutterwave dashboard (Settings → Webhooks).
 * Public (Flutterwave has no JWT) and unthrottled (it retries in bursts); authenticity comes from the `verif-hash`
 * header. Wrong or missing hash → 401; authentic events → 200 as soon as they're queued (503 if the queue is down,
 * so Flutterwave retries). The body is a third-party shape, so it's parsed field by field in the service rather than
 * through a class-validator DTO (which would reject Flutterwave's extra fields).
 */
@Public()
@SkipThrottle()
@Controller({ path: 'payments/flutterwave', version: '1' })
export class FlutterwaveWebhookController {
  constructor(private readonly webhooks: FlutterwaveWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async receive(@Req() request: Request, @Headers(FLUTTERWAVE_HASH_HEADER) hash: string | undefined): Promise<{ readonly received: true }> {
    this.webhooks.assertAuthentic(hash);
    await this.webhooks.accept(request.body as unknown);
    return { received: true };
  }
}
