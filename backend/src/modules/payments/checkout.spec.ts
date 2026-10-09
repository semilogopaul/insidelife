import { FindOperator, type DataSource, type EntityManager, type Repository } from 'typeorm';
import type { Queue } from 'bullmq';
import type { TopupDetailsDto } from '@insidelife/shared';
import type { CheckoutFulfiller, CheckoutRefund, FulfilmentResult, PaidCheckout } from '../../common/ports/checkout.port.js';
import type { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { LedgerService } from '../ledger/ledger.service.js';
import type { CharacterSession } from '../simulation/character-session.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { CheckoutReconciler } from './checkout-reconciler.service.js';
import { claimRefund, decideCharge } from './checkout-rules.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentEntity } from './entities/payment.entity.js';
import { FlutterwaveWebhookService, InvalidWebhookSignatureException } from './flutterwave-webhook.service.js';
import type { GatewayCharge, GatewayRefund, GatewayRefundInput, PaymentGateway } from './gateways/payment-gateway.interface.js';
import type { SandboxGateway } from './gateways/sandbox.gateway.js';
import { PaymentsEventsProcessor } from './payments-events.processor.js';
import { TopupCreditor } from './topup-creditor.service.js';
import { quoteTopup, topupCredit } from './topup-quote.js';
import { TopupsService } from './topups.service.js';

const REF = '7c2b1f0e-6a4d-4c51-9b7e-0d2f3a4b5c6d';
const TX = '9231836';
const USER = 'user-1';
const HASH = 'f'.repeat(16) + '0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7';

type Row = Record<string, unknown>;

/** Evaluates the TypeORM operators the payments code uses (IsNull, LessThan, MoreThan, And) against a value. */
function satisfies(actual: unknown, expected: unknown): boolean {
  if (!(expected instanceof FindOperator)) return actual === expected;
  const operand = expected.value as unknown;
  switch (expected.type) {
    case 'isNull':
      return actual === null || actual === undefined;
    case 'lessThan':
      return (actual as number | Date) < (operand as number | Date);
    case 'moreThan':
      return (actual as number | Date) > (operand as number | Date);
    case 'and':
      return (operand as unknown[]).every((part) => satisfies(actual, part));
    default:
      throw new RangeError(`Unsupported operator ${expected.type}`);
  }
}

const matches = (row: PaymentEntity, where: Row): boolean => Object.entries(where).every(([key, value]) => satisfies((row as unknown as Row)[key], value));

/** In-memory payments table with commit semantics and a global lock standing in for `SELECT … FOR UPDATE`. */
class FakePayments {
  readonly rows = new Map<string, PaymentEntity>();
  private queue: Promise<unknown> = Promise.resolve();

  seed(overrides: Partial<PaymentEntity> = {}): PaymentEntity {
    const row = Object.assign(new PaymentEntity(), {
      id: `p-${this.rows.size + 1}`,
      reference: REF,
      userId: USER,
      characterId: 'char-1',
      purpose: 'topup',
      subjectId: 'owambe-pack',
      description: 'Inside Life top-up: Owambe pack',
      amountKobo: 250_000,
      paidKobo: null,
      topupRate: 400,
      currency: 'NGN',
      provider: 'flutterwave',
      status: 'initialized',
      gatewayTransactionId: null,
      channel: null,
      gatewayResponse: null,
      failureReason: null,
      createdAt: new Date(),
      verifiedAt: null,
      fulfilledAt: null,
      fulfillmentAttempts: 0,
      lastFulfillmentError: null,
      refundStatus: null,
      refundReason: null,
      refundedKobo: 0,
      refundId: null,
      refundedAt: null,
      refundFailure: null,
      flagReason: null,
      ...overrides,
    });
    this.rows.set(row.reference, row);
    return row;
  }

  read(reference: string): PaymentEntity | null {
    const row = this.rows.get(reference);
    return row ? Object.assign(new PaymentEntity(), row) : null;
  }

  private findWhere(where: Row): PaymentEntity | null {
    const row = [...this.rows.values()].find((candidate) => matches(candidate, where));
    return row ? Object.assign(new PaymentEntity(), row) : null;
  }

  private write(payment: PaymentEntity): void {
    this.rows.set(payment.reference, Object.assign(new PaymentEntity(), payment));
  }

  readonly manager = {
    findOne: async (_entity: unknown, options: { where: Row }) => this.findWhere(options.where),
    findOneOrFail: async (_entity: unknown, options: { where: Row }) => {
      const row = this.findWhere(options.where);
      if (!row) throw new RangeError('missing');
      return row;
    },
    save: async (payment: PaymentEntity) => {
      this.write(payment);
      return payment;
    },
  } as unknown as EntityManager;

  readonly dataSource = {
    transaction: <T>(_level: string, work: (manager: EntityManager) => Promise<T>): Promise<T> => {
      const run = this.queue.then(() => work(this.manager));
      this.queue = run.catch(() => undefined);
      return run;
    },
  } as unknown as DataSource;

  readonly repository = {
    findOne: async (options: { where: Row }) => this.findWhere(options.where),
    findOneOrFail: async (options: { where: Row }) => {
      const row = this.findWhere(options.where);
      if (!row) throw new RangeError('missing');
      return row;
    },
    exists: async (options: { where: Row }) => this.findWhere(options.where) !== null,
    find: async (options: { where: Row; take?: number }) =>
      [...this.rows.values()].filter((row) => matches(row, options.where)).slice(0, options.take ?? 1_000).map((row) => Object.assign(new PaymentEntity(), row)),
    update: async (where: Row, patch: Partial<PaymentEntity>) => {
      let affected = 0;
      for (const row of this.rows.values()) {
        if (!matches(row, where)) continue;
        Object.assign(row, patch);
        affected += 1;
      }
      return { affected };
    },
  } as unknown as Repository<PaymentEntity>;
}

const charge = (overrides: Partial<GatewayCharge> = {}): GatewayCharge => ({
  reference: REF,
  transactionId: TX,
  status: 'success',
  amountKobo: 250_000,
  currency: 'NGN',
  channel: 'card',
  paidAt: new Date(),
  details: { status: 'successful' },
  ...overrides,
});

/** A scriptable gateway that records what it was asked. */
class FakeGateway implements PaymentGateway {
  readonly provider = 'flutterwave' as const;
  byReference: GatewayCharge | null = charge();
  byTransaction: GatewayCharge | null = charge();
  refundError: Error | null = null;
  readonly verifiedReferences: string[] = [];
  readonly verifiedTransactions: string[] = [];
  readonly refunds: GatewayRefundInput[] = [];

  async initialize(): Promise<{ readonly authorizationUrl: string }> {
    return { authorizationUrl: 'https://checkout.flutterwave.com/v3/hosted/pay/x' };
  }

  async verify(reference: string): Promise<GatewayCharge | null> {
    this.verifiedReferences.push(reference);
    return this.byReference;
  }

  async verifyTransaction(transactionId: string): Promise<GatewayCharge | null> {
    this.verifiedTransactions.push(transactionId);
    return this.byTransaction;
  }

  async refund(input: GatewayRefundInput): Promise<GatewayRefund> {
    await new Promise((resolve) => setTimeout(resolve, 2));
    this.refunds.push(input);
    if (this.refundError) throw this.refundError;
    return { refundId: `75923${this.refunds.length}`, amountKobo: input.amountKobo ?? 250_000, status: 'completed' };
  }
}

class CountingFulfiller implements CheckoutFulfiller {
  readonly purpose = 'topup' as const;
  readonly delivered: PaidCheckout[] = [];
  readonly refunded: CheckoutRefund[] = [];
  failuresLeft = 0;
  result: FulfilmentResult = { kind: 'delivered' };

  async fulfill(payment: PaidCheckout): Promise<FulfilmentResult> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new RangeError('wallet temporarily unavailable');
    }
    if (this.result.kind === 'delivered') this.delivered.push(payment);
    return this.result;
  }

  async onRefunded(_payment: PaidCheckout, refund: CheckoutRefund): Promise<void> {
    this.refunded.push(refund);
  }
}

