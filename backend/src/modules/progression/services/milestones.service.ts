import { Injectable } from '@nestjs/common';
import { RealtimeBus } from '../../realtime-bus/realtime-bus.service.js';
import { IsNull } from 'typeorm';
import {
  findMilestoneMoment,
  type MilestoneAcknowledgementDto,
  type MilestoneMomentDto,
  type MilestoneMomentId,
  type MilestoneStatDto,
} from '@insidelife/shared';
import { ResourceNotFoundException } from '../../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { MilestoneMomentEntity } from '../entities/milestone-moment.entity.js';
import { renderMomentText } from '../progression.rules.js';

/** Pending moments the client fetches at once (older ones wait their turn). */
const PENDING_PAGE = 20;

export interface MilestoneOptions {
  /** For repeatable moments: what makes this occurrence unique (job + title, chapter number…). */
  readonly occurrence?: string;
  /** Inserted into the moment's copy (`{detail}`), e.g. " at Zenith Bank". */
  readonly detail?: string;
  readonly stats?: readonly MilestoneStatDto[];
}

interface MilestoneRow {
  readonly id: string;
}

/** The queue of full-screen celebrations: enqueue once, show once, acknowledge. */
@Injectable()
export class MilestonesService {
  constructor(private readonly bus: RealtimeBus) {}

  /** Queue a moment. One-time moments are de-duplicated per life; returns false when it was already queued. */
  async enqueue(ctx: SimulationContext, momentId: MilestoneMomentId, options: MilestoneOptions = {}): Promise<boolean> {
    const moment = findMilestoneMoment(momentId);
    if (!moment) return false;
    const dedupeKey = moment.repeatable ? `${moment.id}:${options.occurrence ?? String(ctx.time)}`.slice(0, 160) : moment.id;
    const values = { name: ctx.character.firstName, detail: options.detail ?? '' };
    const result = await ctx.manager
      .createQueryBuilder()
      .insert()
      .into(MilestoneMomentEntity)
      .values({
        characterId: ctx.character.id,
        momentId: moment.id,
        dedupeKey,
        title: moment.title,
        body: renderMomentText(moment.body, values).slice(0, 500),
        icon: moment.icon,
        shareText: moment.shareText,
        stats: [...(options.stats ?? [])],
        gameMinute: ctx.time,
        acknowledgedAt: null,
      })
      .orIgnore()
      .returning('*')
      .execute();
    const inserted = Array.isArray(result.raw) ? (result.raw as MilestoneRow[])[0] : undefined;
    if (!inserted) return false;
    // Celebrate the moment live once the transaction commits (the client also polls pending moments).
    const characterId = ctx.character.id;
    const saved = await ctx.manager.findOneBy(MilestoneMomentEntity, { id: inserted.id });
    if (saved) ctx.afterCommit(() => this.bus.toCharacter(characterId, 'progression:milestone', toDto(saved)));
    return true;
  }

  async pending(ctx: SimulationContext): Promise<MilestoneMomentDto[]> {
    const rows = await ctx.manager.find(MilestoneMomentEntity, {
      where: { characterId: ctx.character.id, acknowledgedAt: IsNull() },
      order: { gameMinute: 'ASC', createdAt: 'ASC' },
      take: PENDING_PAGE,
    });
    return rows.map(toDto);
  }

  countPending(ctx: SimulationContext): Promise<number> {
    return ctx.manager.count(MilestoneMomentEntity, { where: { characterId: ctx.character.id, acknowledgedAt: IsNull() } });
  }

  /** Mark a moment as shown. Idempotent: acknowledging twice keeps the first time. */
  async acknowledge(ctx: SimulationContext, id: string): Promise<MilestoneAcknowledgementDto> {
    const row = await ctx.manager.findOne(MilestoneMomentEntity, { where: { id, characterId: ctx.character.id } });
    if (!row) throw new ResourceNotFoundException('Milestone');
    if (!row.acknowledgedAt) {
      row.acknowledgedAt = new Date();
      await ctx.manager.update(MilestoneMomentEntity, { id: row.id }, { acknowledgedAt: row.acknowledgedAt });
    }
    return { id: row.id, acknowledgedAt: row.acknowledgedAt.toISOString(), remaining: await this.countPending(ctx) };
  }
}

function toDto(row: MilestoneMomentEntity): MilestoneMomentDto {
  return {
    id: row.id,
    momentId: row.momentId,
    title: row.title,
    body: row.body,
    icon: row.icon,
    shareText: row.shareText,
    stats: row.stats,
    gameMinute: row.gameMinute,
    createdAt: row.createdAt.toISOString(),
  };
}
