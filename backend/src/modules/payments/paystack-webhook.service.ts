import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';
import { CheckoutService } from './checkout.service.js';
import { parseTransaction, parseWebhookEvent } from './gateways/paystack.parsers.js';
import { isValidPaystackSignature } from './paystack-signature.js';

export class InvalidWebhookSignatureException extends DomainException {
  constructor() {
    super('INVALID_SIGNATURE', 'Invalid webhook signature', HttpStatus.UNAUTHORIZED);
  }
}

/**
 * Paystack webhooks. The body is trusted only after the HMAC-SHA512 signature over the *raw* bytes checks out (and
 * only those exact bytes are parsed). A `charge.success` goes through the same idempotent path as player
 * verification. Processing never throws: Paystack always gets a fast 200 for an authentic event, and anything that
 * fails is retried by the player's verify call or the reconciler.
 */
@Injectable()
export class PaystackWebhookService {
  private readonly logger = new Logger(PaystackWebhookService.name);
  private readonly secretKey: string;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly checkout: CheckoutService,
  ) {
    this.secretKey = config.get('paystack', { infer: true }).secretKey;
  }

  assertAuthentic(rawBody: Buffer | undefined, signature: string | readonly string[] | undefined): asserts rawBody is Buffer {
    if (!isValidPaystackSignature(rawBody, signature, this.secretKey)) {
      this.logger.warn('Rejected Paystack webhook with an invalid signature');
      throw new InvalidWebhookSignatureException();
    }
  }

  async process(rawBody: Buffer): Promise<void> {
    try {
      const event = parseWebhookEvent(JSON.parse(rawBody.toString('utf8')) as unknown);
      if (!event) {
        this.logger.warn('Ignored malformed Paystack webhook');
        return;
      }
      if (event.event !== 'charge.success') {
        this.logger.debug({ event: event.event }, 'Ignored Paystack webhook event');
        return;
      }
      const charge = parseTransaction(event.data);
      if (!charge) {
        this.logger.warn('Ignored charge.success webhook without a usable transaction');
        return;
      }
      const decision = await this.checkout.handleCharge(charge);
      this.logger.log({ reference: charge.reference, decision: decision?.kind ?? 'unknown-reference' }, 'Processed Paystack charge.success');
    } catch (error) {
      this.logger.error({ err: error }, 'Paystack webhook processing failed');
    }
  }
}
