import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { CheckoutPort, CheckoutRefund, PaidCheckout, RefundOutcome } from '../../common/ports/checkout.port.js';
import type { StorageService } from '../../common/storage/storage.service.js';
import type { CharacterDirectory } from '../characters/character-directory.service.js';
import type { CampaignsService } from './campaigns.service.js';
import { AdCampaignEntity } from './entities/ad-campaign.entity.js';
import type { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import type { ClubTrackEntity } from './entities/club-track.entity.js';
import type { CreativeEntity } from './entities/creative.entity.js';
import { ModerationService } from './moderation.service.js';
import { applyRefundToItem, revertRefundOnItem } from './promotion-refunds.js';
import type { PromotionNotice, PromotionsNotifier } from './promotions-notifier.service.js';
import type { TracksService } from './tracks.service.js';

const CAMPAIGN = '0b7f3c1e-2d4a-4e6b-8c9d-1a2b3c4d5e6f';
const REF = '7c2b1f0e-6a4d-4c51-9b7e-0d2f3a4b5c6d';

interface LogRow {
  readonly action: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly reason: string | null;
}

/** One-table store for campaigns plus the moderation log, with serialised "transactions". */
class FakePromotions {
  campaign: AdCampaignEntity = Object.assign(new AdCampaignEntity(), {
    id: CAMPAIGN,
    ownerUserId: 'owner-1',
    ownerCharacterId: null,
    slotId: 'lekki-toll-gate',
    title: 'Mama Put Jollof',
    tagline: null,
    creativeKey: 'billboards/x.webp',
    creativeUrl: 'https://cdn/x.webp',
    linkUrl: 'https://mamaput.ng',
    startDate: '2099-01-01',
    endDate: '2099-01-08',
    days: 7,
    amountKobo: 30_000_000,
    currency: 'NGN',
    chargeMinor: 30_000_000,
    ngnPerUsd: null,
    status: 'in-review',
    rejectionReason: null,
    paymentReference: REF,
    checkoutUrl: null,
    holdExpiresAt: null,
    impressions: 0,
    clicks: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    paidAt: new Date(),
    reviewedAt: null,
    reviewedBy: null,
  });
  readonly log: LogRow[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  private readonly manager = {
    findOne: async () => Object.assign(new AdCampaignEntity(), this.campaign),
    save: async (entity: AdCampaignEntity) => {
      this.campaign = Object.assign(new AdCampaignEntity(), entity);
      return entity;
    },
    insert: async (_entity: unknown, row: LogRow) => void this.log.push(row),
  } as unknown as EntityManager;

  readonly dataSource = {
    transaction: <T>(_level: string, work: (manager: EntityManager) => Promise<T>): Promise<T> => {
      const run = this.queue.then(() => work(this.manager));
      this.queue = run.catch(() => undefined);
      return run;
    },
  } as unknown as DataSource;

  readonly campaigns = {
    exists: async () => true,
    findOneByOrFail: async () => Object.assign(new AdCampaignEntity(), this.campaign),
  } as unknown as Repository<AdCampaignEntity>;
}

const paid: PaidCheckout = { reference: REF, userId: 'owner-1', characterId: null, purpose: 'billboard', subjectId: CAMPAIGN, currency: 'NGN', amountMinor: 30_000_000, paidMinor: 30_000_000, amountKobo: 30_000_000, ngnPerUsd: null, topupRate: null, paidAt: new Date() };
const refund: CheckoutRefund = { refundId: '75923', currency: 'NGN', amountMinor: 30_000_000, source: 'api', reason: 'Not approved', delivered: true };

function moderation(store: FakePromotions, outcome: (reference: string) => Promise<RefundOutcome>) {
  const notices: PromotionNotice[] = [];
  const refunds: string[] = [];
  const checkout: CheckoutPort = {
    start: async () => ({ reference: 'x', authorizationUrl: 'x' }),
    registerFulfiller: () => undefined,
    refund: async (reference) => {
      refunds.push(reference);
      return outcome(reference);
    },
  };
  const service = new ModerationService(
    store.dataSource,
    store.campaigns,
    {} as Repository<ClubPlayOrderEntity>,
    {} as Repository<ClubTrackEntity>,
    {} as Repository<CreativeEntity>,
    {} as StorageService,
    { findById: async () => null } as unknown as CharacterDirectory,
    { notifyOwner: async (_owner: string, notice: PromotionNotice) => void notices.push(notice) } as unknown as PromotionsNotifier,
    { invalidateLive: () => undefined } as unknown as CampaignsService,
    {} as TracksService,
    checkout,
  );
  return { service, notices, refunds };
}

describe('rejecting a paid ad refunds the payer automatically', () => {
  it('refunds through the gateway; the refund hook settles the booking as refunded', async () => {
    const store = new FakePromotions();
    // The real gateway refund ends with the billboard fulfiller's onRefunded hook, which is applyRefundToItem.
    const { service, notices, refunds } = moderation(store, async () => {
      await applyRefundToItem(store.dataSource, AdCampaignEntity, 'campaign', paid, refund);
      return { kind: 'refunded', refund };
    });
    const view = await service.decideCampaign('admin-1', CAMPAIGN, { action: 'reject', refund: true }, 'Misleading claims');
    expect(refunds).toEqual([REF]);
    expect(view.status).toBe('refunded');
    expect(store.log.map((row) => [row.action, row.fromStatus, row.toStatus])).toEqual([
      ['rejected', 'in-review', 'refund-due'],
      ['refunded', 'refund-due', 'refunded'],
    ]);
    expect(store.log[1]?.reason).toMatch(/₦300,000 refunded automatically \(refund 75923\)/);
    expect(notices[0]?.title).toBe('Billboard not approved');
  });

  it('keeps the booking in refunds due and logs why when the gateway refuses (manual fallback)', async () => {
    const store = new FakePromotions();
    const { service, refunds } = moderation(store, async () => ({ kind: 'failed', reason: 'Flutterwave is not responding right now' }));
    const view = await service.decideCampaign('admin-1', CAMPAIGN, { action: 'reject', refund: true }, 'Misleading claims');
    expect(refunds).toEqual([REF]);
    expect(view.status).toBe('refund-due');
    expect(store.log.at(-1)).toMatchObject({ action: 'refund-failed', toStatus: 'refund-due', reason: expect.stringMatching(/Refund it in the Flutterwave dashboard/) });
    // Ops then refund by hand and mark it refunded.
    const marked = await service.decideCampaign('admin-1', CAMPAIGN, { action: 'mark-refunded' }, 'Refunded in dashboard, ref 123');
    expect(marked.status).toBe('refunded');
  });

  it('does not refund a rejection without refund (fraud)', async () => {
    const store = new FakePromotions();
    const { service, refunds } = moderation(store, async () => ({ kind: 'refunded', refund }));
    const view = await service.decideCampaign('admin-1', CAMPAIGN, { action: 'reject', refund: false }, 'Fraudulent advertiser');
    expect(view.status).toBe('rejected');
    expect(refunds).toEqual([]);
  });

  it('refunds by default when nothing is said about the refund, as long as it hasn’t started', async () => {
    const store = new FakePromotions();
    const { service, refunds } = moderation(store, async () => ({ kind: 'failed', reason: 'down' }));
    await service.decideCampaign('admin-1', CAMPAIGN, { action: 'reject' }, 'Misleading claims');
    expect(refunds).toEqual([REF]);
  });

  it('logs a refund Flutterwave is still processing, and leaves the booking in refunds due until it completes', async () => {
    const store = new FakePromotions();
    const { service } = moderation(store, async () => ({ kind: 'pending', refundId: '75923' }));
    const view = await service.decideCampaign('admin-1', CAMPAIGN, { action: 'reject' }, 'Misleading claims');
    expect(view.status).toBe('refund-due');
    expect(store.log.at(-1)).toMatchObject({ action: 'refund-sent', reason: expect.stringMatching(/Don’t refund by hand/) });
  });
});

/** The booking started running months ago and is live now. */
function running(store: FakePromotions): void {
  store.campaign.status = 'live';
  store.campaign.startDate = '2026-01-01';
  store.campaign.endDate = '2099-01-08';
}

describe('rejecting a running ad (the public terms: no refund once it has started)', () => {
  it('takes it down with no refund and says why', async () => {
    const store = new FakePromotions();
    running(store);
    const { service, refunds, notices } = moderation(store, async () => ({ kind: 'refunded', refund }));
    const view = await service.decideCampaign('admin-1', CAMPAIGN, { action: 'reject' }, 'Misleading claims');
    expect(view.status).toBe('rejected');
    expect(refunds).toEqual([]);
    expect(notices[0]).toMatchObject({ title: 'Billboard taken down', body: expect.stringMatching(/already started running, so it isn’t refunded/) });
  });

  it('lets the moderator grant a refund, by hand only (refunds due), never automatically', async () => {
    const store = new FakePromotions();
    running(store);
    const { service, refunds } = moderation(store, async () => ({ kind: 'refunded', refund }));
    const view = await service.decideCampaign('admin-1', CAMPAIGN, { action: 'reject', refund: true }, 'Our mistake');
    expect(view.status).toBe('refund-due');
    expect(refunds).toEqual([]);
    expect(store.log.at(-1)).toMatchObject({ action: 'refund-flagged', reason: expect.stringMatching(/no automatic refund/) });
  });
});

describe('revertRefundOnItem', () => {
  it('puts a refunded booking back under refunds due when Flutterwave reports its refund failed', async () => {
    const store = new FakePromotions();
    store.campaign.status = 'refunded';
    expect(await revertRefundOnItem(store.dataSource, AdCampaignEntity, 'campaign', paid, refund)).toEqual({ kind: 'back-to-refund-due' });
    expect(store.campaign.status).toBe('refund-due');
    expect(store.log).toEqual([expect.objectContaining({ action: 'refund-failed', fromStatus: 'refunded', toStatus: 'refund-due' })]);
    // Repeated: it is already due, only logged.
    expect(await revertRefundOnItem(store.dataSource, AdCampaignEntity, 'campaign', paid, refund)).toEqual({ kind: 'still-due' });
    expect(store.campaign.status).toBe('refund-due');
  });
});

describe('applyRefundToItem', () => {
  it('takes down a running ad refunded from the dashboard, once', async () => {
    const store = new FakePromotions();
    store.campaign.status = 'live';
    const dashboard: CheckoutRefund = { ...refund, source: 'dashboard', refundId: '99025' };
    expect((await applyRefundToItem(store.dataSource, AdCampaignEntity, 'campaign', paid, dashboard))?.settlement).toEqual({ kind: 'refunded', takenDown: true });
    expect(store.campaign.status).toBe('refunded');
    expect((await applyRefundToItem(store.dataSource, AdCampaignEntity, 'campaign', paid, dashboard))?.settlement).toEqual({ kind: 'none' });
    expect(store.log.map((row) => row.action)).toEqual(['refund-flagged', 'refunded']);
  });

  it('only logs a refunded duplicate payment', async () => {
    const store = new FakePromotions();
    const applied = await applyRefundToItem(store.dataSource, AdCampaignEntity, 'campaign', { ...paid, reference: 'second-payment' }, refund);
    expect(applied?.settlement).toEqual({ kind: 'duplicate-payment' });
    expect(store.campaign.status).toBe('in-review');
    expect(store.log).toEqual([expect.objectContaining({ action: 'refunded', reason: expect.stringMatching(/^Duplicate payment/) })]);
  });
});
