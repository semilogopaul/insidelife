import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { LessThan, type DataSource, type EntityManager, type Repository } from 'typeorm';
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
import {
  claimRefund,
  decideCharge,
  decideRefundReport,
  fulfilmentRetryAt,
  nextCheckAt,
  type ChargeDecision,
  type RefundReport,
  type RefundReportDecision,
} from './checkout-rules.js';
import { PaymentEntity } from './entities/payment.entity.js';
import { refundStateOf } from './gateways/flutterwave.parsers.js';
import { PAYMENT_GATEWAY, type GatewayCharge, type GatewayRefund, type PaymentGateway } from './gateways/payment-gateway.interface.js';
import { SandboxGateway } from './gateways/sandbox.gateway.js';

const MINUTE_MS = 60_000;
/** The reconciler's first gateway check of an unconfirmed checkout (then `CHECK_SCHEDULE_MINUTES`). */
const FIRST_CHECK_AFTER_MS = 10 * MINUTE_MS;
/** When the gateway can't be asked, look again this much later (without using up one of the scheduled checks). */
const CHECK_RETRY_MS = 10 * MINUTE_MS;
/** A purchase whose refund is still processing isn't delivered; look again this much later. */
const REFUND_HOLD_MS = 30 * MINUTE_MS;

const toReport = (refund: GatewayRefund): RefundReport => ({
  refundId: refund.refundId,
  amountKobo: refund.amountKobo,
  state: refundStateOf(refund.status),
  gatewayStatus: refund.status.slice(0, 32),
});

/** A refund webhook arrived before its charge was verified: fail the job so it is retried after the charge lands. */
export class RefundBeforeChargeException extends DomainException {
  constructor(reference: string) {
    super('REFUND_BEFORE_CHARGE', `The charge for ${reference} isn't verified yet`, HttpStatus.CONFLICT);
  }
}

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

/** A refund the gateway reported by webhook (already authenticated), to be recorded once per status. */
export interface ReportedRefund {
  readonly refundId: string;
  readonly transactionId: string | null;
  readonly amountKobo: number;
  /** The gateway's refund status (`completed`, `processing`, `failed`…). Only completed is final. */
  readonly status: string;
}

