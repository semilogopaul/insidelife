import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findAdSlot, type BillboardSlotsDto, type CampaignCheckoutDto, type ClubOrderCheckoutDto, type ClubTrackDto, type TopupStartedDto } from '@insidelife/shared';
import { lagosToday } from '../src/modules/promotions/rules/schedule.rules.js';
import { bootApp, type E2eApp } from './support/app.js';
import { FAKE_FLUTTERWAVE_KEY, FakeFlutterwave, type FakeTransaction } from './support/fake-flutterwave.js';
import { ledgerViolations, NO_VIOLATIONS, postingsWithKey } from './support/ledger.js';
import { synthMp3, uploadCreative, uploadTrack } from './support/media.js';
import { forgetJob, jobResult, paymentRow, sendWebhook, sweepAfterExpiry, sweepWhenDue } from './support/payments.js';
import { createPlayer, ok, type Player } from './support/players.js';

/**
 * Live-mode payments (real Flutterwave client, fake Flutterwave API) for the three things players buy with real
 * money: a top-up, an ad and a club song. Whatever order the confirmations and the refund arrive in, the purchase is
 * delivered at most once, a refund takes it back exactly once, and nothing is delivered after a refund.
 */
let e2e: E2eApp;
const fw = new FakeFlutterwave();
let streetSlots: string[] = [];

beforeAll(async () => {
  fw.install();
  e2e = await bootApp({ env: { FLUTTERWAVE_SECRET_KEY: FAKE_FLUTTERWAVE_KEY } });
  const someone = await createPlayer(e2e);
  const view = ok<BillboardSlotsDto>(await someone.get('/promotions/slots'));
  // Roadside spots with room today, one per scenario so bookings never compete for space.
  const roadside = new Set(['street-billboard', 'bus-shelter', 'totem', 'market-banner', 'park-board']);
  streetSlots = view.slots.filter((slot) => roadside.has(findAdSlot(slot.id)?.kind ?? '') && slot.nextStarts[0] === view.today).map((slot) => slot.id);
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
  fw.uninstall();
});

type Kind = 'topup' | 'ad' | 'song';

interface Purchase {
  readonly kind: Kind;
  readonly buyer: Player;
  readonly reference: string;
  /** Real naira paid. */
  readonly amountNaira: number;
  /** Ad campaign or club order id. */
  readonly itemId: string | null;
  /** Cash before the top-up. */
  readonly cashBefore: number;
}

const TOPUP_CREDIT = 1_000_000;

async function startPurchase(kind: Kind): Promise<Purchase> {
  const buyer = await createPlayer(e2e);
  const cashBefore = await buyer.cash();
  if (kind === 'topup') {
    const started = ok<TopupStartedDto>(await buyer.post('/payments/topups', { packageId: 'owambe-pack' }));
    return { kind, buyer, reference: started.reference, amountNaira: 2_500, itemId: null, cashBefore };
  }
  if (kind === 'ad') {
    const slotId = streetSlots.shift();
    if (!slotId) throw new RangeError('Ran out of free roadside slots');
    const creative = await uploadCreative(buyer, slotId);
    const checkout = ok<CampaignCheckoutDto>(
      await buyer.post('/promotions/campaigns', { slotId, creativeKey: creative.creativeKey, title: 'Pepper Soup Joint', linkUrl: 'https://peppersoup.ng', weeks: 1 }),
    );
    return { kind, buyer, reference: checkout.reference, amountNaira: checkout.quote.totalKobo / 100, itemId: checkout.campaignId, cashBefore };
  }
  const track = ok<ClubTrackDto>(await uploadTrack(buyer, synthMp3(150)));
  const order = ok<ClubOrderCheckoutDto>(await buyer.post(`/promotions/tracks/${track.id}/orders`, { productId: 'all-clubs-7d' }));
  return { kind, buyer, reference: order.reference, amountNaira: order.quote.totalKobo / 100, itemId: order.orderId, cashBefore };
}

const itemTable = (kind: Kind): string => (kind === 'ad' ? 'promotion_campaigns' : 'promotion_club_orders');