function setup(): { payments: FakePayments; gateway: FakeGateway; checkout: CheckoutService; fulfiller: CountingFulfiller } {
  const payments = new FakePayments();
  payments.seed();
  const gateway = new FakeGateway();
  const checkout = new CheckoutService(payments.dataSource, payments.repository, gateway, {} as SandboxGateway);
  const fulfiller = new CountingFulfiller();
  checkout.registerFulfiller(fulfiller);
  return { payments, gateway, checkout, fulfiller };
}

describe('decideCharge (Flutterwave: successful, tx_ref matches, NGN, amount ≥ expected)', () => {
  const expected = { reference: REF, amountKobo: 250_000, currency: 'NGN', status: 'initialized' as const };

  it('records a matching success, and accepts paying more than the price', () => {
    expect(decideCharge(expected, charge())).toEqual({ kind: 'record-success' });
    expect(decideCharge(expected, charge({ amountKobo: 250_100 }))).toEqual({ kind: 'record-success' });
  });

  it('refuses a success that paid less, in another currency or for another reference', () => {
    expect(decideCharge(expected, charge({ amountKobo: 249_999 }))).toEqual({ kind: 'mismatch', reason: 'amount_mismatch' });
    expect(decideCharge(expected, charge({ currency: 'USD' }))).toEqual({ kind: 'mismatch', reason: 'currency_mismatch' });
    expect(decideCharge(expected, charge({ reference: 'other' }))).toEqual({ kind: 'mismatch', reason: 'reference_mismatch' });
  });

  it('never downgrades a confirmed payment', () => {
    expect(decideCharge({ ...expected, status: 'success' }, charge({ status: 'failed' }))).toEqual({ kind: 'already-paid' });
  });

  it('maps pending, failed and cancelled charges', () => {
    expect(decideCharge(expected, charge({ status: 'pending' }))).toEqual({ kind: 'pending' });
    expect(decideCharge(expected, charge({ status: 'failed' }))).toMatchObject({ kind: 'not-paid', status: 'failed' });
    expect(decideCharge(expected, charge({ status: 'abandoned' }))).toMatchObject({ kind: 'not-paid', status: 'abandoned' });
    expect(decideCharge({ ...expected, status: 'failed' }, charge())).toEqual({ kind: 'record-success' });
  });
});

