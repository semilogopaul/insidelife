import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, LessThanOrEqual, MoreThan, type DataSource, type EntityManager, type Repository } from 'typeorm';
import {
  AD_MAX_WEEKS,
  AD_PLACEMENT_KINDS,
  AD_SLOTS,
  AD_WEEK_DAYS,
  BILLBOARD_MAX_LEAD_DAYS,
  BILLBOARD_ROTATION_SECONDS,
  PROMOTION_CONTENT_RULES,
  PROMOTION_TITLE_MAX,
  adQuote,
  adWeekPriceLabel,
  adWeeksProblem,
  findAdSlot,
  phoneAppSlotNumber,
  type AdCampaignDto,
  type AdPlacementKind,
  type AdSlot,
  type BillboardHouseAdDto,
  type BillboardSlotsDto,
  type CampaignCheckoutDto,
  type ClubSongOfferDto,
  type IsoDate,
  type LiveBillboardSlotDto,
  type LiveBillboardsDto,
  type LivePhoneAppDto,
  type PromotionQuote,
  type PromotionStatus,
} from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { AuthUser } from '../../common/interfaces/auth-user.interface.js';
import {
  CHECKOUT_PORT,
  type CheckoutPort,
  type CheckoutRefund,
  type CheckoutSession,
  type FulfilmentResult,
  type PaidCheckout,
} from '../../common/ports/checkout.port.js';
import { withTransaction } from '../../database/transaction.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { AdRatesService, type AdPricing } from './ad-rates.service.js';
import { CreativeService } from './creative.service.js';
import type { CreateCampaignDto } from './dto/campaign.dto.js';
import { AdCampaignEntity } from './entities/ad-campaign.entity.js';
import { appendModerationLog } from './moderation-log.js';
import { advisoryLock, CHECKOUT_HOLD_MINUTES, LIVE_FEED_CACHE_MS, UUID_PATTERN } from './promotions.constants.js';
import { clockAt, toCampaignDto, type Clock } from './promotions.mappers.js';
import { autoRefundNotice, paidNotice, refundedNotice, type NoticeSubject } from './promotions.notices.js';
import { applyRefundToItem, revertRefundOnItem } from './promotion-refunds.js';
import { PromotionStateException, PromotionRuleException } from './promotions.errors.js';
import { PromotionsNotifier } from './promotions-notifier.service.js';
import { validateDisplayText, validatePromotionLink } from './rules/content.rules.js';
import { firstFullDay, nextFreeStart, rangeOf, type DateRange } from './rules/schedule.rules.js';
import { admitAfterPayment, COMMITTED_STATUSES, matchPayment } from './rules/status.rules.js';
import type { Buyer } from './promotions.types.js';
import { CachedValue } from './util/cached-value.js';
import { assertExpectedPrice, assertExpectedStart } from './util/dates.js';

/** Unpaid bookings (live holds) per account, so nobody can squat on every board. */
const MAX_UNPAID_HOLDS = 3;
/** Phone app taglines (the line under the app name). */
const TAGLINE_MAX = 60;
/** Bookings that can affect a new run: from today to the latest possible end of one. */
const SCHEDULE_HORIZON_DAYS = BILLBOARD_MAX_LEAD_DAYS + AD_MAX_WEEKS * AD_WEEK_DAYS;

interface LiveBillboards {
  readonly dto: LiveBillboardsDto;
  /** campaignId → link, for click tracking. */
  readonly links: ReadonlyMap<string, string>;
}

const houseAd = (slot: AdSlot, weekPriceKobo: number): BillboardHouseAdDto => ({
  headline: 'Your ad here',
  body: 'Open the Billboards app on your phone to put your brand on this board.',
  priceLabel: adWeekPriceLabel(weekPriceKobo),
  action: { type: 'open-phone-app', app: 'billboards', slotId: slot.id },
});

/** The server's price for `weeks` consecutive weeks on a slot at its current rate. */
function quoteFor(pricing: AdPricing, slot: AdSlot, weeks: number): PromotionQuote {
  try {
    return adQuote(pricing.weekPriceKobo(slot), weeks);
  } catch (error) {
    throw new PromotionRuleException('INVALID_LENGTH', error instanceof RangeError ? error.message : 'That booking length isn’t available');
  }
}