/** What recording a refund report did (for the caller's outcome). */
interface AppliedRefundReport {
  readonly decision: RefundReportDecision;
  readonly payment: PaymentEntity;
  readonly refund: CheckoutRefund;
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
 * transaction, then recorded from what the gateway says: `pending` (processing), `refunded` (completed: final, the
 * purpose settles it once) or `failed`. A failure reported after completion reverts it and the purpose undoes its
 * settlement. A refund call that errors is re-checked with the gateway before being declared failed; a claim left
 * `sending` by a dead process is re-checked and resolved by the reconciler. A payment is refunded through the API at
 * most once per claim, and Flutterwave itself refuses refunding more than was paid.
 *
 * Only rows of the active gateway (Flutterwave in production) are swept: rows from another provider are left alone.
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
        nextCheckAt: new Date(Date.now() + FIRST_CHECK_AFTER_MS),
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
      // No hosted checkout was handed out, so there is nothing to re-check.
      await this.payments.update({ reference }, { status: 'failed', failureReason: 'initialize_failed', nextCheckAt: null });
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
          // Delivery follows at once; if it doesn't, the undelivered sweep picks rows with no retry time first.
          payment.nextCheckAt = null;
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
  async fulfill(reference: string, now: Date = new Date()): Promise<boolean> {
    const outcome = await withTransaction(this.dataSource, async (manager): Promise<'delivered' | 'refund' | null> => {
      const payment = await manager.findOne(PaymentEntity, { where: { reference }, lock: { mode: 'pessimistic_write' } });
      if (!payment || payment.status !== 'success' || payment.fulfilledAt) return null;
      if (payment.refundStatus === 'refunded') {
        // Refunded (e.g. from the dashboard) before it was delivered: settle it without delivering anything.
        payment.fulfilledAt = now;
        payment.nextCheckAt = null;
        payment.lastFulfillmentError = 'Refunded before delivery; nothing delivered';
        await manager.save(payment);
        this.logger.warn({ reference }, 'Payment refunded before delivery; not delivering');
        return null;
      }
      if (payment.refundStatus === 'pending') {
        // A refund is on its way: deliver nothing while it processes (it completes, or fails and delivery goes ahead).
        payment.nextCheckAt = new Date(now.getTime() + REFUND_HOLD_MS);
        payment.lastFulfillmentError = 'Refund processing; delivery on hold';
        await manager.save(payment);
        return null;
      }

      const fulfiller = this.fulfillers.get(payment.purpose);
      if (!fulfiller) {
        this.logger.warn({ reference, purpose: payment.purpose }, 'No fulfiller registered for purpose; will retry');
        payment.lastFulfillmentError = `No fulfiller registered for "${payment.purpose}"`;
        payment.nextCheckAt = fulfilmentRetryAt(now, Math.max(1, payment.fulfillmentAttempts));
        await manager.save(payment);
        return null;
      }

      payment.fulfillmentAttempts += 1;
      let result: FulfilmentResult;
      try {
        result = await fulfiller.fulfill(this.toPaid(payment));
      } catch (error) {
        // Back off (1, 5, 15, 60 min, then 6 h) so a payment that keeps failing (no living character…) can't block others.
        payment.nextCheckAt = fulfilmentRetryAt(now, payment.fulfillmentAttempts);
        this.logger.error({ reference, purpose: payment.purpose, err: error, retryAt: payment.nextCheckAt }, 'Checkout fulfilment failed; will retry');
        payment.lastFulfillmentError = errorText(error);
        await manager.save(payment);
        return null;
      }
      payment.fulfilledAt = now;
      payment.nextCheckAt = null;
      payment.lastFulfillmentError = null;
      const refund = result.kind === 'refund' && payment.refundStatus === null;
      if (result.kind === 'refund' && refund) {
        payment.refundStatus = 'due';
        payment.refundReason = result.reason.slice(0, 200);
        payment.refundUpdatedAt = now;
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
          return payment.refundStatus === 'pending' && payment.refundId ? { kind: 'pending', refundId: payment.refundId } : { kind: 'in-progress' };
        case 'send':
          payment.refundStatus = 'due';
          payment.refundReason = reason.slice(0, 200);
          payment.refundUpdatedAt = new Date();
          await manager.save(payment);
          return null;
      }
    });
    return owed ?? this.sendRefund(reference);
  }

  /** Reconciler: send refunds that were owed but never sent (process stopped right after fulfilment). */
  async sendDueRefunds(limit: number): Promise<number> {
    const due = await this.payments.find({ where: { refundStatus: 'due', provider: this.gateway.provider }, order: { createdAt: 'ASC' }, take: limit });
    for (const payment of due) await this.sendRefund(payment.reference);
    return due.length;
  }

  /**
   * Reconciler: refund claims left `sending` by a process that died mid-call (or whose call errored and couldn't be
   * re-checked). Ask the gateway: a refund it has is recorded; none at all means the call never landed, so it is owed
   * again (`due`, sent by the next sweep; Flutterwave refuses refunding more than was paid). If the gateway can't be
   * asked, the claim stays and is re-checked next time.
   */
  async resolveStaleRefunds(now: Date, olderThanMs: number, limit: number): Promise<number> {
    const stale = await this.payments.find({
      where: { refundStatus: 'sending', provider: this.gateway.provider, refundUpdatedAt: LessThan(new Date(now.getTime() - olderThanMs)) },
      order: { refundUpdatedAt: 'ASC' },
      take: limit,
    });
    for (const payment of stale) {
      const since = payment.refundUpdatedAt ?? payment.createdAt;
      const lookup = await this.lookUpLostRefund(payment, since);
      if (lookup.kind === 'unknown') {
        await this.payments.update({ reference: payment.reference, refundStatus: 'sending' }, { refundUpdatedAt: now });
        continue;
      }
      if (lookup.kind === 'found') {
        await this.applyAndAnnounce(payment.reference, lookup.report, 'api');
        continue;
      }
      this.logger.warn({ reference: payment.reference }, 'Interrupted refund never reached the gateway; owed again');
      await this.payments.update({ reference: payment.reference, refundStatus: 'sending' }, { refundStatus: 'due', refundUpdatedAt: now });
    }
    return stale.length;
  }