describe('claimRefund', () => {
  it('refunds a paid payment once, never an unpaid one', () => {
    expect(claimRefund({ status: 'success', refundStatus: null })).toEqual({ kind: 'send' });
    expect(claimRefund({ status: 'success', refundStatus: 'due' })).toEqual({ kind: 'send' });
    expect(claimRefund({ status: 'success', refundStatus: 'failed' })).toEqual({ kind: 'send' });
    expect(claimRefund({ status: 'success', refundStatus: 'sending' })).toEqual({ kind: 'in-flight' });
    expect(claimRefund({ status: 'success', refundStatus: 'refunded' })).toEqual({ kind: 'already-refunded' });
    expect(claimRefund({ status: 'initialized', refundStatus: null }).kind).toBe('not-refundable');
  });
});

describe('CheckoutService delivery (verify before fulfil, exactly once)', () => {
  it('delivers exactly once when the redirect, three webhook deliveries and a retry race', async () => {
    const { payments, checkout, fulfiller } = setup();
    const [verified, , , , retried] = await Promise.all([
      checkout.verify(USER, REF, TX),
      checkout.verifyTransaction(TX),
      checkout.verifyTransaction(TX),
      checkout.verifyTransaction(TX),
      checkout.fulfill(REF),
    ]);
    expect(fulfiller.delivered).toHaveLength(1);
    expect(verified.payment.fulfilledAt).toBeInstanceOf(Date);
    expect([verified.fulfilledNow, retried].filter(Boolean).length).toBeLessThanOrEqual(1);
    // The fulfiller gets what the gateway verified (paidKobo) and the rate stored at checkout.
    expect(fulfiller.delivered[0]).toMatchObject({ reference: REF, purpose: 'topup', subjectId: 'owambe-pack', amountKobo: 250_000, paidKobo: 250_000, topupRate: 400 });
    expect(payments.read(REF)).toMatchObject({ status: 'success', gatewayTransactionId: TX, channel: 'card', paidKobo: 250_000 });
    expect(await checkout.fulfill(REF)).toBe(false);
    await checkout.verifyTransaction(TX);
    expect(fulfiller.delivered).toHaveLength(1);
  });

  it('reads the charge back from the gateway and ignores a redirect transaction id for another payment', async () => {
    const { gateway, checkout, fulfiller } = setup();
    gateway.byTransaction = charge({ reference: 'someone-elses-reference' });
    gateway.byReference = charge({ status: 'pending' });
    const { payment } = await checkout.verify(USER, REF, '555');
    expect(gateway.verifiedTransactions).toEqual(['555']);
    expect(gateway.verifiedReferences).toEqual([REF]);
    expect(payment.status).toBe('initialized');
    expect(fulfiller.delivered).toHaveLength(0);
  });

  it('never delivers when the charged amount is below the price or in another currency', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    gateway.byReference = charge({ amountKobo: 50_000 });
    const { payment, fulfilledNow } = await checkout.verify(USER, REF);
    expect(fulfilledNow).toBe(false);
    expect(payment.status).toBe('failed');
    expect(payments.read(REF)?.failureReason).toBe('amount_mismatch');

    payments.seed({ reference: 'ref-usd', status: 'initialized' });
    gateway.byTransaction = charge({ reference: 'ref-usd', currency: 'USD' });
    await checkout.verifyTransaction('42');
    expect(payments.read('ref-usd')?.failureReason).toBe('currency_mismatch');
    expect(fulfiller.delivered).toHaveLength(0);
  });

  it('ignores webhook transactions the gateway doesn’t know and unknown references', async () => {
    const { gateway, checkout, fulfiller } = setup();
    gateway.byTransaction = null;
    expect(await checkout.verifyTransaction('404')).toBeNull();
    expect(await checkout.handleCharge(charge({ reference: 'not-ours' }))).toBeNull();
    expect(fulfiller.delivered).toHaveLength(0);
  });

  it('keeps a paid purchase pending delivery after a fulfiller error and delivers on the next trigger', async () => {
    const { payments, checkout, fulfiller } = setup();
    fulfiller.failuresLeft = 1;
    await checkout.handleCharge(charge());
    expect(payments.read(REF)).toMatchObject({ status: 'success', fulfilledAt: null, fulfillmentAttempts: 1 });
    expect(payments.read(REF)?.lastFulfillmentError).toContain('temporarily unavailable');
    expect(await checkout.fulfill(REF)).toBe(true);
    expect(fulfiller.delivered).toHaveLength(1);
    expect(payments.read(REF)).toMatchObject({ fulfillmentAttempts: 2, lastFulfillmentError: null });
  });

  it('leaves unknown purposes unfulfilled until a fulfiller registers', async () => {
    const { payments, checkout } = setup();
    payments.seed({ purpose: 'billboard', subjectId: 'campaign-9' });
    await checkout.handleCharge(charge());
    expect(payments.read(REF)).toMatchObject({ status: 'success', fulfilledAt: null });
    const billboard: CheckoutFulfiller & { count: number } = {
      purpose: 'billboard',
      count: 0,
      async fulfill() {
        this.count += 1;
        return { kind: 'delivered' };
      },
    };
    checkout.registerFulfiller(billboard);
    expect(await checkout.fulfill(REF)).toBe(true);
    expect(billboard.count).toBe(1);
  });

  it('refuses a second fulfiller for the same purpose', () => {
    const { checkout } = setup();
    expect(() => checkout.registerFulfiller(new CountingFulfiller())).toThrow(RangeError);
  });
});

