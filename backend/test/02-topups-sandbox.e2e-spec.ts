import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOPUP_PACKAGES, topupVirtualAmountUsd, type PaymentDto, type PaymentVerificationDto, type TopupStartedDto, type TopupVerificationDto } from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { E2E } from './support/env.js';
import { burst } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS, postingsWithKey } from './support/ledger.js';
import { call, createPlayer, ok, refused, type Player } from './support/players.js';

let e2e: E2eApp;

beforeAll(async () => {
  // Dollars on (with wallets): the naira flows below must behave exactly as with dollars off.
  e2e = await bootApp({ env: { PAYMENTS_USD_ENABLED: 'true', PAYMENTS_WALLETS_ENABLED: 'true' } });
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

/**
 * The rate table players are promised (docs/GAME_DESIGN.md, "Top-ups"): game naira per real ₦1 by amount. Written
 * out here as the oracle, independently of the shared `topupVirtualAmount`.
 */
const RATE_TABLE: ReadonlyArray<readonly [fromNgn: number, perNaira: number]> = [
  [500, 300],
  [1_000, 350],
  [2_500, 400],
  [5_000, 440],
  [10_000, 500],
];
const promisedCredit = (ngn: number): number => ngn * RATE_TABLE.toReversed().find(([from]) => ngn >= from)![1];

async function startTopup(player: Player, body: object): Promise<TopupStartedDto> {
  return ok<TopupStartedDto>(await player.post('/payments/topups', body));
}

async function payInSandbox(player: Player, reference: string): Promise<PaymentVerificationDto> {
  return ok<PaymentVerificationDto>(await player.post(`/payments/sandbox/${reference}/succeed`));
}

const topupPostings = (player: Player, reference: string) => postingsWithKey(e2e.dataSource, `${player.characterId}:topup:${reference}`);

describe('top-up packs through the sandbox checkout', () => {
  it('credits each pack exactly its in-game amount, flagged as purchased', async () => {
    const player = await createPlayer(e2e);
    for (const pack of TOPUP_PACKAGES) {
      const before = await player.cash();
      const { purchased_total: purchasedBefore, unearned_total: unearnedBefore } = await player.character();
      const started = await startTopup(player, { packageId: pack.id });
      expect(started.sandbox).toBe(true);
      expect(started.authorizationUrl).toBe(`/payments/sandbox?reference=${started.reference}`);
      expect(started.topup).toMatchObject({ packageId: pack.id, priceNgn: pack.priceNgn, virtualAmount: promisedCredit(pack.priceNgn) });

      const [row] = await e2e.dataSource.query<Array<{ amount_kobo: string; topup_rate: number; status: string }>>(
        `SELECT amount_kobo, topup_rate, status FROM payments WHERE reference = $1`,
        [started.reference],
      );
      expect(Number(row?.amount_kobo)).toBe(pack.priceNgn * 100);
      expect(row?.status).toBe('initialized');

      const paid = await payInSandbox(player, started.reference);
      expect(paid.fulfilledNow).toBe(true);
      expect(paid.payment.status).toBe('success');
      expect(await player.cash()).toBe(before + pack.virtualAmount);
      const after = await player.character();
      expect(after.purchased_total).toBe(purchasedBefore + pack.virtualAmount);
      expect(after.unearned_total).toBe(unearnedBefore + pack.virtualAmount);
      expect(await topupPostings(player, started.reference)).toHaveLength(1);
    }
    expect((await player.snapshot()).wallet.balance).toBe(await player.cash());
  });

  it('credits a custom amount at the rate of the largest pack it reaches', async () => {
    const amounts = [500, 999, 1_000, 2_499, 2_500, 4_999, 5_000, 9_999, 10_000, 123_456];
    // One player per few amounts: starting a checkout is limited to 6 a minute per player.
    for (let i = 0; i < amounts.length; i += 5) {
      const player = await createPlayer(e2e);
      for (const amountNgn of amounts.slice(i, i + 5)) {
        const before = await player.cash();
        const started = await startTopup(player, { amountNgn });
        expect(started.topup).toMatchObject({ packageId: null, priceNgn: amountNgn, virtualAmount: promisedCredit(amountNgn) });
        await payInSandbox(player, started.reference);
        expect(await player.cash() - before).toBe(promisedCredit(amountNgn));
      }
    }
    expect(promisedCredit(123_456)).toBe(61_728_000);
    expect(promisedCredit(999)).toBe(299_700);
  });

  it('refuses amounts outside ₦500 – the per-payment maximum, and a pack and an amount together', async () => {
    const player = await createPlayer(e2e);
    refused(await player.post('/payments/topups', { amountNgn: 499 }), 400);
    refused(await player.post('/payments/topups', { amountNgn: 500.5 }), 400);
    refused(await player.post('/payments/topups', { amountNgn: 10_000_001 }), 422, 'INVALID_TOPUP');
    refused(await player.post('/payments/topups', { packageId: 'small-chops', amountNgn: 500 }), 422, 'INVALID_TOPUP');
    refused(await player.post('/payments/topups', {}), 422, 'INVALID_TOPUP');
    refused(await player.post('/payments/topups', { packageId: 'free-money' }), 400);
    const rows = await e2e.dataSource.query<unknown[]>(`SELECT 1 FROM payments WHERE user_id = $1`, [player.userId]);
    expect(rows).toHaveLength(0);
  });
});

describe('top-ups are credited exactly once', () => {
  it('verifying again (redirect reload, back button) never credits twice', async () => {
    const player = await createPlayer(e2e);
    const started = await startTopup(player, { packageId: 'jollof-pack' });
    const before = await player.cash();
    await payInSandbox(player, started.reference);
    for (let i = 0; i < 3; i++) {
      const again = ok<TopupVerificationDto>(await player.post(`/payments/topups/${started.reference}/verification`, {}));
      expect(again.fulfilledNow).toBe(false);
      expect(again.balance).toBe(before + 350_000);
    }
    expect((await payInSandbox(player, started.reference)).fulfilledNow).toBe(false);
    expect(await player.cash()).toBe(before + 350_000);
    expect(await topupPostings(player, started.reference)).toHaveLength(1);
  });

  it('a burst of payment confirmations and verifications for one checkout credits it once', async () => {
    const player = await createPlayer(e2e);
    const started = await startTopup(player, { packageId: 'owambe-pack' });
    const before = await player.cash();
    const results = await burst(12, (i) =>
      i % 2 === 0 ? player.post(`/payments/sandbox/${started.reference}/succeed`) : player.post(`/payments/topups/${started.reference}/verification`, {}),
    );
    expect(results.every((response) => response.status === 200)).toBe(true);
    const deliveries = results.filter((response) => (response.body as { fulfilledNow?: boolean }).fulfilledNow === true);
    expect(deliveries).toHaveLength(1);
    expect(await player.cash()).toBe(before + 1_000_000);
    expect(await topupPostings(player, started.reference)).toHaveLength(1);
  });

  it('a declined payment credits nothing; paying on the same checkout afterwards credits once', async () => {
    const player = await createPlayer(e2e);
    const started = await startTopup(player, { packageId: 'small-chops' });
    const before = await player.cash();
    const declined = ok<PaymentVerificationDto>(await player.post(`/payments/sandbox/${started.reference}/fail`));
    expect(declined.payment.status).toBe('failed');
    expect(declined.fulfilledNow).toBe(false);
    ok(await player.post(`/payments/topups/${started.reference}/verification`, {}));
    expect(await player.cash()).toBe(before);

    await payInSandbox(player, started.reference);
    await payInSandbox(player, started.reference);
    expect(await player.cash()).toBe(before + 150_000);
    expect(await topupPostings(player, started.reference)).toHaveLength(1);
  });

  it('nobody can verify or pay someone else’s checkout', async () => {
    const owner = await createPlayer(e2e);
    const stranger = await createPlayer(e2e);
    const started = await startTopup(owner, { packageId: 'small-chops' });
    refused(await stranger.post(`/payments/topups/${started.reference}/verification`, {}), 404);
    refused(await stranger.post(`/payments/sandbox/${started.reference}/succeed`), 404);
    refused(await stranger.post(`/payments/${started.reference}/verification`, {}), 404);
    const history = ok<PaymentDto[]>(await owner.get('/payments'));
    expect(history.map((payment) => payment.reference)).toContain(started.reference);
    expect(ok<PaymentDto[]>(await stranger.get('/payments')).map((payment) => payment.reference)).not.toContain(started.reference);
  });
});

describe('dollar top-ups through the sandbox checkout', () => {
  it('pays whole dollars on the fake checkout (card or wallet) and credits the naira value once', async () => {
    const player = await createPlayer(e2e);
    for (const [amountUsd, method] of [[1, 'card'], [10, 'applepay'], [25, 'googlepay']] as const) {
      const before = await player.cash();
      const started = await startTopup(player, { currency: 'USD', amountUsd, method, expectedNgnPerUsd: 1_500 });
      expect(started.authorizationUrl).toBe(`/payments/sandbox?reference=${started.reference}`);
      expect(started.topup).toMatchObject({ currency: 'USD', amountMinor: amountUsd * 100, priceUsd: amountUsd, ngnPerUsd: 1_500, virtualAmount: promisedCredit(amountUsd * 1_500) });
      const paid = await payInSandbox(player, started.reference);
      expect(paid.fulfilledNow).toBe(true);
      expect(paid.payment).toMatchObject({ currency: 'USD', amountMinor: amountUsd * 100, ngnPerUsd: 1_500, amountNgn: amountUsd * 1_500, channel: 'sandbox' });
      // Equal value, equal credit: $1 at ₦1,500 credits what ₦1,500 does.
      expect(await player.cash()).toBe(before + topupVirtualAmountUsd(amountUsd, 1_500));
      expect(topupVirtualAmountUsd(amountUsd, 1_500)).toBe(promisedCredit(amountUsd * 1_500));
      expect((await payInSandbox(player, started.reference)).fulfilledNow).toBe(false);
      expect(await topupPostings(player, started.reference)).toHaveLength(1);
    }
    const history = ok<PaymentDto[]>(await player.get('/payments'));
    expect(history.filter((payment) => payment.currency === 'USD').map((payment) => payment.amountMinor)).toEqual([2_500, 1_000, 100]);
  });
});

const webhook = (hash: string | null, body: object) => {
  const test = call(e2e, 'post', '/payments/flutterwave/webhook');
  if (hash !== null) test.set('verif-hash', hash);
  return test.send(body);
};

describe('the Flutterwave webhook endpoint (sandbox mode)', () => {
  const charge = { event: 'charge.completed', data: { id: 99_000_001, tx_ref: '00000000-0000-4000-8000-000000000000', status: 'successful' } };

  it('refuses a webhook without the secret hash or with the wrong one', async () => {
    refused(await webhook(null, charge), 401, 'INVALID_SIGNATURE');
    refused(await webhook('', charge), 401, 'INVALID_SIGNATURE');
    refused(await webhook(`${E2E.webhookHash}x`, charge), 401, 'INVALID_SIGNATURE');
    refused(await webhook(E2E.webhookHash.slice(1), charge), 401, 'INVALID_SIGNATURE');
  });

  it('accepts a signed webhook (and ignores what it can’t parse) without crediting anything on its own', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    expect(ok<{ received: boolean }>(await webhook(E2E.webhookHash, charge)).received).toBe(true);
    expect(ok<{ received: boolean }>(await webhook(E2E.webhookHash, { hello: 'world' })).received).toBe(true);
    expect(ok<{ received: boolean }>(await webhook(E2E.webhookHash, { event: 'transfer.completed', data: {} })).received).toBe(true);
    expect(await player.cash()).toBe(before);
  });
});
