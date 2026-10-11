import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  INCOME_MULTIPLIER,
  topupVirtualAmountUsd,
  usdCentsForKobo,
  type BillboardSlotsDto,
  type CampaignCheckoutDto,
  type ClubOrderCheckoutDto,
  type ClubTrackDto,
  type PaymentDto,
  type PaymentVerificationDto,
  type TopupCatalogDto,
  type TopupStartedDto,
  type TopupVerificationDto,
} from '@insidelife/shared';
import { CheckoutReconciler } from '../src/modules/payments/checkout-reconciler.service.js';
import { PAYMENTS_QUEUE } from '../src/modules/payments/payments-queue.js';
import { signInOwner, type Admin } from './support/admin.js';
import { bootApp, type E2eApp } from './support/app.js';
import { E2E } from './support/env.js';
import { FAKE_FLUTTERWAVE_KEY, FakeFlutterwave, type FakeTransaction } from './support/fake-flutterwave.js';
import { burst, drainCash } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS, postingsWithKey } from './support/ledger.js';
import { synthMp3, uploadCreative, uploadTrack } from './support/media.js';
import { jobResult, paymentRow, sendWebhook, sweepWhenDue } from './support/payments.js';
import { createPlayer, key, ok, refused, type Player } from './support/players.js';

/**
 * Paying in US dollars (PAYMENTS_USD_ENABLED, with Apple Pay / Google Pay: PAYMENTS_WALLETS_ENABLED), live mode: the
 * real Flutterwave client against the fake Flutterwave API, signed webhooks through the real queue. The game stays in
 * naira: a dollar top-up credits what the same naira value credits, a dollar ad costs the naira price ÷ the owner's
 * ₦ per $1, rounded up to the cent. Mirrors the naira gateway spec: whoever confirms first, mismatches, duplicates,
 * orderings, lost redirects, refunds.
 */
let e2e: E2eApp;
const fw = new FakeFlutterwave();
let queue: Queue;
let owner: Admin;
const RATE = 1_500;

beforeAll(async () => {
  fw.install();
  e2e = await bootApp({
    env: { FLUTTERWAVE_SECRET_KEY: FAKE_FLUTTERWAVE_KEY, PAYMENTS_USD_ENABLED: 'true', PAYMENTS_WALLETS_ENABLED: 'true', TOPUP_MAX_PER_PAYMENT_USD: '5000' },
  });
  queue = e2e.get<Queue>(getQueueToken(PAYMENTS_QUEUE));
  owner = await signInOwner(e2e);
  // Spec files share one database: start from the default rate whatever an earlier run left.
  await e2e.dataSource.query(`DELETE FROM ad_rates WHERE key = 'usd-rate'`);
});

afterAll(async () => {
  if (e2e) {
    await e2e.dataSource.query(`DELETE FROM ad_rates WHERE key = 'usd-rate'`);
    expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  }
  await e2e?.close();
  fw.uninstall();
});

const credits = (player: Player, reference: string) => postingsWithKey(e2e.dataSource, `${player.characterId}:topup:${reference}`);
const webhook = (body: object, hash: string | null = E2E.webhookHash) => sendWebhook(e2e, body, hash);
const processed = (jobId: string): Promise<string> => jobResult(e2e, jobId);

async function startDollars(player: Player, amountUsd: number, extra: object = {}): Promise<TopupStartedDto> {
  const started = ok<TopupStartedDto>(await player.post('/payments/topups', { currency: 'USD', amountUsd, expectedNgnPerUsd: RATE, ...extra }));
  expect(started.sandbox).toBe(false);
  expect(started.topup).toMatchObject({ currency: 'USD', amountMinor: amountUsd * 100, priceUsd: amountUsd, ngnPerUsd: RATE, priceNgn: amountUsd * RATE });
  return started;
}

const verify = (player: Player, reference: string, transaction?: FakeTransaction) =>
  player.post(`/payments/topups/${reference}/verification`, transaction ? { transactionId: String(transaction.id) } : {});