interface Observed {
  readonly credits: number;
  readonly clawbacks: number;
  readonly cashDelta: number;
  readonly itemStatus: string | null;
  /** Times the item was marked paid (delivered) in its moderation log. */
  readonly deliveries: number;
  readonly paymentStatus: string;
  readonly refundStatus: string | null;
  readonly refundedKobo: number;
}

async function observe(purchase: Purchase): Promise<Observed> {
  const row = await paymentRow(e2e, purchase.reference);
  const base = { paymentStatus: row.status, refundStatus: row.refund_status, refundedKobo: Number(row.refunded_kobo) };
  if (purchase.kind === 'topup') {
    const id = purchase.buyer.characterId;
    const credits = (await postingsWithKey(e2e.dataSource, `${id}:topup:${purchase.reference}`)).length;
    const clawbacks = (await postingsWithKey(e2e.dataSource, `${id}:topup-clawback:${purchase.reference}`)).length;
    return { ...base, credits, clawbacks, cashDelta: (await purchase.buyer.cash()) - purchase.cashBefore, itemStatus: null, deliveries: credits };
  }
  const [item] = await e2e.dataSource.query<Array<{ status: string }>>(`SELECT status FROM ${itemTable(purchase.kind)} WHERE id = $1`, [purchase.itemId]);
  const [log] = await e2e.dataSource.query<Array<{ n: number }>>(`SELECT COUNT(*)::int AS n FROM promotion_moderation_log WHERE subject_id = $1 AND action = 'paid'`, [purchase.itemId]);
  return { ...base, credits: 0, clawbacks: 0, cashDelta: 0, itemStatus: item?.status ?? null, deliveries: log?.n ?? 0 };
}

/** Delivered and not refunded: coins in the wallet, or the ad/song waiting for review. */
function expectDelivered(purchase: Purchase, seen: Observed, step: string): void {
  if (purchase.kind === 'topup') {
    expect({ step, credits: seen.credits, clawbacks: seen.clawbacks, cash: seen.cashDelta }).toEqual({ step, credits: 1, clawbacks: 0, cash: TOPUP_CREDIT });
  } else {
    expect({ step, status: seen.itemStatus, deliveries: seen.deliveries }).toEqual({ step, status: 'in-review', deliveries: 1 });
  }
  expect({ step, payment: seen.paymentStatus, refund: seen.refundStatus }).toEqual({ step, payment: 'success', refund: null });
}

function expectNotDelivered(purchase: Purchase, seen: Observed, step: string): void {
  if (purchase.kind === 'topup') expect({ step, credits: seen.credits, cash: seen.cashDelta }).toEqual({ step, credits: 0, cash: 0 });
  else expect({ step, status: seen.itemStatus, deliveries: seen.deliveries }).toEqual({ step, status: 'pending-payment', deliveries: 0 });
}

/** Refunded in full: whatever was delivered was taken back once; nothing was delivered after the refund. */
function expectRefunded(purchase: Purchase, seen: Observed, step: string, deliveredBeforeRefund: boolean): void {
  expect({ step, payment: seen.paymentStatus, refund: seen.refundStatus, refunded: seen.refundedKobo }).toEqual({
    step,
    payment: 'success',
    refund: 'refunded',
    refunded: purchase.amountNaira * 100,
  });
  if (purchase.kind === 'topup') {
    const once = deliveredBeforeRefund ? 1 : 0;
    expect({ step, credits: seen.credits, clawbacks: seen.clawbacks, cash: seen.cashDelta }).toEqual({ step, credits: once, clawbacks: once, cash: 0 });
  } else {
    expect({ step, status: seen.itemStatus, deliveries: seen.deliveries }).toEqual({
      step,
      status: deliveredBeforeRefund ? 'refunded' : 'pending-payment',
      deliveries: deliveredBeforeRefund ? 1 : 0,
    });
  }
}

// ----- Events ---------------------------------------------------------------------------------------------------------

