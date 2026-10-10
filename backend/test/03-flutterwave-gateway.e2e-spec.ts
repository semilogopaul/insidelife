import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CampaignCheckoutDto, PaymentVerificationDto, TopupStartedDto, TopupVerificationDto } from '@insidelife/shared';
import { CheckoutReconciler } from '../src/modules/payments/checkout-reconciler.service.js';
import { PAYMENTS_QUEUE } from '../src/modules/payments/payments-queue.js';
import { signInOwner, type Admin } from './support/admin.js';
import { bootApp, type E2eApp } from './support/app.js';
import { E2E } from './support/env.js';
import { FAKE_FLUTTERWAVE_KEY, FakeFlutterwave, type FakeTransaction } from './support/fake-flutterwave.js';
import { burst, fund } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS, postingsWithKey } from './support/ledger.js';
import { uploadCreative } from './support/media.js';
import { jobResult, sweepAfterExpiry, sweepWhenDue } from './support/payments.js';
import { call, createPlayer, key, ok, refused, type Player } from './support/players.js';

/**
 * Live-mode payments: the app runs its real Flutterwave client (a test secret key is set, so no sandbox) against a fake
 * Flutterwave API, and receives signed webhooks through the real endpoint, BullMQ queue and worker.
 */
let e2e: E2eApp;
const fw = new FakeFlutterwave();
let queue: Queue;

beforeAll(async () => {
  fw.install();
  e2e = await bootApp({ env: { FLUTTERWAVE_SECRET_KEY: FAKE_FLUTTERWAVE_KEY } });
  queue = e2e.get<Queue>(getQueueToken(PAYMENTS_QUEUE));
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
  fw.uninstall();
});

interface PaymentRow {
  readonly next_check_at: Date | null;
  readonly status: string;
  readonly failure_reason: string | null;
  readonly paid_kobo: string | null;
  readonly gateway_transaction_id: string | null;
  readonly fulfilled_at: Date | null;
  readonly refund_status: string | null;
  readonly refunded_kobo: string;
  readonly flag_reason: string | null;
  readonly provider: string;
}

const paymentRow = async (reference: string): Promise<PaymentRow> =>
  (await e2e.dataSource.query<PaymentRow[]>(`SELECT * FROM payments WHERE reference = $1`, [reference]))[0]!;

const credits = (player: Player, reference: string) => postingsWithKey(e2e.dataSource, `${player.characterId}:topup:${reference}`);

function webhook(body: object, hash: string | null = E2E.webhookHash) {
  const test = call(e2e, 'post', '/payments/flutterwave/webhook');
  if (hash !== null) test.set('verif-hash', hash);
  return test.send(body);
}

/** Wait until the queued webhook job has been processed by the worker. */
const processed = (jobId: string): Promise<string> => jobResult(e2e, jobId);