describe('dollars are offered, and quoted like the same value in naira', () => {
  it('lists dollar top-ups and dollar ad prices with the owner’s ₦ per $1', async () => {
    const player = await createPlayer(e2e);
    const catalog = ok<TopupCatalogDto>(await player.get('/payments/packages'));
    expect(catalog.usd).toEqual({
      ngnPerUsd: RATE,
      methods: ['card', 'applepay', 'googlepay'],
      minChargeCents: 100,
      minUsd: 1,
      maxPerPaymentUsd: 5_000,
      quickPicksUsd: [1, 5, 10, 25, 50],
    });
    expect(ok<BillboardSlotsDto>(await player.get('/promotions/slots')).usd).toEqual({ ngnPerUsd: RATE, methods: ['card', 'applepay', 'googlepay'], minChargeCents: 100 });
  });

  it('refuses amounts that aren’t whole dollars from $1 to the maximum, packs in dollars and wallets in naira', async () => {
    const player = await createPlayer(e2e);
    refused(await player.post('/payments/topups', { currency: 'USD', amountUsd: 0 }), 400);
    refused(await player.post('/payments/topups', { currency: 'USD', amountUsd: 2.5 }), 400);
    refused(await player.post('/payments/topups', { currency: 'GBP', amountUsd: 5 }), 400);
    refused(await player.post('/payments/topups', { currency: 'USD', amountUsd: 5_001 }), 422, 'INVALID_TOPUP');
    refused(await player.post('/payments/topups', { currency: 'USD', packageId: 'jollof-pack' }), 422, 'INVALID_TOPUP');
    refused(await player.post('/payments/topups', { amountNgn: 5_000, method: 'applepay' }), 422, 'INVALID_TOPUP');
    expect(fw.checkouts.size).toBe(0);
  });
});

describe('a paid dollar checkout is credited exactly once, whoever confirms it first', () => {
  it('charges whole dollars on the hosted checkout and credits the naira value at its tier, once', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startDollars(player, 10);
    expect(fw.checkouts.get(started.reference)).toMatchObject({ amount: 10, currency: 'USD', method: 'card' });
    expect(await paymentRow(e2e, started.reference)).toMatchObject({ currency: 'USD', amount_minor: '1000', amount_kobo: String(1_000 * RATE), ngn_per_usd: RATE, status: 'initialized' });

    const transaction = fw.pay(started.reference);
    const verified = ok<TopupVerificationDto>(await verify(player, started.reference, transaction));
    expect(verified.fulfilledNow).toBe(true);
    const credit = topupVirtualAmountUsd(10, RATE);
    expect(credit).toBe(15_000 * 500 * INCOME_MULTIPLIER);
    expect(verified.balance).toBe(before + credit);
    expect(verified.payment).toMatchObject({ currency: 'USD', amountMinor: 1_000, ngnPerUsd: RATE, amountNgn: 15_000, topup: { label: 'Dollar top-up', virtualAmount: credit } });
    expect(await paymentRow(e2e, started.reference)).toMatchObject({ status: 'success', paid_minor: '1000', channel: 'card' });

    for (let i = 0; i < 3; i++) ok(await webhook(fw.chargeWebhook(transaction)));
    expect(await processed(`charge-${transaction.id}`)).toBe('already-paid');
    await (await queue.getJob(`charge-${transaction.id}`))?.remove();
    ok(await webhook(fw.chargeWebhook(transaction)));
    expect(await processed(`charge-${transaction.id}`)).toBe('already-paid');
    expect(await player.cash()).toBe(before + credit);
    expect(await credits(player, started.reference)).toHaveLength(1);
    expect((await player.character()).purchased_total).toBe(credit);
  });

  it('the redirect, the webhook and the reconciler racing on one dollar payment credit it once', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startDollars(player, 50);
    const transaction = fw.pay(started.reference);
    const reconciler = e2e.get(CheckoutReconciler);
    const due = (await paymentRow(e2e, started.reference)).next_check_at;
    const later = new Date(Math.max(Date.now(), due?.getTime() ?? Date.now()) + 1_000);
    await Promise.all([
      ...Array.from({ length: 6 }, () => verify(player, started.reference, transaction)),
      ...Array.from({ length: 3 }, () => webhook(fw.chargeWebhook(transaction))),
      reconciler.sweep(later),
      reconciler.sweep(later),
    ]);
    await processed(`charge-${transaction.id}`);
    expect(await player.cash()).toBe(before + topupVirtualAmountUsd(50, RATE));
    expect(await credits(player, started.reference)).toHaveLength(1);
  });

  it('ten parallel verifications credit once', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startDollars(player, 25);
    const transaction = fw.pay(started.reference);
    const results = await burst(10, () => verify(player, started.reference, transaction));
    expect(results.filter((response) => (response.body as TopupVerificationDto).fulfilledNow)).toHaveLength(1);
    expect(await player.cash()).toBe(before + topupVirtualAmountUsd(25, RATE));
    expect(await credits(player, started.reference)).toHaveLength(1);
  });

  it('a lost redirect is delivered by the webhook alone, by the reconciler, or by “I’ve paid: check now”', async () => {
    const byWebhook = await createPlayer(e2e);
    const one = await startDollars(byWebhook, 5);
    const first = fw.pay(one.reference);
    ok(await webhook(fw.chargeWebhook(first)));
    expect(await processed(`charge-${first.id}`)).toBe('record-success');
    expect(await credits(byWebhook, one.reference)).toHaveLength(1);

    const byReconciler = await createPlayer(e2e);
    const two = await startDollars(byReconciler, 5);
    fw.pay(two.reference);
    await sweepWhenDue(e2e, two.reference);
    expect(await credits(byReconciler, two.reference)).toHaveLength(1);

    const byRecovery = await createPlayer(e2e);
    const three = await startDollars(byRecovery, 5);
    fw.pay(three.reference);
    // The game's recovery check: the generic verification, no transaction id (the redirect never came back).
    const checked = ok<PaymentVerificationDto>(await byRecovery.post(`/payments/${three.reference}/verification`, {}));
    expect(checked).toMatchObject({ fulfilledNow: true, payment: { status: 'success', currency: 'USD', fulfilled: true } });
    expect(await credits(byRecovery, three.reference)).toHaveLength(1);
    for (const [player, reference] of [[byWebhook, one.reference], [byReconciler, two.reference], [byRecovery, three.reference]] as const) {
      expect((await player.character()).purchased_total, reference).toBe(topupVirtualAmountUsd(5, RATE));
    }
  });
});