const subjectOf = (campaign: AdCampaignEntity): NoticeSubject => ({
  noun: 'Billboard',
  name: campaign.title,
  where: findAdSlot(campaign.slotId)?.name ?? 'your board',
});

/**
 * Ad bookings on every slot in `AD_SLOTS` (premium and street billboards, shelters, lightboxes, Lagos TV, phone apps):
 * prices and next free dates, booking + checkout, payment fulfilment, the public live feed for the 3D world and the
 * phone, and the lazy approved → live → completed transition (no cron: effective status is derived from dates, and the
 * stored status is reconciled whenever the live feed refreshes).
 *
 * Booking rule: 1–4 consecutive weeks, starting on the slot's next free day — today when the whole run fits, else the
 * day the earliest blocking booking ends — so a slot's runs follow each other with no gaps. The buyer never picks
 * dates; the price is the slot's current weekly rate (`AdRatesService`), stored on the booking when it is made.
 */
@Injectable()
export class CampaignsService implements OnModuleInit {
  private readonly logger = new Logger(CampaignsService.name);
  private readonly live = new CachedValue<LiveBillboards>(LIVE_FEED_CACHE_MS, () => this.loadLive());
  /** Slots for sale: everything except phone app slots beyond the configured count. */
  private readonly forSale: readonly AdSlot[];
  private readonly forSaleIds: ReadonlySet<string>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AdCampaignEntity) private readonly campaigns: Repository<AdCampaignEntity>,
    @Inject(CHECKOUT_PORT) private readonly checkout: CheckoutPort,
    private readonly creatives: CreativeService,
    private readonly directory: CharacterDirectory,
    private readonly notifier: PromotionsNotifier,
    private readonly rates: AdRatesService,
    config: ConfigService<AppConfig, true>,
  ) {
    const phoneApps = config.get('ads', { infer: true }).phoneAppSlots;
    this.forSale = AD_SLOTS.filter((slot) => (phoneAppSlotNumber(slot.id) ?? 0) <= phoneApps);
    this.forSaleIds = new Set(this.forSale.map((slot) => slot.id));
  }

  /** A slot that's for sale right now, or null. */
  private slotForSale(id: string): AdSlot | null {
    return this.forSaleIds.has(id) ? (findAdSlot(id) ?? null) : null;
  }

  onModuleInit(): void {
    this.checkout.registerFulfiller({
      purpose: 'billboard',
      fulfill: (payment) => this.applyPayment(payment),
      onRefunded: (payment, refund) => this.applyRefund(payment, refund),
      onRefundFailed: async (payment, refund) => {
        if (UUID_PATTERN.test(payment.subjectId)) await revertRefundOnItem(this.dataSource, AdCampaignEntity, 'campaign', payment, refund);
      },
    });
    // The live feed shows prices on empty boards: refresh it as soon as a rate changes on any node.
    this.rates.onChange(() => this.live.invalidate());
  }

  /** Every slot for sale with its current weekly price and the start date of a 1…4-week booking made now. */
  async slots(clubSong: ClubSongOfferDto): Promise<BillboardSlotsDto> {
    const clock = clockAt();
    const [bookings, pricing] = await Promise.all([
      this.activeBookings(this.campaigns.manager, rangeOf(clock.today, SCHEDULE_HORIZON_DAYS), clock.now),
      this.rates.pricing(),
    ]);
    const bySlot = new Map<string, AdCampaignEntity[]>();
    for (const booking of bookings) bySlot.set(booking.slotId, [...(bySlot.get(booking.slotId) ?? []), booking]);
    const freeNow = Array.from({ length: AD_MAX_WEEKS }, () => clock.today);
    return {
      today: clock.today,
      maxWeeks: AD_MAX_WEEKS,
      rules: PROMOTION_CONTENT_RULES.filter((rule) => rule.appliesTo !== 'music'),
      clubSong,
      // Static details (name, format, description…) come from the shared catalog on the client; state and price travel.
      slots: this.forSale.map((slot) => {
        const mine = bySlot.get(slot.id);
        if (!mine) return { id: slot.id, weekPriceKobo: pricing.weekPriceKobo(slot), nextStarts: freeNow, liveCount: 0 };
        const liveCount = mine.filter((booking) => (booking.status === 'approved' || booking.status === 'live') && booking.startDate <= clock.today).length;
        return { id: slot.id, weekPriceKobo: pricing.weekPriceKobo(slot), nextStarts: this.nextStarts(mine, slot, clock.today), liveCount };
      }),
    };
  }

  async create(user: AuthUser, request: CreateCampaignDto): Promise<CampaignCheckoutDto> {
    const slot = this.slotForSale(request.slotId);
    if (!slot) throw new ResourceNotFoundException('Billboard');
    const weeksProblem = adWeeksProblem(request.weeks);
    if (weeksProblem) throw new PromotionRuleException('INVALID_LENGTH', weeksProblem);
    const clock = clockAt();
    const quote = quoteFor(await this.rates.pricing(), slot, request.weeks);
    assertExpectedPrice(request.expectedPriceKobo, quote, 'week');
    const title = validateDisplayText(request.title, 'Title', 3, PROMOTION_TITLE_MAX);
    if (!title.ok) throw new PromotionRuleException('INVALID_TITLE', title.reason);
    const link = validatePromotionLink(request.linkUrl);
    if (!link.ok) throw new PromotionRuleException('INVALID_LINK', link.reason);
    let tagline: string | null = null;
    if (slot.kind === 'phone-app') {
      const pitch = validateDisplayText(request.tagline ?? '', 'Tagline', 3, TAGLINE_MAX);
      if (!pitch.ok) throw new PromotionRuleException('INVALID_TAGLINE', pitch.reason);
      tagline = pitch.value;
    }

    const creative = await this.creatives.requireOwnedFor(user.userId, request.creativeKey, slot);
    const character = await this.directory.findLivingByUser(user.userId);

    const campaign = await withTransaction(this.dataSource, async (manager) => {
      await advisoryLock(manager, `promotions:billboard:${slot.id}`);
      const unpaid = await manager.count(AdCampaignEntity, {
        where: { ownerUserId: user.userId, status: 'pending-payment', holdExpiresAt: MoreThan(clock.now) },
      });
      if (unpaid >= MAX_UNPAID_HOLDS) throw new PromotionRuleException('TOO_MANY_UNPAID', 'Pay for or cancel your unpaid bookings first');
      const booked = await this.activeBookings(manager, rangeOf(clock.today, SCHEDULE_HORIZON_DAYS), clock.now, slot.id);
      const startDate = nextFreeStart(booked, clock.today, quote.days, slot.maxConcurrentAds, BILLBOARD_MAX_LEAD_DAYS);
      if (!startDate) throw new PromotionRuleException('SLOT_FULL', `${slot.name} is fully booked for the next two months. Try another board`);
      assertExpectedStart(request.expectedStartDate, startDate, slot.name);
      const range = rangeOf(startDate, quote.days);
      return manager.save(
        manager.create(AdCampaignEntity, {
          ownerUserId: user.userId,
          ownerCharacterId: character?.id ?? null,
          slotId: slot.id,
          title: title.value,
          tagline,
          creativeKey: creative.key,
          creativeUrl: creative.url,
          linkUrl: link.value,
          startDate: range.startDate,
          endDate: range.endDate,
          days: quote.days,
          amountKobo: quote.totalKobo,
          status: 'pending-payment',
          holdExpiresAt: new Date(clock.now.getTime() + CHECKOUT_HOLD_MINUTES * 60_000),
        }),
      );
    });

    const session = await this.startCheckout(user, character, campaign, slot);
    return {
      campaignId: campaign.id,
      reference: session.reference,
      authorizationUrl: session.authorizationUrl,
      quote,
      campaign: toCampaignDto(campaign, clock),
    };
  }

  async listMine(userId: string): Promise<AdCampaignDto[]> {
    const clock = clockAt();
    const rows = await this.campaigns.find({ where: { ownerUserId: userId }, order: { createdAt: 'DESC' }, take: 50 });
    return rows.map((row) => toCampaignDto(row, clock));
  }

  /** Cancel before payment. A payment that still lands later is honoured if there is room, refunded otherwise. */
  async cancel(userId: string, campaignId: string): Promise<void> {
    await withTransaction(this.dataSource, async (manager) => {
      const campaign = await manager.findOne(AdCampaignEntity, { where: { id: campaignId, ownerUserId: userId }, lock: { mode: 'pessimistic_write' } });
      if (!campaign) throw new ResourceNotFoundException('Booking');
      if (campaign.status === 'cancelled') return;
      if (campaign.status !== 'pending-payment' && campaign.status !== 'draft') {
        throw new PromotionStateException('This booking is already paid, so it can’t be cancelled here. Contact support if something is wrong');
      }
      const from = campaign.status;
      campaign.status = 'cancelled';
      campaign.holdExpiresAt = null;
      campaign.checkoutUrl = null;
      await manager.save(campaign);
      await appendModerationLog(manager, { subjectType: 'campaign', subjectId: campaign.id, action: 'cancelled', fromStatus: from, toStatus: 'cancelled', actorUserId: userId });
    });
  }

  async liveBillboards(): Promise<LiveBillboardsDto> {
    return (await this.live.get()).dto;
  }

  /** Link of a currently-live campaign (null if it isn't live). */
  async liveLink(campaignId: string): Promise<string | null> {
    return (await this.live.get()).links.get(campaignId) ?? null;
  }

  async filterLive(campaignIds: readonly string[]): Promise<string[]> {
    const { links } = await this.live.get();
    return campaignIds.filter((id) => links.has(id));
  }

  /** After a moderation decision, so this instance serves the change immediately. */
  invalidateLive(): void {
    this.live.invalidate();
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  /** `nextStarts[w - 1]` for a w-week booking on a slot with these bookings (see `nextFreeStart`). */
  private nextStarts(bookings: readonly DateRange[], slot: AdSlot, today: IsoDate): (IsoDate | null)[] {
    return Array.from({ length: AD_MAX_WEEKS }, (_, index) => nextFreeStart(bookings, today, (index + 1) * AD_WEEK_DAYS, slot.maxConcurrentAds, BILLBOARD_MAX_LEAD_DAYS));
  }

  private async startCheckout(user: AuthUser, character: Buyer | null, campaign: AdCampaignEntity, slot: AdSlot): Promise<CheckoutSession> {
    const weeks = Math.round(campaign.days / AD_WEEK_DAYS);
    const plural = weeks === 1 ? 'week' : 'weeks';
    let session: CheckoutSession;
    try {
      session = await this.checkout.start({
        userId: user.userId,
        email: user.email,
        customerName: character ? `@${character.handle}` : undefined,
        characterId: character?.id ?? null,
        purpose: 'billboard',
        amountKobo: campaign.amountKobo,
        description: `Inside Life ad: ${slot.name}, ${weeks} ${plural} from ${campaign.startDate}`.slice(0, 120),
        subjectId: campaign.id,
      });
    } catch (error) {
      await this.releaseFailedCheckout(campaign.id);
      throw error;
    }
    await this.campaigns.update({ id: campaign.id }, { paymentReference: session.reference, checkoutUrl: session.authorizationUrl });
    campaign.paymentReference = session.reference;
    campaign.checkoutUrl = session.authorizationUrl;
    return session;
  }

  private async releaseFailedCheckout(campaignId: string): Promise<void> {
    try {
      await withTransaction(this.dataSource, async (manager) => {
        const result = await manager.update(AdCampaignEntity, { id: campaignId, status: 'pending-payment' }, { status: 'cancelled', holdExpiresAt: null });
        if (result.affected) {
          await appendModerationLog(manager, { subjectType: 'campaign', subjectId: campaignId, action: 'checkout-failed', fromStatus: 'pending-payment', toStatus: 'cancelled' });
        }
      });
    } catch (error) {
      this.logger.warn({ err: error, campaignId }, 'Could not release a booking after a failed checkout; its hold will lapse');
    }
  }

  /**
   * Checkout fulfiller for 'billboard'. Idempotent by reference; never throws for permanent problems (unknown
   * campaign, duplicate payment, sold-out dates) so the payments module doesn't retry forever — it refunds those
   * payments automatically instead (see `applyRefund`).
   */
  private async applyPayment(payment: PaidCheckout): Promise<FulfilmentResult> {
    if (!UUID_PATTERN.test(payment.subjectId)) {
      this.logger.error({ reference: payment.reference, subjectId: payment.subjectId }, 'Billboard payment for a malformed campaign id; refunding');
      return { kind: 'refund', reason: 'Payment for an unknown booking' };
    }
    const clock = clockAt();
    const result = await withTransaction(this.dataSource, async (manager) => {
      const campaign = await manager.findOne(AdCampaignEntity, { where: { id: payment.subjectId }, lock: { mode: 'pessimistic_write' } });
      if (!campaign) {
        this.logger.error({ reference: payment.reference, campaignId: payment.subjectId }, 'Billboard payment for an unknown campaign; refunding');
        return { kind: 'refund', reason: 'Payment for an unknown booking' } as const;
      }
      const match = matchPayment(campaign, payment.reference);
      if (match === 'already-fulfilled') return { kind: 'delivered' } as const;
      if (match === 'duplicate') {
        this.logger.error({ reference: payment.reference, campaignId: campaign.id }, 'Second payment for an already-paid campaign; refunding it');
        await appendModerationLog(manager, {
          subjectType: 'campaign',
          subjectId: campaign.id,
          action: 'duplicate-payment',
          fromStatus: campaign.status,
          toStatus: campaign.status,
          paymentReference: payment.reference,
          reason: 'Duplicate payment — refunded automatically',
        });
        return { kind: 'refund', reason: 'Duplicate payment for a booking that was already paid' } as const;
      }

      await advisoryLock(manager, `promotions:billboard:${campaign.slotId}`);
      const slot = findAdSlot(campaign.slotId);
      const others = await this.activeBookings(manager, campaign, clock.now, campaign.slotId, campaign.id);
      const admission = admitAfterPayment({
        range: campaign,
        today: clock.today,
        amountKobo: campaign.amountKobo,
        paidKobo: payment.amountKobo,
        hasRoom: slot !== undefined && firstFullDay(others, campaign, slot.maxConcurrentAds) === null,
      });

      const from = campaign.status;
      campaign.paidAt = payment.paidAt;
      campaign.paymentReference = payment.reference;
      campaign.holdExpiresAt = null;
      campaign.checkoutUrl = null;
      if (admission.kind === 'review') {
        campaign.status = 'in-review';
      } else {
        campaign.status = 'refund-due';
        campaign.rejectionReason = admission.reason;
      }
      await manager.save(campaign);
      await appendModerationLog(manager, {
        subjectType: 'campaign',
        subjectId: campaign.id,
        action: admission.kind === 'review' ? 'paid' : 'refund-flagged',
        fromStatus: from,
        toStatus: campaign.status,
        paymentReference: payment.reference,
        reason: admission.kind === 'refund' ? admission.reason : null,
      });
      return { kind: 'applied', campaign, admission } as const;
    });

    if (result.kind !== 'applied') return result;
    const { campaign, admission } = result;
    this.logger.log({ campaignId: campaign.id, reference: payment.reference, status: campaign.status }, 'Billboard payment applied');
    await this.notifier.notifyOwner(
      campaign.ownerUserId,
      admission.kind === 'review' ? paidNotice(subjectOf(campaign)) : autoRefundNotice(subjectOf(campaign), admission.reason),
    );
    return admission.kind === 'review' ? { kind: 'delivered' } : { kind: 'refund', reason: admission.reason };
  }

  /** `onRefunded` for 'billboard' payments: settle the booking (see `applyRefundToItem`) and tell the buyer. */
  private async applyRefund(payment: PaidCheckout, refund: CheckoutRefund): Promise<void> {
    if (!UUID_PATTERN.test(payment.subjectId)) return;
    const applied = await applyRefundToItem(this.dataSource, AdCampaignEntity, 'campaign', payment, refund);
    if (applied?.settlement.kind !== 'refunded') return;
    if (applied.settlement.takenDown) this.invalidateLive();
    this.logger.log({ campaignId: applied.item.id, reference: payment.reference, refundId: refund.refundId }, 'Billboard booking refunded');
    await this.notifier.notifyOwner(applied.item.ownerUserId, refundedNotice(subjectOf(applied.item), refund.amountKobo));
  }

  /** Bookings that take a place on their dates: paid & not refused, or unpaid with a live hold. */
  private activeBookings(manager: EntityManager, range: DateRange, now: Date, slotId?: string, excludeId?: string): Promise<AdCampaignEntity[]> {
    const query = manager
      .createQueryBuilder(AdCampaignEntity, 'c')
      .select(['c.id', 'c.slotId', 'c.status', 'c.startDate', 'c.endDate', 'c.holdExpiresAt'])
      .where('c.endDate > :from AND c.startDate < :to', { from: range.startDate, to: range.endDate })
      .andWhere(
        new Brackets((where) => {
          where.where('c.status IN (:...committed)', { committed: COMMITTED_STATUSES }).orWhere("(c.status = 'pending-payment' AND c.holdExpiresAt > :now)", { now });
        }),
      );
    if (slotId) query.andWhere('c.slotId = :slotId', { slotId });
    if (excludeId) query.andWhere('c.id <> :excludeId', { excludeId });
    return query.getMany();
  }

  /** Persist date-driven transitions (approved → live → completed). Effective statuses never depend on this. */
  private async reconcile(clock: Clock): Promise<void> {
    const runningStatuses: PromotionStatus[] = ['approved', 'live'];
    await this.campaigns.update({ status: In(runningStatuses), endDate: LessThanOrEqual(clock.today) }, { status: 'completed' });
    await this.campaigns.update({ status: 'approved', startDate: LessThanOrEqual(clock.today), endDate: MoreThan(clock.today) }, { status: 'live' });
  }

  private async loadLive(): Promise<LiveBillboards> {
    const clock = clockAt();
    try {
      await this.reconcile(clock);
    } catch (error) {
      this.logger.warn({ err: error }, 'Billboard status reconcile failed; serving by date anyway');
    }
    const [running, pricing] = await Promise.all([
      this.campaigns.find({
        where: { status: In(['approved', 'live']), startDate: LessThanOrEqual(clock.today), endDate: MoreThan(clock.today) },
        order: { paidAt: 'ASC', id: 'ASC' },
      }),
      this.rates.pricing(),
    ]);
    const links = new Map<string, string>();
    const bySlot = new Map<string, AdCampaignEntity[]>();
    for (const campaign of running) bySlot.set(campaign.slotId, [...(bySlot.get(campaign.slotId) ?? []), campaign]);
    const slots: LiveBillboardSlotDto[] = [];
    const phoneApps: LivePhoneAppDto[] = [];
    for (const slot of this.forSale) {
      const campaigns = (bySlot.get(slot.id) ?? []).slice(0, slot.maxConcurrentAds);
      for (const campaign of campaigns) links.set(campaign.id, campaign.linkUrl);
      if (slot.kind === 'phone-app') {
        const app = campaigns[0];
        if (app) phoneApps.push({ slotId: slot.id, campaignId: app.id, name: app.title, tagline: app.tagline ?? '', iconUrl: app.creativeUrl, linkUrl: app.linkUrl });
        continue;
      }
      // Empty street slots are left out: the client draws the house ad for anything not listed.
      if (slot.kind !== 'premium-billboard' && campaigns.length === 0) continue;
      const creatives = campaigns.map((campaign) => ({ campaignId: campaign.id, imageUrl: campaign.creativeUrl, linkUrl: campaign.linkUrl, title: campaign.title }));
      slots.push({
        slotId: slot.id,
        format: slot.format,
        width: slot.width,
        height: slot.height,
        rotationSeconds: BILLBOARD_ROTATION_SECONDS,
        creatives,
        hasSpace: creatives.length < slot.maxConcurrentAds,
        houseAd: houseAd(slot, pricing.weekPriceKobo(slot)),
      });
    }
    return { dto: { generatedAt: clock.now.toISOString(), slots, phoneApps, priceLabels: this.kindPriceLabels(pricing) }, links };
  }

  /** "From ₦3,500/week" per street placement kind (its cheapest spot), for the empty faces drawn by the client. */
  private kindPriceLabels(pricing: AdPricing): Partial<Record<AdPlacementKind, string>> {
    const labels: Partial<Record<AdPlacementKind, string>> = {};
    for (const kind of AD_PLACEMENT_KINDS) {
      const prices = this.forSale.filter((slot) => slot.kind === kind).map((slot) => pricing.weekPriceKobo(slot));
      if (prices.length > 0) labels[kind] = `From ${adWeekPriceLabel(Math.min(...prices))}`;
    }
    return labels;
  }
}
