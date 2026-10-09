import { isValidWebhookHash } from './flutterwave-webhook-hash.js';
import { FlutterwaveClient } from './gateways/flutterwave.client.js';
import { nairaToKoboAmount, parseRefund, parseTransaction, parseWebhook } from './gateways/flutterwave.parsers.js';

const SECRET_HASH = '3f9c2a7be1d04c58a6f2e9b17d3c5a80f4e6b2d19a7c3e5f8b0d2a4c6e8f1a3b';
const SECRET_KEY = 'FLWSECK_TEST-0a1b2c3d4e5f60718293a4b5c6d7e8f9-X';

/** A `GET /v3/transactions/:id/verify` body as Flutterwave documents it (card details trimmed). */
const verified = {
  status: 'success',
  message: 'Transaction fetched successfully',
  data: {
    id: 9_231_836,
    tx_ref: '7c2b1f0e-6a4d-4c51-9b7e-0d2f3a4b5c6d',
    flw_ref: 'FLW-MOCK-c1d2e3',
    amount: 2_500,
    currency: 'NGN',
    charged_amount: 2_500,
    app_fee: 35,
    merchant_fee: 0,
    processor_response: 'Approved by Financial Institution',
    status: 'successful',
    payment_type: 'card',
    created_at: '2026-10-09T11:02:03.000Z',
    amount_settled: 2_465,
    card: { first_6digits: '553188', last_4digits: '2950', issuer: 'MASTERCARD CREDIT', country: 'NG', type: 'MASTERCARD', token: 'flw-t1nf-secret', expiry: '09/32' },
    customer: { id: 1, name: '@ada', phone_number: '08012345678', email: 'ada@example.com' },
  },
};

describe('Flutterwave webhook hash (verif-hash)', () => {
  it('accepts exactly the configured secret hash', () => {
    expect(isValidWebhookHash(SECRET_HASH, SECRET_HASH)).toBe(true);
  });

  it('refuses wrong, partial, padded, case-changed, repeated or missing headers', () => {
    expect(isValidWebhookHash('wrong', SECRET_HASH)).toBe(false);
    expect(isValidWebhookHash(SECRET_HASH.slice(0, 32), SECRET_HASH)).toBe(false);
    expect(isValidWebhookHash(` ${SECRET_HASH}`, SECRET_HASH)).toBe(false);
    expect(isValidWebhookHash(SECRET_HASH.toUpperCase(), SECRET_HASH)).toBe(false);
    expect(isValidWebhookHash([SECRET_HASH], SECRET_HASH)).toBe(false);
    expect(isValidWebhookHash(undefined, SECRET_HASH)).toBe(false);
    expect(isValidWebhookHash('', SECRET_HASH)).toBe(false);
  });

  it('refuses everything when no hash is configured', () => {
    expect(isValidWebhookHash('', '')).toBe(false);
    expect(isValidWebhookHash('anything', '')).toBe(false);
  });
});

describe('Flutterwave parsers', () => {
  it('turns naira into kobo and refuses nonsense', () => {
    expect(nairaToKoboAmount(2_500)).toBe(250_000);
    expect(nairaToKoboAmount(100.5)).toBe(10_050);
    expect(nairaToKoboAmount(-1)).toBeNull();
    expect(nairaToKoboAmount('2500')).toBeNull();
    expect(nairaToKoboAmount(Number.NaN)).toBeNull();
  });

  it('reads a verified transaction, keeping no card digits, tokens or customer contact', () => {
    const charge = parseTransaction(verified.data);
    expect(charge).toMatchObject({ reference: verified.data.tx_ref, transactionId: '9231836', status: 'success', amountKobo: 250_000, currency: 'NGN', channel: 'card' });
    const audit = JSON.stringify(charge?.details);
    for (const secret of ['553188', '2950', 'flw-t1nf-secret', 'ada@example.com', '08012345678']) expect(audit).not.toContain(secret);
  });

  it('maps statuses and refuses transactions without a reference or amount', () => {
    expect(parseTransaction({ ...verified.data, status: 'failed' })?.status).toBe('failed');
    expect(parseTransaction({ ...verified.data, status: 'cancelled' })?.status).toBe('abandoned');
    expect(parseTransaction({ ...verified.data, status: 'pending' })?.status).toBe('pending');
    expect(parseTransaction({ ...verified.data, tx_ref: undefined })).toBeNull();
    expect(parseTransaction({ ...verified.data, amount: '2500' })).toBeNull();
  });

  it('reads charge.completed, refund webhooks (wrapped or bare) and ignores the rest', () => {
    expect(parseWebhook({ event: 'charge.completed', data: verified.data })).toEqual({ kind: 'charge', transactionId: '9231836', reference: verified.data.tx_ref });
    const bare = { id: 99_025, AmountRefunded: 100, status: 'completed', FlwRef: '4687213286', destination: 'payment_source', TransactionId: 9_231_836 };
    expect(parseWebhook(bare)).toEqual({ kind: 'refund', refund: { refundId: '99025', amountKobo: 10_000, status: 'completed', transactionId: '9231836' } });
    expect(parseWebhook({ event: 'refund.completed', data: bare })).toMatchObject({ kind: 'refund', refund: { refundId: '99025' } });
    expect(parseWebhook({ event: 'transfer.completed', data: {} })).toEqual({ kind: 'ignored', event: 'transfer.completed' });
    expect(parseWebhook({ event: 'charge.completed', data: { tx_ref: 'x' } })).toBeNull();
    expect(parseWebhook(null)).toBeNull();
  });

  it('reads the refund API response', () => {
    expect(parseRefund({ id: 75_923, tx_id: 908_790, amount_refunded: 6_900, status: 'completed', flw_ref: 'URF_1' })).toEqual({
      refundId: '75923',
      amountKobo: 690_000,
      status: 'completed',
      transactionId: '908790',
    });
  });
});

