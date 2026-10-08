import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { TopupPackage } from '@insidelife/shared';
import type { CheckoutFulfiller, PaidCheckout } from '../../common/ports/checkout.port.js';
import type { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CharacterEntity } from '../characters/entities/character.entity.js';
import type { CharacterSession } from '../simulation/character-session.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { decideCharge } from './checkout-rules.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentEntity } from './entities/payment.entity.js';
import type { GatewayCharge, PaymentGateway } from './gateways/payment-gateway.interface.js';
import type { SandboxGateway } from './gateways/sandbox.gateway.js';
import { TopupCreditor } from './topup-creditor.service.js';
import { TopupsService } from './topups.service.js';

const REF = '7c2b1f0e-6a4d-4c51-9b7e-0d2f3a4b5c6d';
const USER = 'user-1';

/** In-memory payments table with commit semantics and a global lock standing in for `SELECT … FOR UPDATE`. */
class FakePayments {
  readonly rows = new Map<string, PaymentEntity>();
  private queue: Promise<unknown> = Promise.resolve();

  seed(overrides: Partial<PaymentEntity> = {}): void {
    const row = Object.assign(new PaymentEntity(), {
      id: 'p1',
      reference: REF,
      userId: USER,
      characterId: 'char-1',
      purpose: 'topup',
      subjectId: 'owambe-pack',
      description: 'Inside Life top-up: Owambe pack',
      amountKobo: 250_000,
      currency: 'NGN',
      provider: 'paystack',
      status: 'initialized',
      channel: null,
      gatewayResponse: null,
      failureReason: null,
      createdAt: new Date(),
      verifiedAt: null,
      fulfilledAt: null,
      fulfillmentAttempts: 0,
      lastFulfillmentError: null,
      ...overrides,
    });
    this.rows.set(row.reference, row);
  }

  read(reference: string): PaymentEntity | null {
    const row = this.rows.get(reference);
    return row ? Object.assign(new PaymentEntity(), row) : null;
  }

  readonly manager = {
    findOne: async (_entity: unknown, options: { where: { reference: string } }) => this.read(options.where.reference),
    save: async (payment: PaymentEntity) => {
      this.rows.set(payment.reference, Object.assign(new PaymentEntity(), payment));
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
    findOne: async (options: { where: { reference: string; userId?: string } }) => {
      const row = this.read(options.where.reference);
      return row && (!options.where.userId || row.userId === options.where.userId) ? row : null;
    },
    findOneOrFail: async (options: { where: { reference: string } }) => {
      const row = this.read(options.where.reference);
      if (!row) throw new RangeError('missing');
      return row;
    },
  } as unknown as Repository<PaymentEntity>;
}

const charge = (overrides: Partial<GatewayCharge> = {}): GatewayCharge => ({
  reference: REF,
  status: 'success',
  amountKobo: 250_000,
  currency: 'NGN',
  channel: 'card',
  paidAt: new Date(),
  details: { status: 'success' },
  ...overrides,
});

class CountingFulfiller implements CheckoutFulfiller {
  readonly purpose = 'topup' as const;
  readonly delivered: PaidCheckout[] = [];
  failuresLeft = 0;

  async fulfill(payment: PaidCheckout): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new RangeError('wallet temporarily unavailable');
    }
    this.delivered.push(payment);
  }
}

function setup(gatewayCharge: GatewayCharge | null = charge()): { payments: FakePayments; checkout: CheckoutService; fulfiller: CountingFulfiller } {
  const payments = new FakePayments();
  payments.seed();
  const gateway: PaymentGateway = {
    provider: 'paystack',
    initialize: async () => ({ authorizationUrl: 'https://checkout.paystack.com/x' }),
    verify: async () => gatewayCharge,
  };
  const checkout = new CheckoutService(payments.dataSource, payments.repository, gateway, {} as SandboxGateway);
  const fulfiller = new CountingFulfiller();
  checkout.registerFulfiller(fulfiller);
  return { payments, checkout, fulfiller };
}

describe('decideCharge', () => {
  const expected = { reference: REF, amountKobo: 250_000, currency: 'NGN', status: 'initialized' as const };

  it('records a matching success', () => {
    expect(decideCharge(expected, charge())).toEqual({ kind: 'record-success' });
  });

  it('refuses a success whose amount, currency or reference does not match', () => {
    expect(decideCharge(expected, charge({ amountKobo: 249_999 }))).toEqual({ kind: 'mismatch', reason: 'amount_mismatch' });
    expect(decideCharge(expected, charge({ currency: 'USD' }))).toEqual({ kind: 'mismatch', reason: 'currency_mismatch' });
    expect(decideCharge(expected, charge({ reference: 'other' }))).toEqual({ kind: 'mismatch', reason: 'reference_mismatch' });
  });

  it('never downgrades a confirmed payment', () => {
    expect(decideCharge({ ...expected, status: 'success' }, charge({ status: 'reversed' }))).toEqual({ kind: 'already-paid' });
  });

  it('maps pending, failed and abandoned charges', () => {
    expect(decideCharge(expected, charge({ status: 'pending' }))).toEqual({ kind: 'pending' });
    expect(decideCharge(expected, charge({ status: 'failed' }))).toMatchObject({ kind: 'not-paid', status: 'failed' });
    expect(decideCharge(expected, charge({ status: 'abandoned' }))).toMatchObject({ kind: 'not-paid', status: 'abandoned' });
    expect(decideCharge({ ...expected, status: 'failed' }, charge())).toEqual({ kind: 'record-success' });
  });
});