describe('CheckoutService refunds', () => {
  it('refunds a fulfiller’s refusal (sold out) once, right after the fulfilment commits', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    fulfiller.result = { kind: 'refund', reason: 'The space filled up before your payment landed' };
    await Promise.all([checkout.handleCharge(charge()), checkout.verifyTransaction(TX), checkout.fulfill(REF)]);
    expect(gateway.refunds).toEqual([expect.objectContaining({ reference: REF, transactionId: TX })]);
    expect(payments.read(REF)).toMatchObject({ refundStatus: 'refunded', refundedKobo: 250_000, refundId: '759231', refundReason: expect.stringContaining('filled up') });
    expect(fulfiller.refunded).toEqual([expect.objectContaining({ source: 'api', refundId: '759231', delivered: true })]);
  });

  it('refunds on request exactly once (a repeat reports the first refund)', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.seed({ status: 'success', fulfilledAt: new Date(), gatewayTransactionId: TX });
    const [first, second] = await Promise.all([checkout.refund(REF, 'Not approved in review'), checkout.refund(REF, 'Not approved in review')]);
    expect(gateway.refunds).toHaveLength(1);
    expect(first.kind).toBe('refunded');
    // The racing call either saw the claim (in progress) or the finished refund.
    expect(['in-progress', 'already-refunded']).toContain(second.kind);
    expect(await checkout.refund(REF, 'again')).toMatchObject({ kind: 'already-refunded', refund: { refundId: '759231' } });
    expect(gateway.refunds).toHaveLength(1);
    expect(fulfiller.refunded).toHaveLength(1);
  });

  it('records a refused refund as failed (manual fallback) and lets it be retried', async () => {
    const { payments, gateway, checkout } = setup();
    payments.seed({ status: 'success', fulfilledAt: new Date(), gatewayTransactionId: TX });
    gateway.refundError = new RangeError('Flutterwave is not responding right now');
    expect(await checkout.refund(REF, 'Not approved')).toMatchObject({ kind: 'failed', reason: expect.stringContaining('not responding') });
    expect(payments.read(REF)).toMatchObject({ refundStatus: 'failed', refundFailure: expect.stringContaining('not responding') });
    gateway.refundError = null;
    expect(await checkout.refund(REF, 'Not approved')).toMatchObject({ kind: 'refunded' });
    expect(payments.read(REF)?.refundStatus).toBe('refunded');
  });

  it('never refunds a payment that didn’t go through', async () => {
    const { gateway, checkout } = setup();
    expect(await checkout.refund(REF, 'x')).toMatchObject({ kind: 'not-refundable' });
    expect(await checkout.refund('unknown', 'x')).toMatchObject({ kind: 'not-refundable' });
    expect(gateway.refunds).toHaveLength(0);
  });

  it('records a dashboard refund once however many times the webhook arrives', async () => {
    const { payments, checkout, fulfiller } = setup();
    payments.seed({ status: 'success', fulfilledAt: new Date(), gatewayTransactionId: TX });
    const reported = { refundId: '99025', transactionId: TX, amountKobo: 250_000 };
    const results = await Promise.all([checkout.recordGatewayRefund(reported), checkout.recordGatewayRefund(reported), checkout.recordGatewayRefund(reported)]);
    expect(results.toSorted()).toEqual(['duplicate', 'duplicate', 'recorded']);
    expect(payments.read(REF)).toMatchObject({ refundStatus: 'refunded', refundId: '99025', refundedKobo: 250_000, refundReason: 'Refunded in the Flutterwave dashboard' });
    expect(fulfiller.refunded).toEqual([expect.objectContaining({ source: 'dashboard', delivered: true })]);
  });

  it('finds the payment of a refunded transaction through the gateway and cancels its delivery if it was not delivered yet', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.seed({ status: 'success', gatewayTransactionId: null });
    gateway.byTransaction = charge();
    expect(await checkout.recordGatewayRefund({ refundId: '1', transactionId: TX, amountKobo: 250_000 })).toBe('recorded');
    expect(fulfiller.refunded).toEqual([expect.objectContaining({ delivered: false })]);
    expect(await checkout.fulfill(REF)).toBe(false);
    expect(fulfiller.delivered).toHaveLength(0);
    expect(payments.read(REF)?.lastFulfillmentError).toMatch(/Refunded before delivery/);
    gateway.byTransaction = null;
    expect(await checkout.recordGatewayRefund({ refundId: '2', transactionId: '777', amountKobo: 1 })).toBe('unknown');
  });
});