describe('FlutterwaveClient', () => {
  const config = { get: () => ({ flutterwave: { secretKey: SECRET_KEY, webhookSecretHash: SECRET_HASH }, callbackUrl: 'https://insidelife.online/payments/callback' }) };
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let responses: Array<{ status: number; body: unknown }> = [];

  beforeEach(() => {
    calls.splice(0);
    responses = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift() ?? { status: 500, body: null };
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const client = (): FlutterwaveClient => new FlutterwaveClient(config as never);
  const sentBody = (index = 0): Record<string, unknown> => JSON.parse(String(calls[index]?.init.body)) as Record<string, unknown>;

  it('creates a Standard checkout with our reference as tx_ref, naira amounts, the callback and metadata', async () => {
    responses.push({ status: 200, body: { status: 'success', message: 'Hosted Link', data: { link: 'https://checkout.flutterwave.com/v3/hosted/pay/abc' } } });
    const session = await client().initialize({
      reference: verified.data.tx_ref,
      paymentId: 'p-1',
      email: 'ada@example.com',
      customerName: '@ada',
      amountKobo: 30_000_000,
      description: 'Inside Life billboard: Lekki Toll Gate, 7 days',
      metadata: { purpose: 'billboard', subjectId: 'c-1', characterId: null },
    });
    expect(session.authorizationUrl).toBe('https://checkout.flutterwave.com/v3/hosted/pay/abc');
    expect(calls[0]?.url).toBe('https://api.flutterwave.com/v3/payments');
    const headers = calls[0]?.init.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe(`Bearer ${SECRET_KEY}`);
    expect(sentBody()).toMatchObject({
      tx_ref: verified.data.tx_ref,
      amount: 300_000,
      currency: 'NGN',
      redirect_url: 'https://insidelife.online/payments/callback',
      customer: { email: 'ada@example.com', name: '@ada' },
      customizations: { title: 'Inside Life', logo: 'https://insidelife.online/icons/icon-512.png' },
      meta: { paymentId: 'p-1', kind: 'billboard' },
    });
  });

  it('fails cleanly (502) when Flutterwave refuses the checkout', async () => {
    responses.push({ status: 400, body: { status: 'error', message: 'Invalid currency', data: null } });
    await expect(client().initialize({ reference: 'r', paymentId: 'p', email: 'a@b.c', customerName: 'x', amountKobo: 50_000, description: 'd', metadata: {} })).rejects.toMatchObject({
      errorCode: 'EXTERNAL_SERVICE_ERROR',
    });
  });

  it('verifies by transaction id or by reference, and treats "no transaction found" as unknown', async () => {
    responses.push({ status: 200, body: verified }, { status: 400, body: { status: 'error', message: 'No transaction was found for this id', data: null } });
    expect(await client().verifyTransaction('9231836')).toMatchObject({ reference: verified.data.tx_ref, status: 'success' });
    expect(calls[0]?.url).toBe('https://api.flutterwave.com/v3/transactions/9231836/verify');
    expect(await client().verify('ref with spaces')).toBeNull();
    expect(calls[1]?.url).toBe('https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=ref%20with%20spaces');
    expect(await client().verifyTransaction('../../etc')).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('refunds by transaction id and refuses an unaccepted refund', async () => {
    responses.push({ status: 200, body: { status: 'success', message: 'Transaction refund initiated', data: { id: 75_923, tx_id: 9_231_836, amount_refunded: 2_500, status: 'completed' } } });
    expect(await client().refund({ reference: 'r', transactionId: '9231836', comments: 'Not approved' })).toEqual({ refundId: '75923', amountKobo: 250_000, status: 'completed' });
    expect(calls[0]?.url).toBe('https://api.flutterwave.com/v3/transactions/9231836/refund');
    expect(sentBody()).toEqual({ comments: 'Not approved' });
    responses.push({ status: 400, body: { status: 'error', message: 'Transaction already refunded', data: null } });
    await expect(client().refund({ reference: 'r', transactionId: '9231836', comments: 'again' })).rejects.toMatchObject({ errorCode: 'EXTERNAL_SERVICE_ERROR' });
  });
});