describe('CheckoutService delivery', () => {
  it('delivers exactly once when verify, webhook and a retry race', async () => {
    const { payments, checkout, fulfiller } = setup();
    const [, verified, , retried] = await Promise.all([checkout.handleCharge(charge()), checkout.verify(USER, REF), checkout.handleCharge(charge()), checkout.fulfill(REF)]);
    expect(fulfiller.delivered).toHaveLength(1);
    expect(verified.payment.fulfilledAt).toBeInstanceOf(Date);
    // Whichever trigger got the row lock first delivered; at most one of the reporting triggers can claim it.
    expect([verified.fulfilledNow, retried].filter(Boolean).length).toBeLessThanOrEqual(1);
    expect(fulfiller.delivered[0]).toMatchObject({ reference: REF, purpose: 'topup', subjectId: 'owambe-pack', amountKobo: 250_000 });
    const row = payments.read(REF);
    expect(row?.status).toBe('success');
    expect(row?.fulfilledAt).toBeInstanceOf(Date);
    // Later triggers are no-ops.
    expect(await checkout.fulfill(REF)).toBe(false);
    await checkout.handleCharge(charge());
    expect(fulfiller.delivered).toHaveLength(1);
  });

  it('never delivers when the charged amount differs from the price', async () => {
    const { payments, checkout, fulfiller } = setup(charge({ amountKobo: 50_000 }));
    const { payment, fulfilledNow } = await checkout.verify(USER, REF);
    expect(fulfilledNow).toBe(false);
    expect(payment.status).toBe('failed');
    expect(payments.read(REF)?.failureReason).toBe('amount_mismatch');
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
      },
    };
    checkout.registerFulfiller(billboard);
    expect(await checkout.fulfill(REF)).toBe(true);
    expect(billboard.count).toBe(1);
  });

  it('leaves a pending charge in flight and ignores unknown references', async () => {
    const { payments, checkout, fulfiller } = setup(charge({ status: 'pending' }));
    await checkout.verify(USER, REF);
    expect(payments.read(REF)?.status).toBe('initialized');
    expect(await checkout.handleCharge(charge({ reference: 'not-ours' }))).toBeNull();
    expect(fulfiller.delivered).toHaveLength(0);
  });

  it('refuses a second fulfiller for the same purpose', () => {
    const { checkout } = setup();
    expect(() => checkout.registerFulfiller(new CountingFulfiller())).toThrow(RangeError);
  });
});

describe('TopupsService fulfiller', () => {
  const credits: Array<{ characterId: string; pack: TopupPackage; reference: string }> = [];
  const creditor = { credit: async (characterId: string, pack: TopupPackage, reference: string) => void credits.push({ characterId, pack, reference }) };
  const characters = new Map<string, Pick<CharacterEntity, 'id' | 'alive' | 'userId'>>([
    ['char-1', { id: 'char-1', alive: false, userId: USER }],
    ['heir-1', { id: 'heir-1', alive: true, userId: USER }],
  ]);
  const directory = {
    findById: async (id: string) => characters.get(id) ?? null,
    findLivingByUser: async (userId: string) => [...characters.values()].find((c) => c.userId === userId && c.alive) ?? null,
  } as unknown as CharacterDirectory;
  const config = { get: () => ({ dailyLimitNgn: 20_000 }) };
  const topups = new TopupsService(
    { registerFulfiller: () => undefined } as unknown as CheckoutService,
    creditor as unknown as TopupCreditor,
    directory,
    {} as never,
    {} as never,
    {} as DataSource,
    config as never,
  );
  const paid = (overrides: Partial<PaidCheckout> = {}): PaidCheckout => ({
    reference: REF,
    userId: USER,
    characterId: 'char-1',
    purpose: 'topup',
    subjectId: 'owambe-pack',
    amountKobo: 250_000,
    paidAt: new Date(),
    ...overrides,
  });

  beforeEach(() => credits.splice(0));

  it('credits the package to the living heir when the paying character has died', async () => {
    await topups.fulfill(paid());
    expect(credits).toEqual([{ characterId: 'heir-1', pack: expect.objectContaining({ id: 'owambe-pack', virtualAmount: 1_000_000 }), reference: REF }]);
  });

  it('refuses unknown packages and mismatched prices', async () => {
    await expect(topups.fulfill(paid({ subjectId: 'free-money' }))).rejects.toMatchObject({ errorCode: 'TOPUP_PACKAGE_UNKNOWN' });
    await expect(topups.fulfill(paid({ amountKobo: 50_000 }))).rejects.toMatchObject({ errorCode: 'TOPUP_AMOUNT_MISMATCH' });
    expect(credits).toHaveLength(0);
  });
});

describe('TopupCreditor', () => {
  it('credits a reference once and announces it once, even if delivered twice', async () => {
    const appliedKeys = new Set<string>();
    let cash = 0;
    const notifications: string[] = [];
    const ctx = {
      wallet: {
        get cash() {
          return cash;
        },
        receive: async (amount: number, _kind: string, _memo: string, key: string, options: { income: string }) => {
          expect(options.income).toBe('purchased');
          if (appliedKeys.has(key)) return;
          appliedKeys.add(key);
          cash += amount;
        },
      },
      notify: (draft: { title: string }) => notifications.push(draft.title),
    } as unknown as SimulationContext;
    const session = { run: async <T>(_ref: unknown, command: (context: SimulationContext) => Promise<T>) => command(ctx) } as unknown as CharacterSession;
    const creditor = new TopupCreditor(session);
    const pack: TopupPackage = { id: 'jollof-pack', label: 'Jollof pack', blurb: '', priceNgn: 1_000, virtualAmount: 350_000 };

    await creditor.credit('char-1', pack, REF);
    await creditor.credit('char-1', pack, REF);
    expect(cash).toBe(350_000);
    expect([...appliedKeys]).toEqual([`topup:${REF}`]);
    expect(notifications).toEqual(['Payment confirmed ✓']);
  });
});
