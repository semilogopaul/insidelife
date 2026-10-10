import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AdRateDto,
  type BillboardSlotsDto,
  type CampaignCheckoutDto,
  type ClubOrderCheckoutDto,
  type ClubOrderDetailDto,
  type ClubRotationDto,
  type ClubScheduleDto,
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
  readonly refunded_minor: string;
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
    blocks: 1,
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
    // Owner's rules (Oct 2026): ₦35,000 a week or more sells in 3-day blocks at the daily rate × 3 (to ₦500); cheaper by
    // the week. Club songs: ₦5,000 a day, always by the week.
    const block = (id: string) => view.slots.find((slot) => slot.id === id);
    expect(block('mmia-arrivals')).toMatchObject({ blockDays: 3, blockPriceKobo: 75_000 * NAIRA, maxBlocks: 9 });
    expect(block('app-1')).toMatchObject({ blockDays: 3, blockPriceKobo: 43_000 * NAIRA });
    expect(block('lagos-tv')).toMatchObject({ blockDays: 3, blockPriceKobo: 18_000 * NAIRA });
    expect(block('surulere-stadium')).toMatchObject({ blockDays: 3, blockPriceKobo: 15_000 * NAIRA });
    expect(block('ajah-roundabout')).toMatchObject({ blockDays: 7, blockPriceKobo: 28_000 * NAIRA, maxBlocks: 4 });
    expect(block('ikorodu-garage')).toMatchObject({ blockDays: 7, blockPriceKobo: 17_500 * NAIRA });
    expect(view.clubSong).toMatchObject({ weekPriceKobo: 35_000 * NAIRA, dayPriceKobo: 5_000 * NAIRA, priceKobo: 35_000 * NAIRA, days: 7, maxWeeks: 4 });
    expect(view.clubSong.playsPerDay).toBeGreaterThan(0);
    expect(view.maxWeeks).toBe(4);
    expect(view.maxRunDays).toBe(28);
    // Street spots are district-scaled, never under ₦2,000 a week, and all sold by the week.
    expect(view.slots.every((slot) => slot.weekPriceKobo >= 2_000 * NAIRA && slot.weekPriceKobo % (500 * NAIRA) === 0)).toBe(true);
    expect(view.slots.filter((slot) => slot.weekPriceKobo < 35_000 * NAIRA).every((slot) => slot.blockDays === 7)).toBe(true);
  });

  it('books 1–4 weeks from the next free day and refuses anything else', async () => {
    const buyer = await createPlayer(e2e);
    refused(await book(buyer, 'ajah-roundabout', { blocks: 0 }), 400);
    refused(await book(buyer, 'ajah-roundabout', { blocks: 5 }), 422, 'INVALID_LENGTH');
    refused(await book(buyer, 'ajah-roundabout', { linkUrl: 'http://insecure.ng' }), 422, 'INVALID_LINK');
    refused(await book(buyer, 'ajah-roundabout', { expectedStartDate: addDays(today(), 3) }), 422, 'DATES_CHANGED');
    const wrongPrice = await book(buyer, 'ajah-roundabout', { blocks: 2, expectedPriceKobo: 28_000 * NAIRA });
    refused(wrongPrice, 422, 'PRICE_CHANGED');
    expect(wrongPrice.body.details).toEqual([`weekPriceKobo=${28_000 * NAIRA}`, `totalKobo=${56_000 * NAIRA}`]);

    // Older clients' `weeks` still work on a spot sold by the week.
    const checkout = ok<CampaignCheckoutDto>(await book(buyer, 'ajah-roundabout', { blocks: undefined, weeks: 2, expectedStartDate: today(), expectedPriceKobo: 56_000 * NAIRA }));
    expect(checkout.quote).toMatchObject({ blocks: 2, blockDays: 7, days: 14, weekPriceKobo: 28_000 * NAIRA, totalKobo: 56_000 * NAIRA });
    expect(checkout.campaign).toMatchObject({ startDate: today(), endDate: addDays(today(), 14), status: 'pending-payment', blockDays: 7, blocks: 2 });
    expect(Number((await payment(checkout.reference)).amount_kobo)).toBe(56_000 * NAIRA);
  });

  it('sells expensive spots in 3-day blocks (1–9), back to back from the next free day', async () => {
    const buyer = await createPlayer(e2e);
    refused(await book(buyer, 'ikeja-allen', { blocks: 10 }), 400);
    // `weeks` means nothing on a 3-day spot: refused rather than guessed.
    refused(await book(buyer, 'ikeja-allen', { blocks: undefined, weeks: 1 }), 422, 'INVALID_LENGTH');
    const wrongPrice = await book(buyer, 'ikeja-allen', { blocks: 2, expectedPriceKobo: 112_000 * NAIRA });
    refused(wrongPrice, 422, 'PRICE_CHANGED');
    expect(wrongPrice.body.message).toMatch(/₦24,000 per 3 days/);
    const checkout = ok<CampaignCheckoutDto>(await book(buyer, 'ikeja-allen', { blocks: 2, expectedStartDate: today(), expectedPriceKobo: 48_000 * NAIRA }));
    expect(checkout.quote).toMatchObject({ blocks: 2, blockDays: 3, days: 6, blockPriceKobo: 24_000 * NAIRA, weekPriceKobo: 56_000 * NAIRA, totalKobo: 48_000 * NAIRA });
    expect(checkout.campaign).toMatchObject({ startDate: today(), endDate: addDays(today(), 6), days: 6, blockDays: 3, blocks: 2 });
    expect(Number((await payment(checkout.reference)).amount_kobo)).toBe(48_000 * NAIRA);
  });
});

