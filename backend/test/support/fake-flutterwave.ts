/**
 * A fake Flutterwave v3 API for the gateway spec. The app runs its real `FlutterwaveClient` (a test secret key is
 * configured); every `fetch` to https://api.flutterwave.com/v3 is answered here, in the shapes the real API uses
 * (https://developer.flutterwave.com/v3.0/docs): hosted checkout, verify by id / by reference, refunds. Anything else
 * goes to the real network as usual.
 *
 * The test plays the customer (`pay`) and ops in the dashboard (`dashboardRefund`), and sends the webhooks itself.
 */
export const FAKE_FLUTTERWAVE_KEY = 'FLWSECK_TEST-e2efake0000000000-X';
const API = 'https://api.flutterwave.com/v3';

export interface FakeCheckout {
  readonly txRef: string;
  readonly amount: number;
  readonly currency: string;
  readonly redirectUrl: string;
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface FakeTransaction {
  readonly id: number;
  readonly tx_ref: string;
  readonly flw_ref: string;
  amount: number;
  charged_amount: number | null;
  readonly app_fee: number;
  currency: string;
  status: 'successful' | 'failed' | 'cancelled' | 'pending';
  readonly payment_type: string;
  readonly created_at: string;
}

export interface FakeRefund {
  readonly id: number;
  readonly tx_id: number;
  readonly amount_refunded: number;
  status: string;
  readonly comments: string;
  readonly created_at: string;
}

export interface PayOptions {
  /** Naira actually charged; defaults to the checkout amount. */
  readonly amount?: number;
  /** `charged_amount` (amount + fees passed to the customer); null leaves it out. Defaults to `amount`. */
  readonly chargedAmount?: number | null;
  readonly currency?: string;
  readonly status?: FakeTransaction['status'];
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const notFound = (): Response => json(400, { status: 'error', message: 'No transaction was found for this id', data: null });

export class FakeFlutterwave {
  readonly checkouts = new Map<string, FakeCheckout>();
  readonly transactions: FakeTransaction[] = [];
  readonly refunds: FakeRefund[] = [];
  /** Every API call the app made (method + path), for asserting what it asked Flutterwave to do. */
  readonly calls: Array<{ readonly method: string; readonly path: string; readonly body: unknown }> = [];
  /** What the next refund request is answered with (`completed`, `processing`, or a refusal). */
  refundBehaviour: 'completed' | 'processing' | 'refuse' = 'completed';
  /**
   * Ids are unique across spec files (Flutterwave's are global): BullMQ keeps processed webhook jobs, keyed by these
   * ids, for a day, so two fakes reusing ids would see each other's jobs as duplicates.
   */
  private nextId = Date.now() * 10;
  private original: typeof fetch | null = null;