describe('Flutterwave webhooks → queue → processor', () => {
  /** Stand-in for BullMQ: `add` with an existing job id is a no-op, like the real queue while the job is kept. */
  class FakeQueue {
    readonly jobs = new Map<string, { name: string; data: unknown }>();
    async add(name: string, data: unknown, options: { jobId: string }): Promise<void> {
      if (!this.jobs.has(options.jobId)) this.jobs.set(options.jobId, { name, data });
    }
  }
  const config = { get: () => ({ flutterwave: { webhookSecretHash: HASH }, sandbox: false }) };
  const body = { event: 'charge.completed', data: { id: Number(TX), tx_ref: REF, amount: 2_500, currency: 'NGN', status: 'successful' } };

  it('refuses a missing or wrong verif-hash with 401', () => {
    const webhooks = new FlutterwaveWebhookService(config as never, new FakeQueue() as unknown as Queue);
    expect(() => webhooks.assertAuthentic(undefined)).toThrow(InvalidWebhookSignatureException);
    expect(() => webhooks.assertAuthentic('wrong')).toThrow(InvalidWebhookSignatureException);
    expect(() => webhooks.assertAuthentic(`${HASH} `)).toThrow(InvalidWebhookSignatureException);
    let refused: unknown = null;
    try {
      webhooks.assertAuthentic(HASH.toUpperCase());
    } catch (error) {
      refused = error;
    }
    expect(refused).toMatchObject({ errorCode: 'INVALID_SIGNATURE', status: 401 });
    expect(() => webhooks.assertAuthentic(HASH)).not.toThrow();
  });

  it('fulfils once when the same charge.completed arrives three times, after verifying it with the API', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    const queue = new FakeQueue();
    const webhooks = new FlutterwaveWebhookService(config as never, queue as unknown as Queue);
    for (let delivery = 0; delivery < 3; delivery++) {
      webhooks.assertAuthentic(HASH);
      expect(await webhooks.accept(body)).toBe('queued');
    }
    expect([...queue.jobs.keys()]).toEqual([`charge-${TX}`]);
    const processor = new PaymentsEventsProcessor(checkout);
    // Even if the queue had kept all three, processing each one would still deliver once.
    for (let run = 0; run < 3; run++) await processor.process({ name: 'charge', data: { transactionId: TX } } as never);
    expect(gateway.verifiedTransactions).toEqual([TX, TX, TX]);
    expect(fulfiller.delivered).toHaveLength(1);
    expect(payments.read(REF)?.status).toBe('success');
  });

  it('records a refund webhook (bare Flutterwave refund body) once', async () => {
    const { payments, checkout, fulfiller } = setup();
    payments.seed({ status: 'success', fulfilledAt: new Date(), gatewayTransactionId: TX });
    const queue = new FakeQueue();
    const webhooks = new FlutterwaveWebhookService(config as never, queue as unknown as Queue);
    const refund = { id: 99025, AmountRefunded: 2_500, status: 'completed', FlwRef: '4687213286', TransactionId: Number(TX) };
    await webhooks.accept(refund);
    await webhooks.accept(refund);
    expect([...queue.jobs.entries()]).toEqual([['refund-99025', { name: 'refund', data: { refundId: '99025', transactionId: TX, amountKobo: 250_000 } }]]);
    const processor = new PaymentsEventsProcessor(checkout);
    expect(await processor.process({ name: 'refund', data: queue.jobs.get('refund-99025')?.data } as never)).toBe('recorded');
    expect(await processor.process({ name: 'refund', data: queue.jobs.get('refund-99025')?.data } as never)).toBe('duplicate');
    expect(fulfiller.refunded).toHaveLength(1);
  });

  it('acknowledges malformed and unrelated events without queueing anything', async () => {
    const queue = new FakeQueue();
    const webhooks = new FlutterwaveWebhookService(config as never, queue as unknown as Queue);
    expect(await webhooks.accept({ event: 'transfer.completed', data: { id: 1 } })).toBe('ignored');
    expect(await webhooks.accept({ hello: 'world' })).toBe('ignored');
    expect(await webhooks.accept('not json')).toBe('ignored');
    expect(queue.jobs.size).toBe(0);
  });

  it('asks Flutterwave to retry (503) when the queue is down', async () => {
    const broken = { add: async () => Promise.reject(new RangeError('redis down')) } as unknown as Queue;
    const webhooks = new FlutterwaveWebhookService(config as never, broken);
    await expect(webhooks.accept(body)).rejects.toMatchObject({ errorCode: 'WEBHOOK_RETRY_LATER' });
  });
});