  /** Reconciler: re-read refunds the gateway is still processing (a lost completion webhook can't strand them). */
  async refreshPendingRefunds(now: Date, olderThanMs: number, limit: number): Promise<number> {
    if (!this.gateway.fetchRefund) return 0;
    const pending = await this.payments.find({
      where: { refundStatus: 'pending', provider: this.gateway.provider, refundUpdatedAt: LessThan(new Date(now.getTime() - olderThanMs)) },
      order: { refundUpdatedAt: 'ASC' },
      take: limit,
    });
    for (const payment of pending) {
      // Move it to the back of the line first, whatever the gateway answers.
      await this.payments.update({ reference: payment.reference, refundStatus: 'pending' }, { refundUpdatedAt: now });
      if (!payment.refundId) continue;
      try {
        const refund = await this.gateway.fetchRefund(payment.refundId);
        if (refund) await this.applyAndAnnounce(payment.reference, toReport(refund), 'gateway');
      } catch (error) {
        this.logger.warn({ reference: payment.reference, err: error }, 'Could not re-check a pending refund');
      }
    }
    return pending.length;
  }

  /**
   * A refund the gateway reported by webhook (typically made by ops in the dashboard). Recorded once per refund id;
   * the purpose's `onRefunded` then claws back or takes down what the payment bought.
   */
  async recordGatewayRefund(reported: ReportedRefund): Promise<'recorded' | 'duplicate' | 'unknown'> {
    const found = await this.referenceForTransaction(reported.transactionId);
    if (!found) {
      this.logger.warn({ refundId: reported.refundId, transactionId: reported.transactionId }, 'Refund for a transaction we don’t know; ignored');
      return 'unknown';
    }
    // The refund webhook can beat the charge's own verification: record the charge now if the gateway gave it to us
    // (record only: the refund is settled first, so a refund before delivery delivers nothing).
    if (found.charge) await this.applyCharge(found.charge);
    const report: RefundReport = {
      refundId: reported.refundId,
      amountKobo: reported.amountKobo,
      state: refundStateOf(reported.status),
      gatewayStatus: reported.status.slice(0, 32),
    };
    // Throws RefundBeforeChargeException while the charge still isn't verified: the job is retried.
    const applied = await this.applyAndAnnounce(found.reference, report, 'gateway', reported.transactionId);
    if (!applied || applied.decision.kind === 'ignore') return 'duplicate';
    this.logger.warn({ reference: found.reference, refundId: report.refundId, state: report.state, amountKobo: report.amountKobo }, 'Gateway refund recorded');
    return 'recorded';
  }

  /** Mark a payment for a human look (shown to ops in the payment row; also logged). */
  async flag(reference: string, reason: string): Promise<void> {
    this.logger.warn({ reference, reason }, 'Payment flagged for ops');
    await this.payments.update({ reference }, { flagReason: reason.slice(0, 200) });
  }

  /** Read a checkout back from the gateway by reference and record it. Throws when the gateway can't be asked. */
  async verifyWithGateway(reference: string): Promise<void> {
    const charge = await this.gateway.verify(reference);
    if (charge) await this.handleCharge(charge);
  }