describe('a dollar charge that doesn’t match the checkout is never credited', () => {
  const cases: ReadonlyArray<{ name: string; pay: Parameters<FakeFlutterwave['pay']>[1]; reason: string }> = [
    { name: 'paid a cent less', pay: { amount: 9.99, chargedAmount: 9.99 }, reason: 'amount_mismatch' },
    { name: 'charged a cent less', pay: { amount: 10, chargedAmount: 9.99 }, reason: 'amount_mismatch' },
    { name: 'no charged amount', pay: { amount: 10, chargedAmount: null }, reason: 'amount_mismatch' },
    // A naira charge on a dollar checkout, even for "more" (₦15,000 or 10): never dollars.
    { name: 'paid in naira, same value', pay: { amount: 15_000, chargedAmount: 15_000, currency: 'NGN' }, reason: 'currency_mismatch' },
    { name: 'paid in naira, same number', pay: { amount: 10, chargedAmount: 10, currency: 'NGN' }, reason: 'currency_mismatch' },
  ];
  for (const testCase of cases) {
    it(`${testCase.name}: not credited (redirect or webhook)`, async () => {
      const player = await createPlayer(e2e);
      const before = await player.cash();
      const started = await startDollars(player, 10);
      const transaction = fw.pay(started.reference, testCase.pay);
      expect(ok<TopupVerificationDto>(await verify(player, started.reference, transaction)).fulfilledNow).toBe(false);
      ok(await webhook(fw.chargeWebhook(transaction)));
      await processed(`charge-${transaction.id}`);
      expect(await paymentRow(e2e, started.reference)).toMatchObject({ status: 'failed', failure_reason: testCase.reason, fulfilled_at: null });
      expect(await player.cash()).toBe(before);
      expect(await credits(player, started.reference)).toHaveLength(0);
    });
  }

  it('a dollar charge on a naira checkout is never credited either', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = ok<TopupStartedDto>(await player.post('/payments/topups', { packageId: 'owambe-pack' }));
    expect(started.topup.currency).toBe('NGN');
    const transaction = fw.pay(started.reference, { amount: 2_500, chargedAmount: 2_500, currency: 'USD' });
    ok(await verify(player, started.reference, transaction));
    expect(await paymentRow(e2e, started.reference)).toMatchObject({ status: 'failed', failure_reason: 'currency_mismatch' });
    expect(await player.cash()).toBe(before);
  });

  it('a refund that arrives before the dollar charge was confirmed delivers nothing at all', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startDollars(player, 5);
    const transaction = fw.pay(started.reference);
    const refund = fw.dashboardRefund(transaction.id, 5);
    ok(await webhook(fw.refundWebhook(refund)));
    await processed(`refund-${refund.id}-completed`);
    ok(await verify(player, started.reference, transaction));
    ok(await webhook(fw.chargeWebhook(transaction)));
    await processed(`charge-${transaction.id}`);
    expect(await player.cash()).toBe(before);
    expect(await paymentRow(e2e, started.reference)).toMatchObject({ status: 'success', refund_status: 'refunded', refunded_minor: '500' });
    expect(await credits(player, started.reference)).toHaveLength(0);
  });
});