describe('CheckoutReconciler', () => {
  it('verifies checkouts pending for 10+ minutes by reference, sends owed refunds and expires day-old ones', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    const now = new Date('2026-10-09T12:00:00Z');
    const minutesAgo = (minutes: number): Date => new Date(now.getTime() - minutes * 60_000);
    payments.rows.clear();
    payments.seed({ reference: 'fresh', createdAt: minutesAgo(5) });
    payments.seed({ reference: 'stale', createdAt: minutesAgo(15) });
    payments.seed({ reference: 'ancient', createdAt: minutesAgo(25 * 60) });
    payments.seed({ reference: 'owed', status: 'success', fulfilledAt: minutesAgo(30), refundStatus: 'due', refundReason: 'Sold out', gatewayTransactionId: '1', createdAt: minutesAgo(30) });
    gateway.byReference = charge({ reference: 'stale' });

    await new CheckoutReconciler(checkout, payments.repository).sweep(now);

    expect(gateway.verifiedReferences).toEqual(['stale']);
    expect(payments.read('stale')).toMatchObject({ status: 'success' });
    expect(fulfiller.delivered.map((paid) => paid.reference)).toEqual(['stale']);
    expect(payments.read('fresh')?.status).toBe('initialized');
    expect(payments.read('ancient')).toMatchObject({ status: 'abandoned', failureReason: 'checkout_expired' });
    expect(gateway.refunds.map((refund) => refund.reference)).toEqual(['owed']);
    expect(payments.read('owed')?.refundStatus).toBe('refunded');
  });
});

const dashboardRefund = (overrides: Partial<CheckoutRefund> = {}): CheckoutRefund => ({ refundId: '9', amountKobo: 250_000, source: 'dashboard', reason: null, delivered: true, ...overrides });

describe('top-up quotes and credits', () => {
  it('quotes a pack or a custom amount (not both, not neither) at the rate of the largest pack it reaches', () => {
    expect(quoteTopup({ packageId: 'owambe-pack' }, 10_000_000)).toEqual({
      ok: true,
      quote: { subjectId: 'owambe-pack', packageId: 'owambe-pack', label: 'Owambe pack', priceNgn: 2_500, ratePerNaira: 400, virtualAmount: 1_000_000 },
    });
    expect(quoteTopup({ amountNgn: 2_500 }, 10_000_000)).toMatchObject({ ok: true, quote: { subjectId: 'custom', packageId: null, ratePerNaira: 400, virtualAmount: 1_000_000 } });
    expect(quoteTopup({ amountNgn: 7_000 }, 10_000_000)).toMatchObject({ ok: true, quote: { label: 'Custom top-up', ratePerNaira: 440, virtualAmount: 3_080_000 } });
    expect(quoteTopup({ amountNgn: 250_000 }, 10_000_000)).toMatchObject({ ok: true, quote: { ratePerNaira: 500, virtualAmount: 125_000_000 } });
    expect(quoteTopup({}, 10_000_000)).toEqual({ ok: false, reason: 'Pick a pack or enter an amount' });
    expect(quoteTopup({ packageId: 'jollof-pack', amountNgn: 1_000 }, 10_000_000).ok).toBe(false);
    expect(quoteTopup({ amountNgn: 499 }, 10_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/₦500/) });
    expect(quoteTopup({ amountNgn: 20_000_000 }, 10_000_000)).toMatchObject({ ok: false, reason: expect.stringMatching(/at most ₦10,000,000/) });
    expect(quoteTopup({ packageId: 'odogwu-pack' }, 5_000)).toMatchObject({ ok: false });
  });

  it('credits the verified amount × the stored rate, and refuses rows that do not add up', () => {
    const custom = { subjectId: 'custom', amountKobo: 700_000, paidKobo: 700_000, topupRate: 440 };
    expect(topupCredit(custom)).toEqual({ ok: true, credit: { packageId: null, label: 'Custom top-up', ratePerNaira: 440, virtualAmount: 3_080_000 } });
    // Paid more than quoted (never on hosted checkout, but the verified amount is what counts).
    expect(topupCredit({ ...custom, paidKobo: 800_000 })).toMatchObject({ ok: true, credit: { virtualAmount: 3_520_000 } });
    // Before verification the quote is shown.
    expect(topupCredit({ ...custom, paidKobo: null })).toMatchObject({ ok: true, credit: { virtualAmount: 3_080_000 } });
    // A rate that isn't the one the server quotes for the price (forged or corrupted row).
    expect(topupCredit({ ...custom, topupRate: 500 })).toMatchObject({ ok: false });
    expect(topupCredit({ ...custom, subjectId: 'free-money' })).toMatchObject({ ok: false });
    // Top-ups made before custom amounts have no stored rate: the pack's.
    expect(topupCredit({ subjectId: 'big-boy-pack', amountKobo: 500_000, paidKobo: 500_000, topupRate: null })).toMatchObject({ ok: true, credit: { virtualAmount: 2_200_000, ratePerNaira: 440 } });
    expect(topupCredit({ subjectId: 'big-boy-pack', amountKobo: 50_000, paidKobo: 50_000, topupRate: null })).toMatchObject({ ok: false });
  });
});

