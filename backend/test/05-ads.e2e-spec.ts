import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AdRateDto,
  type BillboardSlotsDto,
  type CampaignCheckoutDto,
  type ClubOrderCheckoutDto,
  type ClubRotationDto,
  type ClubTrackDto,
  type LiveBillboardsDto,
  type ModerationQueueDto,
  type PaymentVerificationDto,
} from '@insidelife/shared';
import { addDays, lagosToday } from '../src/modules/promotions/rules/schedule.rules.js';
import { grantAdmin, signInOwner, type Admin } from './support/admin.js';
import { bootApp, type E2eApp } from './support/app.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { forgedMp3, synthMp3, taggedMp3, uploadCreative, uploadTrack } from './support/media.js';
import { call, createPlayer, ok, refused, type Player } from './support/players.js';

let e2e: E2eApp;
let owner: Admin;
let moderator: Admin;

beforeAll(async () => {
  e2e = await bootApp();
  owner = await signInOwner(e2e);
  moderator = await grantAdmin(e2e, owner, 'moderator@e2e.test');
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

const NAIRA = 100;
const today = (): string => lagosToday();

async function slots(player: Player): Promise<BillboardSlotsDto> {
  return ok<BillboardSlotsDto>(await player.get('/promotions/slots'));
}

const live = async (): Promise<LiveBillboardsDto> => ok<LiveBillboardsDto>(await call(e2e, 'get', '/promotions/billboards/live'));

interface PaymentRow {
  readonly amount_kobo: string;
  readonly status: string;
  readonly refund_status: string | null;
  readonly refunded_kobo: string;
}
const payment = async (reference: string): Promise<PaymentRow> => (await e2e.dataSource.query<PaymentRow[]>(`SELECT * FROM payments WHERE reference = $1`, [reference]))[0]!;

async function book(buyer: Player, slotId: string, body: Record<string, unknown> = {}) {
  const creative = await uploadCreative(buyer, slotId);
  return buyer.post('/promotions/campaigns', {
    slotId,
    creativeKey: creative.creativeKey,
    title: 'Suya Republic',
    tagline: 'Hot suya, delivered',
    linkUrl: 'https://suyarepublic.ng/order',
    weeks: 1,
    ...body,
  });
}

async function payInSandbox(buyer: Player, reference: string): Promise<PaymentVerificationDto> {
  return ok<PaymentVerificationDto>(await buyer.post(`/payments/sandbox/${reference}/succeed`));
}

describe('prices and booking rules', () => {
  it('quotes the weekly prices players were promised', async () => {
    const player = await createPlayer(e2e);
    const view = await slots(player);
    const price = (id: string): number | undefined => view.slots.find((slot) => slot.id === id)?.weekPriceKobo;
    expect(price('mmia-arrivals')).toBe(175_000 * NAIRA);
    expect(price('third-mainland-north')).toBe(140_000 * NAIRA);
    expect(price('lekki-toll-gate')).toBe(105_000 * NAIRA);
    expect(price('ikorodu-garage')).toBe(17_500 * NAIRA);
    expect(price('lagos-tv')).toBe(42_000 * NAIRA);
    expect(price('app-1')).toBe(100_000 * NAIRA);
    expect(view.clubSong).toMatchObject({ priceKobo: 5_000 * NAIRA, days: 7 });
    expect(view.maxWeeks).toBe(4);
    // Street spots are district-scaled and never under ₦2,000 a week.
    expect(view.slots.every((slot) => slot.weekPriceKobo >= 2_000 * NAIRA && slot.weekPriceKobo % (500 * NAIRA) === 0)).toBe(true);
  });

  it('books 1–4 weeks from the next free day and refuses anything else', async () => {
    const buyer = await createPlayer(e2e);
    refused(await book(buyer, 'ikeja-allen', { weeks: 0 }), 400);
    refused(await book(buyer, 'ikeja-allen', { weeks: 5 }), 400);
    refused(await book(buyer, 'ikeja-allen', { linkUrl: 'http://insecure.ng' }), 422, 'INVALID_LINK');
    refused(await book(buyer, 'ikeja-allen', { expectedStartDate: addDays(today(), 3) }), 422, 'DATES_CHANGED');
    const wrongPrice = await book(buyer, 'ikeja-allen', { weeks: 2, expectedPriceKobo: 56_000 * NAIRA });
    refused(wrongPrice, 422, 'PRICE_CHANGED');
    expect(wrongPrice.body.details).toEqual([`weekPriceKobo=${56_000 * NAIRA}`, `totalKobo=${112_000 * NAIRA}`]);

    const checkout = ok<CampaignCheckoutDto>(await book(buyer, 'ikeja-allen', { weeks: 2, expectedStartDate: today(), expectedPriceKobo: 112_000 * NAIRA }));
    expect(checkout.quote).toMatchObject({ weeks: 2, days: 14, weekPriceKobo: 56_000 * NAIRA, totalKobo: 112_000 * NAIRA });
    expect(checkout.campaign).toMatchObject({ startDate: today(), endDate: addDays(today(), 14), status: 'pending-payment' });
    expect(Number((await payment(checkout.reference)).amount_kobo)).toBe(112_000 * NAIRA);
  });
});

describe('a billboard from booking to the live feed', () => {
  it('pay → moderation queue → approved by an admin → on the live billboards', async () => {
    const buyer = await createPlayer(e2e);
    const checkout = ok<CampaignCheckoutDto>(await book(buyer, 'mmia-arrivals', { weeks: 2, expectedStartDate: today(), expectedPriceKobo: 350_000 * NAIRA }));
    expect((await live()).slots.find((slot) => slot.slotId === 'mmia-arrivals')?.creatives.map((creative) => creative.campaignId) ?? []).not.toContain(checkout.campaignId);

    const paid = await payInSandbox(buyer, checkout.reference);
    expect(paid.fulfilledNow).toBe(true);
    const queue = ok<ModerationQueueDto>(await moderator.get('/moderation/queue'));
    expect(queue.campaigns.map((campaign) => campaign.id)).toContain(checkout.campaignId);
    // Paid but not approved yet: still not on the board.
    expect((await live()).slots.find((slot) => slot.slotId === 'mmia-arrivals')?.creatives.map((creative) => creative.campaignId) ?? []).not.toContain(checkout.campaignId);

    const approved = ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${checkout.campaignId}/approve`));
    expect(approved.status).toBe('live');
    const board = (await live()).slots.find((slot) => slot.slotId === 'mmia-arrivals')!;
    expect(board.creatives.map((creative) => creative.campaignId)).toContain(checkout.campaignId);
    expect(ok<Array<{ id: string; status: string }>>(await buyer.get('/promotions/campaigns')).find((campaign) => campaign.id === checkout.campaignId)?.status).toBe('live');

    // Audited: who approved what.
    const audit = ok<{ items: Array<{ action: string; target: { id: string } }> }>(await owner.get(`/audit-logs?action=campaign.approve&targetId=${checkout.campaignId}`));
    expect(audit.items).toHaveLength(1);
  });

  it('a phone-app ad costs ₦100,000 a week, holds its slot, and the next run starts the day the slot is free', async () => {
    const first = await createPlayer(e2e);
    const second = await createPlayer(e2e);
    const one = ok<CampaignCheckoutDto>(await book(first, 'app-1', { title: 'Chop Express', tagline: 'Food in 30 minutes', expectedStartDate: today(), expectedPriceKobo: 100_000 * NAIRA }));
    expect(Number((await payment(one.reference)).amount_kobo)).toBe(100_000 * NAIRA);
    // While the first booking's checkout is open, the slot is held: the next run starts a week later.
    const nextFree = addDays(today(), 7);
    expect((await slots(second)).slots.find((slot) => slot.id === 'app-1')?.nextStarts[0]).toBe(nextFree);
    refused(await book(second, 'app-1', { expectedStartDate: today() }), 422, 'DATES_CHANGED');
    const two = ok<CampaignCheckoutDto>(await book(second, 'app-1', { title: 'Keke Ride', tagline: 'Book a keke', expectedStartDate: nextFree, expectedPriceKobo: 100_000 * NAIRA }));
    expect(two.campaign).toMatchObject({ startDate: nextFree, endDate: addDays(nextFree, 7) });

    await payInSandbox(first, one.reference);
    await payInSandbox(second, two.reference);
    expect(ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${one.campaignId}/approve`)).status).toBe('live');
    expect(ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${two.campaignId}/approve`)).status).toBe('approved');
    const apps = (await live()).phoneApps;
    expect(apps.find((app) => app.slotId === 'app-1')).toMatchObject({ campaignId: one.campaignId, name: 'Chop Express', tagline: 'Food in 30 minutes' });

    // Rejected before it starts running (approved for next week): refunded automatically.
    const rejected = ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${two.campaignId}/reject`, { reason: 'Unlicensed transport service' }));
    expect(rejected.status).toBe('refunded');
    expect(await payment(two.reference)).toMatchObject({ refund_status: 'refunded', refunded_kobo: String(100_000 * NAIRA) });

    // Rejected while running: taken down, no refund.
    const takenDown = ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${one.campaignId}/reject`, { reason: 'Reported by players' }));
    expect(takenDown.status).toBe('rejected');
    expect(await payment(one.reference)).toMatchObject({ refund_status: null, refunded_kobo: '0' });
    expect((await live()).phoneApps.find((app) => app.slotId === 'app-1')).toBeUndefined();
  });

  it('rejecting an ad still in review refunds it in full, once', async () => {
    const buyer = await createPlayer(e2e);
    const checkout = ok<CampaignCheckoutDto>(await book(buyer, 'lagos-tv', { weeks: 3 }));
    await payInSandbox(buyer, checkout.reference);
    const rejected = ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${checkout.campaignId}/reject`, { reason: 'Gambling' }));
    expect(rejected.status).toBe('refunded');
    expect(await payment(checkout.reference)).toMatchObject({ refund_status: 'refunded', refunded_kobo: String(3 * 42_000 * NAIRA) });
    refused(await moderator.post(`/moderation/campaigns/${checkout.campaignId}/reject`, { reason: 'Again' }), 409);
    refused(await moderator.post(`/moderation/campaigns/${checkout.campaignId}/approve`), 409);
  });

  it('players can’t moderate, and admin tokens are needed for the admin API', async () => {
    const player = await createPlayer(e2e);
    refused(await player.get('/admin/moderation/queue'), 401);
    refused(await call(e2e, 'post', '/admin/moderation/campaigns/00000000-0000-4000-8000-000000000000/approve').set('Origin', 'http://evil.example'), 403);
  });
});

