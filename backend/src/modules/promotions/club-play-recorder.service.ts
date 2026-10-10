import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { And, LessThanOrEqual, MoreThan, type DataSource } from 'typeorm';
import { findVenue } from '@insidelife/shared';
import type { AppConfig } from '../../config/configuration.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { ClubScheduleService, type ScheduledSlot } from './club-schedule.service.js';
import { ClubPlayEntity } from './entities/club-play.entity.js';
import { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import { ClubTrackEntity } from './entities/club-track.entity.js';
import { PromotionAudienceEntity } from './entities/promotion-audience.entity.js';
import { songPlayingNotice } from './promotions.notices.js';
import { PromotionsNotifier } from './promotions-notifier.service.js';
import { canEnterVenue, shouldAnnouncePlay } from './rules/play-notice.rules.js';
import { audienceHash } from './tracking/view-deduper.js';
import { promotionsHashKey } from './tracking/tracking-key.js';

const SWEEP_EVERY_MS = 15_000;
/** After a restart, record the plays of the last few hours (the schedule is the truth: they played for everyone there). */
const CATCH_UP_MS = 6 * 3_600_000;
/** Longest a play lasts (a song is at most 3 minutes), plus slack: plays that may still be on. */
const MAX_PLAY_MS = 4 * 60_000;
/** Players counted per club per sample (presence keeps every player at a place in one set). */
const AUDIENCE_SAMPLE = 500;
/** Per-play listener hashes are only needed while the play can still gain listeners. */
const PRUNE_AFTER_MS = 2 * 86_400_000;
const PRUNE_EVERY_MS = 3_600_000;

interface RecordedPlay {
  readonly id: string;
  readonly slot: ScheduledSlot;
}

/**
 * Turns the club schedule into facts. Every 15 s, on every API node (all of it is idempotent):
 *
 * 1. **Plays.** Each scheduled slot that has started and has a song becomes one `promotion_club_plays` row (unique by
 *    slot, so a second node or a re-run adds nothing) and +1 play on the order and the track. The schedule is what
 *    every club's audio plays, so a started slot is a play whether or not anyone was there.
 * 2. **"Your song is on now."** The artist hears about the first play of a run, then — while online, at most every
 *    half hour — when it starts in a club they can get into, with "Take me there" (see `shouldAnnouncePlay`).
 * 3. **Audience.** For plays still on, the players present in that club (presence) are added as listeners: a keyed
 *    hash per play and per order (`promotion_audience`), so each player counts once per play and once per order, and
 *    the play's audience, the order's listeners and its total audience go up by exactly the new ones. The artist's own
 *    character isn't counted.
 */
@Injectable()
export class ClubPlayRecorder implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ClubPlayRecorder.name);
  private readonly hashKey: string;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastSweptMs: number | null = null;
  private lastPrunedMs = 0;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly schedule: ClubScheduleService,
    private readonly presence: PresenceService,
    private readonly directory: CharacterDirectory,
    private readonly notifier: PromotionsNotifier,
    config: ConfigService<AppConfig, true>,
  ) {
    this.hashKey = promotionsHashKey(config);
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(nowMs: number = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.step('plays', () => this.recordPlays(nowMs));
      await this.step('audience', () => this.sampleAudience(nowMs));
      if (nowMs - this.lastPrunedMs > PRUNE_EVERY_MS) {
        this.lastPrunedMs = nowMs;
        await this.step('prune', () => this.prune(nowMs));
      }
    } finally {
      this.running = false;
    }
  }

  /** Record every started slot with a song since the last sweep (with a minute of overlap); returns the new plays. */
  async recordPlays(nowMs: number): Promise<RecordedPlay[]> {
    const from = Math.max(nowMs - CATCH_UP_MS, (this.lastSweptMs ?? nowMs - CATCH_UP_MS) - 60_000);
    const started = (await this.schedule.slotsBetween(from - MAX_PLAY_MS, nowMs + 1)).filter(
      (slot) => slot.holder !== null && slot.songEndsAtMs !== null && slot.startsAtMs <= nowMs && slot.startsAtMs >= from,
    );
    this.lastSweptMs = nowMs;
    if (started.length === 0) return [];
    const result = await this.dataSource
      .createQueryBuilder()
      .insert()
      .into(ClubPlayEntity)
      .values(
        started.map((slot) => ({
          slotIndex: slot.index,
          orderId: slot.holder?.order.id,
          trackId: slot.holder?.track.id,
          venueId: slot.venueId,
          gameMinute: slot.startMinute,
          startsAt: new Date(slot.startsAtMs),
          endsAt: new Date(slot.songEndsAtMs ?? slot.startsAtMs),
          audience: 0,
        })),
      )
      .orIgnore()
      .returning(['id', 'slotIndex'])
      .execute();
    const rows = (result.raw as Array<{ id: string; slot_index: string | number }>) ?? [];
    const bySlot = new Map(started.map((slot) => [slot.index, slot]));
    const recorded = rows.flatMap((row): RecordedPlay[] => {
      const slot = bySlot.get(Number(row.slot_index));
      return slot ? [{ id: row.id, slot }] : [];
    });
    if (recorded.length > 0) await this.countAndAnnounce(recorded, nowMs);
    return recorded;
  }

  /** Add everyone in the club during plays that are still on. Returns how many new listeners were counted. */
  async sampleAudience(nowMs: number): Promise<number> {
    const now = new Date(nowMs);
    const playing = await this.dataSource.getRepository(ClubPlayEntity).find({
      where: { startsAt: And(LessThanOrEqual(now), MoreThan(new Date(nowMs - MAX_PLAY_MS))), endsAt: MoreThan(now) },
    });
    if (playing.length === 0) return 0;
    const orders = await this.dataSource.getRepository(ClubPlayOrderEntity).find({ where: playing.map((play) => ({ id: play.orderId })) });
    const ownerOf = new Map(orders.map((order) => [order.id, order]));
    let added = 0;
    for (const play of playing) {
      const order = ownerOf.get(play.orderId);
      if (!order) continue;
      const owner = await this.directory.findLivingByUser(order.ownerUserId);
      const excluded = new Set([order.ownerCharacterId, owner?.id].filter((id): id is string => typeof id === 'string'));
      const present = (await this.presence.playersAt(play.venueId, AUDIENCE_SAMPLE)).filter((player) => player.locationId === play.venueId && !excluded.has(player.characterId));
      if (present.length === 0) continue;
      added += await this.addListeners(play, order.id, present.map((player) => player.characterId));
    }
    return added;
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private async addListeners(play: ClubPlayEntity, orderId: string, characterIds: readonly string[]): Promise<number> {
    const values = characterIds.flatMap((characterId) => [
      { subjectId: play.id, viewerHash: audienceHash(this.hashKey, play.id, characterId) },
      { subjectId: orderId, viewerHash: audienceHash(this.hashKey, orderId, characterId) },
    ]);
    return this.dataSource.transaction(async (manager) => {
      const result = await manager.createQueryBuilder().insert().into(PromotionAudienceEntity).values(values).orIgnore().returning(['subjectId']).execute();
      const inserted = (result.raw as Array<{ subject_id: string }>) ?? [];
      const toPlay = inserted.filter((row) => row.subject_id === play.id).length;
      const toOrder = inserted.filter((row) => row.subject_id === orderId).length;
      if (toPlay > 0) await manager.increment(ClubPlayEntity, { id: play.id }, 'audience', toPlay);
      if (toPlay > 0 || toOrder > 0) {
        await manager.query('UPDATE promotion_club_orders SET audience = audience + $2, listeners = listeners + $3 WHERE id = $1', [orderId, toPlay, toOrder]);
      }
      return toPlay;
    });
  }

  private async countAndAnnounce(recorded: readonly RecordedPlay[], nowMs: number): Promise<void> {
    const byOrder = new Map<string, RecordedPlay[]>();
    for (const play of recorded) {
      const orderId = play.slot.holder?.order.id;
      if (orderId) byOrder.set(orderId, [...(byOrder.get(orderId) ?? []), play]);
    }
    for (const [orderId, plays] of byOrder) {
      const holder = plays[0]?.slot.holder;
      if (!holder) continue;
      const rows = (await this.dataSource.query('UPDATE promotion_club_orders SET plays = plays + $2 WHERE id = $1 RETURNING plays, play_notice_at', [orderId, plays.length])) as [
        Array<{ plays: string | number; play_notice_at: Date | null }>,
        number,
      ];
      await this.dataSource.getRepository(ClubTrackEntity).increment({ id: holder.track.id }, 'plays', plays.length);
      const updated = rows[0]?.[0];
      if (!updated) continue;
      const latest = plays.toSorted((a, b) => b.slot.startsAtMs - a.slot.startsAtMs)[0];
      if (!latest) continue;
      await this.announce(orderId, holder, latest.slot, Number(updated.plays) - plays.length === 0, updated.play_notice_at, nowMs);
    }
  }

  private async announce(orderId: string, holder: NonNullable<ScheduledSlot['holder']>, slot: ScheduledSlot, firstPlay: boolean, lastNoticeAt: Date | null, nowMs: number): Promise<void> {
    const owner = await this.directory.findLivingByUser(holder.order.ownerUserId);
    if (!owner) return;
    const venue = findVenue(slot.venueId);
    const canEnter = canEnterVenue(venue, owner.status);
    const announce = shouldAnnouncePlay({
      firstPlay,
      startedAt: slot.startsAtMs,
      now: nowMs,
      lastNoticeAt: lastNoticeAt ? new Date(lastNoticeAt).getTime() : null,
      ownerOnline: await this.presence.isOnline(owner.id),
      canEnter,
    });
    if (!announce) return;
    // Claim the notice (several nodes may sweep at once): only the node that moves `play_notice_at` sends it.
    const claimed = (await this.dataSource.query(
      'UPDATE promotion_club_orders SET play_notice_at = $2 WHERE id = $1 AND (play_notice_at IS NULL OR play_notice_at = $3) RETURNING id',
      [orderId, new Date(nowMs), lastNoticeAt],
    )) as [unknown[], number];
    if ((claimed[0] ?? []).length === 0) return;
    const song = `${holder.track.artistName} – ${holder.track.title}`;
    await this.notifier.notifyOwner(holder.order.ownerUserId, songPlayingNotice(orderId, song, slot.venueId, venue?.name ?? 'a club', canEnter));
  }

  private async prune(nowMs: number): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM promotion_audience a USING promotion_club_plays p WHERE a.subject_id = p.id AND p.ends_at < $1`,
      [new Date(nowMs - PRUNE_AFTER_MS)],
    );
  }

  private async step(name: string, work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.warn({ err: error, step: name }, 'Club play recording step failed');
    }
  }
}
