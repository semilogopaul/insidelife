import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac } from 'node:crypto';
import type { Redis } from 'ioredis';
import { In, type DataSource } from 'typeorm';
import type { ClickTargetDto } from '@insidelife/shared';
import { ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import { REDIS } from '../../../common/redis/redis.module.js';
import type { AppConfig } from '../../../config/configuration.js';
import { withTransaction } from '../../../database/transaction.js';
import { CampaignsService } from '../campaigns.service.js';
import { AdCampaignEntity } from '../entities/ad-campaign.entity.js';
import { ClubPlayOrderEntity } from '../entities/club-play-order.entity.js';
import { ClubTrackEntity } from '../entities/club-track.entity.js';
import { TracksService } from '../tracks.service.js';
import { RedisDedupeStore } from './redis-dedupe.store.js';
import { ViewDeduper, type TrackingKind } from './view-deduper.js';

/**
 * Impressions, clicks and plays from the 3D world. Only items that are live right now count, each signed-in viewer
 * counts once per item per real hour, and nothing personal is stored (Redis holds hour-scoped keyed hashes that
 * expire with the hour; Postgres only holds totals). Tracking never fails a request: when Redis is down, nothing is
 * counted rather than over-counted.
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly deduper: ViewDeduper;

  constructor(
    @Inject(REDIS) redis: Redis,
    config: ConfigService<AppConfig, true>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly campaigns: CampaignsService,
    private readonly tracks: TracksService,
  ) {
    // A purpose-bound key derived from the server secret: viewer hashes can't be reversed or linked across hours.
    const key = createHmac('sha256', config.get('auth', { infer: true }).accessSecret).update('promotions:viewer-hash:v1').digest('base64url');
    this.deduper = new ViewDeduper(new RedisDedupeStore(redis), key);
  }

  async impressions(viewerId: string | null, campaignIds: readonly string[]): Promise<void> {
    if (!viewerId) return;
    const live = await this.campaigns.filterLive(campaignIds);
    const fresh = await this.firstSeen('impression', viewerId, live);
    if (fresh.length === 0) return;
    await this.dataSource.getRepository(AdCampaignEntity).increment({ id: In(fresh) }, 'impressions', 1);
  }

  /** Where the billboard links to (opened by the client behind the "You're leaving Inside Life" screen). */
  async click(viewerId: string | null, campaignId: string): Promise<ClickTargetDto> {
    const url = await this.campaigns.liveLink(campaignId);
    if (!url) throw new ResourceNotFoundException('Billboard ad');
    if (viewerId) {
      const fresh = await this.firstSeen('click', viewerId, [campaignId]);
      if (fresh.length > 0) await this.dataSource.getRepository(AdCampaignEntity).increment({ id: campaignId }, 'clicks', 1);
    }
    return { url };
  }

  async play(viewerId: string | null, trackId: string, venueId: string): Promise<void> {
    if (!viewerId) return;
    const orderId = await this.tracks.liveOrderId(trackId, venueId);
    if (!orderId) return;
    const fresh = await this.firstSeen('play', viewerId, [trackId]);
    if (fresh.length === 0) return;
    await withTransaction(this.dataSource, async (manager) => {
      await manager.increment(ClubPlayOrderEntity, { id: orderId }, 'plays', 1);
      await manager.increment(ClubTrackEntity, { id: trackId }, 'plays', 1);
    });
  }

  private async firstSeen(kind: TrackingKind, viewerId: string, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    try {
      return await this.deduper.firstSeen(kind, viewerId, ids);
    } catch (error) {
      this.logger.warn({ err: error, kind }, 'Tracking de-duplication unavailable; not counting');
      return [];
    }
  }
}