async function startTopup(player: Player, body: object): Promise<TopupStartedDto> {
  const started = ok<TopupStartedDto>(await player.post('/payments/topups', body));
  expect(started.sandbox).toBe(false);
  expect(started.authorizationUrl).toMatch(/^https:\/\/checkout\.flutterwave\.test\//);
  expect(fw.checkouts.get(started.reference)).toMatchObject({ amount: started.topup.priceNgn, currency: 'NGN', redirectUrl: expect.stringMatching(/\/payments\/callback/) });
  return started;
}

const verifyTopup = (player: Player, reference: string, transaction?: FakeTransaction) =>
  player.post(`/payments/topups/${reference}/verification`, transaction ? { transactionId: String(transaction.id) } : {});

describe('a paid checkout is credited exactly once, whoever confirms it first', () => {
  it('redirect verification credits once; the webhook that follows (and its retries) credits nothing more', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startTopup(player, { packageId: 'owambe-pack' });
    expect(await paymentRow(started.reference)).toMatchObject({ provider: 'flutterwave', status: 'initialized' });

    const transaction = fw.pay(started.reference);
    const verified = ok<TopupVerificationDto>(await verifyTopup(player, started.reference, transaction));
    expect(verified.fulfilledNow).toBe(true);
    expect(verified.balance).toBe(before + 1_000_000);
    const row = await paymentRow(started.reference);
    expect(row).toMatchObject({ status: 'success', gateway_transaction_id: String(transaction.id) });
    expect(Number(row.paid_kobo)).toBe(250_000);

    for (let i = 0; i < 3; i++) ok(await webhook(fw.chargeWebhook(transaction)));
    expect(await processed(`charge-${transaction.id}`)).toBe('already-paid');
    // Even if the job ran again (Flutterwave retried after the job was cleaned up), nothing more is credited.
    await (await queue.getJob(`charge-${transaction.id}`))?.remove();
    ok(await webhook(fw.chargeWebhook(transaction)));
    expect(await processed(`charge-${transaction.id}`)).toBe('already-paid');

    expect(await player.cash()).toBe(before + 1_000_000);
    expect(await credits(player, started.reference)).toHaveLength(1);
  });

  it('a signed webhook alone delivers a payment whose redirect never came back', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startTopup(player, { amountNgn: 3_000 });
    const transaction = fw.pay(started.reference);
    ok(await webhook(fw.chargeWebhook(transaction)));
    expect(await processed(`charge-${transaction.id}`)).toBe('record-success');
    expect(await player.cash()).toBe(before + 3_000 * 400);
    expect((await player.character()).purchased_total).toBe(3_000 * 400);
  });

  it('refuses webhooks without the right secret hash, and they change nothing', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startTopup(player, { packageId: 'small-chops' });
    const transaction = fw.pay(started.reference);
    refused(await webhook(fw.chargeWebhook(transaction), null), 401, 'INVALID_SIGNATURE');
    refused(await webhook(fw.chargeWebhook(transaction), 'not-the-hash'), 401, 'INVALID_SIGNATURE');
    expect(await queue.getJob(`charge-${transaction.id}`)).toBeUndefined();
    expect(await player.cash()).toBe(before);
    expect((await paymentRow(started.reference)).status).toBe('initialized');
  });

  it('the redirect, the webhook and the reconciler racing on one payment credit it once', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startTopup(player, { packageId: 'odogwu-pack' });
    const transaction = fw.pay(started.reference);
    const reconciler = e2e.get(CheckoutReconciler);
    const due = (await paymentRow(started.reference)).next_check_at;
    const later = new Date(Math.max(Date.now(), due?.getTime() ?? Date.now()) + 1_000);
    await Promise.all([
      ...Array.from({ length: 6 }, () => verifyTopup(player, started.reference, transaction)),
      ...Array.from({ length: 3 }, () => webhook(fw.chargeWebhook(transaction))),
      reconciler.sweep(later),
      reconciler.sweep(later),
    ]);
    await processed(`charge-${transaction.id}`);
    expect(await player.cash()).toBe(before + 5_000_000);
    expect(await credits(player, started.reference)).toHaveLength(1);
    expect((await paymentRow(started.reference)).fulfilled_at).not.toBeNull();
  });

  it('ten parallel verifications credit once', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startTopup(player, { packageId: 'big-boy-pack' });
    const transaction = fw.pay(started.reference);
    const results = await burst(10, () => verifyTopup(player, started.reference, transaction));
    expect(results.map((response) => response.status)).toEqual(Array.from({ length: 10 }, () => 200));
    expect(results.filter((response) => (response.body as TopupVerificationDto).fulfilledNow)).toHaveLength(1);
    expect(await player.cash()).toBe(before + 2_200_000);
    expect(await credits(player, started.reference)).toHaveLength(1);
  });

  it('the reconciler delivers a payment whose redirect and webhook were both lost', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startTopup(player, { packageId: 'jollof-pack' });
    fw.pay(started.reference);
    await sweepWhenDue(e2e, started.reference);
    expect(await player.cash()).toBe(before + 350_000);
    expect(await paymentRow(started.reference)).toMatchObject({ status: 'success' });
  });

  it('a checkout nobody paid is checked again and marked abandoned after a day, crediting nothing', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startTopup(player, { packageId: 'small-chops' });
    await sweepAfterExpiry(e2e, started.reference);
    expect(await paymentRow(started.reference)).toMatchObject({ status: 'abandoned', failure_reason: 'checkout_expired' });
    expect(await player.cash()).toBe(before);
  });
});