describe('Apple Pay and Google Pay are dollar checkouts, verified exactly like cards', () => {
  it('Apple Pay: a wallet charge whose page the player is sent to; credited only once Flutterwave confirms it', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const started = await startDollars(player, 10, { method: 'applepay' });
    expect(fw.callsTo('POST', '/charges?type=applepay')).toBeGreaterThanOrEqual(1);
    expect(started.authorizationUrl).toMatch(/^https:\/\/applepay\.flutterwave\.test\//);
    expect(fw.checkouts.get(started.reference)).toMatchObject({ amount: 10, currency: 'USD', method: 'applepay', redirectUrl: expect.stringMatching(/\/payments\/callback$/) });

    // Not paid yet: the pending wallet charge credits nothing, whoever asks.
    expect(ok<TopupVerificationDto>(await verify(player, started.reference)).fulfilledNow).toBe(false);
    expect(await player.cash()).toBe(before);

    const transaction = fw.pay(started.reference);
    expect(transaction.payment_type).toBe('applepay');
    ok(await webhook(fw.chargeWebhook(transaction)));
    expect(await processed(`charge-${transaction.id}`)).toBe('record-success');
    expect(await player.cash()).toBe(before + topupVirtualAmountUsd(10, RATE));
    expect(await paymentRow(e2e, started.reference)).toMatchObject({ status: 'success', channel: 'applepay', currency: 'USD', paid_minor: '1000' });
  });

  it('Google Pay: the reconciler confirms it when the player never comes back; a short wallet charge is refused', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const paid = await startDollars(player, 5, { method: 'googlepay' });
    expect(paid.authorizationUrl).toMatch(/^https:\/\/googlepay\.flutterwave\.test\//);
    fw.pay(paid.reference);
    await sweepWhenDue(e2e, paid.reference);
    expect(await player.cash()).toBe(before + topupVirtualAmountUsd(5, RATE));

    const short = await startDollars(player, 5, { method: 'googlepay' });
    const transaction = fw.pay(short.reference, { amount: 4.99, chargedAmount: 4.99 });
    ok(await webhook(fw.chargeWebhook(transaction)));
    await processed(`charge-${transaction.id}`);
    expect(await paymentRow(e2e, short.reference)).toMatchObject({ status: 'failed', failure_reason: 'amount_mismatch' });
    expect(await player.cash()).toBe(before + topupVirtualAmountUsd(5, RATE));
  });
});

