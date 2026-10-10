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
import { claimRefund, decideCharge, nextCheckAt } from './checkout-rules.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentEntity } from './entities/payment.entity.js';
import { FlutterwaveWebhookService, InvalidWebhookSignatureException } from './flutterwave-webhook.service.js';
import type { GatewayCharge, GatewayRefund, GatewayRefundInput, GatewayRefundRecord, PaymentGateway } from './gateways/payment-gateway.interface.js';
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

/** Evaluates the TypeORM operators the payments code uses (IsNull, In, LessThan[OrEqual], MoreThan, And) against a value. */
function satisfies(actual: unknown, expected: unknown): boolean {
  if (!(expected instanceof FindOperator)) return actual === expected;
  const operand = expected.value as unknown;
  if (expected.type !== 'isNull' && (actual === null || actual === undefined)) return false;
  switch (expected.type) {
    case 'isNull':
      return actual === null || actual === undefined;
    case 'in':
      return (operand as unknown[]).includes(actual);
    case 'lessThan':
      return (actual as number | Date) < (operand as number | Date);
    case 'lessThanOrEqual':
      return (actual as number | Date) <= (operand as number | Date);
    case 'moreThan':
      return (actual as number | Date) > (operand as number | Date);
    case 'and':
      return (operand as unknown[]).every((part) => satisfies(actual, part));
    default:
      throw new RangeError(`Unsupported operator ${expected.type}`);
  }
}

const matches = (row: PaymentEntity, where: Row | Row[]): boolean =>
  Array.isArray(where) ? where.some((part) => matches(row, part)) : Object.entries(where).every(([key, value]) => satisfies((row as unknown as Row)[key], value));

type Order = Record<string, 'ASC' | 'DESC' | { direction: 'ASC' | 'DESC'; nulls?: 'FIRST' | 'LAST' }>;

/** A sortable column value (dates as epoch ms); null for null. */
function sortValue(row: PaymentEntity, key: string): number | null {
  const raw = (row as unknown as Row)[key];
  return raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw : null;
}

