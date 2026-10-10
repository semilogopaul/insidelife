import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, type Repository } from 'typeorm';
import {
  CLUB_ROTATION_CAPACITY,
  clubSlotsBetween,
  clubSongGuarantee,
  gameMinuteAt,
  isClubPlayVenue,
  nextLaneSlots,
  realMsAt,
  type ClubPlayTimeDto,
  type ClubScheduleDto,
  type ClubScheduledPlayDto,
  type ClubSlot,
  type ClubSongGuarantee,
  type IsoDate,
} from '@insidelife/shared';
import { ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import { WorldService } from '../world/world.service.js';
import { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import { ClubTrackEntity } from './entities/club-track.entity.js';
import { lagosToday } from './rules/schedule.rules.js';
import { CachedValue } from './util/cached-value.js';

/** Recomputed at most this often per node (a moderation decision invalidates it at once). */
const HOLDERS_CACHE_MS = 15_000;
/** The audio's window: a few minutes back (to join a song mid-way) and ahead (so it can ask again calmly). */
const SCHEDULE_BACK_MS = 4 * 60_000;
const SCHEDULE_AHEAD_MS = 20 * 60_000;

/** An approved song holding a lane on its dates. */
export interface LaneHolder {
  readonly order: Pick<ClubPlayOrderEntity, 'id' | 'trackId' | 'ownerUserId' | 'ownerCharacterId' | 'startDate' | 'endDate' | 'lane'>;
  readonly track: Pick<ClubTrackEntity, 'id' | 'artistName' | 'title' | 'audioUrl' | 'contentType' | 'durationSeconds'>;
}

/** A slot with its real times and the song that plays in it (if any). */
export interface ScheduledSlot extends ClubSlot {
  readonly startsAtMs: number;
  readonly date: IsoDate;
  readonly holder: LaneHolder | null;
  /** When the song (not the slot) ends. */
  readonly songEndsAtMs: number | null;
}

/**
 * The server's club schedule: the shared slot/lane plan (`club-schedule.ts`) on the real game clock, filled with the
 * approved songs that hold each lane on each Lagos day. Everything that talks about club plays — the audio feed, the
 * play recorder, the Promote app's "next plays" — reads it here, so they always agree.
 */
@Injectable()
export class ClubScheduleService {
  private readonly logger = new Logger(ClubScheduleService.name);
  private readonly holders = new CachedValue<readonly LaneHolder[]>(HOLDERS_CACHE_MS, () => this.loadHolders());

  constructor(
    private readonly world: WorldService,
    @InjectRepository(ClubPlayOrderEntity) private readonly orders: Repository<ClubPlayOrderEntity>,
    @InjectRepository(ClubTrackEntity) private readonly tracks: Repository<ClubTrackEntity>,
  ) {}

  get guarantee(): ClubSongGuarantee {
    return clubSongGuarantee(this.world.clock.scale, CLUB_ROTATION_CAPACITY);
  }

  invalidate(): void {
    this.holders.invalidate();
  }

  /** Paid slots (with their songs) overlapping `[fromMs, toMs)`, optionally in one club. */
  async slotsBetween(fromMs: number, toMs: number, venueId?: string): Promise<ScheduledSlot[]> {
    const holders = await this.holders.get();
    const { clock, seed } = this.world;
    const slots = clubSlotsBetween(gameMinuteAt(clock, fromMs), gameMinuteAt(clock, toMs), clock.scale, { seed, lanes: CLUB_ROTATION_CAPACITY, venueId });
    return slots.map((slot) => this.fill(slot, holders));
  }

  /** `GET /promotions/club-schedule`: what the audio plays in a club, from a few minutes ago to ~20 minutes ahead. */
  async schedule(venueId: string, nowMs: number = Date.now()): Promise<ClubScheduleDto> {
    if (!isClubPlayVenue(venueId)) throw new ResourceNotFoundException('Club');
    const untilMs = nowMs + SCHEDULE_AHEAD_MS;
    const slots = await this.slotsBetween(nowMs - SCHEDULE_BACK_MS, untilMs, venueId);
    const plays: ClubScheduledPlayDto[] = [];
    for (const slot of slots) {
      if (!slot.holder || slot.songEndsAtMs === null || slot.songEndsAtMs <= nowMs - SCHEDULE_BACK_MS) continue;
      const { track } = slot.holder;
      plays.push({
        slotIndex: slot.index,
        venueId,
        trackId: track.id,
        audioUrl: track.audioUrl,
        contentType: track.contentType,
        artistName: track.artistName,
        title: track.title,
        durationSeconds: track.durationSeconds,
        startsAtMs: slot.startsAtMs,
        gameMinute: slot.startMinute,
      });
    }
    return { venueId, generatedAt: new Date(nowMs).toISOString(), serverNowMs: nowMs, untilMs, plays };
  }

  /**
   * An order's plays around now: the one playing right now (if any) and the next `count`, within its run and only while
   * it's approved. Times are exact (the same slots the audio plays).
   */
  async playsOf(
    order: Pick<ClubPlayOrderEntity, 'id' | 'lane' | 'startDate' | 'endDate' | 'status'>,
    track: Pick<ClubTrackEntity, 'durationSeconds'>,
    count: number,
    nowMs: number = Date.now(),
  ): Promise<{ readonly playingNow: ClubPlayTimeDto | null; readonly upcoming: ClubPlayTimeDto[] }> {
    if (order.lane === null || !['approved', 'live'].includes(order.status)) return { playingNow: null, upcoming: [] };
    const { clock, seed } = this.world;
    const durationMs = track.durationSeconds * 1000;
    const fromMinute = gameMinuteAt(clock, nowMs - durationMs);
    const runEnds = Date.parse(`${order.endDate}T00:00:00.000+01:00`);
    const runStarts = Date.parse(`${order.startDate}T00:00:00.000+01:00`);
    const candidates = nextLaneSlots(order.lane, fromMinute, count + 2, clock.scale, { seed, lanes: CLUB_ROTATION_CAPACITY }, Math.max(4, count));
    let playingNow: ClubPlayTimeDto | null = null;
    const upcoming: ClubPlayTimeDto[] = [];
    for (const slot of candidates) {
      const startsAtMs = Math.round(realMsAt(clock, slot.startMinute));
      if (startsAtMs < runStarts || startsAtMs >= runEnds) continue;
      const time = { venueId: slot.venueId, startsAtMs, endsAtMs: startsAtMs + durationMs, gameMinute: slot.startMinute };
      if (startsAtMs <= nowMs && nowMs < time.endsAtMs) playingNow = time;
      else if (startsAtMs > nowMs && upcoming.length < count) upcoming.push(time);
    }
    return { playingNow, upcoming };
  }

  // ----- Internals --------------------------------------------------------------------------------------------------

  private fill(slot: ClubSlot, holders: readonly LaneHolder[]): ScheduledSlot {
    const startsAtMs = Math.round(realMsAt(this.world.clock, slot.startMinute));
    const date = lagosToday(new Date(startsAtMs));
    const holder = holders.find((candidate) => candidate.order.lane === slot.lane && candidate.order.startDate <= date && date < candidate.order.endDate) ?? null;
    return { ...slot, startsAtMs, date, holder, songEndsAtMs: holder ? startsAtMs + holder.track.durationSeconds * 1000 : null };
  }

  /** Approved songs with a lane whose run hasn't ended (oldest payment first, so a lane clash plays the first payer). */
  private async loadHolders(): Promise<readonly LaneHolder[]> {
    const yesterday = lagosToday(new Date(Date.now() - 86_400_000));
    const orders = await this.orders.find({
      where: { status: In(['approved', 'live']), endDate: MoreThan(yesterday) },
      order: { paidAt: 'ASC', id: 'ASC' },
    });
    const laned = orders.filter((order) => order.lane !== null);
    if (laned.length < orders.length) this.logger.warn({ unlaned: orders.length - laned.length }, 'Approved club orders without a lane are not scheduled');
    if (laned.length === 0) return [];
    const tracks = await this.tracks.find({ where: { id: In([...new Set(laned.map((order) => order.trackId))]), removedAt: IsNull() } });
    const byId = new Map(tracks.map((track) => [track.id, track]));
    return laned.flatMap((order) => {
      const track = byId.get(order.trackId);
      return track ? [{ order, track }] : [];
    });
  }
}
