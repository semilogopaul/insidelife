import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { In, Not, type DataSource, type Repository } from 'typeorm';
import { findAdSlot, type ModerationCampaignDto, type ModerationClubOrderDto, type ModerationQueueDto, type PromotionStatus } from '@insidelife/shared';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { withTransaction } from '../../database/transaction.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { CampaignsService } from './campaigns.service.js';
import { AdCampaignEntity } from './entities/ad-campaign.entity.js';
import { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import { ClubTrackEntity } from './entities/club-track.entity.js';
import { CreativeEntity } from './entities/creative.entity.js';
import type { ModerationAction } from './entities/moderation-log.entity.js';
import { appendModerationLog } from './moderation-log.js';
import { clockAt, toCampaignDto, toClubOrderDto, type Clock } from './promotions.mappers.js';
import { approvedNotice, refundedNotice, rejectedNotice, type NoticeSubject } from './promotions.notices.js';
import { PromotionStateException } from './promotions.errors.js';
import { PromotionsNotifier, type PromotionNotice } from './promotions-notifier.service.js';
import { COMMITTED_STATUSES, decideModeration, type ModerationDecision } from './rules/status.rules.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { TracksService, trackSubject } from './tracks.service.js';

const QUEUE_LIMIT = 100;
/** Items that still need their media: anything unpaid-but-held, in review or running. */
const MEDIA_IN_USE: PromotionStatus[] = ['pending-payment', ...COMMITTED_STATUSES];

type Handles = ReadonlyMap<string, string>;

const logAction = (decision: ModerationDecision): ModerationAction =>
  decision.action === 'approve' ? 'approved' : decision.action === 'reject' ? 'rejected' : 'refunded';

function noticeFor(decision: ModerationDecision, to: PromotionStatus, subject: NoticeSubject, item: { startDate: string; amountKobo: number }, reason: string | null): PromotionNotice {
  switch (decision.action) {
    case 'approve':
      return approvedNotice(subject, to === 'live', item.startDate);
    case 'reject':
      return rejectedNotice(subject, reason ?? 'it breaks our content rules.', to === 'refund-due');
    case 'mark-refunded':
      return refundedNotice(subject, item.amountKobo);
  }
}

/**
 * Admin review of paid billboard campaigns and club orders: the queue, approve / reject (with refund flag), and
 * marking refunds done after ops refund them in the Paystack dashboard. Rejected media is deleted from storage.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AdCampaignEntity) private readonly campaigns: Repository<AdCampaignEntity>,
    @InjectRepository(ClubPlayOrderEntity) private readonly orders: Repository<ClubPlayOrderEntity>,
    @InjectRepository(ClubTrackEntity) private readonly tracks: Repository<ClubTrackEntity>,
    @InjectRepository(CreativeEntity) private readonly creatives: Repository<CreativeEntity>,
    private readonly storage: StorageService,
    private readonly directory: CharacterDirectory,
    private readonly notifier: PromotionsNotifier,
    private readonly campaignFeed: CampaignsService,
    private readonly rotationFeed: TracksService,
  ) {}

  async queue(): Promise<ModerationQueueDto> {
    const clock = clockAt();
    const [reviewCampaigns, reviewOrders, refundCampaigns, refundOrders] = await Promise.all([
      this.campaigns.find({ where: { status: 'in-review' }, order: { startDate: 'ASC', paidAt: 'ASC' }, take: QUEUE_LIMIT }),
      this.orders.find({ where: { status: 'in-review' }, order: { startDate: 'ASC', paidAt: 'ASC' }, take: QUEUE_LIMIT }),
      this.campaigns.find({ where: { status: 'refund-due' }, order: { updatedAt: 'ASC' }, take: QUEUE_LIMIT }),
      this.orders.find({ where: { status: 'refund-due' }, order: { updatedAt: 'ASC' }, take: QUEUE_LIMIT }),
    ]);
    const allOrders = [...reviewOrders, ...refundOrders];
    const trackIds = [...new Set(allOrders.map((order) => order.trackId))];
    const tracks = trackIds.length === 0 ? [] : await this.tracks.find({ where: { id: In(trackIds) } });
    const trackById = new Map(tracks.map((track) => [track.id, track]));
    const handles = await this.handlesOf([...reviewCampaigns, ...refundCampaigns, ...allOrders]);

    const campaignView = (campaign: AdCampaignEntity): ModerationCampaignDto => this.campaignView(campaign, clock, handles);
    const orderViews = (orders: readonly ClubPlayOrderEntity[]): ModerationClubOrderDto[] =>
      orders.flatMap((order) => {
        const track = trackById.get(order.trackId);
        return track ? [this.orderView(order, track, clock, handles)] : [];
      });
    return {
      campaigns: reviewCampaigns.map(campaignView),
      clubOrders: orderViews(reviewOrders),
      refundsDue: { campaigns: refundCampaigns.map(campaignView), clubOrders: orderViews(refundOrders) },
    };
  }

  async decideCampaign(adminId: string, campaignId: string, decision: ModerationDecision, reason: string | null): Promise<ModerationCampaignDto> {
    const clock = clockAt();
    const campaign = await withTransaction(this.dataSource, async (manager) => {
      const entity = await manager.findOne(AdCampaignEntity, { where: { id: campaignId }, lock: { mode: 'pessimistic_write' } });
      if (!entity) throw new ResourceNotFoundException('Campaign');
      const outcome = decideModeration(entity, decision, clock.today);
      if (!outcome.ok) throw new PromotionStateException(outcome.message);
      const from = entity.status;
      entity.status = outcome.to;
      if (decision.action === 'mark-refunded') {
        entity.holdExpiresAt = null;
      } else {
        entity.reviewedAt = clock.now;
        entity.reviewedBy = adminId;
      }
      if (decision.action === 'reject') entity.rejectionReason = reason;
      await manager.save(entity);
      await appendModerationLog(manager, {
        subjectType: 'campaign',
        subjectId: entity.id,
        action: logAction(decision),
        fromStatus: from,
        toStatus: entity.status,
        actorUserId: adminId,
        reason,
        paymentReference: entity.paymentReference,
      });
      return entity;
    });

    this.campaignFeed.invalidateLive();
    if (decision.action === 'reject') await this.removeCreativeIfUnused(campaign);
    this.logger.log({ campaignId, action: decision.action, status: campaign.status, adminId }, 'Billboard campaign moderated');
    const subject: NoticeSubject = { noun: 'Billboard', name: campaign.title, where: findAdSlot(campaign.slotId)?.name ?? 'your board' };
    await this.notifier.notifyOwner(campaign.ownerUserId, noticeFor(decision, campaign.status, subject, campaign, reason));
    return this.campaignView(campaign, clock, await this.handlesOf([campaign]));
  }

  async decideClubOrder(adminId: string, orderId: string, decision: ModerationDecision, reason: string | null): Promise<ModerationClubOrderDto> {
    const clock = clockAt();
    const { order, track } = await withTransaction(this.dataSource, async (manager) => {
      const entity = await manager.findOne(ClubPlayOrderEntity, { where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
      if (!entity) throw new ResourceNotFoundException('Club order');
      const owner = await manager.findOne(ClubTrackEntity, { where: { id: entity.trackId } });
      if (!owner) throw new ResourceNotFoundException('Song');
      const outcome = decideModeration(entity, decision, clock.today);
      if (!outcome.ok) throw new PromotionStateException(outcome.message);
      const from = entity.status;
      entity.status = outcome.to;
      if (decision.action === 'mark-refunded') {
        entity.holdExpiresAt = null;
      } else {
        entity.reviewedAt = clock.now;
        entity.reviewedBy = adminId;
      }
      if (decision.action === 'reject') entity.rejectionReason = reason;
      await manager.save(entity);
      await appendModerationLog(manager, {
        subjectType: 'club-order',
        subjectId: entity.id,
        action: logAction(decision),
        fromStatus: from,
        toStatus: entity.status,
        actorUserId: adminId,
        reason,
        paymentReference: entity.paymentReference,
      });
      return { order: entity, track: owner };
    });

    this.rotationFeed.invalidateRotation();
    if (decision.action === 'reject') await this.removeTrackIfUnused(track, order.id);
    this.logger.log({ orderId, action: decision.action, status: order.status, adminId }, 'Club order moderated');
    await this.notifier.notifyOwner(order.ownerUserId, noticeFor(decision, order.status, trackSubject(track, order), order, reason));
    return this.orderView(order, track, clock, await this.handlesOf([order]));
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  /** Delete a rejected creative unless another live/held booking still shows it. */
  private async removeCreativeIfUnused(campaign: AdCampaignEntity): Promise<void> {
    try {
      const inUse = await this.campaigns.exists({ where: { creativeKey: campaign.creativeKey, status: In(MEDIA_IN_USE), id: Not(campaign.id) } });
      if (inUse) return;
      await this.creatives.delete({ key: campaign.creativeKey });
      await this.storage.remove(campaign.creativeKey);
    } catch (error) {
      this.logger.warn({ err: error, campaignId: campaign.id }, 'Could not remove a rejected creative');
    }
  }

  /** Delete a rejected song's audio unless another order still needs it; the track can't be ordered again. */
  private async removeTrackIfUnused(track: ClubTrackEntity, rejectedOrderId: string): Promise<void> {
    try {
      const inUse = await this.orders.exists({ where: { trackId: track.id, status: In(MEDIA_IN_USE), id: Not(rejectedOrderId) } });
      if (inUse || track.removedAt) return;
      await this.tracks.update({ id: track.id }, { removedAt: new Date() });
      track.removedAt = new Date();
      await this.storage.remove(track.audioKey);
    } catch (error) {
      this.logger.warn({ err: error, trackId: track.id }, 'Could not remove a rejected track');
    }
  }

  private async handlesOf(items: ReadonlyArray<{ readonly ownerCharacterId: string | null }>): Promise<Handles> {
    const ids = [...new Set(items.map((item) => item.ownerCharacterId).filter((id): id is string => id !== null))];
    const characters = await Promise.all(ids.map((id) => this.directory.findById(id)));
    return new Map(characters.flatMap((character) => (character ? [[character.id, character.handle] as const] : [])));
  }

  private campaignView(campaign: AdCampaignEntity, clock: Clock, handles: Handles): ModerationCampaignDto {
    return {
      ...toCampaignDto(campaign, clock),
      ownerUserId: campaign.ownerUserId,
      ownerHandle: campaign.ownerCharacterId ? (handles.get(campaign.ownerCharacterId) ?? null) : null,
    };
  }

  private orderView(order: ClubPlayOrderEntity, track: ClubTrackEntity, clock: Clock, handles: Handles): ModerationClubOrderDto {
    return {
      ...toClubOrderDto(order, clock),
      ownerUserId: order.ownerUserId,
      ownerHandle: order.ownerCharacterId ? (handles.get(order.ownerCharacterId) ?? null) : null,
      track: {
        id: track.id,
        artistName: track.artistName,
        title: track.title,
        audioUrl: track.audioUrl,
        contentType: track.contentType,
        durationSeconds: track.durationSeconds,
      },
    };
  }
}