  /**
   * Reconciler: check an unconfirmed checkout with the gateway and schedule the next look (10 min, 30 min, 2 h, 6 h,
   * 23 h after it started; nothing after the fifth). When the gateway can't be asked, look again in 10 minutes without
   * using up a scheduled check.
   */
  async recheckCheckout(reference: string, now: Date): Promise<void> {
    let asked = true;
    try {
      await this.verifyWithGateway(reference);
    } catch (error) {
      asked = false;
      this.logger.warn({ reference, err: error }, 'Reconciliation check failed; will retry');
    }
    const row = await this.payments.findOne({ where: { reference } });
    if (!row || row.status === 'success') return;
    const attempts = asked ? row.checkAttempts + 1 : row.checkAttempts;
    const scheduled = asked ? nextCheckAt(row.createdAt, attempts) : new Date(now.getTime() + CHECK_RETRY_MS);
    // A row that fell behind its schedule still goes to the back of the line.
    const next = scheduled && scheduled.getTime() < now.getTime() + MINUTE_MS ? new Date(now.getTime() + MINUTE_MS) : scheduled;
    await this.payments.update({ reference, status: row.status }, { checkAttempts: attempts, lastCheckedAt: now, nextCheckAt: next });
  }

  /**
   * Reconciler: a checkout unconfirmed after a day. Check it with the gateway one last time; only if it is still
   * unpaid is it marked abandoned (a payment that lands later still counts). Returns false when the gateway couldn't be
   * asked (it stays as it is for the next sweep).
   */
  async expireCheckout(reference: string, now: Date): Promise<boolean> {
    try {
      await this.verifyWithGateway(reference);
    } catch (error) {
      this.logger.warn({ reference, err: error }, 'Final check before expiry failed; will retry');
      return false;
    }
    await this.payments.update(
      { reference, status: 'initialized' },
      { status: 'abandoned', failureReason: 'checkout_expired', nextCheckAt: null, lastCheckedAt: now },
    );
    return true;
  }

