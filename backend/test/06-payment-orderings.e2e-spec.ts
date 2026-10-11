import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INCOME_MULTIPLIER as K, findAdSlot, type BillboardSlotsDto, type CampaignCheckoutDto, type ClubOrderCheckoutDto, type ClubTrackDto, type TopupStartedDto } from '@insidelife/shared';
import { lagosToday } from '../src/modules/promotions/rules/schedule.rules.js';
import { bootApp, type E2eApp } from './support/app.js';
import { FAKE_FLUTTERWAVE_KEY, FakeFlutterwave, type FakeTransaction } from './support/fake-flutterwave.js';
import { ledgerViolations, NO_VIOLATIONS, postingsWithKey } from './support/ledger.js';
import { synthMp3, uploadCreative, uploadTrack } from './support/media.js';
import { forgetJob, jobResult, paymentRow, sendWebhook, sweepAfterExpiry, sweepWhenDue } from './support/payments.js';
import { createPlayer, ok, refused, type Player } from './support/players.js';

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

const TOPUP_CREDIT = 1_000_000 * K;

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
      await buyer.post('/promotions/campaigns', { slotId, creativeKey: creative.creativeKey, title: 'Pepper Soup Joint', linkUrl: 'https://peppersoup.ng', blocks: 1 }),
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
  const base = { paymentStatus: row.status, refundStatus: row.refund_status, refundedKobo: Number(row.refunded_minor) };
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
    // Refunded before it was ever delivered, the booking ends at once (it doesn't sit at "awaiting payment").
    expect({ step, status: seen.itemStatus, deliveries: seen.deliveries }).toEqual({ step, status: 'refunded', deliveries: deliveredBeforeRefund ? 1 : 0 });
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

