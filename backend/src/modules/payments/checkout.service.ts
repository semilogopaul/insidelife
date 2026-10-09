import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import {
  CHECKOUT_PURPOSES,
  type CheckoutFulfiller,
  type CheckoutPort,
  type CheckoutPurpose,
  type CheckoutRefund,
  type CheckoutRequest,
  type CheckoutSession,
  type FulfilmentResult,
  type PaidCheckout,
  type RefundOutcome,
} from '../../common/ports/checkout.port.js';
import { DomainException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { withTransaction } from '../../database/transaction.js';
import { claimRefund, decideCharge, type ChargeDecision } from './checkout-rules.js';
import { PaymentEntity } from './entities/payment.entity.js';
import { PAYMENT_GATEWAY, type GatewayCharge, type GatewayRefund, type PaymentGateway } from './gateways/payment-gateway.interface.js';
import { SandboxGateway } from './gateways/sandbox.gateway.js';

/**
 * Flutterwave's practical NGN floor is ₦100. The ceiling is a sanity bound, not a business rule: top-ups stop at the
 * configured per-payment maximum (₦10m by default) and ad rates at ₦100m a week × 4 weeks.
 */
const MIN_AMOUNT_KOBO = 10_000;
const MAX_AMOUNT_KOBO = 50_000_000_000;
/** In-flight (initialized) checkouts count toward daily caps for this long, then they're presumed abandoned. */
const IN_FLIGHT_WINDOW_MINUTES = 30;
const DASHBOARD_REFUND_REASON = 'Refunded in the Flutterwave dashboard';

/** Runs inside the checkout-creation transaction, after the per-user lock, before the row is inserted. */
export type CheckoutGuard = (manager: EntityManager, request: CheckoutRequest) => Promise<void>;

export interface VerifiedPayment {
  readonly payment: PaymentEntity;
  readonly fulfilledNow: boolean;
}

/** A refund the gateway reported by webhook (already authenticated), to be recorded once. */
export interface ReportedRefund {
  readonly refundId: string;
  readonly transactionId: string | null;
  readonly amountKobo: number;
}

class InvalidCheckoutException extends DomainException {
  constructor(message: string) {
    super('INVALID_CHECKOUT', message, HttpStatus.BAD_REQUEST);
  }
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : 'Unknown error').slice(0, 200);

/**
 * Generic real-money checkout. Owns the payment rows and the gateway; domains start checkouts and register a
 * fulfiller per purpose.
 *
 * Delivery guarantee: on a verified success (redirect verification, webhook job, sandbox or reconciler — whichever
 * comes first) the payment row is locked `FOR UPDATE`; if it isn't fulfilled yet, its fulfiller runs and
 * `fulfilledAt` is stamped in the same transaction. Concurrent triggers serialise on that lock, so a fulfiller runs
 * once per payment in normal operation; after a crash between the fulfiller's commit and ours it may run again, which
 * is why fulfillers must be idempotent by reference (top-ups are, via the ledger key `topup:<reference>`).
 *
 * Refund guarantee: a refund is owed (`due`), claimed under the row lock (`sending`), sent to the gateway outside any
 * transaction, then recorded (`refunded` / `failed`). A payment is refunded through the API at most once; the
 * reconciler retries owed refunds that were never sent.
 */
@Injectable()
export class CheckoutService implements CheckoutPort {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly fulfillers = new Map<CheckoutPurpose, CheckoutFulfiller>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(PaymentEntity) private readonly payments: Repository<PaymentEntity>,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly sandboxGateway: SandboxGateway,
  ) {}

  get sandbox(): boolean {
    return this.gateway.provider === 'sandbox';
  }

  get gatewayProvider(): PaymentGateway['provider'] {
    return this.gateway.provider;
  }

  registerFulfiller(fulfiller: CheckoutFulfiller): void {
    if (this.fulfillers.has(fulfiller.purpose)) throw new RangeError(`Checkout fulfiller for "${fulfiller.purpose}" registered twice`);
    this.fulfillers.set(fulfiller.purpose, fulfiller);
  }

  /** Create the payment row and a hosted checkout. `guard` lets a purpose enforce caps atomically (per-user lock). */
  async start(request: CheckoutRequest, guard?: CheckoutGuard): Promise<CheckoutSession> {
    this.assertValid(request);
    const reference = randomUUID();
    const paymentId = await withTransaction(this.dataSource, async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`checkout:${request.userId}`]);
      await guard?.(manager, request);
      const inserted = await manager.insert(PaymentEntity, {
        reference,
        userId: request.userId,
        characterId: request.characterId,
        purpose: request.purpose,
        subjectId: request.subjectId,
        description: request.description.trim(),
        amountKobo: request.amountKobo,
        topupRate: request.topupRate ?? null,
        currency: 'NGN',
        provider: this.gateway.provider,
        status: 'initialized',
      });
      return String(inserted.identifiers[0]?.id ?? '');
    });

    try {
      const { authorizationUrl } = await this.gateway.initialize({
        reference,
        paymentId,
        email: request.email,
        customerName: request.customerName?.trim() || 'Inside Life player',
        amountKobo: request.amountKobo,
        description: request.description,
        metadata: { purpose: request.purpose, subjectId: request.subjectId, characterId: request.characterId },
      });
      this.logger.log({ reference, purpose: request.purpose, provider: this.gateway.provider }, 'Checkout started');
      return { reference, authorizationUrl };
    } catch (error) {
      await this.payments.update({ reference }, { status: 'failed', failureReason: 'initialize_failed' });
      throw error;
    }
  }

  /**
   * Player-initiated verification after the redirect back from checkout. The redirect's `transaction_id` is only a
   * hint: the charge is read back from the gateway and must carry this payment's reference. Idempotent.
   */
  async verify(userId: string, reference: string, transactionId?: string): Promise<VerifiedPayment> {
    const payment = await this.payments.findOne({ where: { reference, userId } });
    if (!payment) throw new ResourceNotFoundException('Payment');
    if (payment.status !== 'success') {
      const charge = await this.lookUp(reference, transactionId);
      if (charge) await this.applyCharge(charge);
    }
    const fulfilledNow = await this.fulfill(reference);
    return { payment: await this.payments.findOneOrFail({ where: { reference } }), fulfilledNow };
  }

  /** A webhook said a transaction completed: read it back from the gateway, then record and deliver it. */
  async verifyTransaction(transactionId: string): Promise<ChargeDecision | null> {
    const charge = await this.gateway.verifyTransaction(transactionId);
    if (!charge) {
      this.logger.warn({ transactionId }, 'Webhook transaction unknown to the gateway; ignored');
      return null;
    }
    return this.handleCharge(charge);
  }

  /** A charge read from the gateway (webhook job, reconciler, sandbox). Unknown references are ignored. */
  async handleCharge(charge: GatewayCharge): Promise<ChargeDecision | null> {
    const decision = await this.applyCharge(charge);
    if (decision) await this.fulfill(charge.reference);
    return decision;
  }

  /** Sandbox checkout outcome chosen by the player (404 unless the sandbox gateway is active). */
  async simulate(userId: string, reference: string, outcome: 'success' | 'failed'): Promise<VerifiedPayment> {
    if (!this.sandbox) throw new ResourceNotFoundException('Page');
    const payment = await this.payments.findOne({ where: { reference, userId } });
    if (!payment) throw new ResourceNotFoundException('Payment');
    await this.applyCharge(this.sandboxGateway.simulatedCharge(payment, outcome));
    const fulfilledNow = await this.fulfill(reference);
    return { payment: await this.payments.findOneOrFail({ where: { reference } }), fulfilledNow };
  }

  findForUser(userId: string, limit: number): Promise<PaymentEntity[]> {
    return this.payments.find({ where: { userId }, order: { createdAt: 'DESC' }, take: limit });
  }

  /** Kobo committed today for a purpose: confirmed payments plus checkouts still in flight. */
  async committedKoboSince(manager: EntityManager, userId: string, purpose: CheckoutPurpose, since: Date): Promise<number> {
    const rows = (await manager.query(
      `SELECT COALESCE(SUM(amount_kobo), 0) AS total
         FROM payments
        WHERE user_id = $1 AND purpose = $2 AND created_at >= $3
          AND (status = 'success' OR (status = 'initialized' AND created_at > now() - make_interval(mins => $4)))`,
      [userId, purpose, since, IN_FLIGHT_WINDOW_MINUTES],
    )) as Array<{ total: string }>;
    return Number(rows[0]?.total ?? 0);
  }

  /** Record what the gateway reported, under a row lock. Returns null for unknown references. */
  async applyCharge(charge: GatewayCharge): Promise<ChargeDecision | null> {
    return withTransaction(this.dataSource, async (manager) => {
      const payment = await manager.findOne(PaymentEntity, { where: { reference: charge.reference }, lock: { mode: 'pessimistic_write' } });
      if (!payment) {
        this.logger.warn({ reference: charge.reference }, 'Charge for an unknown payment reference ignored');
        return null;
      }
      const decision = decideCharge(payment, charge);
      switch (decision.kind) {
        case 'record-success':
          payment.status = 'success';
          payment.verifiedAt = charge.paidAt ?? new Date();
          payment.paidKobo = charge.amountKobo;
          payment.channel = charge.channel?.slice(0, 32) ?? null;
          payment.gatewayTransactionId = charge.transactionId;
          payment.gatewayResponse = charge.details;
          payment.failureReason = null;
          break;
        case 'not-paid':
          payment.status = decision.status;
          payment.failureReason = decision.reason;
          payment.gatewayResponse = charge.details;
          break;
        case 'mismatch':
          this.logger.warn({ reference: payment.reference, reason: decision.reason }, 'Charge does not match the payment; not delivering');
          payment.status = 'failed';
          payment.failureReason = decision.reason;
          payment.gatewayResponse = charge.details;
          break;
        case 'already-paid':
          // Keep the gateway id of the paid charge for refunds, if an earlier trigger didn't have it.
          if (payment.gatewayTransactionId || !charge.transactionId || charge.status !== 'success') return decision;
          payment.gatewayTransactionId = charge.transactionId;
          break;
        case 'pending':
          return decision;
      }
      await manager.save(payment);
      return decision;
    });
  }

  /**
   * Deliver a paid purchase exactly once (see class doc). Returns true when this call delivered it. Fulfiller errors
   * are recorded on the row and leave it unfulfilled for the next trigger to retry. A fulfiller that can't deliver
   * (sold out, duplicate payment…) asks for a refund, which is sent right after this commits.
   */
  async fulfill(reference: string): Promise<boolean> {
    const outcome = await withTransaction(this.dataSource, async (manager): Promise<'delivered' | 'refund' | null> => {
      const payment = await manager.findOne(PaymentEntity, { where: { reference }, lock: { mode: 'pessimistic_write' } });
      if (!payment || payment.status !== 'success' || payment.fulfilledAt) return null;
      if (payment.refundStatus === 'refunded') {
        // Refunded (e.g. from the dashboard) before it was delivered: settle it without delivering anything.
        payment.fulfilledAt = new Date();
        payment.lastFulfillmentError = 'Refunded before delivery; nothing delivered';
        await manager.save(payment);
        this.logger.warn({ reference }, 'Payment refunded before delivery; not delivering');
        return null;
      }

      const fulfiller = this.fulfillers.get(payment.purpose);
      if (!fulfiller) {
        this.logger.warn({ reference, purpose: payment.purpose }, 'No fulfiller registered for purpose; will retry');
        payment.lastFulfillmentError = `No fulfiller registered for "${payment.purpose}"`;
        await manager.save(payment);
        return null;
      }

      payment.fulfillmentAttempts += 1;
      let result: FulfilmentResult;
      try {
        result = await fulfiller.fulfill(this.toPaid(payment));
      } catch (error) {
        this.logger.error({ reference, purpose: payment.purpose, err: error }, 'Checkout fulfilment failed; will retry');
        payment.lastFulfillmentError = errorText(error);
        await manager.save(payment);
        return null;
      }
      payment.fulfilledAt = new Date();
      payment.lastFulfillmentError = null;
      const refund = result.kind === 'refund' && payment.refundStatus === null;
      if (result.kind === 'refund' && refund) {
        payment.refundStatus = 'due';
        payment.refundReason = result.reason.slice(0, 200);
      }
      await manager.save(payment);
      this.logger.log({ reference, purpose: payment.purpose, refund }, refund ? 'Checkout settled with a refund' : 'Checkout fulfilled');
      return refund ? 'refund' : 'delivered';
    });

    // Outside the row lock: the refund claims the same row (the reconciler retries it if this process dies first).
    if (outcome === 'refund') await this.sendRefund(reference);
    return outcome !== null;
  }

  /** Refund a successful payment in full (port method; see `CheckoutPort.refund`). */
  async refund(reference: string, reason: string): Promise<RefundOutcome> {
    const owed = await withTransaction(this.dataSource, async (manager): Promise<RefundOutcome | null> => {
      const payment = await manager.findOne(PaymentEntity, { where: { reference }, lock: { mode: 'pessimistic_write' } });
      if (!payment) return { kind: 'not-refundable', reason: 'Unknown payment' };
      const claim = claimRefund(payment);
      switch (claim.kind) {
        case 'not-refundable':
          return claim;
        case 'already-refunded':
          return { kind: 'already-refunded', refund: this.recordedRefund(payment) };
        case 'in-flight':
          return { kind: 'in-progress' };
        case 'send':
          payment.refundStatus = 'due';
          payment.refundReason = reason.slice(0, 200);
          await manager.save(payment);
          return null;
      }
    });
    return owed ?? this.sendRefund(reference);
  }

  /** Reconciler: send refunds that were owed but never sent (process stopped right after fulfilment). */
  async sendDueRefunds(limit: number): Promise<number> {
    const due = await this.payments.find({ where: { refundStatus: 'due' }, order: { createdAt: 'ASC' }, take: limit });
    for (const payment of due) await this.sendRefund(payment.reference);
    return due.length;
  }

  /**
   * A refund the gateway reported by webhook (typically made by ops in the dashboard). Recorded once per refund id;
   * the purpose's `onRefunded` then claws back or takes down what the payment bought.
   */
  async recordGatewayRefund(reported: ReportedRefund): Promise<'recorded' | 'duplicate' | 'unknown'> {
    const reference = await this.referenceForTransaction(reported.transactionId);
    if (!reference) {
      this.logger.warn({ refundId: reported.refundId, transactionId: reported.transactionId }, 'Refund for a transaction we don’t know; ignored');
      return 'unknown';
    }
    let source: CheckoutRefund['source'] = 'dashboard';
    const recorded = await withTransaction(this.dataSource, async (manager) => {
      const payment = await manager.findOne(PaymentEntity, { where: { reference }, lock: { mode: 'pessimistic_write' } });
      if (!payment || payment.status !== 'success') return null;
      if (payment.refundId === reported.refundId && payment.refundStatus === 'refunded') return null;
      const sameRefund = payment.refundId === reported.refundId;
      // Our own API refund whose webhook beat the API response: it's ours, not a dashboard refund.
      source = payment.refundStatus === 'sending' ? 'api' : 'dashboard';
      payment.refundStatus = 'refunded';
      payment.refundReason ??= DASHBOARD_REFUND_REASON;
      payment.refundedKobo = sameRefund ? reported.amountKobo : Math.min(payment.amountKobo, payment.refundedKobo + reported.amountKobo);
      payment.refundId = reported.refundId;
      payment.refundedAt = new Date();
      payment.refundFailure = null;
      payment.gatewayTransactionId ??= reported.transactionId;
      await manager.save(payment);
      return payment;
    });
    if (!recorded) return 'duplicate';
    this.logger.warn({ reference, refundId: reported.refundId, amountKobo: reported.amountKobo }, 'Gateway refund recorded');
    await this.notifyRefunded(recorded, {
      refundId: reported.refundId,
      amountKobo: reported.amountKobo,
      source,
      reason: recorded.refundReason,
      delivered: recorded.fulfilledAt !== null,
    });
    return 'recorded';
  }

  /** Mark a payment for a human look (shown to ops in the payment row; also logged). */
  async flag(reference: string, reason: string): Promise<void> {
    this.logger.warn({ reference, reason }, 'Payment flagged for ops');
    await this.payments.update({ reference }, { flagReason: reason.slice(0, 200) });
  }

  /** Used by the reconciler. */
  async verifyWithGateway(reference: string): Promise<void> {
    const charge = await this.gateway.verify(reference);
    if (charge) await this.handleCharge(charge);
  }

  /** Confirm a webhook-reported refund with the gateway (when it can), else trust the authenticated webhook body. */
  async confirmRefund(reported: ReportedRefund): Promise<ReportedRefund> {
    const confirmed = await this.gateway.fetchRefund?.(reported.refundId);
    if (!confirmed) return reported;
    return { refundId: confirmed.refundId, transactionId: confirmed.transactionId ?? reported.transactionId, amountKobo: confirmed.amountKobo };
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private async lookUp(reference: string, transactionId: string | undefined): Promise<GatewayCharge | null> {
    if (transactionId) {
      const charge = await this.gateway.verifyTransaction(transactionId);
      if (charge?.reference === reference) return charge;
    }
    return this.gateway.verify(reference);
  }

  /** Claim an owed refund (`due` → `sending`), call the gateway, record the outcome, then tell the purpose. */
  private async sendRefund(reference: string): Promise<RefundOutcome> {
    const claimed = await withTransaction(this.dataSource, async (manager) => {
      const payment = await manager.findOne(PaymentEntity, { where: { reference }, lock: { mode: 'pessimistic_write' } });
      if (!payment || payment.refundStatus !== 'due') return payment;
      payment.refundStatus = 'sending';
      await manager.save(payment);
      return { ...payment, refundStatus: 'sending' as const, claimedNow: true };
    });
    if (!claimed) return { kind: 'not-refundable', reason: 'Unknown payment' };
    if (!('claimedNow' in claimed)) {
      if (claimed.refundStatus === 'refunded') return { kind: 'already-refunded', refund: this.recordedRefund(claimed) };
      if (claimed.refundStatus === 'sending') return { kind: 'in-progress' };
      if (claimed.refundStatus === 'failed') return { kind: 'failed', reason: claimed.refundFailure ?? 'The gateway refused the refund' };
      return { kind: 'not-refundable', reason: 'No refund is owed on this payment' };
    }

    let refund: GatewayRefund;
    try {
      refund = await this.gateway.refund({
        reference,
        transactionId: claimed.gatewayTransactionId,
        comments: `Inside Life refund: ${claimed.refundReason ?? 'not delivered'}`,
      });
    } catch (error) {
      const failure = errorText(error);
      await this.payments.update({ reference, refundStatus: 'sending' }, { refundStatus: 'failed', refundFailure: failure });
      this.logger.error({ reference, err: error }, 'Automatic refund failed; refund it by hand in the Flutterwave dashboard');
      return { kind: 'failed', reason: failure };
    }

    const recorded = await withTransaction(this.dataSource, async (manager) => {
      const payment = await manager.findOneOrFail(PaymentEntity, { where: { reference }, lock: { mode: 'pessimistic_write' } });
      // The refund webhook can beat our own API response; it then already recorded (and announced) this refund.
      if (payment.refundStatus === 'refunded' && payment.refundId === refund.refundId) return { payment, announce: false };
      payment.refundStatus = 'refunded';
      payment.refundId = refund.refundId;
      payment.refundedKobo = refund.amountKobo;
      payment.refundedAt = new Date();
      payment.refundFailure = null;
      await manager.save(payment);
      return { payment, announce: true };
    });
    const result: CheckoutRefund = {
      refundId: refund.refundId,
      amountKobo: refund.amountKobo,
      source: 'api',
      reason: recorded.payment.refundReason,
      delivered: recorded.payment.fulfilledAt !== null,
    };
    this.logger.log({ reference, refundId: refund.refundId, amountKobo: refund.amountKobo }, 'Payment refunded');
    if (recorded.announce) await this.notifyRefunded(recorded.payment, result);
    return { kind: 'refunded', refund: result };
  }

  private async notifyRefunded(payment: PaymentEntity, refund: CheckoutRefund): Promise<void> {
    const fulfiller = this.fulfillers.get(payment.purpose);
    if (!fulfiller?.onRefunded) return;
    try {
      await fulfiller.onRefunded(this.toPaid(payment), refund);
    } catch (error) {
      this.logger.error({ reference: payment.reference, err: error }, 'Refund follow-up failed; flagged for ops');
      await this.payments.update({ reference: payment.reference }, { flagReason: `Refund follow-up failed: ${errorText(error)}`.slice(0, 200) });
    }
  }

  /** Our reference for a gateway transaction id: from the recorded id, else read back from the gateway. */
  private async referenceForTransaction(transactionId: string | null): Promise<string | null> {
    if (!transactionId) return null;
    const known = await this.payments.findOne({ where: { gatewayTransactionId: transactionId } });
    if (known) return known.reference;
    const charge = await this.gateway.verifyTransaction(transactionId);
    return charge && (await this.payments.exists({ where: { reference: charge.reference } })) ? charge.reference : null;
  }

  private recordedRefund(payment: PaymentEntity): CheckoutRefund {
    return { refundId: payment.refundId ?? '', amountKobo: payment.refundedKobo, source: 'api', reason: payment.refundReason, delivered: payment.fulfilledAt !== null };
  }

  private toPaid(payment: PaymentEntity): PaidCheckout {
    return {
      reference: payment.reference,
      userId: payment.userId,
      characterId: payment.characterId,
      purpose: payment.purpose,
      subjectId: payment.subjectId,
      amountKobo: payment.amountKobo,
      // Rows verified before paid_kobo existed were checked to be at least the price.
      paidKobo: payment.paidKobo ?? payment.amountKobo,
      topupRate: payment.topupRate,
      paidAt: payment.verifiedAt ?? payment.createdAt,
    };
  }

  private assertValid(request: CheckoutRequest): void {
    if (!CHECKOUT_PURPOSES.includes(request.purpose)) throw new InvalidCheckoutException('Unknown payment purpose');
    if (!Number.isSafeInteger(request.amountKobo) || request.amountKobo < MIN_AMOUNT_KOBO || request.amountKobo > MAX_AMOUNT_KOBO) {
      throw new InvalidCheckoutException('Payment amount is out of range');
    }
    const description = request.description.trim();
    if (description.length === 0 || description.length > 120) throw new InvalidCheckoutException('Payment description is invalid');
    if (request.subjectId.length === 0 || request.subjectId.length > 64) throw new InvalidCheckoutException('Payment subject is invalid');
    if (request.topupRate !== undefined && (!Number.isSafeInteger(request.topupRate) || request.topupRate <= 0)) throw new InvalidCheckoutException('Top-up rate is invalid');
    if (!request.email.includes('@')) throw new InvalidCheckoutException('A valid email is required for checkout');
  }
}