describe('a billboard from booking to the live feed', () => {
  it('pay → moderation queue → approved by an admin → on the live billboards', async () => {
    const buyer = await createPlayer(e2e);
    const checkout = ok<CampaignCheckoutDto>(await book(buyer, 'mmia-arrivals', { blocks: 2, expectedStartDate: today(), expectedPriceKobo: 150_000 * NAIRA }));
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

  it('a phone-app ad (₦100,000 a week) sells in 3-day blocks of ₦43,000, holds its slot, and the next run starts the day the slot is free', async () => {
    const first = await createPlayer(e2e);
    const second = await createPlayer(e2e);
    const one = ok<CampaignCheckoutDto>(await book(first, 'app-1', { title: 'Chop Express', tagline: 'Food in 30 minutes', expectedStartDate: today(), expectedPriceKobo: 43_000 * NAIRA }));
    expect(Number((await payment(one.reference)).amount_kobo)).toBe(43_000 * NAIRA);
    // While the first booking's checkout is open, the slot is held: the next run starts when its 3 days end.
    const nextFree = addDays(today(), 3);
    expect((await slots(second)).slots.find((slot) => slot.id === 'app-1')?.nextStarts[0]).toBe(nextFree);
    refused(await book(second, 'app-1', { expectedStartDate: today() }), 422, 'DATES_CHANGED');
    const two = ok<CampaignCheckoutDto>(await book(second, 'app-1', { title: 'Keke Ride', tagline: 'Book a keke', expectedStartDate: nextFree, expectedPriceKobo: 43_000 * NAIRA }));
    expect(two.campaign).toMatchObject({ startDate: nextFree, endDate: addDays(nextFree, 3) });

    await payInSandbox(first, one.reference);
    await payInSandbox(second, two.reference);
    expect(ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${one.campaignId}/approve`)).status).toBe('live');
    expect(ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${two.campaignId}/approve`)).status).toBe('approved');
    const apps = (await live()).phoneApps;
    expect(apps.find((app) => app.slotId === 'app-1')).toMatchObject({ campaignId: one.campaignId, name: 'Chop Express', tagline: 'Food in 30 minutes' });

    // Rejected before it starts running (approved for next week): refunded automatically.
    const rejected = ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${two.campaignId}/reject`, { reason: 'Unlicensed transport service' }));
    expect(rejected.status).toBe('refunded');
    expect(await payment(two.reference)).toMatchObject({ refund_status: 'refunded', refunded_minor: String(43_000 * NAIRA) });

    // Rejected while running: taken down, no refund.
    const takenDown = ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${one.campaignId}/reject`, { reason: 'Reported by players' }));
    expect(takenDown.status).toBe('rejected');
    expect(await payment(one.reference)).toMatchObject({ refund_status: null, refunded_minor: '0' });
    expect((await live()).phoneApps.find((app) => app.slotId === 'app-1')).toBeUndefined();
  });

  it('rejecting an ad still in review refunds it in full, once', async () => {
    const buyer = await createPlayer(e2e);
    const checkout = ok<CampaignCheckoutDto>(await book(buyer, 'lagos-tv', { blocks: 3 }));
    await payInSandbox(buyer, checkout.reference);
    const rejected = ok<{ status: string }>(await moderator.post(`/moderation/campaigns/${checkout.campaignId}/reject`, { reason: 'Gambling' }));
    expect(rejected.status).toBe('refunded');
    expect(await payment(checkout.reference)).toMatchObject({ refund_status: 'refunded', refunded_minor: String(3 * 18_000 * NAIRA) });
    refused(await moderator.post(`/moderation/campaigns/${checkout.campaignId}/reject`, { reason: 'Again' }), 409);
    refused(await moderator.post(`/moderation/campaigns/${checkout.campaignId}/approve`), 409);
  });

  it('players can’t moderate, and admin tokens are needed for the admin API', async () => {
    const player = await createPlayer(e2e);
    refused(await player.get('/admin/moderation/queue'), 401);
    refused(await call(e2e, 'post', '/admin/moderation/campaigns/00000000-0000-4000-8000-000000000000/approve').set('Origin', 'http://evil.example'), 403);
  });
});