describe('the owner’s ₦ per $1 rate', () => {
  it('is owner-edited (₦500–₦5,000) and audited; a change only affects new checkouts', async () => {
    const player = await createPlayer(e2e);
    const before = await player.cash();
    const old = await startDollars(player, 10);

    refused(await owner.put('/ad-rates/usd-rate', { priceKobo: 499 * 100, reason: 'Too low a rate' }), 400);
    refused(await owner.put('/ad-rates/usd-rate', { priceKobo: 1_500 * 100 + 50, reason: 'Not whole naira' }), 422, 'INVALID_RATE');
    refused(await owner.put('/ad-rates/usd-rate', { priceKobo: 5_001 * 100, reason: 'Too high a rate' }), 422, 'INVALID_RATE');
    const changed = ok<{ key: string; currentKobo: number; unit: string }>(await owner.put('/ad-rates/usd-rate', { priceKobo: 1_600 * 100, reason: 'Parallel market moved' }));
    try {
      expect(changed).toMatchObject({ key: 'usd-rate', currentKobo: 160_000, unit: 'ngn-per-usd' });
      const [audit] = await e2e.dataSource.query<Array<{ action: string; reason: string }>>(
        `SELECT action, reason FROM audit_logs WHERE target_type = 'ad-rate' AND target_id = 'usd-rate' ORDER BY occurred_at DESC LIMIT 1`,
      );
      expect(audit).toEqual({ action: 'ad-rate.update', reason: 'Parallel market moved' });

      // New quotes use ₦1,600; a player who saw ₦1,500 is told instead of being charged differently.
      expect(ok<TopupCatalogDto>(await player.get('/payments/packages')).usd?.ngnPerUsd).toBe(1_600);
      refused(await player.post('/payments/topups', { currency: 'USD', amountUsd: 10, expectedNgnPerUsd: RATE }), 409, 'RATE_CHANGED');
      const fresh = ok<TopupStartedDto>(await player.post('/payments/topups', { currency: 'USD', amountUsd: 10, expectedNgnPerUsd: 1_600 }));
      expect(fresh.topup).toMatchObject({ ngnPerUsd: 1_600, priceNgn: 16_000, virtualAmount: topupVirtualAmountUsd(10, 1_600) });

      // The checkout started at ₦1,500 credits at ₦1,500 (its stored rate), whatever the rate is now.
      ok(await verify(player, old.reference, fw.pay(old.reference)));
      expect(await player.cash()).toBe(before + topupVirtualAmountUsd(10, RATE));
      ok(await verify(player, fresh.reference, fw.pay(fresh.reference)));
      expect(await player.cash()).toBe(before + topupVirtualAmountUsd(10, RATE) + topupVirtualAmountUsd(10, 1_600));
    } finally {
      ok(await owner.put('/ad-rates/usd-rate', { priceKobo: RATE * 100, reason: 'Back to the default rate' }));
    }
    expect(ok<TopupCatalogDto>(await player.get('/payments/packages')).usd?.ngnPerUsd).toBe(RATE);
  });
});