describe('a charge that doesn’t match the checkout is never credited', () => {
  const cases: ReadonlyArray<{ name: string; pay: (amount: number) => Parameters<FakeFlutterwave['pay']>[1]; reason: string }> = [
    { name: 'paid less than the price', pay: (amount) => ({ amount: amount - 1, chargedAmount: amount - 1 }), reason: 'amount_mismatch' },
    { name: 'charged less than the price', pay: (amount) => ({ amount, chargedAmount: amount - 100 }), reason: 'amount_mismatch' },
    { name: 'no charged amount reported', pay: (amount) => ({ amount, chargedAmount: null }), reason: 'amount_mismatch' },
    { name: 'paid in another currency', pay: (amount) => ({ amount, currency: 'USD' }), reason: 'currency_mismatch' },
  ];
  for (const testCase of cases) {
    it(`${testCase.name}: not credited (redirect or webhook)`, async () => {
      const player = await createPlayer(e2e);
      const before = await player.cash();
      const started = await startTopup(player, { packageId: 'owambe-pack' });
      const transaction = fw.pay(started.reference, testCase.pay(2_500));
      const verified = ok<TopupVerificationDto>(await verifyTopup(player, started.reference, transaction));
      expect(verified.fulfilledNow).toBe(false);
      ok(await webhook(fw.chargeWebhook(transaction)));
      await processed(`charge-${transaction.id}`);
      expect(await paymentRow(started.reference)).toMatchObject({ status: 'failed', failure_reason: testCase.reason, fulfilled_at: null });
      expect(await player.cash()).toBe(before);
      expect(await credits(player, started.reference)).toHaveLength(0);
    });
  }

  it('a failed card payment credits nothing', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startTopup(player, { packageId: 'small-chops' });
    const transaction = fw.pay(started.reference, { status: 'failed' });
    ok(await verifyTopup(player, started.reference, transaction));
    expect(await paymentRow(started.reference)).toMatchObject({ status: 'failed', failure_reason: 'charge_failed' });
    expect(await player.cash()).toBe(before);
  });

  it('the transaction id from a redirect can’t be borrowed from another payment', async () => {
    const cheap = await createPlayer(e2e);
    const thief = await createPlayer(e2e);
    const cheapStarted = await startTopup(cheap, { packageId: 'small-chops' });
    const cheapPaid = fw.pay(cheapStarted.reference);
    const expensive = await startTopup(thief, { packageId: 'odogwu-pack' });
    const before = await thief.cash();
    // The thief verifies their unpaid ₦10,000 checkout with the id of someone's ₦500 payment.
    const verified = ok<TopupVerificationDto>(await verifyTopup(thief, expensive.reference, cheapPaid));
    expect(verified.fulfilledNow).toBe(false);
    expect(await thief.cash()).toBe(before);
    expect((await paymentRow(expensive.reference)).status).toBe('initialized');
  });
});

async function paidTopup(player: Player, packageId: string): Promise<{ reference: string; transaction: FakeTransaction; credit: number }> {
  const before = await player.cash();
  const started = await startTopup(player, { packageId });
  const transaction = fw.pay(started.reference);
  ok(await verifyTopup(player, started.reference, transaction));
  return { reference: started.reference, transaction, credit: (await player.cash()) - before };
}

