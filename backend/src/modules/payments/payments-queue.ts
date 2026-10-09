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
  readonly amountKobo: number;
}

export type PaymentsJob = { readonly name: 'charge'; readonly data: ChargeJob } | { readonly name: 'refund'; readonly data: RefundJob };

/** Deterministic job ids: duplicate deliveries of the same event collapse while the job is kept (a day). */
export const jobIdFor = (job: PaymentsJob): string => (job.name === 'charge' ? `charge-${job.data.transactionId}` : `refund-${job.data.refundId}`);

export const PAYMENTS_JOB_OPTIONS = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;
