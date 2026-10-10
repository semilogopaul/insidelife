import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Test } from 'supertest';
import { CheckoutReconciler } from '../../src/modules/payments/checkout-reconciler.service.js';
import { PAYMENTS_QUEUE } from '../../src/modules/payments/payments-queue.js';
import type { E2eApp } from './app.js';
import { E2E } from './env.js';
import { waitFor } from './game.js';
import { call } from './players.js';

export interface PaymentRow {
  readonly reference: string;
  readonly purpose: string;
  readonly subject_id: string;
  readonly status: string;
  readonly failure_reason: string | null;
  readonly amount_kobo: string;
  readonly currency: string;
  readonly amount_minor: string;
  readonly ngn_per_usd: number | null;
  readonly channel: string | null;
  readonly paid_minor: string | null;
  readonly gateway_transaction_id: string | null;
  readonly created_at: Date;
  readonly fulfilled_at: Date | null;
  readonly next_check_at: Date | null;
  readonly refund_status: string | null;
  readonly refunded_minor: string;
  readonly refund_reason: string | null;
  readonly flag_reason: string | null;
  readonly provider: string;
}

export async function paymentRow(e2e: E2eApp, reference: string): Promise<PaymentRow> {
  const [row] = await e2e.dataSource.query<PaymentRow[]>(`SELECT * FROM payments WHERE reference = $1`, [reference]);
  if (!row) throw new RangeError(`No payment ${reference}`);
  return row;
}

/** `POST /payments/flutterwave/webhook` as Flutterwave sends it (with the dashboard's secret hash unless told otherwise). */
export function sendWebhook(e2e: E2eApp, body: object, hash: string | null = E2E.webhookHash): Test {
  const test = call(e2e, 'post', '/payments/flutterwave/webhook');
  if (hash !== null) test.set('verif-hash', hash);
  return test.send(body);
}

export function paymentsQueue(e2e: E2eApp): Queue {
  return e2e.get<Queue>(getQueueToken(PAYMENTS_QUEUE));
}

/** Wait until the queued webhook job has run; resolves with its result (or `failed: …`). */
export async function jobResult(e2e: E2eApp, jobId: string): Promise<string> {
  const queue = paymentsQueue(e2e);
  return waitFor(async () => {
    const job = await queue.getJob(jobId);
    const state = job ? await job.getState() : 'missing';
    if (state !== 'completed' && state !== 'failed') return undefined;
    // Read the job again: the copy fetched before it finished doesn't carry its result.
    const finished = await queue.getJob(jobId);
    return state === 'failed' ? `failed: ${finished?.failedReason ?? ''}` : String(finished?.returnvalue);
  }, `payments job ${jobId}`);
}

/** Forget a processed job, so the same webhook delivered again runs again (as after BullMQ cleans up). */
export async function forgetJob(e2e: E2eApp, jobId: string): Promise<void> {
  await (await paymentsQueue(e2e).getJob(jobId))?.remove();
}

/**
 * Run the reconciler's sweep at the moment this payment is next due for a look (whatever the schedule is: the test
 * doesn't depend on the exact delays). A row with nothing scheduled is swept now.
 */
export async function sweepWhenDue(e2e: E2eApp, reference: string): Promise<Date> {
  const row = await paymentRow(e2e, reference);
  const due = Math.max(Date.now(), row.next_check_at?.getTime() ?? Date.now()) + 1_000;
  const at = new Date(due);
  await e2e.get(CheckoutReconciler).sweep(at);
  return at;
}

/** Sweep a day after the checkout started: the last check before an unpaid checkout is given up as abandoned. */
export async function sweepAfterExpiry(e2e: E2eApp, reference: string): Promise<void> {
  const row = await paymentRow(e2e, reference);
  await e2e.get(CheckoutReconciler).sweep(new Date(row.created_at.getTime() + 24 * 3_600_000 + 60_000));
}
