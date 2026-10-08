import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import {
  CHECKOUT_PURPOSES,
  type CheckoutFulfiller,
  type CheckoutPort,
  type CheckoutPurpose,
  type CheckoutRequest,
  type CheckoutSession,
  type PaidCheckout,
} from '../../common/ports/checkout.port.js';
import { DomainException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { withTransaction } from '../../database/transaction.js';
import { decideCharge, type ChargeDecision } from './checkout-rules.js';
import { PaymentEntity } from './entities/payment.entity.js';
import { PAYMENT_GATEWAY, type GatewayCharge, type PaymentGateway } from './gateways/payment-gateway.interface.js';
import { SandboxGateway } from './gateways/sandbox.gateway.js';

/** Paystack's NGN floor is ₦50; anything above ₦1m in one checkout is a bug, not a purchase. */
const MIN_AMOUNT_KOBO = 5_000;
const MAX_AMOUNT_KOBO = 100_000_000;
/** In-flight (initialized) checkouts count toward daily caps for this long, then they're presumed abandoned. */
const IN_FLIGHT_WINDOW_MINUTES = 30;

/** Runs inside the checkout-creation transaction, after the per-user lock, before the row is inserted. */
export type CheckoutGuard = (manager: EntityManager, request: CheckoutRequest) => Promise<void>;

export interface VerifiedPayment {
  readonly payment: PaymentEntity;
  readonly fulfilledNow: boolean;
}

class InvalidCheckoutException extends DomainException {
  constructor(message: string) {
    super('INVALID_CHECKOUT', message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * Generic real-money checkout. Owns the payment rows and the gateway; domains start checkouts and register a
 * fulfiller per purpose.
 *
 * Delivery guarantee: on a verified success (verify endpoint, signed webhook, sandbox or reconciler — whichever comes
 * first) the payment row is locked `FOR UPDATE`; if it isn't fulfilled yet, its fulfiller runs and `fulfilledAt` is
 * stamped in the same transaction. Concurrent triggers serialise on that lock, so a fulfiller runs once per payment
 * in normal operation; after a crash between the fulfiller's commit and ours it may run again, which is why
 * fulfillers must be idempotent by reference (top-ups are, via the ledger key `topup:<reference>`).
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

  registerFulfiller(fulfiller: CheckoutFulfiller): void {
    if (this.fulfillers.has(fulfiller.purpose)) throw new RangeError(`Checkout fulfiller for "${fulfiller.purpose}" registered twice`);
    this.fulfillers.set(fulfiller.purpose, fulfiller);
  }

  /** Create the payment row and a hosted checkout. `guard` lets a purpose enforce caps atomically (per-user lock). */
  async start(request: CheckoutRequest, guard?: CheckoutGuard): Promise<CheckoutSession> {
    this.assertValid(request);
    const reference = randomUUID();
    await withTransaction(this.dataSource, async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`checkout:${request.userId}`]);
      await guard?.(manager, request);
      await manager.insert(PaymentEntity, {
        reference,
        userId: request.userId,
        characterId: request.characterId,
        purpose: request.purpose,
        subjectId: request.subjectId,
        description: request.description.trim(),
        amountKobo: request.amountKobo,
        currency: 'NGN',
        provider: this.gateway.provider,
        status: 'initialized',
      });
    });

    try {
      const { authorizationUrl } = await this.gateway.initialize({
        reference,
        email: request.email,
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

  /** Player-initiated verification (after the redirect back from checkout). Idempotent. */
  async verify(userId: string, reference: string): Promise<VerifiedPayment> {
    const payment = await this.payments.findOne({ where: { reference, userId } });
    if (!payment) throw new ResourceNotFoundException('Payment');
    if (payment.status !== 'success') {
      const charge = await this.gateway.verify(reference);
      if (charge) await this.applyCharge(charge);
    }
    const fulfilledNow = await this.fulfill(reference);
    return { payment: await this.payments.findOneOrFail({ where: { reference } }), fulfilledNow };
  }

  /** A charge reported by a trusted channel (signed webhook, reconciler, sandbox). Unknown references are ignored. */
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
          payment.channel = charge.channel?.slice(0, 32) ?? null;
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
        case 'pending':
          return decision;
      }
      await manager.save(payment);
      return decision;
    });
  }

  /**
   * Deliver a paid purchase exactly once (see class doc). Returns true when this call delivered it. Fulfiller errors
   * are recorded on the row and leave it unfulfilled for the next trigger to retry.
   */
  async fulfill(reference: string): Promise<boolean> {
    return withTransaction(this.dataSource, async (manager) => {
      const payment = await manager.findOne(PaymentEntity, { where: { reference }, lock: { mode: 'pessimistic_write' } });
      if (!payment || payment.status !== 'success' || payment.fulfilledAt) return false;

      const fulfiller = this.fulfillers.get(payment.purpose);
      if (!fulfiller) {
        this.logger.warn({ reference, purpose: payment.purpose }, 'No fulfiller registered for purpose; will retry');
        payment.lastFulfillmentError = `No fulfiller registered for "${payment.purpose}"`;
        await manager.save(payment);
        return false;
      }

      payment.fulfillmentAttempts += 1;
      try {
        await fulfiller.fulfill(this.toPaid(payment));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error({ reference, purpose: payment.purpose, err: error }, 'Checkout fulfilment failed; will retry');
        payment.lastFulfillmentError = message.slice(0, 200);
        await manager.save(payment);
        return false;
      }
      payment.fulfilledAt = new Date();
      payment.lastFulfillmentError = null;
      await manager.save(payment);
      this.logger.log({ reference, purpose: payment.purpose }, 'Checkout fulfilled');
      return true;
    });
  }

  /** Used by the reconciler. */
  async verifyWithGateway(reference: string): Promise<void> {
    const charge = await this.gateway.verify(reference);
    if (charge) await this.handleCharge(charge);
  }

  get gatewayProvider(): PaymentGateway['provider'] {
    return this.gateway.provider;
  }

  private toPaid(payment: PaymentEntity): PaidCheckout {
    return {
      reference: payment.reference,
      userId: payment.userId,
      characterId: payment.characterId,
      purpose: payment.purpose,
      subjectId: payment.subjectId,
      amountKobo: payment.amountKobo,
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
    if (!request.email.includes('@')) throw new InvalidCheckoutException('A valid email is required for checkout');
  }
}