/** Sorts like Postgres: ascending puts nulls last unless asked otherwise. */
function ordered(rows: PaymentEntity[], order: Order | undefined): PaymentEntity[] {
  if (!order) return rows;
  const keys = Object.entries(order).map(([key, spec]) => (typeof spec === 'string' ? { key, desc: spec === 'DESC', nullsFirst: spec === 'DESC' } : { key, desc: spec.direction === 'DESC', nullsFirst: spec.nulls === 'FIRST' }));

  return rows.toSorted((a, b) => {
    for (const { key, desc, nullsFirst } of keys) {
      const [x, y] = [sortValue(a, key), sortValue(b, key)];
      if (x === y) continue;
      if (x === null) return nullsFirst ? -1 : 1;
      if (y === null) return nullsFirst ? 1 : -1;
      return desc ? y - x : x - y;
    }
    return 0;
  });
}

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
      checkAttempts: 0,
      lastCheckedAt: null,
      nextCheckAt: null,
      refundStatus: null,
      refundReason: null,
      refundedKobo: 0,
      refundId: null,
      refundGatewayStatus: null,
      refundUpdatedAt: null,
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
    find: async (options: { where: Row | Row[]; order?: Order; take?: number }) =>
      ordered(
        [...this.rows.values()].filter((row) => matches(row, options.where)),
        options.order,
      )
        .slice(0, options.take ?? 1_000)
        .map((row) => Object.assign(new PaymentEntity(), row)),
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
  chargedAmountKobo: 253_500,
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
  verifyError: Error | null = null;
  refundError: Error | null = null;
  refundStatus = 'completed';
  /** What `findRefund` / `fetchRefund` report (a refund the gateway has), or an error to throw. */
  knownRefund: GatewayRefundRecord | null = null;
  lookupError: Error | null = null;
  readonly verifiedReferences: string[] = [];
  readonly verifiedTransactions: string[] = [];
  readonly refunds: GatewayRefundInput[] = [];
  readonly refundLookups: string[] = [];

  async findRefund(transactionId: string): Promise<GatewayRefundRecord | null> {
    this.refundLookups.push(transactionId);
    if (this.lookupError) throw this.lookupError;
    return this.knownRefund;
  }

  async fetchRefund(refundId: string): Promise<GatewayRefundRecord | null> {
    this.refundLookups.push(refundId);
    if (this.lookupError) throw this.lookupError;
    return this.knownRefund?.refundId === refundId ? this.knownRefund : null;
  }

  async initialize(): Promise<{ readonly authorizationUrl: string }> {
    return { authorizationUrl: 'https://checkout.flutterwave.com/v3/hosted/pay/x' };
  }

  async verify(reference: string): Promise<GatewayCharge | null> {
    this.verifiedReferences.push(reference);
    if (this.verifyError) throw this.verifyError;
    return this.byReference ? { ...this.byReference, reference: this.byReference.reference === REF ? reference : this.byReference.reference } : null;
  }

  async verifyTransaction(transactionId: string): Promise<GatewayCharge | null> {
    this.verifiedTransactions.push(transactionId);
    return this.byTransaction;
  }

  async refund(input: GatewayRefundInput): Promise<GatewayRefund> {
    await new Promise((resolve) => setTimeout(resolve, 2));
    this.refunds.push(input);
    if (this.refundError) throw this.refundError;
    return { refundId: `75923${this.refunds.length}`, amountKobo: input.amountKobo ?? 250_000, status: this.refundStatus };
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

  readonly refundFailures: Array<{ refundId: string; wasCompleted: boolean }> = [];

  async onRefunded(_payment: PaidCheckout, refund: CheckoutRefund): Promise<void> {
    this.refunded.push(refund);
  }

  async onRefundFailed(_payment: PaidCheckout, refund: CheckoutRefund, wasCompleted: boolean): Promise<void> {
    this.refundFailures.push({ refundId: refund.refundId, wasCompleted });
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

  it('also requires charged_amount ≥ the price (and refuses a charge that doesn’t say what was charged)', () => {
    expect(decideCharge(expected, charge({ chargedAmountKobo: 250_000 }))).toEqual({ kind: 'record-success' });
    expect(decideCharge(expected, charge({ chargedAmountKobo: 249_999 }))).toEqual({ kind: 'mismatch', reason: 'amount_mismatch' });
    expect(decideCharge(expected, charge({ chargedAmountKobo: null }))).toEqual({ kind: 'mismatch', reason: 'amount_mismatch' });
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
    expect(claimRefund({ status: 'success', refundStatus: 'pending' })).toEqual({ kind: 'in-flight' });
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
    const reported = { refundId: '99025', transactionId: TX, amountKobo: 250_000, status: 'completed' };
    const results = await Promise.all([checkout.recordGatewayRefund(reported), checkout.recordGatewayRefund(reported), checkout.recordGatewayRefund(reported)]);
    expect(results.toSorted()).toEqual(['duplicate', 'duplicate', 'recorded']);
    expect(payments.read(REF)).toMatchObject({ refundStatus: 'refunded', refundId: '99025', refundedKobo: 250_000, refundReason: 'Refunded in the Flutterwave dashboard' });
    expect(fulfiller.refunded).toEqual([expect.objectContaining({ source: 'dashboard', delivered: true })]);
  });

  it('finds the payment of a refunded transaction through the gateway and cancels its delivery if it was not delivered yet', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.seed({ status: 'success', gatewayTransactionId: null });
    gateway.byTransaction = charge();
    expect(await checkout.recordGatewayRefund({ refundId: '1', transactionId: TX, amountKobo: 250_000, status: 'completed' })).toBe('recorded');
    expect(fulfiller.refunded).toEqual([expect.objectContaining({ delivered: false })]);
    expect(await checkout.fulfill(REF)).toBe(false);
    expect(fulfiller.delivered).toHaveLength(0);
    expect(payments.read(REF)?.lastFulfillmentError).toMatch(/Refunded before delivery/);
    gateway.byTransaction = null;
    expect(await checkout.recordGatewayRefund({ refundId: '2', transactionId: '777', amountKobo: 1, status: 'completed' })).toBe('unknown');
  });
});