const trackFiles = (): number => [...e2e.storage.files.keys()].filter((key) => key.startsWith('tracks/')).length;

describe('club songs', () => {
  it('refuses a song longer than 3 minutes, including one whose MP3 header lies about its length', async () => {
    const artist = await createPlayer(e2e);
    const stored = trackFiles();
    const long = await uploadTrack(artist, synthMp3(6 * 60));
    refused(long, 422, 'INVALID_MEDIA');
    expect(long.body.message).toMatch(/at most 3 minutes/);
    refused(await uploadTrack(artist, synthMp3(3 * 60 + 2)), 422, 'INVALID_MEDIA');
    refused(await uploadTrack(artist, synthMp3(10)), 422, 'INVALID_MEDIA');
    // 6 minutes of audio behind a Xing header claiming 2:30.
    refused(await uploadTrack(artist, forgedMp3(6 * 60, 150)), 422, 'INVALID_MEDIA');
    // Uploads are limited to 5 a minute per player: the rest come from a second artist.
    const other = await createPlayer(e2e);
    // A file whose header claims less than its frames by more than 5% is refused as tampered, whatever the length.
    refused(await uploadTrack(other, forgedMp3(170, 120)), 422, 'INVALID_MEDIA');
    // And the reverse: 2 minutes of audio claiming 6 is refused as broken, not accepted.
    refused(await uploadTrack(other, forgedMp3(2 * 60, 6 * 60)), 422, 'INVALID_MEDIA');
    refused(await uploadTrack(other, Buffer.from('ID3 not really a song at all, just text pretending')), 422, 'INVALID_MEDIA');
    expect(ok<ClubTrackDto[]>(await artist.get('/promotions/tracks'))).toHaveLength(0);
    expect(ok<ClubTrackDto[]>(await other.get('/promotions/tracks'))).toHaveLength(0);
    expect(trackFiles()).toBe(stored);
  });

  it('accepts a song of 3 minutes or less; booking → payment → approval puts it in every club’s rotation', async () => {
    const artist = await createPlayer(e2e);
    const track = ok<ClubTrackDto>(await uploadTrack(artist, taggedMp3(3 * 60)));
    expect(track.durationSeconds).toBe(180);
    const plain = ok<ClubTrackDto>(await uploadTrack(artist, synthMp3(2 * 60 + 30), 'Detty December'));
    expect(plain.durationSeconds).toBe(150);

    const offer = (await slots(artist)).clubSong;
    refused(await artist.post(`/promotions/tracks/${track.id}/orders`, { productId: 'all-clubs-7d', expectedPriceKobo: 4_000 * NAIRA }), 422, 'PRICE_CHANGED');
    const order = ok<ClubOrderCheckoutDto>(await artist.post(`/promotions/tracks/${track.id}/orders`, { productId: 'all-clubs-7d', expectedStartDate: offer.startDate!, expectedPriceKobo: offer.priceKobo }));
    expect(order.quote.totalKobo).toBe(35_000 * NAIRA);
    expect(Number((await payment(order.reference)).amount_kobo)).toBe(35_000 * NAIRA);

    await payInSandbox(artist, order.reference);
    const queue = ok<ModerationQueueDto>(await moderator.get('/moderation/queue'));
    expect(queue.clubOrders.map((clubOrder) => clubOrder.id)).toContain(order.orderId);
    expect(ok<{ status: string }>(await moderator.post(`/moderation/club-orders/${order.orderId}/approve`)).status).toBe('live');

    for (const venueId of ['allen-nights', 'the-vault', 'quilox']) {
      const rotation = ok<ClubRotationDto>(await call(e2e, 'get', `/promotions/club-rotation?venueId=${venueId}`));
      expect(rotation.tracks.map((entry) => entry.trackId)).toContain(track.id);
    }
    // Its page says when and where it plays next; the club's own schedule (what its audio plays) says the same.
    const detail = ok<ClubOrderDetailDto>(await artist.get(`/promotions/club-orders/${order.orderId}`));
    expect(detail.guarantee).toMatchObject({ playsPerDay: offer.playsPerDay, minPlaysPerDay: offer.minPlaysPerDay, clubs: offer.clubs });
    expect(detail.receipt).toMatchObject({ amountKobo: 35_000 * NAIRA, blocks: 1, blockDays: 7, paymentReference: order.reference });
    expect(detail.timeline.map((step) => `${step.step}:${step.state}`)).toEqual(['paid:done', 'in-review:done', 'approved:done', 'live:current', 'ended:next']);
    const next = detail.playingNow ?? detail.upcoming[0];
    expect(next).toBeDefined();
    const schedule = ok<ClubScheduleDto>(await call(e2e, 'get', `/promotions/club-schedule?venueId=${next!.venueId}`));
    expect(schedule.plays.find((play) => play.startsAtMs === next!.startsAtMs)).toMatchObject({ trackId: track.id, durationSeconds: 180 });

    // One running order per song.
    refused(await artist.post(`/promotions/tracks/${track.id}/orders`, { productId: 'all-clubs-7d' }), 409);

    // The other song, two weeks: paid, then rejected in review → refunded automatically, in full.
    refused(await artist.post(`/promotions/tracks/${plain.id}/orders`, { productId: 'all-clubs-7d', weeks: 2, expectedPriceKobo: 35_000 * NAIRA }), 422, 'PRICE_CHANGED');
    const second = ok<ClubOrderCheckoutDto>(await artist.post(`/promotions/tracks/${plain.id}/orders`, { productId: 'all-clubs-7d', weeks: 2, expectedPriceKobo: 70_000 * NAIRA }));
    expect(second.order).toMatchObject({ days: 14, weeks: 2, amountKobo: 70_000 * NAIRA });
    await payInSandbox(artist, second.reference);
    const rejected = ok<{ status: string }>(await moderator.post(`/moderation/club-orders/${second.orderId}/reject`, { reason: 'Explicit lyrics' }));
    expect(rejected.status).toBe('refunded');
    expect(await payment(second.reference)).toMatchObject({ refund_status: 'refunded', refunded_minor: String(70_000 * NAIRA) });
  });
});