describe('refunds made in the Flutterwave dashboard take the coins back, once', () => {

  it('a full refund claws back everything; the same refund reported again takes nothing more', async () => {
    const player = await createPlayer(e2e);
    const start = await player.cash();
    const { reference, transaction, credit } = await paidTopup(player, 'owambe-pack');
    expect(credit).toBe(1_000_000);

    const refund = fw.dashboardRefund(transaction.id, 2_500);
    ok(await webhook(fw.refundWebhook(refund)));
    expect(await processed(`refund-${refund.id}-completed`)).toBe('recorded');
    expect(await player.cash()).toBe(start);
    const after = await player.character();
    expect(after.purchased_total).toBe(0);
    expect(await paymentRow(reference)).toMatchObject({ refund_status: 'refunded', refunded_kobo: '250000' });

    await (await queue.getJob(`refund-${refund.id}-completed`))?.remove();
    ok(await webhook(fw.refundWebhook(refund)));
    expect(await processed(`refund-${refund.id}-completed`)).toBe('duplicate');
    expect(await player.cash()).toBe(start);
  });

  it('two partial refunds each take their share', async () => {
    const player = await createPlayer(e2e);
    const start = await player.cash();
    const { transaction } = await paidTopup(player, 'odogwu-pack');
    const first = fw.dashboardRefund(transaction.id, 5_000);
    ok(await webhook(fw.refundWebhook(first)));
    await processed(`refund-${first.id}-completed`);
    expect(await player.cash()).toBe(start + 2_500_000);
    const second = fw.dashboardRefund(transaction.id, 5_000);
    ok(await webhook(fw.refundWebhook(second)));
    await processed(`refund-${second.id}-completed`);
    expect(await player.cash()).toBe(start);
    expect((await player.character()).purchased_total).toBe(0);
  });

  it('takes the rest from savings when cash is short', async () => {
    const player = await createPlayer(e2e);
    const { reference, transaction } = await paidTopup(player, 'big-boy-pack');
    const cash = await player.cash();
    ok(await player.post('/wallet/savings-transfers', { direction: 'deposit', amount: cash - 1_000_000, idempotencyKey: key() }));
    const savings = await player.savings();

    const refund = fw.dashboardRefund(transaction.id, 5_000);
    ok(await webhook(fw.refundWebhook(refund)));
    await processed(`refund-${refund.id}-completed`);
    expect(await player.cash()).toBe(0);
    expect(await player.savings()).toBe(savings - 1_200_000);
    expect((await paymentRow(reference)).flag_reason).toMatch(/clawed back ₦2,200,000 of ₦2,200,000/);
  });

  it('never goes below zero: what was moved out of reach (here, into dollars) is flagged for ops as a shortfall', async () => {
    const player = await createPlayer(e2e);
    const { reference, transaction } = await paidTopup(player, 'big-boy-pack');
    ok(await player.post('/fx/orders', { side: 'buy-usd', amountNaira: (await player.cash()) - 100_000, idempotencyKey: key() }));
    const cash = await player.cash();
    expect(cash).toBeLessThan(2_200_000);

    const refund = fw.dashboardRefund(transaction.id, 5_000);
    ok(await webhook(fw.refundWebhook(refund)));
    await processed(`refund-${refund.id}-completed`);
    expect(await player.cash()).toBe(0);
    const row = await paymentRow(reference);
    expect(row.refund_status).toBe('refunded');
    expect(row.flag_reason).toMatch(/already spent/);
    expect((await player.character()).purchased_total).toBe(2_200_000 - cash);
  });

  it('what was already spent becomes a debt: recorded once, blocks sending, shown in the bank and to admins, repaid from the next money in', async () => {
    const player = await createPlayer(e2e);
    const friend = await createPlayer(e2e);
    const { transaction } = await paidTopup(player, 'big-boy-pack');
    ok(await player.post('/fx/orders', { side: 'buy-usd', amountNaira: (await player.cash()) - 100_000, idempotencyKey: key() }));
    const cash = await player.cash();
    const owed = 2_200_000 - cash;

    const refund = fw.dashboardRefund(transaction.id, 5_000);
    ok(await webhook(fw.refundWebhook(refund)));
    await processed(`refund-${refund.id}-completed`);
    expect((await player.character()).debt).toBe(owed);
    // The same refund reported again adds no second debt.
    await (await queue.getJob(`refund-${refund.id}-completed`))?.remove();
    ok(await webhook(fw.refundWebhook(refund)));
    await processed(`refund-${refund.id}-completed`);
    expect((await player.character()).debt).toBe(owed);
    expect(await e2e.dataSource.query(`SELECT amount FROM character_debts WHERE character_id = $1`, [player.characterId])).toEqual([{ amount: String(owed) }]);

    expect(ok<{ debt: number }>(await player.get('/wallet')).debt).toBe(owed);
    const owner = await signInOwner(e2e);
    expect(ok<{ character: { debt: number } }>(await owner.get(`/players/${player.userId}`)).character.debt).toBe(owed);
    refused(await player.post('/transfers', { toHandle: friend.handle, amount: 1_000, idempotencyKey: key() }), 422, 'DEBT_OUTSTANDING');

    // Money coming in repays the debt first (back to system:topup), then the rest is theirs and sending works again.
    await fund(e2e, player, owed + 300_000);
    expect(await player.cash()).toBe(300_000);
    expect((await player.character()).debt).toBe(0);
    expect(await postingsWithKey(e2e.dataSource, `${player.characterId}:debt-repayment:0`)).toHaveLength(1);
    expect(ok<{ debt: number }>(await player.get('/wallet')).debt).toBe(0);
    ok(await player.post('/transfers', { toHandle: friend.handle, amount: 100_000, idempotencyKey: key() }));
  });

  it('a refund that arrives before the charge was confirmed delivers nothing at all', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startTopup(player, { packageId: 'jollof-pack' });
    const transaction = fw.pay(started.reference);
    const refund = fw.dashboardRefund(transaction.id, 1_000);
    ok(await webhook(fw.refundWebhook(refund)));
    await processed(`refund-${refund.id}-completed`);
    ok(await verifyTopup(player, started.reference, transaction));
    ok(await webhook(fw.chargeWebhook(transaction)));
    await processed(`charge-${transaction.id}`);
    expect(await player.cash()).toBe(before);
    expect(await paymentRow(started.reference)).toMatchObject({ status: 'success', refund_status: 'refunded' });
    expect(await credits(player, started.reference)).toHaveLength(0);
  });
});