/** A refund of the default payment as a webhook reports it. */
const refundReport = (refundId: string, status: string) => ({ refundId, transactionId: TX, amountKobo: 250_000, status });

describe('refund states (only completed is final)', () => {
  const paidRow = { status: 'success' as const, fulfilledAt: new Date(), gatewayTransactionId: TX, paidKobo: 250_000 };

  it('records our refund as pending while Flutterwave processes it, and settles it once when it completes', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.seed(paidRow);
    gateway.refundStatus = 'processing';
    expect(await checkout.refund(REF, 'Not approved in review')).toEqual({ kind: 'pending', refundId: '759231' });
    expect(payments.read(REF)).toMatchObject({ refundStatus: 'pending', refundGatewayStatus: 'processing', refundedKobo: 0 });
    expect(fulfiller.refunded).toHaveLength(0);
    // A second request doesn't send another refund.
    expect(await checkout.refund(REF, 'again')).toEqual({ kind: 'pending', refundId: '759231' });
    expect(gateway.refunds).toHaveLength(1);
    // The completion webhook for the same refund id is a status change, not a duplicate.
    const completed = { refundId: '759231', transactionId: TX, amountKobo: 250_000, status: 'completed' };
    expect(await checkout.recordGatewayRefund(completed)).toBe('recorded');
    expect(await checkout.recordGatewayRefund(completed)).toBe('duplicate');
    expect(payments.read(REF)).toMatchObject({ refundStatus: 'refunded', refundedKobo: 250_000, refundGatewayStatus: 'completed' });
    expect(fulfiller.refunded).toEqual([expect.objectContaining({ refundId: '759231', source: 'api' })]);
  });

  it('reverts a refund Flutterwave later reports failed, and tells the purpose to undo its settlement', async () => {
    const { payments, checkout, fulfiller } = setup();
    payments.seed(paidRow);
    expect(await checkout.recordGatewayRefund(refundReport('880', 'completed'))).toBe('recorded');
    expect(await checkout.recordGatewayRefund(refundReport('880', 'failed'))).toBe('recorded');
    expect(payments.read(REF)).toMatchObject({ refundStatus: 'failed', refundedKobo: 0, refundGatewayStatus: 'failed', refundFailure: expect.stringMatching(/by hand/) });
    expect(fulfiller.refundFailures).toEqual([{ refundId: '880', wasCompleted: true }]);
    // Completing after all settles it again (the purpose's clawback keys stop a second take).
    expect(await checkout.recordGatewayRefund(refundReport('880', 'completed'))).toBe('recorded');
    expect(fulfiller.refunded.map((refund) => refund.refundId)).toEqual(['880', '880']);
  });

  it('treats a failure of a refund still processing as failed, without a settlement to undo', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.seed(paidRow);
    gateway.refundStatus = 'pending';
    await checkout.refund(REF, 'Not approved');
    expect(await checkout.recordGatewayRefund({ refundId: '759231', transactionId: TX, amountKobo: 250_000, status: 'failed' })).toBe('recorded');
    expect(payments.read(REF)?.refundStatus).toBe('failed');
    expect(fulfiller.refundFailures).toEqual([{ refundId: '759231', wasCompleted: false }]);
    expect(fulfiller.refunded).toHaveLength(0);
  });

  it('records a second partial refund as more money back', async () => {
    const { payments, checkout, fulfiller } = setup();
    payments.seed(paidRow);
    await checkout.recordGatewayRefund({ refundId: '1', transactionId: TX, amountKobo: 100_000, status: 'completed' });
    await checkout.recordGatewayRefund({ refundId: '2', transactionId: TX, amountKobo: 100_000, status: 'completed-mpgs' });
    expect(payments.read(REF)).toMatchObject({ refundStatus: 'refunded', refundId: '2', refundedKobo: 200_000 });
    expect(fulfiller.refunded.map((refund) => [refund.refundId, refund.amountKobo])).toEqual([
      ['1', 100_000],
      ['2', 100_000],
    ]);
  });

  it('re-checks with Flutterwave when the refund call errors: a refund it has is recorded, none is a failure', async () => {
    const { payments, gateway, checkout } = setup();
    payments.seed(paidRow);
    gateway.refundError = new RangeError('timeout');
    gateway.knownRefund = { refundId: '4242', amountKobo: 250_000, status: 'completed', transactionId: TX };
    expect(await checkout.refund(REF, 'Not approved')).toMatchObject({ kind: 'refunded', refund: { refundId: '4242' } });
    expect(gateway.refundLookups).toEqual([TX]);

    payments.seed({ ...paidRow, reference: 'ref-2', gatewayTransactionId: '999' });
    gateway.knownRefund = null;
    expect(await checkout.refund('ref-2', 'Not approved')).toMatchObject({ kind: 'failed', reason: 'timeout' });
    expect(payments.read('ref-2')?.refundStatus).toBe('failed');
  });

  it('leaves a claim in sending when Flutterwave can’t be asked, and the reconciler resolves it later', async () => {
    const { payments, gateway, checkout } = setup();
    payments.seed(paidRow);
    gateway.refundError = new RangeError('timeout');
    gateway.lookupError = new RangeError('flutterwave down');
    expect(await checkout.refund(REF, 'Not approved')).toEqual({ kind: 'in-progress' });
    expect(payments.read(REF)?.refundStatus).toBe('sending');

    const later = new Date(Date.now() + 10 * 60_000);
    // Still can't ask: the claim stays (and goes to the back of the line).
    expect(await checkout.resolveStaleRefunds(later, 5 * 60_000, 20)).toBe(1);
    expect(payments.read(REF)?.refundStatus).toBe('sending');
    // Flutterwave has it: recorded.
    gateway.lookupError = null;
    gateway.knownRefund = { refundId: '5150', amountKobo: 250_000, status: 'processing', transactionId: TX };
    await checkout.resolveStaleRefunds(new Date(later.getTime() + 10 * 60_000), 5 * 60_000, 20);
    expect(payments.read(REF)).toMatchObject({ refundStatus: 'pending', refundId: '5150' });
  });

  it('owes a refund again when an interrupted claim never reached Flutterwave', async () => {
    const { payments, gateway, checkout } = setup();
    payments.seed({ ...paidRow, refundStatus: 'sending', refundUpdatedAt: new Date(Date.now() - 60 * 60_000), refundReason: 'Sold out' });
    gateway.knownRefund = null;
    await checkout.resolveStaleRefunds(new Date(), 5 * 60_000, 20);
    expect(payments.read(REF)?.refundStatus).toBe('due');
    await checkout.sendDueRefunds(20);
    expect(gateway.refunds).toHaveLength(1);
    expect(payments.read(REF)?.refundStatus).toBe('refunded');
  });

  it('re-reads refunds still processing, so a lost completion webhook can’t strand them', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.seed({ ...paidRow, refundStatus: 'pending', refundId: '6060', refundReason: 'Not approved', refundUpdatedAt: new Date(Date.now() - 60 * 60_000) });
    gateway.knownRefund = { refundId: '6060', amountKobo: 250_000, status: 'completed', transactionId: TX };
    await checkout.refreshPendingRefunds(new Date(), 30 * 60_000, 20);
    expect(payments.read(REF)?.refundStatus).toBe('refunded');
    expect(fulfiller.refunded).toEqual([expect.objectContaining({ refundId: '6060', source: 'api' })]);
  });

  it('holds delivery while a refund is processing', async () => {
    const { payments, checkout, fulfiller } = setup();
    payments.seed({ status: 'success', refundStatus: 'pending', refundId: '1' });
    expect(await checkout.fulfill(REF)).toBe(false);
    expect(fulfiller.delivered).toHaveLength(0);
    expect(payments.read(REF)?.nextCheckAt).toBeInstanceOf(Date);
  });

  it('retries (throws) a refund webhook that arrives before its charge is verified', async () => {
    const { payments, gateway, checkout } = setup();
    // Flutterwave still reports the charge pending, so it can't be verified yet.
    gateway.byTransaction = charge({ status: 'pending' });
    const processor = new PaymentsEventsProcessor(checkout);
    await expect(
      processor.process({ name: 'refund', data: { refundId: '77', transactionId: TX, amountKobo: 250_000, status: 'completed' } } as never),
    ).rejects.toMatchObject({ errorCode: 'REFUND_BEFORE_CHARGE' });
    expect(payments.read(REF)?.refundStatus).toBeNull();
    // Once the charge is successful, the retry verifies it first and records the refund.
    gateway.byTransaction = charge();
    expect(await processor.process({ name: 'refund', data: { refundId: '77', transactionId: TX, amountKobo: 250_000, status: 'completed' } } as never)).toBe('recorded');
    expect(payments.read(REF)).toMatchObject({ status: 'success', refundStatus: 'refunded' });
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
    expect([...queue.jobs.entries()]).toEqual([
      ['refund-99025-completed', { name: 'refund', data: { refundId: '99025', transactionId: TX, amountKobo: 250_000, status: 'completed' } }],
    ]);
    const processor = new PaymentsEventsProcessor(checkout);
    expect(await processor.process({ name: 'refund', data: queue.jobs.get('refund-99025-completed')?.data } as never)).toBe('recorded');
    expect(await processor.process({ name: 'refund', data: queue.jobs.get('refund-99025-completed')?.data } as never)).toBe('duplicate');
    expect(fulfiller.refunded).toHaveLength(1);
    // A later status of the same refund is a new job, not dropped as a duplicate delivery.
    await webhooks.accept({ ...refund, status: 'failed' });
    expect([...queue.jobs.keys()]).toEqual(['refund-99025-completed', 'refund-99025-failed']);
  });

  it('retries a charge job while Flutterwave still says pending, instead of completing it', async () => {
    const { gateway, checkout, fulfiller } = setup();
    gateway.byTransaction = charge({ status: 'pending' });
    const processor = new PaymentsEventsProcessor(checkout);
    await expect(processor.process({ name: 'charge', data: { transactionId: TX } } as never)).rejects.toMatchObject({ errorCode: 'CHARGE_PENDING' });
    gateway.byTransaction = charge();
    expect(await processor.process({ name: 'charge', data: { transactionId: TX } } as never)).toBe('record-success');
    expect(fulfiller.delivered).toHaveLength(1);
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

/** `minutes` after `date`. */
const at = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60_000);

describe('CheckoutReconciler', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const minutesAgo = (minutes: number): Date => new Date(now.getTime() - minutes * 60_000);
  /** A checkout started `age` minutes ago, scheduled like `start()` does (first check 10 minutes in). */
  const checkoutRow = (reference: string, age: number, extra: Partial<PaymentEntity> = {}): Partial<PaymentEntity> => ({
    reference,
    createdAt: minutesAgo(age),
    nextCheckAt: at(minutesAgo(age), 10),
    ...extra,
  });

  it('checks due checkouts with the gateway, sends owed refunds and expires day-old ones after a last check', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.rows.clear();
    payments.seed(checkoutRow('fresh', 5));
    payments.seed(checkoutRow('stale', 15));
    payments.seed(checkoutRow('ancient', 25 * 60, { checkAttempts: 5, nextCheckAt: null }));
    payments.seed({ reference: 'owed', status: 'success', fulfilledAt: minutesAgo(30), refundStatus: 'due', refundReason: 'Sold out', gatewayTransactionId: '1', createdAt: minutesAgo(30) });
    gateway.byReference = charge({ reference: 'stale' });

    await new CheckoutReconciler(checkout, payments.repository).sweep(now);

    // The day-old one gets one last check before being abandoned.
    expect(gateway.verifiedReferences.toSorted()).toEqual(['ancient', 'stale']);
    expect(payments.read('stale')).toMatchObject({ status: 'success' });
    expect(fulfiller.delivered.map((paid) => paid.reference)).toEqual(['stale']);
    expect(payments.read('fresh')?.status).toBe('initialized');
    expect(payments.read('ancient')).toMatchObject({ status: 'abandoned', failureReason: 'checkout_expired' });
    expect(gateway.refunds.map((refund) => refund.reference)).toEqual(['owed']);
    expect(payments.read('owed')?.refundStatus).toBe('refunded');
  });

  it('delivers a day-old checkout that turns out to be paid at its last check, instead of abandoning it', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.rows.clear();
    payments.seed(checkoutRow('late', 24 * 60 + 5, { checkAttempts: 5, nextCheckAt: null }));
    gateway.byReference = charge({ reference: 'late' });
    await new CheckoutReconciler(checkout, payments.repository).sweep(now);
    expect(payments.read('late')?.status).toBe('success');
    expect(fulfiller.delivered.map((paid) => paid.reference)).toEqual(['late']);
  });

  it('backs unpaid checkouts off (10 min, 30 min, 2 h, 6 h, 23 h) so a paid one with a lost webhook is reached at once', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.rows.clear();
    // 40 old unpaid checkouts, all due, older than the paid one: the old code re-checked these 20 oldest forever.
    for (let index = 0; index < 40; index++) payments.seed(checkoutRow(`unpaid-${index}`, 60 + index));
    payments.seed(checkoutRow('paid', 20));
    gateway.byReference = null; // "no transaction found" for the unpaid ones
    const reconciler = new CheckoutReconciler(checkout, payments.repository);

    await reconciler.sweep(now);
    await reconciler.sweep(at(now, 2));
    gateway.byReference = charge({ reference: 'paid' });
    await reconciler.sweep(at(now, 4));

    expect(fulfiller.delivered.map((paid) => paid.reference)).toEqual(['paid']);
    const first = payments.read('unpaid-0');
    expect(first).toMatchObject({ status: 'initialized', checkAttempts: 1 });
    // Next look at 30 minutes after it started (already past), so at least a minute from the check.
    expect(first?.lastCheckedAt).toEqual(expect.any(Date));
    expect(first?.nextCheckAt?.getTime()).toBeGreaterThan(now.getTime());
  });

  it('follows the check schedule by age and stops after the fifth check', () => {
    const created = new Date('2026-10-09T00:00:00Z');
    expect([0, 1, 2, 3, 4, 5].map((attempts) => nextCheckAt(created, attempts)?.toISOString().slice(11, 16) ?? null)).toEqual([
      '00:10',
      '00:30',
      '02:00',
      '06:00',
      '23:00',
      null,
    ]);
  });

  it('re-checks failed checkouts within the day (a mismatched or failed attempt may still be paid)', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.rows.clear();
    payments.seed(checkoutRow('retried', 45, { status: 'failed', failureReason: 'charge_failed' }));
    payments.seed(checkoutRow('never-started', 45, { status: 'failed', failureReason: 'initialize_failed', nextCheckAt: null }));
    gateway.byReference = charge({ reference: 'retried' });
    await new CheckoutReconciler(checkout, payments.repository).sweep(now);
    expect(gateway.verifiedReferences).toEqual(['retried']);
    expect(fulfiller.delivered.map((paid) => paid.reference)).toEqual(['retried']);
  });

  it('doesn’t use up a scheduled check when the gateway can’t be asked', async () => {
    const { payments, gateway, checkout } = setup();
    payments.rows.clear();
    payments.seed(checkoutRow('flaky', 15));
    gateway.verifyError = new RangeError('flutterwave down');
    await new CheckoutReconciler(checkout, payments.repository).sweep(now);
    expect(payments.read('flaky')).toMatchObject({ status: 'initialized', checkAttempts: 0, nextCheckAt: at(now, 10) });
  });

  it('backs off deliveries that keep failing, so they can’t block other payments', async () => {
    const { payments, checkout, fulfiller } = setup();
    payments.rows.clear();
    for (let index = 0; index < 25; index++) payments.seed({ reference: `stuck-${index}`, status: 'success', createdAt: minutesAgo(90 + index) });
    payments.seed({ reference: 'healthy', status: 'success', createdAt: minutesAgo(30) });
    fulfiller.failuresLeft = 25; // the 25 oldest fail (no living character…)
    const reconciler = new CheckoutReconciler(checkout, payments.repository);
    await reconciler.sweep(now);
    await reconciler.sweep(at(now, 0.5));
    expect(fulfiller.delivered.map((paid) => paid.reference)).toEqual(['healthy']);
    // The oldest failed in the first sweep: next try a minute later, not on every sweep.
    expect(payments.read('stuck-24')).toMatchObject({ fulfillmentAttempts: 1, nextCheckAt: at(now, 1) });
  });

  it('never touches rows of another provider (old Paystack rows)', async () => {
    const { payments, gateway, checkout, fulfiller } = setup();
    payments.rows.clear();
    payments.seed(checkoutRow('paystack-new', 30, { provider: 'paystack' as never }));
    payments.seed(checkoutRow('paystack-old', 30 * 60, { provider: 'paystack' as never }));
    payments.seed({ reference: 'paystack-owed', provider: 'paystack' as never, status: 'success', fulfilledAt: new Date(), refundStatus: 'due' });
    await new CheckoutReconciler(checkout, payments.repository).sweep(now);
    expect(gateway.verifiedReferences).toEqual([]);
    expect(gateway.refunds).toEqual([]);
    expect(fulfiller.delivered).toEqual([]);
    expect(payments.read('paystack-old')?.status).toBe('initialized');
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
    // Top-ups made before custom amounts have no stored rate: the pack's, if the pack still matches what was charged.
    expect(topupCredit({ subjectId: 'big-boy-pack', amountKobo: 500_000, paidKobo: 500_000, topupRate: null })).toMatchObject({ ok: true, credit: { virtualAmount: 2_200_000, ratePerNaira: 440 } });
    expect(topupCredit({ subjectId: 'big-boy-pack', amountKobo: 50_000, paidKobo: 50_000, topupRate: null })).toMatchObject({ ok: false });
    expect(topupCredit({ subjectId: 'free-money', amountKobo: 50_000, paidKobo: 50_000, topupRate: null })).toMatchObject({ ok: false });
  });

  it('trusts the rate stored at checkout even after packs or tiers change, within sane bounds', () => {
    // Quoted at 550 per ₦1 on a day the tiers were more generous: today's 440 doesn't strand it.
    expect(topupCredit({ subjectId: 'custom', amountKobo: 700_000, paidKobo: 700_000, topupRate: 550 })).toMatchObject({ ok: true, credit: { virtualAmount: 3_850_000 } });
    // A pack that has since been renamed or retired still credits, with a generic label.
    expect(topupCredit({ subjectId: 'retired-pack', amountKobo: 300_000, paidKobo: 300_000, topupRate: 380 })).toMatchObject({ ok: true, credit: { label: 'Top-up', virtualAmount: 1_140_000 } });
    for (const rate of [0, -5, 2_001, 1.5]) expect(topupCredit({ subjectId: 'custom', amountKobo: 700_000, paidKobo: 700_000, topupRate: rate }), String(rate)).toMatchObject({ ok: false });
    expect(topupCredit({ subjectId: 'custom', amountKobo: 700_000, paidKobo: 700_000, topupRate: 2_000 }).ok).toBe(true);
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
  const clawbacks: Array<{ characterId: string; amount: number; reference: string; refundId: string }> = [];
  const flags: string[] = [];
  const creditor = {
    credit: async (characterId: string, pack: TopupDetailsDto, reference: string) => void credits.push({ characterId, pack, reference }),
    clawBack: async (characterId: string, _pack: TopupDetailsDto, amount: number, reference: string, refundId: string) => {
      clawbacks.push({ characterId, amount, reference, refundId });
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

  it('refuses rows with no usable rate (unknown legacy pack, mismatched legacy price, insane stored rate)', async () => {
    await expect(topups.fulfill(paid({ subjectId: 'free-money', topupRate: null }))).rejects.toMatchObject({ errorCode: 'TOPUP_UNDELIVERABLE' });
    await expect(topups.fulfill(paid({ amountKobo: 50_000, topupRate: null }))).rejects.toMatchObject({ errorCode: 'TOPUP_UNDELIVERABLE' });
    await expect(topups.fulfill(paid({ subjectId: 'custom', amountKobo: 100_000, paidKobo: 100_000, topupRate: 50_000 }))).rejects.toMatchObject({
      errorCode: 'TOPUP_UNDELIVERABLE',
    });
    expect(credits).toHaveLength(0);
  });

  it('claws back the coins of a delivered top-up refunded from the dashboard, as far as possible, and flags it', async () => {
    await topups.onRefunded(paid(), dashboardRefund());
    expect(clawbacks).toEqual([{ characterId: 'heir-1', amount: 1_000_000, reference: REF, refundId: '9' }]);
    expect(flags).toEqual(['Top-up refunded after delivery (refund 9): clawed back ₦400,000 of ₦1,000,000 (₦600,000 already spent)']);
  });

  it('flags a refund that failed after the coins were taken back', async () => {
    await topups.onRefundFailed(paid(), dashboardRefund(), true);
    expect(flags).toEqual([expect.stringMatching(/Refund 9 failed after the coins were taken back/)]);
    await topups.onRefundFailed(paid(), dashboardRefund(), false);
    expect(flags).toHaveLength(1);
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
  const state = { cash: startCash, savings: startSavings, purchasedTotal: 1_000_000, unearnedTotal: 1_500_000, debt: 0 };
  const notifications: string[] = [];
  // character_debts: one row per (reference, refund id), like its unique index.
  const debts = new Map<string, number>();
  const ctx = {
    manager: {
      query: async (_sql: string, [, reference, refundId, amount]: [string, string, string, number]) => {
        if (debts.has(`${reference}|${refundId}`)) return [];
        debts.set(`${reference}|${refundId}`, amount);
        return [{ id: `debt-${debts.size}` }];
      },
    },
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
  return { creditor: new TopupCreditor(session, ledger), state, appliedKeys, notifications, debts };
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

  it('claws back from cash then savings, never below zero, once per refund', async () => {
    const { creditor, state, notifications } = walletContext(100_000, 150_000);
    expect(await creditor.clawBack('char-1', pack, 350_000, REF, 'rf-1')).toEqual({ taken: 250_000, shortfall: 100_000 });
    expect([state.cash, state.savings]).toEqual([0, 0]);
    expect(state.purchasedTotal).toBe(750_000);
    expect(notifications).toEqual(['You owe money from a refunded top-up', 'Top-up reversed']);
    expect(await creditor.clawBack('char-1', pack, 350_000, REF, 'rf-1')).toMatchObject({ taken: 0 });
  });

  it('records what could not be taken back as a debt, once per refund', async () => {
    const { creditor, state, debts, notifications } = walletContext(100_000, 0);
    await creditor.clawBack('char-1', pack, 350_000, REF, 'rf-1');
    expect(state.debt).toBe(250_000);
    expect([...debts.values()]).toEqual([250_000]);
    // The same refund reported again adds nothing; a fully covered refund owes nothing.
    await creditor.clawBack('char-1', pack, 350_000, REF, 'rf-1');
    expect(state.debt).toBe(250_000);
    expect(notifications.filter((title) => title.startsWith('You owe'))).toHaveLength(1);
    const covered = walletContext(350_000, 0);
    await covered.creditor.clawBack('char-1', pack, 350_000, REF, 'rf-2');
    expect([covered.state.debt, covered.debts.size]).toEqual([0, 0]);
  });

  it('takes each partial refund’s share: a second refund id claws back again, the same one never twice', async () => {
    const { creditor, state, appliedKeys } = walletContext(350_000, 0);
    expect(await creditor.clawBack('char-1', pack, 175_000, REF, 'rf-1')).toMatchObject({ taken: 175_000 });
    expect(await creditor.clawBack('char-1', pack, 175_000, REF, 'rf-2')).toMatchObject({ taken: 175_000 });
    expect(await creditor.clawBack('char-1', pack, 175_000, REF, 'rf-2')).toMatchObject({ taken: 0 });
    expect(state.cash).toBe(0);
    expect([...appliedKeys]).toEqual([`topup-clawback:${REF}:rf-1`, `topup-clawback:${REF}:rf-2`]);
  });
});