const EVENTS = ['redirect', 'webhook', 'reconciler', 'duplicate-webhook', 'refund-webhook'] as const;
type PaymentEvent = (typeof EVENTS)[number];
const CONFIRMING: ReadonlySet<PaymentEvent> = new Set(['redirect', 'webhook', 'reconciler', 'duplicate-webhook']);

async function happen(event: PaymentEvent, purchase: Purchase, transaction: FakeTransaction): Promise<void> {
  switch (event) {
    case 'redirect':
      ok(await purchase.buyer.post(`/payments/${purchase.reference}/verification`, { transactionId: String(transaction.id) }));
      return;
    case 'webhook':
    case 'duplicate-webhook': {
      // Each delivery is processed (a duplicate isn't swallowed by the queue's job id: the worker sees it again).
      await forgetJob(e2e, `charge-${transaction.id}`);
      ok(await sendWebhook(e2e, fw.chargeWebhook(transaction)));
      const result = await jobResult(e2e, `charge-${transaction.id}`);
      expect(['record-success', 'already-paid']).toContain(result);
      return;
    }
    case 'reconciler':
      await sweepWhenDue(e2e, purchase.reference);
      return;
    case 'refund-webhook': {
      const refund = fw.dashboardRefund(transaction.id, purchase.amountNaira);
      ok(await sendWebhook(e2e, fw.refundWebhook(refund)));
      expect(await jobResult(e2e, `refund-${refund.id}-completed`)).toBe('recorded');
      return;
    }
  }
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

const ORDERS = permutations(EVENTS);

describe.each<Kind>(['topup', 'ad', 'song'])('every order of redirect, webhook, reconciler, duplicate webhook and refund: %s', (kind) => {
  it.each(ORDERS.map((order) => [order.join(' → '), order] as const))('%s', async (_name, order) => {
    const purchase = await startPurchase(kind);
    const transaction = fw.pay(purchase.reference);
    expectNotDelivered(purchase, await observe(purchase), 'paid, nobody told us yet');

    let confirmed = false;
    let refunded = false;
    let deliveredBeforeRefund = false;
    for (const event of order) {
      await happen(event, purchase, transaction);
      if (event === 'refund-webhook') {
        refunded = true;
        deliveredBeforeRefund = confirmed;
      } else if (CONFIRMING.has(event)) {
        confirmed = true;
      }
      const seen = await observe(purchase);
      if (refunded) expectRefunded(purchase, seen, `after ${event}`, deliveredBeforeRefund);
      else if (confirmed) expectDelivered(purchase, seen, `after ${event}`);
      else expectNotDelivered(purchase, seen, `after ${event}`);
    }
    // Flutterwave was never asked to refund anything (the refund was the dashboard's), and nothing is left owed.
    expect(fw.callsTo('POST', `/transactions/${transaction.id}/refund`)).toBe(0);
  });
});

describe('the owner’s phone payment: redirect lost, no webhook, checkout link expired', () => {
  it.each<Kind>(['topup', 'ad', 'song'])('%s: paid with no redirect and no webhook → the reconciler delivers it exactly once', async (kind) => {
    const purchase = await startPurchase(kind);
    fw.pay(purchase.reference);
    expectNotDelivered(purchase, await observe(purchase), 'awaiting payment');
    await sweepWhenDue(e2e, purchase.reference);
    expectDelivered(purchase, await observe(purchase), 'after the reconciler');
    await sweepWhenDue(e2e, purchase.reference);
    await sweepWhenDue(e2e, purchase.reference);
    expectDelivered(purchase, await observe(purchase), 'after more sweeps');
  });

  it.each<Kind>(['topup', 'ad', 'song'])('%s: a webhook arriving after the reconciler delivered it changes nothing', async (kind) => {
    const purchase = await startPurchase(kind);
    const transaction = fw.pay(purchase.reference);
    await sweepWhenDue(e2e, purchase.reference);
    ok(await sendWebhook(e2e, fw.chargeWebhook(transaction)));
    expect(await jobResult(e2e, `charge-${transaction.id}`)).toBe('already-paid');
    ok(await purchase.buyer.post(`/payments/${purchase.reference}/verification`, { transactionId: String(transaction.id) }));
    expectDelivered(purchase, await observe(purchase), 'after the late webhook and redirect');
  });

  it.each<Kind>(['topup', 'ad', 'song'])('%s: never paid → checked on schedule, then abandoned after the final check; nothing delivered', async (kind) => {
    const purchase = await startPurchase(kind);
    await sweepWhenDue(e2e, purchase.reference);
    await sweepWhenDue(e2e, purchase.reference);
    expect((await paymentRow(e2e, purchase.reference)).status).toBe('initialized');
    await sweepAfterExpiry(e2e, purchase.reference);
    expect(await paymentRow(e2e, purchase.reference)).toMatchObject({ status: 'abandoned', failure_reason: 'checkout_expired', fulfilled_at: null });
    expectNotDelivered(purchase, await observe(purchase), 'abandoned');
  });

  it('top-up: a payment that lands after the checkout was given up is still delivered, once', async () => {
    const purchase = await startPurchase('topup');
    await sweepAfterExpiry(e2e, purchase.reference);
    expect((await paymentRow(e2e, purchase.reference)).status).toBe('abandoned');
    const transaction = fw.pay(purchase.reference);
    ok(await sendWebhook(e2e, fw.chargeWebhook(transaction)));
    expect(await jobResult(e2e, `charge-${transaction.id}`)).toBe('record-success');
    ok(await sendWebhook(e2e, fw.chargeWebhook(transaction)));
    expectDelivered(purchase, await observe(purchase), 'late payment');
  });

  it('ad: paid after the booking’s hold lapsed and someone else took the slot → refunded automatically, once', async () => {
    const late = await createPlayer(e2e);
    const creative = await uploadCreative(late, 'app-7');
    const lateBooking = ok<CampaignCheckoutDto>(
      await late.post('/promotions/campaigns', { slotId: 'app-7', creativeKey: creative.creativeKey, title: 'Late Payer', tagline: 'Paid too late', linkUrl: 'https://latepayer.ng', weeks: 1 }),
    );
    // The checkout link (and the slot hold) ran out before the player paid.
    await e2e.dataSource.query(`UPDATE promotion_campaigns SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [lateBooking.campaignId]);

    const prompt = await createPlayer(e2e);
    const promptCreative = await uploadCreative(prompt, 'app-7');
    const promptBooking = ok<CampaignCheckoutDto>(
      await prompt.post('/promotions/campaigns', {
        slotId: 'app-7',
        creativeKey: promptCreative.creativeKey,
        title: 'Prompt Payer',
        tagline: 'Paid on time',
        linkUrl: 'https://promptpayer.ng',
        weeks: 1,
        expectedStartDate: lagosToday(),
      }),
    );
    const promptPaid = fw.pay(promptBooking.reference);
    ok(await prompt.post(`/payments/${promptBooking.reference}/verification`, { transactionId: String(promptPaid.id) }));

    const latePaid = fw.pay(lateBooking.reference);
    await sweepWhenDue(e2e, lateBooking.reference);
    ok(await late.post(`/payments/${lateBooking.reference}/verification`, { transactionId: String(latePaid.id) }));
    ok(await sendWebhook(e2e, fw.chargeWebhook(latePaid)));
    await jobResult(e2e, `charge-${latePaid.id}`);

    const statusOf = async (id: string): Promise<string | undefined> =>
      (await e2e.dataSource.query<Array<{ status: string }>>(`SELECT status FROM promotion_campaigns WHERE id = $1`, [id]))[0]?.status;
    expect(await statusOf(lateBooking.campaignId)).toBe('refunded');
    expect(await paymentRow(e2e, lateBooking.reference)).toMatchObject({ refund_status: 'refunded', refunded_kobo: String(lateBooking.quote.totalKobo) });
    expect(fw.callsTo('POST', `/transactions/${latePaid.id}/refund`)).toBe(1);
    expect(await statusOf(promptBooking.campaignId)).toBe('in-review');
    expect((await paymentRow(e2e, promptBooking.reference)).refund_status).toBeNull();
  });
});