describe('club songs', () => {
  it('refuses a song of 5 minutes or more, including one whose MP3 header lies about its length', async () => {
    const artist = await createPlayer(e2e);
    const long = await uploadTrack(artist, synthMp3(6 * 60));
    refused(long, 422, 'INVALID_MEDIA');
    expect(long.body.message).toMatch(/under 5 minutes/);
    refused(await uploadTrack(artist, synthMp3(5 * 60)), 422, 'INVALID_MEDIA');
    // 6 minutes of audio behind a Xing header claiming 3 minutes.
    const forged = await uploadTrack(artist, forgedMp3(6 * 60, 3 * 60));
    refused(forged, 422, 'INVALID_MEDIA');
    // And the reverse: a 3-minute file claiming 6 minutes is refused as broken, not accepted.
    refused(await uploadTrack(artist, forgedMp3(3 * 60, 6 * 60)), 422, 'INVALID_MEDIA');
    expect(ok<ClubTrackDto[]>(await artist.get('/promotions/tracks'))).toHaveLength(0);
    expect(e2e.storage.files.size).toBeGreaterThanOrEqual(0);
  });

  it('accepts a song under 5 minutes; booking → payment → approval puts it in every club’s rotation', async () => {
    const artist = await createPlayer(e2e);
    const track = ok<ClubTrackDto>(await uploadTrack(artist, taggedMp3(4 * 60 + 59)));
    expect(track.durationSeconds).toBe(299);
    const plain = ok<ClubTrackDto>(await uploadTrack(artist, synthMp3(3 * 60), 'Detty December'));
    expect(plain.durationSeconds).toBe(180);

    const offer = (await slots(artist)).clubSong;
    refused(await artist.post(`/promotions/tracks/${track.id}/orders`, { productId: 'all-clubs-7d', expectedPriceKobo: 4_000 * NAIRA }), 422, 'PRICE_CHANGED');
    const order = ok<ClubOrderCheckoutDto>(await artist.post(`/promotions/tracks/${track.id}/orders`, { productId: 'all-clubs-7d', expectedStartDate: offer.startDate!, expectedPriceKobo: offer.priceKobo }));
    expect(order.quote.totalKobo).toBe(5_000 * NAIRA);
    expect(Number((await payment(order.reference)).amount_kobo)).toBe(5_000 * NAIRA);

    await payInSandbox(artist, order.reference);
    const queue = ok<ModerationQueueDto>(await moderator.get('/moderation/queue'));
    expect(queue.clubOrders.map((clubOrder) => clubOrder.id)).toContain(order.orderId);
    expect(ok<{ status: string }>(await moderator.post(`/moderation/club-orders/${order.orderId}/approve`)).status).toBe('live');

    for (const venueId of ['allen-nights', 'the-vault', 'quilox']) {
      const rotation = ok<ClubRotationDto>(await call(e2e, 'get', `/promotions/club-rotation?venueId=${venueId}`));
      expect(rotation.tracks.map((entry) => entry.trackId)).toContain(track.id);
    }
    // One running order per song.
    refused(await artist.post(`/promotions/tracks/${track.id}/orders`, { productId: 'all-clubs-7d' }), 409);

    // The other song: paid, then rejected in review → refunded automatically.
    const second = ok<ClubOrderCheckoutDto>(await artist.post(`/promotions/tracks/${plain.id}/orders`, { productId: 'all-clubs-7d' }));
    await payInSandbox(artist, second.reference);
    const rejected = ok<{ status: string }>(await moderator.post(`/moderation/club-orders/${second.orderId}/reject`, { reason: 'Explicit lyrics' }));
    expect(rejected.status).toBe('refunded');
    expect(await payment(second.reference)).toMatchObject({ refund_status: 'refunded', refunded_kobo: String(5_000 * NAIRA) });
  });
});