describe('two players racing for the last space (a phone-app slot holds one ad a day)', () => {
  const book = async (player: Player, slotId: string, expectedStartDate?: string) => {
    const creative = await uploadCreative(player, slotId);
    return player.post('/promotions/campaigns', {
      slotId,
      creativeKey: creative.creativeKey,
      title: `Racer ${player.handle.slice(0, 8)}`,
      tagline: 'First come, first served',
      linkUrl: 'https://racer.ng',
      blocks: 1,
      ...(expectedStartDate ? { expectedStartDate } : {}),
    });
  };
  const statusOf = async (id: string): Promise<string | undefined> =>
    (await e2e.dataSource.query<Array<{ status: string }>>(`SELECT status FROM promotion_campaigns WHERE id = $1`, [id]))[0]?.status;
  /** Bookings that hold the slot on a day (paid and not refused): never more than its capacity (1). */
  const maxPaidPerDay = async (slotId: string): Promise<number> => {
    const [row] = await e2e.dataSource.query<Array<{ n: number | null }>>(
      `SELECT MAX(n)::int AS n FROM (
         SELECT d, COUNT(*) AS n FROM promotion_campaigns c, generate_series(c.start_date::date, c.end_date::date - 1, interval '1 day') AS d
          WHERE c.slot_id = $1 AND c.status IN ('in-review', 'approved', 'live') GROUP BY d) days`,
      [slotId],
    );
    return row?.n ?? 0;
  };

  it('both book at once: one gets today, the other is told the next free day; nobody is double-booked', async () => {
    const [ada, femi] = [await createPlayer(e2e), await createPlayer(e2e)];
    const today = lagosToday();
    const [first, second] = await Promise.all([book(ada, 'app-8', today), book(femi, 'app-8', today)]);
    expect([first.status, second.status].toSorted()).toEqual([201, 422]);
    const loser = first.status === 422 ? first : second;
    expect(loser.body.errorCode).toBe('DATES_CHANGED');
    expect(loser.body.message).toMatch(/next free start is now/);
    // The slot's quote for everyone else now starts after the winner's week (the hold counts while they pay).
    const view = ok<BillboardSlotsDto>(await femi.get('/promotions/slots'));
    expect(view.slots.find((slot) => slot.id === 'app-8')?.nextStarts[0]).not.toBe(today);
  });

  it('while one player is paying, the other can only book after them; a late payer after the hold lapsed is refunded automatically', async () => {
    const [slow, fast, third] = [await createPlayer(e2e), await createPlayer(e2e), await createPlayer(e2e)];
    const today = lagosToday();
    const slowBooking = ok<CampaignCheckoutDto>(await book(slow, 'app-9', today));

    // Hold active: the second buyer's quote and booking start the day after the first buyer's week.
    const quote = ok<BillboardSlotsDto>(await fast.get('/promotions/slots')).slots.find((slot) => slot.id === 'app-9')!;
    expect(quote.nextStarts[0]).toBe(slowBooking.campaign.endDate);
    refused(await book(fast, 'app-9', today), 422, 'DATES_CHANGED');

    // The slow buyer's checkout (and hold) expires before they pay; someone else takes the slot and pays at once.
    await e2e.dataSource.query(`UPDATE promotion_campaigns SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [slowBooking.campaignId]);
    const thirdBooking = ok<CampaignCheckoutDto>(await book(third, 'app-9', today));
    const thirdPaid = fw.pay(thirdBooking.reference);
    ok(await third.post(`/payments/${thirdBooking.reference}/verification`, { transactionId: String(thirdPaid.id) }));
    expect(await statusOf(thirdBooking.campaignId)).toBe('in-review');

    // Now the slow buyer pays (phone, redirect lost): whichever way it's confirmed, it's refunded once, automatically.
    const slowPaid = fw.pay(slowBooking.reference);
    ok(await sendWebhook(e2e, fw.chargeWebhook(slowPaid)));
    await jobResult(e2e, `charge-${slowPaid.id}`);
    await sweepWhenDue(e2e, slowBooking.reference);
    ok(await slow.post(`/payments/${slowBooking.reference}/verification`, { transactionId: String(slowPaid.id) }));
    expect(await statusOf(slowBooking.campaignId)).toBe('refunded');
    expect(await paymentRow(e2e, slowBooking.reference)).toMatchObject({ status: 'success', refund_status: 'refunded', refunded_minor: String(slowBooking.quote.totalKobo) });
    expect(fw.callsTo('POST', `/transactions/${slowPaid.id}/refund`)).toBe(1);

    // The paying buyer keeps the slot; at no point do two paid ads share it.
    expect(await statusOf(thirdBooking.campaignId)).toBe('in-review');
    expect((await paymentRow(e2e, thirdBooking.reference)).refund_status).toBeNull();
    expect(await maxPaidPerDay('app-9')).toBe(1);
    expect(await maxPaidPerDay('app-8')).toBeLessThanOrEqual(1);
  });

  it('refunded before anyone confirmed the payment: the booking ends at once and its days are free for the next player', async () => {
    const [buyer, next] = [await createPlayer(e2e), await createPlayer(e2e)];
    const nextFree = async (): Promise<string | undefined> => ok<BillboardSlotsDto>(await next.get('/promotions/slots')).slots.find((slot) => slot.id === 'app-7')?.nextStarts[0] ?? undefined;
    const freeBefore = (await nextFree())!;
    const booking = ok<CampaignCheckoutDto>(await book(buyer, 'app-7', freeBefore));
    expect(await nextFree()).not.toBe(freeBefore);

    const paid = fw.pay(booking.reference);
    const refund = fw.dashboardRefund(paid.id, booking.quote.totalKobo / 100);
    ok(await sendWebhook(e2e, fw.refundWebhook(refund)));
    expect(await jobResult(e2e, `refund-${refund.id}-completed`)).toBe('recorded');
    expect(await statusOf(booking.campaignId)).toBe('refunded');
    expect(await nextFree()).toBe(freeBefore);

    // The confirmation that arrives afterwards delivers nothing, and the next player gets those days.
    ok(await buyer.post(`/payments/${booking.reference}/verification`, { transactionId: String(paid.id) }));
    expect(await statusOf(booking.campaignId)).toBe('refunded');
    const nextBooking = ok<CampaignCheckoutDto>(await book(next, 'app-7', freeBefore));
    expect(nextBooking.campaign.startDate).toBe(freeBefore);
    // Leave the space as we found it for the tests after this one (an unpaid hold that lapsed holds nothing).
    await e2e.dataSource.query(`UPDATE promotion_campaigns SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [nextBooking.campaignId]);
    expect(await nextFree()).toBe(freeBefore);
  });

  it('both pay for the last space at once after a lapsed hold: exactly one keeps it, the other is refunded', async () => {
    const [first, second] = [await createPlayer(e2e), await createPlayer(e2e)];
    const today = lagosToday();
    const one = ok<CampaignCheckoutDto>(await book(first, 'app-10', today));
    // The first hold lapses, so a second booking for the same days is accepted; both then pay at the same moment.
    await e2e.dataSource.query(`UPDATE promotion_campaigns SET hold_expires_at = now() - interval '1 minute' WHERE id = $1`, [one.campaignId]);
    const two = ok<CampaignCheckoutDto>(await book(second, 'app-10', today));
    const [paidOne, paidTwo] = [fw.pay(one.reference), fw.pay(two.reference)];
    await Promise.all([
      first.post(`/payments/${one.reference}/verification`, { transactionId: String(paidOne.id) }),
      second.post(`/payments/${two.reference}/verification`, { transactionId: String(paidTwo.id) }),
    ]);
    const statuses = [await statusOf(one.campaignId), await statusOf(two.campaignId)].toSorted();
    expect(statuses).toEqual(['in-review', 'refunded']);
    expect(await maxPaidPerDay('app-10')).toBe(1);
    const refunds = fw.callsTo('POST', `/transactions/${paidOne.id}/refund`) + fw.callsTo('POST', `/transactions/${paidTwo.id}/refund`);
    expect(refunds).toBe(1);
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
      await late.post('/promotions/campaigns', { slotId: 'app-7', creativeKey: creative.creativeKey, title: 'Late Payer', tagline: 'Paid too late', linkUrl: 'https://latepayer.ng', blocks: 1 }),
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
        blocks: 1,
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
    expect(await paymentRow(e2e, lateBooking.reference)).toMatchObject({ refund_status: 'refunded', refunded_minor: String(lateBooking.quote.totalKobo) });
    expect(fw.callsTo('POST', `/transactions/${latePaid.id}/refund`)).toBe(1);
    expect(await statusOf(promptBooking.campaignId)).toBe('in-review');
    expect((await paymentRow(e2e, promptBooking.reference)).refund_status).toBeNull();
  });
});
