/** BullMQ queue for gateway events: webhooks are acknowledged at once and processed here (verify, then act). */
export const PAYMENTS_QUEUE = 'payments';

/** `charge`: a `charge.completed` webhook (verify the transaction with the API, record, deliver). */
export interface ChargeJob {
  readonly transactionId: string;
}

/** `refund`: a refund webhook (confirm with the API when possible, record, claw back / take down). */
export interface RefundJob {
  readonly refundId: string;
  readonly transactionId: string | null;
  /** In minor units of the refunded charge's currency (kobo, cents). */
  readonly amountMinor: number;
  /** Jobs queued before dollar payments carried kobo here (every payment was NGN then, so it equals `amountMinor`). */
  readonly amountKobo?: number;
  /** The gateway's refund status in the webhook (`completed`, `processing`, `failed`…). */
  readonly status: string;
}

export type PaymentsJob = { readonly name: 'charge'; readonly data: ChargeJob } | { readonly name: 'refund'; readonly data: RefundJob };

/**
 * Deterministic job ids: duplicate deliveries of the same event collapse while the job is kept. A refund's id includes
 * its status, so a later status change of the same refund (processing → completed, or → failed) is never dropped as
 * a duplicate.
 */
export const jobIdFor = (job: PaymentsJob): string =>
  job.name === 'charge' ? `charge-${job.data.transactionId}` : `refund-${job.data.refundId}-${job.data.status.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/**
 * A job that throws is retried with backoff (about 8 minutes in all); after that the reconciler takes over. Failed jobs
 * are dropped after an hour so a later webhook for the same event can be queued again.
 */
export const PAYMENTS_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 3600 },
} as const;
