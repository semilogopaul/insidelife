import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import type { AppConfig } from '../../config/configuration.js';
import { isValidWebhookHash } from './flutterwave-webhook-hash.js';
import { parseWebhook } from './gateways/flutterwave.parsers.js';
import { jobIdFor, PAYMENTS_JOB_OPTIONS, PAYMENTS_QUEUE, type PaymentsJob } from './payments-queue.js';

export class InvalidWebhookSignatureException extends DomainException {
  constructor() {
    super('INVALID_SIGNATURE', 'Invalid webhook signature', HttpStatus.UNAUTHORIZED);
  }
}

/** The queue is down: answer 503 so Flutterwave retries the webhook later (retries are on in the dashboard). */
export class WebhookRetryLaterException extends DomainException {
  constructor() {
    super('WEBHOOK_RETRY_LATER', 'Please retry later', HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export type WebhookAcceptance = 'queued' | 'ignored';

/**
 * Flutterwave webhooks. A request is accepted only with the right `verif-hash`; its body is then reduced to ids
 * (transaction id, refund id) and queued, so Flutterwave gets its 200 at once. The queue worker reads the charge or
 * refund back from the API and acts idempotently: duplicate deliveries share a job id, and the payment row lock plus
 * ledger keys make a repeat a no-op anyway.
 */
@Injectable()
export class FlutterwaveWebhookService implements OnModuleInit {
  private readonly logger = new Logger(FlutterwaveWebhookService.name);
  private readonly secretHash: string;
  private readonly enabled: boolean;

  constructor(
    config: ConfigService<AppConfig, true>,
    @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
  ) {
    const payments = config.get('payments', { infer: true });
    this.secretHash = payments.flutterwave.webhookSecretHash;
    this.enabled = !payments.sandbox;
  }

  onModuleInit(): void {
    if (this.enabled && !this.secretHash) {
      this.logger.warn('FLUTTERWAVE_WEBHOOK_SECRET_HASH is not set: every Flutterwave webhook will be refused (redirects and the reconciler still confirm payments)');
    }
  }

  assertAuthentic(header: string | readonly string[] | undefined): void {
    if (!isValidWebhookHash(header, this.secretHash)) {
      this.logger.warn('Rejected a Flutterwave webhook with a missing or wrong verif-hash');
      throw new InvalidWebhookSignatureException();
    }
  }

  async accept(body: unknown): Promise<WebhookAcceptance> {
    const event = parseWebhook(body);
    if (!event) {
      this.logger.warn('Ignored a malformed Flutterwave webhook');
      return 'ignored';
    }
    if (event.kind === 'ignored') {
      this.logger.debug({ event: event.event }, 'Ignored Flutterwave webhook event');
      return 'ignored';
    }
    const job: PaymentsJob =
      event.kind === 'charge'
        ? { name: 'charge', data: { transactionId: event.transactionId } }
        : {
            name: 'refund',
            data: { refundId: event.refund.refundId, transactionId: event.refund.transactionId, amountKobo: event.refund.amountKobo, status: event.refund.status },
          };
    try {
      await this.queue.add(job.name, job.data, { ...PAYMENTS_JOB_OPTIONS, jobId: jobIdFor(job) });
    } catch (error) {
      this.logger.error({ err: error, job: job.name }, 'Could not queue a Flutterwave webhook; asking Flutterwave to retry');
      throw new WebhookRetryLaterException();
    }
    this.logger.log({ job: job.name, jobId: jobIdFor(job) }, 'Queued Flutterwave webhook');
    return 'queued';
  }
}