describe('TopupsService checkout', () => {
  const directory = { findLivingByUser: async () => ({ id: 'char-1', alive: true, userId: USER }) } as unknown as CharacterDirectory;
  const users = { findById: async () => ({ id: USER, email: 'ada@example.com' }) };

  function topupsWith(dailyLimitNgn: number, spentKobo = 0) {
    const started: Array<Record<string, unknown>> = [];
    const checkout = {
      sandbox: false,
      registerFulfiller: () => undefined,
      committedKoboSince: async () => spentKobo,
      start: async (request: Record<string, unknown>, guard?: (manager: EntityManager, request: unknown) => Promise<void>) => {
        await guard?.({} as EntityManager, request);
        started.push(request);
        return { reference: REF, authorizationUrl: 'https://checkout.flutterwave.com/v3/hosted/pay/x' };
      },
    };
    const config = { get: () => ({ dailyLimitNgn, maxTopupNgn: 10_000_000 }) };
    const service = new TopupsService(checkout as unknown as CheckoutService, {} as TopupCreditor, directory, users as never, {} as never, { manager: {} } as DataSource, config as never);
    return { service, started };
  }

  it('starts a custom-amount checkout with the server’s quote and no daily cap by default', async () => {
    const { service, started } = topupsWith(0, 900_000_000);
    const result = await service.start(USER, { amountNgn: 3_000_000 });
    expect(result.topup).toEqual({ packageId: null, label: 'Custom top-up', priceNgn: 3_000_000, ratePerNaira: 500, virtualAmount: 1_500_000_000 });
    expect(started).toEqual([expect.objectContaining({ amountKobo: 300_000_000, subjectId: 'custom', topupRate: 500, purpose: 'topup' })]);
    expect(await service.catalog(USER)).toMatchObject({ dailyLimitNgn: null, remainingTodayNgn: null, minNgn: 500, maxPerPaymentNgn: 10_000_000 });
  });

  it('enforces a daily cap only when the owner sets one', async () => {
    const { service } = topupsWith(20_000, 1_500_000);
    await expect(service.start(USER, { amountNgn: 6_000 })).rejects.toMatchObject({ errorCode: 'TOPUP_DAILY_LIMIT' });
    await expect(service.start(USER, { amountNgn: 5_000 })).resolves.toMatchObject({ topup: { virtualAmount: 2_200_000 } });
    expect(await service.catalog(USER)).toMatchObject({ dailyLimitNgn: 20_000, remainingTodayNgn: 5_000 });
  });

  it('refuses amounts outside ₦500 – the maximum and requests with both or neither', async () => {
    const { service, started } = topupsWith(0);
    await expect(service.start(USER, { amountNgn: 400 })).rejects.toMatchObject({ errorCode: 'INVALID_TOPUP' });
    await expect(service.start(USER, { amountNgn: 10_000_001 })).rejects.toMatchObject({ errorCode: 'INVALID_TOPUP' });
    await expect(service.start(USER, {})).rejects.toMatchObject({ errorCode: 'INVALID_TOPUP' });
    expect(started).toHaveLength(0);
  });
});

