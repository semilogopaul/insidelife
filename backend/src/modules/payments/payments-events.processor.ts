import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { CheckoutService } from './checkout.service.js';
import { PAYMENTS_QUEUE, type ChargeJob, type RefundJob } from './payments-queue.js';

/**
 * Works through queued Flutterwave webhooks. Each job re-reads the truth from the API and goes through the same
 * idempotent paths as the redirect verification and the reconciler. A thrown error makes BullMQ retry with backoff;
 * after the last attempt the reconciler still catches pending charges (refunds need the dashboard webhook or ops).
 */
@Processor(PAYMENTS_QUEUE, { concurrency: 4 })
export class PaymentsEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsEventsProcessor.name);

  constructor(private readonly checkout: CheckoutService) {
    super();
  }

  async process(job: Job<ChargeJob | RefundJob>): Promise<string> {
    switch (job.name) {
      case 'charge': {
        const { transactionId } = job.data as ChargeJob;
        const decision = await this.checkout.verifyTransaction(transactionId);
        this.logger.log({ transactionId, decision: decision?.kind ?? 'unknown-reference' }, 'Processed Flutterwave charge webhook');
        return decision?.kind ?? 'unknown-reference';
      }
      case 'refund': {
        const confirmed = await this.checkout.confirmRefund(job.data as RefundJob);
        const result = await this.checkout.recordGatewayRefund(confirmed);
        this.logger.log({ refundId: confirmed.refundId, result }, 'Processed Flutterwave refund webhook');
        return result;
      }
      default:
        this.logger.warn({ name: job.name }, 'Unknown payments job ignored');
        return 'ignored';
    }
  }
}