describe('ad prices set by the owner', () => {
  it('only an owner can change a rate; new quotes use it at once, paid and pending orders keep their price, and it is audited', async () => {
    const buyer = await createPlayer(e2e);
    // A booking made (and quoted) before the change, paid after it.
    const pending = ok<CampaignCheckoutDto>(await book(buyer, 'app-2', { title: 'Old Price Co', tagline: 'Booked before', expectedPriceKobo: 43_000 * NAIRA }));

    refused(await moderator.put('/ad-rates/phone-app', { priceKobo: 120_000 * NAIRA, reason: 'Moderators can’t' }), 403);
    // The request shape allows the rate card's lowest value (the ₦500 exchange rate); each key's own range is checked after.
    refused(await owner.put('/ad-rates/phone-app', { priceKobo: 1_999 * NAIRA, reason: 'Below the minimum' }), 422, 'INVALID_RATE');
    refused(await owner.put('/ad-rates/phone-app', { priceKobo: 499 * NAIRA, reason: 'Far below the minimum' }), 400);
    refused(await owner.put('/ad-rates/no-such-rate', { priceKobo: 120_000 * NAIRA, reason: 'Unknown key' }), 404);
    const updated = ok<AdRateDto>(await owner.put('/ad-rates/phone-app', { priceKobo: 120_000 * NAIRA, reason: 'Demand is high' }));
    expect(updated).toMatchObject({ key: 'phone-app', currentKobo: 120_000 * NAIRA, defaultKobo: 100_000 * NAIRA });

    const view = await slots(buyer);
    expect(view.slots.find((slot) => slot.id === 'app-6')?.weekPriceKobo).toBe(120_000 * NAIRA);
    refused(await book(buyer, 'app-6', { expectedPriceKobo: 43_000 * NAIRA }), 422, 'PRICE_CHANGED');
    const fresh = ok<CampaignCheckoutDto>(await book(buyer, 'app-6', { expectedPriceKobo: 51_500 * NAIRA }));
    expect(Number((await payment(fresh.reference)).amount_kobo)).toBe(51_500 * NAIRA);

    // The booking quoted before the change pays what it was quoted and goes to review as normal.
    expect(Number((await payment(pending.reference)).amount_kobo)).toBe(43_000 * NAIRA);
    await payInSandbox(buyer, pending.reference);
    const [row] = await e2e.dataSource.query<Array<{ status: string; amount_kobo: string }>>(`SELECT status, amount_kobo FROM promotion_campaigns WHERE id = $1`, [pending.campaignId]);
    expect(row).toMatchObject({ status: 'in-review', amount_kobo: String(43_000 * NAIRA) });

    // Club songs too.
    ok(await owner.put('/ad-rates/club-song', { priceKobo: 49_000 * NAIRA, reason: 'Festive season: ₦7,000 a day' }));
    expect((await slots(buyer)).clubSong.priceKobo).toBe(49_000 * NAIRA);

    const audit = ok<{ items: Array<{ action: string; before: { priceKobo: number }; after: { priceKobo: number } }> }>(await owner.get('/audit-logs?action=ad-rate.update'));
    expect(audit.items.map((entry) => [entry.before.priceKobo, entry.after.priceKobo])).toEqual(
      expect.arrayContaining([
        [100_000 * NAIRA, 120_000 * NAIRA],
        [35_000 * NAIRA, 49_000 * NAIRA],
      ]),
    );

    // Back to the defaults (setting the default price removes the override).
    expect(ok<AdRateDto>(await owner.put('/ad-rates/phone-app', { priceKobo: 100_000 * NAIRA, reason: 'Back to normal' })).updatedAt).toBeNull();
    ok(await owner.put('/ad-rates/club-song', { priceKobo: 35_000 * NAIRA, reason: 'Back to normal' }));
    expect((await slots(buyer)).slots.find((slot) => slot.id === 'app-6')?.weekPriceKobo).toBe(100_000 * NAIRA);
  });
});