describe('TopupsService fulfiller', () => {
  const credits: Array<{ characterId: string; pack: TopupDetailsDto; reference: string }> = [];
  const clawbacks: Array<{ characterId: string; amount: number; reference: string }> = [];
  const flags: string[] = [];
  const creditor = {
    credit: async (characterId: string, pack: TopupDetailsDto, reference: string) => void credits.push({ characterId, pack, reference }),
    clawBack: async (characterId: string, _pack: TopupDetailsDto, amount: number, reference: string) => {
      clawbacks.push({ characterId, amount, reference });
      return { taken: Math.min(amount, 400_000), shortfall: Math.max(0, amount - 400_000) };
    },
  };
  const characters = new Map<string, Pick<CharacterEntity, 'id' | 'alive' | 'userId'>>([
    ['char-1', { id: 'char-1', alive: false, userId: USER }],
    ['heir-1', { id: 'heir-1', alive: true, userId: USER }],
  ]);
  const directory = {
    findById: async (id: string) => characters.get(id) ?? null,
    findLivingByUser: async (userId: string) => [...characters.values()].find((c) => c.userId === userId && c.alive) ?? null,
  } as unknown as CharacterDirectory;
  const config = { get: () => ({ dailyLimitNgn: 0, maxTopupNgn: 10_000_000 }) };
  const checkout = { registerFulfiller: () => undefined, flag: async (_reference: string, reason: string) => void flags.push(reason) };
  const topups = new TopupsService(checkout as unknown as CheckoutService, creditor as unknown as TopupCreditor, directory, {} as never, {} as never, {} as DataSource, config as never);
  const paid = (overrides: Partial<PaidCheckout> = {}): PaidCheckout => ({
    reference: REF,
    userId: USER,
    characterId: 'char-1',
    purpose: 'topup',
    subjectId: 'owambe-pack',
    amountKobo: 250_000,
    paidKobo: 250_000,
    topupRate: 400,
    paidAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    credits.splice(0);
    clawbacks.splice(0);
    flags.splice(0);
  });

  it('credits the package to the living heir when the paying character has died', async () => {
    expect(await topups.fulfill(paid())).toEqual({ kind: 'delivered' });
    expect(credits).toEqual([{ characterId: 'heir-1', pack: expect.objectContaining({ packageId: 'owambe-pack', virtualAmount: 1_000_000 }), reference: REF }]);
  });

  it('credits a custom amount from what Flutterwave verified, at the stored rate', async () => {
    await topups.fulfill(paid({ subjectId: 'custom', amountKobo: 2_000_000, paidKobo: 2_000_000, topupRate: 500 }));
    expect(credits).toEqual([expect.objectContaining({ pack: { packageId: null, label: 'Custom top-up', ratePerNaira: 500, virtualAmount: 10_000_000 } })]);
  });

  it('refuses unknown packages, mismatched prices and rates that were not quoted', async () => {
    await expect(topups.fulfill(paid({ subjectId: 'free-money' }))).rejects.toMatchObject({ errorCode: 'TOPUP_UNDELIVERABLE' });
    await expect(topups.fulfill(paid({ amountKobo: 50_000 }))).rejects.toMatchObject({ errorCode: 'TOPUP_UNDELIVERABLE' });
    await expect(topups.fulfill(paid({ subjectId: 'custom', amountKobo: 100_000, paidKobo: 100_000, topupRate: 500 }))).rejects.toMatchObject({
      errorCode: 'TOPUP_UNDELIVERABLE',
    });
    expect(credits).toHaveLength(0);
  });

  it('claws back the coins of a delivered top-up refunded from the dashboard, as far as possible, and flags it', async () => {
    await topups.onRefunded(paid(), dashboardRefund());
    expect(clawbacks).toEqual([{ characterId: 'heir-1', amount: 1_000_000, reference: REF }]);
    expect(flags).toEqual(['Top-up refunded after delivery: clawed back ₦400,000 of ₦1,000,000 (₦600,000 already spent)']);
  });

  it('claws back only the refunded share of a partial refund, and nothing for an undelivered top-up', async () => {
    await topups.onRefunded(paid(), dashboardRefund({ amountKobo: 125_000 }));
    expect(clawbacks).toEqual([expect.objectContaining({ amount: 500_000 })]);
    clawbacks.splice(0);
    await topups.onRefunded(paid(), dashboardRefund({ delivered: false }));
    expect(clawbacks).toHaveLength(0);
    expect(flags.at(-1)).toMatch(/before delivery/);
  });
});

/** A character wallet with ledger-key idempotency, for the creditor (credit and clawback). */
function walletContext(startCash: number, startSavings: number) {
  const appliedKeys = new Set<string>();
  const state = { cash: startCash, savings: startSavings, purchasedTotal: 1_000_000, unearnedTotal: 1_500_000 };
  const notifications: string[] = [];
  const ctx = {
    manager: {},
    character: state,
    wallet: {
      get cash() {
        return state.cash;
      },
      receive: async (amount: number, _kind: string, _memo: string, key: string, options: { income: string }) => {
        expect(options.income).toBe('purchased');
        if (appliedKeys.has(key)) return;
        appliedKeys.add(key);
        state.cash += amount;
      },
      pay: async (amount: number, _kind: string, _memo: string, key: string, options: { sink?: string; account?: string }) => {
        expect(options.sink).toBe('topup');
        if (amount <= 0 || appliedKeys.has(key)) return;
        appliedKeys.add(key);
        if (options.account === 'savings') state.savings -= amount;
        else state.cash -= amount;
      },
    },
    notify: (draft: { title: string }) => notifications.push(draft.title),
  } as unknown as SimulationContext;
  const session = { run: async <T>(_ref: unknown, command: (context: SimulationContext) => Promise<T>) => command(ctx) } as unknown as CharacterSession;
  const ledger = { balances: async () => ({ cash: state.cash, savings: state.savings, pension: 0, usd: 0 }) } as unknown as LedgerService;
  return { creditor: new TopupCreditor(session, ledger), state, appliedKeys, notifications };
}

describe('TopupCreditor', () => {
  const pack: TopupDetailsDto = { packageId: 'jollof-pack', label: 'Jollof pack', ratePerNaira: 350, virtualAmount: 350_000 };

  it('credits a reference once and announces it once, even if delivered twice', async () => {
    const { creditor, state, appliedKeys, notifications } = walletContext(0, 0);
    await creditor.credit('char-1', pack, REF);
    await creditor.credit('char-1', pack, REF);
    expect(state.cash).toBe(350_000);
    expect([...appliedKeys]).toEqual([`topup:${REF}`]);
    expect(notifications).toEqual(['Payment confirmed ✓']);
  });

  it('claws back from cash then savings, never below zero, once per reference', async () => {
    const { creditor, state, notifications } = walletContext(100_000, 150_000);
    expect(await creditor.clawBack('char-1', pack, 350_000, REF)).toEqual({ taken: 250_000, shortfall: 100_000 });
    expect([state.cash, state.savings]).toEqual([0, 0]);
    expect(state.purchasedTotal).toBe(750_000);
    expect(notifications).toEqual(['Top-up reversed']);
    expect(await creditor.clawBack('char-1', pack, 350_000, REF)).toMatchObject({ taken: 0 });
  });
});
