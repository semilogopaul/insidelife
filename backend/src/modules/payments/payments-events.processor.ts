import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpStatus, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import { CheckoutService } from './checkout.service.js';
import { PAYMENTS_QUEUE, type ChargeJob, type RefundJob } from './payments-queue.js';

/** The charge isn't final yet (Flutterwave still says pending): fail the job so BullMQ retries it with backoff. */
export class ChargeStillPendingException extends DomainException {
  constructor(transactionId: string) {
    super('CHARGE_PENDING', `Transaction ${transactionId} is still pending at Flutterwave`, HttpStatus.CONFLICT);
  }
}

/**
 * Works through queued Flutterwave webhooks. Each job re-reads the truth from the API and goes through the same
 * idempotent paths as the redirect verification and the reconciler. A thrown error makes BullMQ retry with backoff:
 * a charge that is still pending, a refund that arrived before its charge was verified, Flutterwave being down. After
 * the last attempt the reconciler still catches unconfirmed charges and pending refunds.
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
        if (decision?.kind === 'pending') throw new ChargeStillPendingException(transactionId);
        return decision?.kind ?? 'unknown-reference';
      }
      case 'refund': {
        const confirmed = await this.checkout.confirmRefund(job.data as RefundJob);
        const result = await this.checkout.recordGatewayRefund(confirmed);
        this.logger.log({ refundId: confirmed.refundId, status: confirmed.status, result }, 'Processed Flutterwave refund webhook');
        return result;
      }
      default:
        this.logger.warn({ name: job.name }, 'Unknown payments job ignored');
        return 'ignored';
    }
  }
}
