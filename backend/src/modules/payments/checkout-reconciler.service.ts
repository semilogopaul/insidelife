import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, LessThanOrEqual, MoreThan, type FindOptionsWhere, type Repository } from 'typeorm';
import { CheckoutService } from './checkout.service.js';
import { PaymentEntity } from './entities/payment.entity.js';

/** Every minute, so a checkout's first check (2 min after it started) lands 2–3 minutes in. */
const SWEEP_EVERY_MS = 60_000;
const BATCH = 20;
const MINUTE_MS = 60_000;
const ABANDON_AFTER_MS = 24 * 60 * MINUTE_MS;
const RETRY_FULFILMENT_FOR_MS = 7 * 24 * 60 * MINUTE_MS;
/** A refund claim older than this with no answer was interrupted (the gateway call itself times out after 15 s). */
const STALE_SENDING_MS = 5 * MINUTE_MS;
/** Processing refunds are re-read from the gateway this often, in case the completion webhook was lost. */
const PENDING_REFUND_RECHECK_MS = 30 * MINUTE_MS;

/**
 * Safety net for lost webhooks, closed tabs, unreachable redirects and failed fulfilments. Every minute, for the active
 * gateway's rows only (Flutterwave in production; rows from another provider, e.g. old Paystack test rows, are never
 * touched):
 *
 * 1. retries paid-but-undelivered payments that are due (each failure backs off: 1, 5, 15, 60 min, then 6 h, so a
 *    payment that keeps failing can't block the others);
 * 2. sends refunds that were owed but never sent, resolves claims left `sending` by a dead process (re-checked with
 *    the gateway first) and re-reads refunds still processing;
 * 3. checks unconfirmed checkouts (`initialized`, and `failed`/`abandoned` ones that may still be paid) with the
 *    gateway on a schedule by age — 2 min, 10 min, 30 min, 2 h, 6 h, 23 h (`CHECK_SCHEDULE_MINUTES`) — least recently
 *    due first, so the oldest unpaid rows can't starve a paid one whose webhook was lost (the player can also check
 *    at any time: "I've paid: check now");
 * 4. after a day, checks each still-unconfirmed checkout one last time and only then marks it abandoned.
 *
 * Everything it calls is idempotent and row-locked, so several instances sweeping at once is harmless.
 */
@Injectable()
export class CheckoutReconciler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CheckoutReconciler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly checkout: CheckoutService,
    @InjectRepository(PaymentEntity) private readonly payments: Repository<PaymentEntity>,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.step('deliveries', () => this.retryDeliveries(now));
      await this.step('refunds', async () => {
        await this.checkout.resolveStaleRefunds(now, STALE_SENDING_MS, BATCH);
        await this.checkout.sendDueRefunds(BATCH);
        await this.checkout.refreshPendingRefunds(now, PENDING_REFUND_RECHECK_MS, BATCH);
      });
      await this.step('checks', () => this.checkUnconfirmed(now));
      await this.step('expiry', () => this.expireUnpaid(now));
    } finally {
      this.running = false;
    }
  }

  private async retryDeliveries(now: Date): Promise<void> {
    const base: FindOptionsWhere<PaymentEntity> = {
      status: 'success',
      fulfilledAt: IsNull(),
      provider: this.checkout.gatewayProvider,
      createdAt: MoreThan(new Date(now.getTime() - RETRY_FULFILMENT_FOR_MS)),
    };
    const due = await this.payments.find({
      // Never tried (no retry time yet) or due for a retry.
      where: [
        { ...base, nextCheckAt: IsNull() },
        { ...base, nextCheckAt: LessThanOrEqual(now) },
      ],
      order: { nextCheckAt: { direction: 'ASC', nulls: 'FIRST' }, createdAt: 'ASC' },
      take: BATCH,
    });
    for (const payment of due) await this.checkout.fulfill(payment.reference, now);
  }

  private async checkUnconfirmed(now: Date): Promise<void> {
    const due = await this.payments.find({
      where: {
        status: In(['initialized', 'failed', 'abandoned']),
        provider: this.checkout.gatewayProvider,
        createdAt: MoreThan(new Date(now.getTime() - ABANDON_AFTER_MS)),
        nextCheckAt: LessThanOrEqual(now),
      },
      order: { nextCheckAt: 'ASC' },
      take: BATCH,
    });
    for (const payment of due) await this.checkout.recheckCheckout(payment.reference, now);
  }

  private async expireUnpaid(now: Date): Promise<void> {
    const expired = await this.payments.find({
      where: { status: 'initialized', provider: this.checkout.gatewayProvider, createdAt: LessThan(new Date(now.getTime() - ABANDON_AFTER_MS)) },
      order: { createdAt: 'ASC' },
      take: BATCH,
    });
    for (const payment of expired) await this.checkout.expireCheckout(payment.reference, now);
  }

  /** One failing step (gateway down, a bad row) never stops the others. */
  private async step(name: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn({ err: error, step: name }, 'Checkout reconciliation step failed');
    }
  }
}