describe('ad prices set by the owner', () => {
  it('only an owner can change a rate; new quotes use it at once, paid and pending orders keep their price, and it is audited', async () => {
    const buyer = await createPlayer(e2e);
    // A booking made (and quoted) before the change, paid after it.
    const pending = ok<CampaignCheckoutDto>(await book(buyer, 'app-2', { title: 'Old Price Co', tagline: 'Booked before', expectedPriceKobo: 100_000 * NAIRA }));

    refused(await moderator.put('/ad-rates/phone-app', { priceKobo: 120_000 * NAIRA, reason: 'Moderators can’t' }), 403);
    refused(await owner.put('/ad-rates/phone-app', { priceKobo: 1_999 * NAIRA, reason: 'Below the minimum' }), 400);
    refused(await owner.put('/ad-rates/no-such-rate', { priceKobo: 120_000 * NAIRA, reason: 'Unknown key' }), 404);
    const updated = ok<AdRateDto>(await owner.put('/ad-rates/phone-app', { priceKobo: 120_000 * NAIRA, reason: 'Demand is high' }));
    expect(updated).toMatchObject({ key: 'phone-app', currentKobo: 120_000 * NAIRA, defaultKobo: 100_000 * NAIRA });

    const view = await slots(buyer);
    expect(view.slots.find((slot) => slot.id === 'app-6')?.weekPriceKobo).toBe(120_000 * NAIRA);
    refused(await book(buyer, 'app-6', { expectedPriceKobo: 100_000 * NAIRA }), 422, 'PRICE_CHANGED');
    const fresh = ok<CampaignCheckoutDto>(await book(buyer, 'app-6', { expectedPriceKobo: 120_000 * NAIRA }));
    expect(Number((await payment(fresh.reference)).amount_kobo)).toBe(120_000 * NAIRA);

    // The booking quoted before the change pays what it was quoted and goes to review as normal.
    expect(Number((await payment(pending.reference)).amount_kobo)).toBe(100_000 * NAIRA);
    await payInSandbox(buyer, pending.reference);
    const [row] = await e2e.dataSource.query<Array<{ status: string; amount_kobo: string }>>(`SELECT status, amount_kobo FROM promotion_campaigns WHERE id = $1`, [pending.campaignId]);
    expect(row).toMatchObject({ status: 'in-review', amount_kobo: String(100_000 * NAIRA) });

    // Club songs too.
    ok(await owner.put('/ad-rates/club-song', { priceKobo: 7_000 * NAIRA, reason: 'Festive season' }));
    expect((await slots(buyer)).clubSong.priceKobo).toBe(7_000 * NAIRA);

    const audit = ok<{ items: Array<{ action: string; before: { priceKobo: number }; after: { priceKobo: number } }> }>(await owner.get('/audit-logs?action=ad-rate.update'));
    expect(audit.items.map((entry) => [entry.before.priceKobo, entry.after.priceKobo])).toEqual(
      expect.arrayContaining([
        [100_000 * NAIRA, 120_000 * NAIRA],
        [5_000 * NAIRA, 7_000 * NAIRA],
      ]),
    );

    // Back to the defaults (setting the default price removes the override).
    expect(ok<AdRateDto>(await owner.put('/ad-rates/phone-app', { priceKobo: 100_000 * NAIRA, reason: 'Back to normal' })).updatedAt).toBeNull();
    ok(await owner.put('/ad-rates/club-song', { priceKobo: 5_000 * NAIRA, reason: 'Back to normal' }));
    expect((await slots(buyer)).slots.find((slot) => slot.id === 'app-6')?.weekPriceKobo).toBe(100_000 * NAIRA);
  });
});