  /** Confirm a webhook-reported refund with the gateway (when it can), else trust the authenticated webhook body. */
  async confirmRefund(reported: ReportedRefund): Promise<ReportedRefund> {
    const confirmed = await this.gateway.fetchRefund?.(reported.refundId);
    if (!confirmed) return reported;
    return {
      refundId: confirmed.refundId,
      transactionId: confirmed.transactionId ?? reported.transactionId,
      amountKobo: confirmed.amountKobo,
      status: confirmed.status,
    };
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private async lookUp(reference: string, transactionId: string | undefined): Promise<GatewayCharge | null> {
    if (transactionId) {
      const charge = await this.gateway.verifyTransaction(transactionId);
      if (charge?.reference === reference) return charge;
    }
    return this.gateway.verify(reference);
  }

  /** Claim an owed refund (`due` → `sending`), call the gateway, record what it says, then tell the purpose. */
  private async sendRefund(reference: string): Promise<RefundOutcome> {
    const claimedAt = new Date();
    const claimed = await withTransaction(this.dataSource, async (manager) => {
      const payment = await manager.findOne(PaymentEntity, { where: { reference }, lock: { mode: 'pessimistic_write' } });
      if (!payment || payment.refundStatus !== 'due') return payment;
      payment.refundStatus = 'sending';
      payment.refundUpdatedAt = claimedAt;
      await manager.save(payment);
      return { payment, claimedNow: true as const };
    });
    if (!claimed) return { kind: 'not-refundable', reason: 'Unknown payment' };
    if (!('claimedNow' in claimed)) {
      if (claimed.refundStatus === 'refunded') return { kind: 'already-refunded', refund: this.recordedRefund(claimed) };
      if (claimed.refundStatus === 'pending' && claimed.refundId) return { kind: 'pending', refundId: claimed.refundId };
      if (claimed.refundStatus === 'sending' || claimed.refundStatus === 'pending') return { kind: 'in-progress' };
      if (claimed.refundStatus === 'failed') return { kind: 'failed', reason: claimed.refundFailure ?? 'The gateway refused the refund' };
      return { kind: 'not-refundable', reason: 'No refund is owed on this payment' };
    }

    let report: RefundReport;
    try {
      report = toReport(
        await this.gateway.refund({
          reference,
          transactionId: claimed.payment.gatewayTransactionId,
          comments: `Inside Life refund: ${claimed.payment.refundReason ?? 'not delivered'}`,
        }),
      );
    } catch (error) {
      // A timeout may still have gone through: ask the gateway before calling it failed.
      const lookup = await this.lookUpLostRefund(claimed.payment, claimedAt);
      if (lookup.kind === 'unknown') {
        this.logger.warn({ reference, err: error }, 'Refund call failed and the gateway could not be re-checked; the reconciler resolves it');
        return { kind: 'in-progress' };
      }
      if (lookup.kind === 'none') {
        const failure = errorText(error);
        await this.payments.update({ reference, refundStatus: 'sending' }, { refundStatus: 'failed', refundFailure: failure, refundUpdatedAt: new Date() });
        this.logger.error({ reference, err: error }, 'Automatic refund failed; refund it by hand in the Flutterwave dashboard');
        return { kind: 'failed', reason: failure };
      }
      this.logger.warn({ reference, refundId: lookup.report.refundId }, 'Refund call errored but the gateway has the refund; recording it');
      report = lookup.report;
    }

    const applied = await this.applyAndAnnounce(reference, report, 'api');
    if (!applied) return { kind: 'not-refundable', reason: 'Unknown payment' };
    this.logger.log({ reference, refundId: report.refundId, state: report.state, amountKobo: report.amountKobo }, 'Refund sent');
    const now = applied.payment;
    switch (now.refundStatus) {
      case 'refunded':
        return { kind: 'refunded', refund: applied.refund };
      case 'pending':
        return { kind: 'pending', refundId: report.refundId };
      case 'failed':
        return { kind: 'failed', reason: now.refundFailure ?? 'The gateway refused the refund' };
      default:
        return { kind: 'in-progress' };
    }
  }

  /**
   * Record a refund report under the row lock (`decideRefundReport`), then tell the purpose: `onRefunded` when it
   * completed, `onRefundFailed` when a refund we tracked failed. `origin` says whether it came from our own API call.
   * Throws `RefundBeforeChargeException` when the payment isn't verified yet (a webhook that beat the charge).
   */
  private async applyAndAnnounce(
    reference: string,
    report: RefundReport,
    origin: 'api' | 'gateway',
    transactionId: string | null = null,
  ): Promise<AppliedRefundReport | null> {
    const applied = await withTransaction(this.dataSource, async (manager): Promise<AppliedRefundReport | null> => {
      const payment = await manager.findOne(PaymentEntity, { where: { reference }, lock: { mode: 'pessimistic_write' } });
      if (!payment) return null;
      if (payment.status !== 'success') throw new RefundBeforeChargeException(reference);
      const decision = decideRefundReport(payment, report);
      // Ours: sent by this process, claimed by us, or the same refund we sent earlier (never a dashboard reason).
      const ours =
        origin === 'api' ||
        payment.refundStatus === 'sending' ||
        (payment.refundId === report.refundId && payment.refundReason !== null && payment.refundReason !== DASHBOARD_REFUND_REASON);
      const now = new Date();
      switch (decision.kind) {
        case 'ignore':
          break;
        case 'pending':
          payment.refundStatus = 'pending';
          payment.refundId = report.refundId;
          payment.refundFailure = null;
          payment.refundReason ??= DASHBOARD_REFUND_REASON;
          break;
        case 'completed': {
          const paid = payment.paidKobo ?? payment.amountKobo;
          payment.refundedKobo = decision.additional ? Math.min(paid, payment.refundedKobo + report.amountKobo) : Math.min(paid, report.amountKobo);
          payment.refundStatus = 'refunded';
          payment.refundId = report.refundId;
          payment.refundedAt = now;
          payment.refundFailure = null;
          payment.refundReason ??= DASHBOARD_REFUND_REASON;
          break;
        }
        case 'failed':
          if (decision.reverted) {
            payment.refundedKobo = Math.max(0, payment.refundedKobo - report.amountKobo);
            payment.refundedAt = null;
          }
          payment.refundStatus = 'failed';
          payment.refundId = report.refundId;
          payment.refundFailure = `Flutterwave reported the refund ${report.gatewayStatus}: refund it by hand`.slice(0, 200);
          break;
      }
      if (decision.kind !== 'ignore') {
        payment.refundGatewayStatus = report.gatewayStatus;
        payment.refundUpdatedAt = now;
        payment.gatewayTransactionId ??= transactionId;
        await manager.save(payment);
      }
      const refund: CheckoutRefund = {
        refundId: report.refundId,
        amountKobo: report.amountKobo,
        source: ours ? 'api' : 'dashboard',
        reason: payment.refundReason,
        delivered: payment.fulfilledAt !== null,
      };
      return { decision, payment, refund };
    });
    if (!applied) return null;
    if (applied.decision.kind === 'completed') await this.notifyRefunded(applied.payment, applied.refund);
    if (applied.decision.kind === 'failed') await this.notifyRefundFailed(applied.payment, applied.refund, applied.decision.reverted);
    return applied;
  }

  /**
   * Did the gateway take a refund we lost track of (call timed out, process died)? `found`: it has one for this
   * transaction since `since`; `none`: it has none; `unknown`: it couldn't be asked.
   */
  private async lookUpLostRefund(
    payment: PaymentEntity,
    since: Date,
  ): Promise<{ readonly kind: 'found'; readonly report: RefundReport } | { readonly kind: 'none' } | { readonly kind: 'unknown' }> {
    if (!this.gateway.findRefund) return { kind: 'none' };
    try {
      const transactionId = payment.gatewayTransactionId ?? (await this.gateway.verify(payment.reference))?.transactionId ?? null;
      if (!transactionId) return { kind: 'none' };
      const refund = await this.gateway.findRefund(transactionId, since);
      return refund ? { kind: 'found', report: toReport(refund) } : { kind: 'none' };
    } catch (error) {
      this.logger.warn({ reference: payment.reference, err: error }, 'Could not look a refund up at the gateway');
      return { kind: 'unknown' };
    }
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

  private async notifyRefundFailed(payment: PaymentEntity, refund: CheckoutRefund, wasCompleted: boolean): Promise<void> {
    this.logger.error({ reference: payment.reference, refundId: refund.refundId, wasCompleted }, 'Refund failed at the gateway; refund it by hand');
    const fulfiller = this.fulfillers.get(payment.purpose);
    if (!fulfiller?.onRefundFailed) return;
    try {
      await fulfiller.onRefundFailed(this.toPaid(payment), refund, wasCompleted);
    } catch (error) {
      this.logger.error({ reference: payment.reference, err: error }, 'Refund-failure follow-up failed; flagged for ops');
      await this.payments.update({ reference: payment.reference }, { flagReason: `Refund-failure follow-up failed: ${errorText(error)}`.slice(0, 200) });
    }
  }

  /**
   * Our reference for a gateway transaction id: from the recorded id, else read back from the gateway (and then the
   * charge too, so a refund webhook that beat the charge's verification can verify it first).
   */
  private async referenceForTransaction(transactionId: string | null): Promise<{ readonly reference: string; readonly charge: GatewayCharge | null } | null> {
    if (!transactionId) return null;
    const known = await this.payments.findOne({ where: { gatewayTransactionId: transactionId } });
    if (known) return { reference: known.reference, charge: null };
    const charge = await this.gateway.verifyTransaction(transactionId);
    return charge && (await this.payments.exists({ where: { reference: charge.reference } })) ? { reference: charge.reference, charge } : null;
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