describe('refunds of dollar payments take back the coins in proportion, once', () => {
  async function paidDollars(player: Player, amountUsd: number): Promise<{ reference: string; transaction: FakeTransaction }> {
    const started = await startDollars(player, amountUsd);
    const transaction = fw.pay(started.reference);
    ok(await verify(player, started.reference, transaction));
    return { reference: started.reference, transaction };
  }

  it('two partial dollar refunds each take their share; the same refund reported again takes nothing more', async () => {
    const player = await createPlayer(e2e);
    const start = await player.cash();
    const { reference, transaction } = await paidDollars(player, 10);
    const credit = topupVirtualAmountUsd(10, RATE);
    const first = fw.dashboardRefund(transaction.id, 2.5);
    ok(await webhook(fw.refundWebhook(first)));
    await processed(`refund-${first.id}-completed`);
    expect(await player.cash()).toBe(start + credit - credit / 4);
    expect(await paymentRow(e2e, reference)).toMatchObject({ refund_status: 'refunded', refunded_minor: '250' });
    await (await queue.getJob(`refund-${first.id}-completed`))?.remove();
    ok(await webhook(fw.refundWebhook(first)));
    expect(await processed(`refund-${first.id}-completed`)).toBe('duplicate');
    expect(await player.cash()).toBe(start + credit - credit / 4);

    const second = fw.dashboardRefund(transaction.id, 7.5);
    ok(await webhook(fw.refundWebhook(second)));
    await processed(`refund-${second.id}-completed`);
    expect(await player.cash()).toBe(start);
    expect(await paymentRow(e2e, reference)).toMatchObject({ refunded_minor: '1000' });
    expect((await player.character()).purchased_total).toBe(0);
  });

  it('what was already spent becomes a debt, recorded once and repaid from the next money in', async () => {
    const player = await createPlayer(e2e);
    // From ₦0, so the dollars bought below always fit the monthly FX allowance, whatever the starting money.
    await drainCash(e2e, player);
    const { transaction } = await paidDollars(player, 2);
    // Move most of it into dollars (out of reach of a claw-back), capped at ₦5m: the CBN monthly allowance is real-world and doesn't grow with the income multiplier.
    ok(await player.post('/fx/orders', { side: 'buy-usd', amountNaira: Math.min((await player.cash()) - 1_000, 5_000_000), idempotencyKey: key() }));
    const cash = await player.cash();
    const owed = topupVirtualAmountUsd(2, RATE) - cash;
    expect(owed).toBeGreaterThan(0);

    const refund = fw.dashboardRefund(transaction.id, 2);
    ok(await webhook(fw.refundWebhook(refund)));
    await processed(`refund-${refund.id}-completed`);
    expect(await player.cash()).toBe(0);
    expect((await player.character()).debt).toBe(owed);
    await (await queue.getJob(`refund-${refund.id}-completed`))?.remove();
    ok(await webhook(fw.refundWebhook(refund)));
    await processed(`refund-${refund.id}-completed`);
    expect(await e2e.dataSource.query(`SELECT amount FROM character_debts WHERE character_id = $1`, [player.characterId])).toEqual([{ amount: String(owed) }]);

    // The next dollar top-up repays the debt before the player can spend it.
    const next = await paidDollars(player, 50);
    expect(await credits(player, next.reference)).toHaveLength(1);
    expect((await player.character()).debt).toBe(0);
    expect(await player.cash()).toBe(topupVirtualAmountUsd(50, RATE) - owed);
  });
});