async function bookAndPay(buyer: Player, slotId: string): Promise<{ checkout: CampaignCheckoutDto; transaction: FakeTransaction }> {
  const creative = await uploadCreative(buyer, slotId);
  const checkout = ok<CampaignCheckoutDto>(
    await buyer.post('/promotions/campaigns', { slotId, creativeKey: creative.creativeKey, title: 'Mama Put Deluxe', tagline: 'Hot jollof, any time', linkUrl: 'https://mamaput.ng/menu', blocks: 1 }),
  );
  const transaction = fw.pay(checkout.reference);
  const verified = ok<PaymentVerificationDto>(await buyer.post(`/payments/${checkout.reference}/verification`, { transactionId: String(transaction.id) }));
  expect(verified.fulfilledNow).toBe(true);
  return { checkout, transaction };
}

describe('ads paid through Flutterwave and refunded automatically', () => {
  let owner: Admin;

  beforeAll(async () => {
    owner = await signInOwner(e2e);
  });


  it('rejecting a paid ad before it runs refunds the payer through Flutterwave, once', async () => {
    const buyer = await createPlayer(e2e);
    const { checkout, transaction } = await bookAndPay(buyer, 'app-3');
    const rejected = ok<{ status: string }>(await owner.post(`/moderation/campaigns/${checkout.campaignId}/reject`, { reason: 'Misleading claims' }));
    expect(rejected.status).toBe('refunded');
    expect(fw.callsTo('POST', `/transactions/${transaction.id}/refund`)).toBe(1);
    expect(await paymentRow(checkout.reference)).toMatchObject({ refund_status: 'refunded', refunded_kobo: String(checkout.quote.totalKobo) });
    refused(await owner.post(`/moderation/campaigns/${checkout.campaignId}/reject`, { reason: 'Again' }), 409);
    expect(fw.callsTo('POST', `/transactions/${transaction.id}/refund`)).toBe(1);
  });

  it('a refund Flutterwave is still processing completes on its webhook; it is never sent twice', async () => {
    const buyer = await createPlayer(e2e);
    const { checkout, transaction } = await bookAndPay(buyer, 'app-4');
    fw.refundBehaviour = 'processing';
    try {
      const rejected = ok<{ status: string }>(await owner.post(`/moderation/campaigns/${checkout.campaignId}/reject`, { reason: 'Wrong category' }));
      expect(rejected.status).toBe('refund-due');
    } finally {
      fw.refundBehaviour = 'completed';
    }
    expect(await paymentRow(checkout.reference)).toMatchObject({ refund_status: 'pending' });
    // The reconciler's sweep doesn't send it again while Flutterwave processes it.
    await e2e.get(CheckoutReconciler).sweep(new Date());
    expect(fw.callsTo('POST', `/transactions/${transaction.id}/refund`)).toBe(1);

    const refund = fw.refunds.find((candidate) => candidate.tx_id === transaction.id)!;
    refund.status = 'completed';
    ok(await webhook(fw.refundWebhook(refund)));
    await processed(`refund-${refund.id}-completed`);
    expect(await paymentRow(checkout.reference)).toMatchObject({ refund_status: 'refunded' });
    const [campaign] = await e2e.dataSource.query<Array<{ status: string }>>(`SELECT status FROM promotion_campaigns WHERE id = $1`, [checkout.campaignId]);
    expect(campaign?.status).toBe('refunded');
  });

  it('when Flutterwave refuses the refund, the ad waits under “refunds due” for a manual refund', async () => {
    const buyer = await createPlayer(e2e);
    const { checkout } = await bookAndPay(buyer, 'app-5');
    fw.refundBehaviour = 'refuse';
    try {
      const rejected = ok<{ status: string }>(await owner.post(`/moderation/campaigns/${checkout.campaignId}/reject`, { reason: 'Prohibited product' }));
      expect(rejected.status).toBe('refund-due');
    } finally {
      fw.refundBehaviour = 'completed';
    }
    expect(await paymentRow(checkout.reference)).toMatchObject({ refund_status: 'failed' });
    const queueView = ok<{ refundsDue: { campaigns: Array<{ id: string }> } }>(await owner.get('/moderation/queue'));
    expect(queueView.refundsDue.campaigns.map((campaign) => campaign.id)).toContain(checkout.campaignId);
    const marked = ok<{ status: string }>(await owner.post(`/moderation/campaigns/${checkout.campaignId}/refunded`, { note: 'Refunded by hand in the dashboard' }));
    expect(marked.status).toBe('refunded');
  });
});
