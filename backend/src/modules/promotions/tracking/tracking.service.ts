import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { In, type DataSource } from 'typeorm';
import {
  AD_VIEW_DEDUPE_GAME_MINUTES,
  adSpotGeometry,
  adSurfaceOfSlot,
  findRoute,
  findVenue,
  homeEntrance,
  homeKey,
  homeLocationId,
  venueEntrance,
  type AdViewReport,
  type ClickTargetDto,
  type DistrictId,
  type WorldPoint,
} from '@insidelife/shared';
import { ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import { PLAYER_POSITION_PORT, type PlayerPositionPort } from '../../../common/ports/player-position.port.js';
import { REDIS } from '../../../common/redis/redis.module.js';
import type { AppConfig } from '../../../config/configuration.js';
import { CharacterDirectory } from '../../characters/character-directory.service.js';
import type { CharacterEntity } from '../../characters/entities/character.entity.js';
import { WorldService } from '../../world/world.service.js';
import { CampaignsService } from '../campaigns.service.js';
import { AdCampaignEntity } from '../entities/ad-campaign.entity.js';
import { PromotionAudienceEntity } from '../entities/promotion-audience.entity.js';
import { judgeView, viewsAllowed, type ViewerState } from '../rules/views.rules.js';
import { RedisDedupeStore } from './redis-dedupe.store.js';
import { promotionsHashKey } from './tracking-key.js';
import { audienceHash, ViewDeduper } from './view-deduper.js';

/** Dedupe keys outlive their game hour (30 real seconds at ×120) comfortably. */
const VIEW_DEDUPE_TTL_SECONDS = 15 * 60;
/** A ride's route is kept this long per node (it doesn't change while the ride lasts). */
const RIDE_ROUTE_CACHE = 200;

export interface ViewsResult {
  readonly counted: number;
  readonly rejected: number;
}

/**
 * Views and link opens from the game. A view counts only when it's believable and new:
 *
 * - the viewer is signed in with a living character, and under `VIEW_REPORTS_PER_MINUTE` reports this minute;
 * - the campaign is live on that slot right now;
 * - it passes `judgeView` against what the server knows (last accepted position or the ride they're on for street
 *   spots, being indoors for Lagos TV);
 * - this player hasn't been counted for this campaign in this game hour (Redis, keyed hashes that expire).
 *
 * Postgres keeps only totals, plus a keyed hash per (campaign, player) for the unique-viewer count. Tracking never fails
 * a request: when Redis is down nothing is counted rather than over-counted.
 */
@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly deduper: ViewDeduper;
  private readonly hashKey: string;
  private readonly rideRoutes = new Map<string, readonly WorldPoint[] | null>();

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    config: ConfigService<AppConfig, true>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly campaigns: CampaignsService,
    private readonly directory: CharacterDirectory,
    private readonly world: WorldService,
    @Inject(PLAYER_POSITION_PORT) private readonly positions: PlayerPositionPort,
  ) {
    this.hashKey = promotionsHashKey(config);
    this.deduper = new ViewDeduper(new RedisDedupeStore(redis), this.hashKey);
  }

  async views(userId: string | null, reports: readonly AdViewReport[], nowMs: number = Date.now()): Promise<ViewsResult> {
    if (!userId || reports.length === 0) return { counted: 0, rejected: reports.length };
    const character = await this.directory.findLivingByUser(userId);
    if (!character) return { counted: 0, rejected: reports.length };
    const allowed = await this.rateLimit(character.id, reports.length, nowMs);
    const candidates = reports.slice(0, allowed);

    const accepted: AdViewReport[] = [];
    let viewer: ViewerState | null = null;
    for (const report of candidates) {
      const liveSlot = await this.campaigns.liveSlotOf(report.campaignId);
      if (liveSlot !== report.slotId) continue;
      const surface = adSurfaceOfSlot(report.slotId);
      if (!surface) continue;
      viewer ??= await this.viewerState(character, surface === 'street', nowMs);
      const verdict = judgeView({ surface, spot: adSpotGeometry(report.slotId), seenAt: report.seenAt, now: nowMs, viewer });
      if (verdict === 'count') accepted.push(report);
    }
    const counted = await this.count(character.id, accepted);
    return { counted, rejected: reports.length - counted };
  }

  /** Where the billboard links to (opened by the client behind the "You're leaving Inside Life" screen). */
  async click(viewerId: string | null, campaignId: string): Promise<ClickTargetDto> {
    const url = await this.campaigns.liveLink(campaignId);
    if (!url) throw new ResourceNotFoundException('Billboard ad');
    if (viewerId) {
      const fresh = await this.firstSeen(() => this.deduper.firstSeen('click', viewerId, [campaignId]));
      if (fresh.length > 0) await this.dataSource.getRepository(AdCampaignEntity).increment({ id: campaignId }, 'clicks', 1);
    }
    return { url };
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  /** Count the accepted views: once per campaign per game hour, and once per campaign ever for unique viewers. */
  private async count(characterId: string, accepted: readonly AdViewReport[]): Promise<number> {
    if (accepted.length === 0) return 0;
    const byHour = new Map<number, string[]>();
    for (const report of accepted) {
      const hour = Math.floor(this.world.now(report.seenAt) / AD_VIEW_DEDUPE_GAME_MINUTES);
      byHour.set(hour, [...(byHour.get(hour) ?? []), report.campaignId]);
    }
    const fresh = new Set<string>();
    for (const [hour, ids] of byHour) {
      for (const id of await this.firstSeen(() => this.deduper.firstSeenIn('view', characterId, ids, { index: hour, ttlSeconds: VIEW_DEDUPE_TTL_SECONDS }))) fresh.add(id);
    }
    if (fresh.size === 0) return 0;
    const ids = [...fresh];
    await this.dataSource.transaction(async (manager) => {
      await manager.increment(AdCampaignEntity, { id: In(ids) }, 'impressions', 1);
      const inserted = await manager
        .createQueryBuilder()
        .insert()
        .into(PromotionAudienceEntity)
        .values(ids.map((id) => ({ subjectId: id, viewerHash: audienceHash(this.hashKey, id, characterId) })))
        .orIgnore()
        .returning(['subjectId'])
        .execute();
      const firstTime = ((inserted.raw as Array<{ subject_id: string }>) ?? []).map((row) => row.subject_id);
      if (firstTime.length > 0) await manager.increment(AdCampaignEntity, { id: In(firstTime) }, 'uniqueViewers', 1);
    });
    return ids.length;
  }

  /** How many of `reported` this character may report now (per real minute, in Redis); 0 if Redis is down. */
  private async rateLimit(characterId: string, reported: number, nowMs: number): Promise<number> {
    const key = `promo:views:rate:${characterId}:${Math.floor(nowMs / 60_000)}`;
    try {
      const total = await this.redis.incrby(key, reported);
      if (total === reported) await this.redis.expire(key, 120);
      return viewsAllowed(total - reported, reported);
    } catch (error) {
      this.logger.warn({ err: error }, 'View rate limit unavailable; not counting');
      return 0;
    }
  }

  private async viewerState(character: CharacterEntity, needsPosition: boolean, nowMs: number): Promise<ViewerState> {
    const travel = character.travel;
    const gameNow = this.world.now(nowMs);
    const riding = travel !== null && travel.source !== 'open-world' && gameNow >= travel.departAt && gameNow <= travel.arriveAt + 2;
    return {
      locationId: character.locationId,
      riding,
      fix: needsPosition ? await this.positions.last(character.id) : null,
      ride: needsPosition && riding && travel ? this.rideRoute(character, travel.fromLocationId, travel.toLocationId, travel.departAt) : null,
    };
  }

  /** The route a booked ride plays back (door to door, the same `findRoute` the client uses). */
  private rideRoute(character: CharacterEntity, from: string, to: string, departAt: number): readonly WorldPoint[] | null {
    const key = `${character.id}:${from}:${to}:${departAt}`;
    if (this.rideRoutes.has(key)) return this.rideRoutes.get(key) ?? null;
    const door = (locationId: string): WorldPoint | null => {
      if (locationId === homeLocationId(character.id)) return homeEntrance(homeKey(character.id, character.homePropertyId), character.homeDistrictId as DistrictId).position;
      return findVenue(locationId) ? (venueEntrance(locationId)?.position ?? null) : null;
    };
    const a = door(from);
    const b = door(to);
    const route = a && b ? (findRoute(a, b)?.points ?? null) : null;
    if (this.rideRoutes.size >= RIDE_ROUTE_CACHE) this.rideRoutes.clear();
    this.rideRoutes.set(key, route);
    return route;
  }

  private async firstSeen(lookup: () => Promise<string[]>): Promise<string[]> {
    try {
      return await lookup();
    } catch (error) {
      this.logger.warn({ err: error }, 'Tracking de-duplication unavailable; not counting');
      return [];
    }
  }
}