describe('ads and songs in dollars: the naira price ÷ the rate, rounded up to the cent, snapshotted on the order', () => {
  async function book(buyer: Player, slotId: string, body: object): Promise<CampaignCheckoutDto> {
    const creative = await uploadCreative(buyer, slotId);
    return ok<CampaignCheckoutDto>(
      await buyer.post('/promotions/campaigns', { slotId, creativeKey: creative.creativeKey, title: 'Suya Spot Dollars', linkUrl: 'https://suyaspot.ng', blocks: 1, ...body }),
    );
  }

  it('books a billboard in dollars, verifies it in cents, and refunds it in dollars when rejected', async () => {
    const buyer = await createPlayer(e2e);
    const checkout = await book(buyer, 'bs-11-12-p', { currency: 'USD', expectedNgnPerUsd: RATE });
    const cents = usdCentsForKobo(checkout.quote.totalKobo, RATE);
    expect(checkout.charge).toEqual({ currency: 'USD', amountMinor: cents, ngnPerUsd: RATE });
    expect(checkout.campaign).toMatchObject({ amountKobo: checkout.quote.totalKobo, currency: 'USD', chargeMinor: cents, ngnPerUsd: RATE });
    expect(fw.checkouts.get(checkout.reference)).toMatchObject({ amount: cents / 100, currency: 'USD', method: 'card' });
    expect(await paymentRow(e2e, checkout.reference)).toMatchObject({ currency: 'USD', amount_minor: String(cents), amount_kobo: String(cents * RATE), ngn_per_usd: RATE });

    const transaction = fw.pay(checkout.reference);
    expect(ok<PaymentVerificationDto>(await buyer.post(`/payments/${checkout.reference}/verification`, { transactionId: String(transaction.id) })).fulfilledNow).toBe(true);
    const [paid] = await e2e.dataSource.query<Array<{ status: string }>>(`SELECT status FROM promotion_campaigns WHERE id = $1`, [checkout.campaignId]);
    expect(paid?.status).toBe('in-review');

    const rejected = ok<{ status: string }>(await owner.post(`/moderation/campaigns/${checkout.campaignId}/reject`, { reason: 'Misleading claims' }));
    expect(rejected.status).toBe('refunded');
    expect(fw.callsTo('POST', `/transactions/${transaction.id}/refund`)).toBe(1);
    expect(await paymentRow(e2e, checkout.reference)).toMatchObject({ refund_status: 'refunded', refunded_minor: String(cents) });
    const detail = ok<{ receipt: { currency: string; chargedMinor: number; refundedMinor: number } }>(await buyer.get(`/promotions/campaigns/${checkout.campaignId}`));
    expect(detail.receipt).toMatchObject({ currency: 'USD', chargedMinor: cents, refundedMinor: cents });
    const [notice] = await e2e.dataSource.query<Array<{ body: string }>>(
      `SELECT body FROM notifications WHERE character_id = $1 AND title LIKE '%refund sent%' ORDER BY created_at DESC LIMIT 1`,
      [buyer.characterId],
    );
    expect(notice?.body).toContain(`$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`);
  });

  it('a naira payment can’t pay for a dollar booking (and dollar prices follow the rate the buyer saw)', async () => {
    const buyer = await createPlayer(e2e);
    refused(
      await buyer.post('/promotions/campaigns', {
        slotId: 'bs-11-20-p',
        creativeKey: (await uploadCreative(buyer, 'bs-11-20-p')).creativeKey,
        title: 'Old Rate',
        linkUrl: 'https://suyaspot.ng',
        blocks: 1,
        currency: 'USD',
        expectedNgnPerUsd: 1_400,
      }),
      422,
      'PRICE_CHANGED',
    );
    const checkout = await book(buyer, 'bs-11-24-n', { currency: 'USD', expectedNgnPerUsd: RATE });
    const transaction = fw.pay(checkout.reference, { amount: checkout.quote.totalKobo / 100, chargedAmount: checkout.quote.totalKobo / 100, currency: 'NGN' });
    expect(ok<PaymentVerificationDto>(await buyer.post(`/payments/${checkout.reference}/verification`, { transactionId: String(transaction.id) })).fulfilledNow).toBe(false);
    expect(await paymentRow(e2e, checkout.reference)).toMatchObject({ status: 'failed', failure_reason: 'currency_mismatch' });
    const [row] = await e2e.dataSource.query<Array<{ status: string }>>(`SELECT status FROM promotion_campaigns WHERE id = $1`, [checkout.campaignId]);
    expect(row?.status).toBe('pending-payment');
  });

  it('orders a club song in dollars with Google Pay', async () => {
    const artist = await createPlayer(e2e);
    const track = ok<ClubTrackDto>(await uploadTrack(artist, synthMp3(3 * 60), 'Dollar Groove'));
    const offer = ok<BillboardSlotsDto>(await artist.get('/promotions/slots')).clubSong;
    const order = ok<ClubOrderCheckoutDto>(
      await artist.post(`/promotions/tracks/${track.id}/orders`, {
        productId: 'all-clubs-7d',
        expectedStartDate: offer.nextStarts[0]!,
        expectedPriceKobo: offer.weekPriceKobo,
        currency: 'USD',
        method: 'googlepay',
        expectedNgnPerUsd: RATE,
      }),
    );
    const cents = usdCentsForKobo(offer.weekPriceKobo, RATE);
    expect(order.charge).toEqual({ currency: 'USD', amountMinor: cents, ngnPerUsd: RATE });
    expect(order.authorizationUrl).toMatch(/^https:\/\/googlepay\.flutterwave\.test\//);
    const transaction = fw.pay(order.reference);
    ok(await webhook(fw.chargeWebhook(transaction)));
    expect(await processed(`charge-${transaction.id}`)).toBe('record-success');
    const [row] = await e2e.dataSource.query<Array<{ status: string; currency: string; charge_minor: string }>>(
      `SELECT status, currency, charge_minor FROM promotion_club_orders WHERE id = $1`,
      [order.orderId],
    );
    expect(row).toEqual({ status: 'in-review', currency: 'USD', charge_minor: String(cents) });
    const history = ok<PaymentDto[]>(await artist.get('/payments'));
    expect(history.find((payment) => payment.reference === order.reference)).toMatchObject({ currency: 'USD', amountMinor: cents, channel: 'googlepay', fulfilled: true });
  });
});
