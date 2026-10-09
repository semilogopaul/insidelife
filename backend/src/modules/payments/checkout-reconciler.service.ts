import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, IsNull, LessThan, MoreThan, type Repository } from 'typeorm';
import { CheckoutService } from './checkout.service.js';
import { PaymentEntity } from './entities/payment.entity.js';

const SWEEP_EVERY_MS = 2 * 60_000;
const BATCH = 20;
const MINUTE_MS = 60_000;
/** Give the player's own redirect + verify a head start before we poll the gateway. */
const VERIFY_AFTER_MS = 10 * MINUTE_MS;
const ABANDON_AFTER_MS = 24 * 60 * MINUTE_MS;
const RETRY_FULFILMENT_FOR_MS = 7 * 24 * 60 * MINUTE_MS;

/**
 * Safety net for lost webhooks, closed tabs and failed fulfilments: every two minutes it retries paid-but-undelivered
 * payments, sends refunds that were owed but never sent, re-verifies in-flight checkouts older than 10 minutes with
 * the gateway (Flutterwave `verify_by_reference`), and marks day-old unpaid checkouts abandoned. Everything it calls
 * is idempotent and row-locked, so several instances sweeping at once is harmless.
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
      const undelivered = await this.payments.find({
        where: { status: 'success', fulfilledAt: IsNull(), createdAt: MoreThan(new Date(now.getTime() - RETRY_FULFILMENT_FOR_MS)) },
        order: { createdAt: 'ASC' },
        take: BATCH,
      });
      for (const payment of undelivered) await this.checkout.fulfill(payment.reference);

      await this.checkout.sendDueRefunds(BATCH);

      const stale = await this.payments.find({
        where: {
          status: 'initialized',
          provider: this.checkout.gatewayProvider,
          createdAt: And(LessThan(new Date(now.getTime() - VERIFY_AFTER_MS)), MoreThan(new Date(now.getTime() - ABANDON_AFTER_MS))),
        },
        order: { createdAt: 'ASC' },
        take: BATCH,
      });
      for (const payment of stale) {
        try {
          await this.checkout.verifyWithGateway(payment.reference);
        } catch (error) {
          this.logger.warn({ reference: payment.reference, err: error }, 'Reconciliation verify failed');
        }
      }

      await this.payments.update(
        { status: 'initialized', createdAt: LessThan(new Date(now.getTime() - ABANDON_AFTER_MS)) },
        { status: 'abandoned', failureReason: 'checkout_expired' },
      );
    } catch (error) {
      this.logger.warn({ err: error }, 'Checkout reconciliation sweep failed');
    } finally {
      this.running = false;
    }
  }
}