  install(): void {
    this.original = globalThis.fetch;
    const passThrough = this.original;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.startsWith(API)) return passThrough(input, init);
      return this.handle(url.slice(API.length), init ?? {});
    }) as typeof fetch;
  }

  uninstall(): void {
    if (this.original) globalThis.fetch = this.original;
  }

  /** The customer pays on the hosted checkout (or the payment fails): Flutterwave now has a transaction. */
  pay(txRef: string, options: PayOptions = {}): FakeTransaction {
    const checkout = this.checkouts.get(txRef);
    if (!checkout) throw new RangeError(`No hosted checkout for ${txRef}`);
    const amount = options.amount ?? checkout.amount;
    const transaction: FakeTransaction = {
      id: this.id(),
      tx_ref: txRef,
      flw_ref: `FLW-MOCK-${txRef.slice(0, 8)}`,
      amount,
      charged_amount: options.chargedAmount === undefined ? amount : options.chargedAmount,
      app_fee: Math.round(amount * 0.014 * 100) / 100,
      currency: options.currency ?? checkout.currency,
      status: options.status ?? 'successful',
      payment_type: 'card',
      created_at: new Date().toISOString(),
    };
    this.transactions.push(transaction);
    return transaction;
  }

  /** Ops refund a transaction in the Flutterwave dashboard (no API call from the app). */
  dashboardRefund(transactionId: number, amountNaira: number, status = 'completed'): FakeRefund {
    const refund: FakeRefund = { id: this.id(), tx_id: transactionId, amount_refunded: amountNaira, status, comments: 'Dashboard refund', created_at: new Date().toISOString() };
    this.refunds.push(refund);
    return refund;
  }

  /** The `charge.completed` webhook body Flutterwave sends for a transaction. */
  chargeWebhook(transaction: FakeTransaction): object {
    return {
      event: 'charge.completed',
      data: { id: transaction.id, tx_ref: transaction.tx_ref, flw_ref: transaction.flw_ref, amount: transaction.amount, currency: transaction.currency, status: transaction.status },
    };
  }

  /** A refund webhook as Flutterwave sends it (the bare refund object, webhook casing). */
  refundWebhook(refund: FakeRefund): object {
    return { id: refund.id, AmountRefunded: refund.amount_refunded, status: refund.status, TransactionId: refund.tx_id, FlwRef: 'FLW-MOCK', comments: refund.comments };
  }

  callsTo(method: string, pathPrefix: string): number {
    return this.calls.filter((call) => call.method === method && call.path.startsWith(pathPrefix)).length;
  }

  private id(): number {
    this.nextId += 1;
    return this.nextId;
  }

  private async handle(path: string, init: RequestInit): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : null;
    this.calls.push({ method, path, body });
    const auth = new Headers(init.headers).get('authorization');
    if (auth !== `Bearer ${FAKE_FLUTTERWAVE_KEY}`) return json(401, { status: 'error', message: 'Invalid authorization key', data: null });

    const [route = '', query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    let match: RegExpMatchArray | null;

    if (method === 'POST' && route === '/payments') {
      const request = body as { tx_ref: string; amount: number; currency: string; redirect_url: string; meta: Record<string, unknown> };
      this.checkouts.set(request.tx_ref, { txRef: request.tx_ref, amount: request.amount, currency: request.currency, redirectUrl: request.redirect_url, meta: request.meta });
      return json(200, { status: 'success', message: 'Hosted Link', data: { link: `https://checkout.flutterwave.test/v3/hosted/pay/${request.tx_ref.slice(0, 12)}` } });
    }
    if (method === 'GET' && route === '/transactions/verify_by_reference') {
      const transaction = this.transactions.filter((candidate) => candidate.tx_ref === params.get('tx_ref')).at(-1);
      return transaction ? json(200, { status: 'success', message: 'Transaction fetched successfully', data: transaction }) : notFound();
    }
    if (method === 'GET' && (match = route.match(/^\/transactions\/(\d+)\/verify$/))) {
      const transaction = this.transactions.find((candidate) => candidate.id === Number(match![1]));
      return transaction ? json(200, { status: 'success', message: 'Transaction fetched successfully', data: transaction }) : notFound();
    }
    if (method === 'POST' && (match = route.match(/^\/transactions\/(\d+)\/refund$/))) {
      const transaction = this.transactions.find((candidate) => candidate.id === Number(match![1]));
      if (!transaction) return notFound();
      if (this.refundBehaviour === 'refuse') return json(400, { status: 'error', message: 'Refund not possible for this transaction', data: null });
      const requested = (body as { amount?: number } | null)?.amount ?? transaction.amount;
      const refund: FakeRefund = {
        id: this.id(),
        tx_id: transaction.id,
        amount_refunded: requested,
        status: this.refundBehaviour === 'completed' ? 'completed' : 'processing',
        comments: String((body as { comments?: string } | null)?.comments ?? ''),
        created_at: new Date().toISOString(),
      };
      this.refunds.push(refund);
      return json(200, { status: 'success', message: 'Transaction refund initiated', data: refund });
    }
    if (method === 'GET' && (match = route.match(/^\/refunds\/(\d+)$/))) {
      const refund = this.refunds.find((candidate) => candidate.id === Number(match![1]));
      return refund ? json(200, { status: 'success', message: 'Refund fetched', data: refund }) : json(404, { status: 'error', message: 'Refund not found', data: null });
    }
    if (method === 'GET' && route === '/refunds') {
      return json(200, { status: 'success', message: 'Refunds fetched', data: params.get('page') === '1' ? this.refunds : [] });
    }
    return json(404, { status: 'error', message: `Fake Flutterwave has no route ${method} ${route}`, data: null });
  }
}
