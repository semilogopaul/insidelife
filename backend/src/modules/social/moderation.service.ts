import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { MoreThan, type DataSource } from 'typeorm';
import { REPORT_RULES, type BlockedPlayerDto, type PlayerReportDto, type ReportPlayerRequest } from '@insidelife/shared';
import { GameRuleException, RateLimitedException } from '../../common/exceptions/domain.exception.js';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BlockEntity } from './entities/block.entity.js';
import { FriendshipEntity, friendshipPairKey } from './entities/friendship.entity.js';
import { ReportEntity } from './entities/report.entity.js';
import { normaliseHandle, playerNotFound } from './social-errors.js';
import { SocialNotifier } from './social-notifier.service.js';
import { sanitisePlayerText } from './text-sanitiser.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Free text from players for moderators. */
const sanitiseReportDetails = (raw: string | undefined): string | null => sanitisePlayerText(raw, REPORT_RULES.detailsMaxLength) || null;

/**
 * Blocks and reports. Blocking is silent (the other player is never told), removes any friendship or pending
 * request between the two, and is enforced everywhere through `SocialGuard`. Reports go to a moderation queue with
 * server-captured context; a player can file at most `REPORT_RULES.maxPerDay` per real day.
 */
@Injectable()
export class ModerationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notifier: SocialNotifier,
  ) {}

  async block(ctx: SimulationContext, handle: string): Promise<BlockedPlayerDto> {
    const target = await this.findTarget(ctx, handle);
    if (target.id === ctx.character.id) throw new GameRuleException('BLOCK_SELF', 'You can’t block yourself — log off and touch grass instead');
    await ctx.manager.createQueryBuilder().insert().into(BlockEntity).values({ blockerId: ctx.character.id, blockedId: target.id }).orIgnore().execute();
    const removed = await ctx.manager.delete(FriendshipEntity, { pairKey: friendshipPairKey(ctx.character.id, target.id) });
    // Their friend list changed: refresh it silently (no notification — blocking is never announced).
    if ((removed.affected ?? 0) > 0) this.notifier.invalidate(ctx, target.id, 'friends');
    const row = await ctx.manager.findOneByOrFail(BlockEntity, { blockerId: ctx.character.id, blockedId: target.id });
    return this.blockedDto(row, target);
  }

  async unblock(ctx: SimulationContext, characterId: string): Promise<void> {
    await ctx.manager.delete(BlockEntity, { blockerId: ctx.character.id, blockedId: characterId });
  }

  async blocked(characterId: string): Promise<BlockedPlayerDto[]> {
    const rows = await this.dataSource.getRepository(BlockEntity).find({ where: { blockerId: characterId }, order: { createdAt: 'DESC' } });
    if (rows.length === 0) return [];
    const people = await this.dataSource.getRepository(CharacterEntity).find({
      where: rows.map((row) => ({ id: row.blockedId })),
      select: { id: true, handle: true, firstName: true, lastName: true },
    });
    const byId = new Map(people.map((person) => [person.id, person]));
    return rows.flatMap((row) => {
      const person = byId.get(row.blockedId);
      return person ? [this.blockedDto(row, person)] : [];
    });
  }

  async report(ctx: SimulationContext, request: ReportPlayerRequest): Promise<PlayerReportDto> {
    const reporter = ctx.character;
    const target = await this.findTarget(ctx, request.handle);
    if (target.id === reporter.id) throw new GameRuleException('REPORT_SELF', 'You can’t report yourself');
    const messageId = request.messageId ?? null;

    const duplicate = await ctx.manager.findOne(ReportEntity, {
      where: { reporterId: reporter.id, targetId: target.id, reason: request.reason, status: 'open', ...(messageId ? { messageId } : {}) },
      order: { createdAt: 'DESC' },
    });
    let report = duplicate;
    if (!report) {
      const recent = await ctx.manager.count(ReportEntity, { where: { reporterId: reporter.id, createdAt: MoreThan(new Date(Date.now() - DAY_MS)) } });
      if (recent >= REPORT_RULES.maxPerDay) throw new RateLimitedException('You’ve sent a lot of reports today. Our team is on it.');
      report = await ctx.manager.save(
        ctx.manager.create(ReportEntity, {
          reporterId: reporter.id,
          targetId: target.id,
          reason: request.reason,
          messageId,
          status: 'open',
          gameMinute: ctx.time,
          context: {
            details: sanitiseReportDetails(request.details),
            reporterLocationId: reporter.locationId,
            targetLocationId: target.locationId,
            sameLocation: reporter.locationId === target.locationId,
          },
        }),
      );
    }

    if (request.alsoBlock) await this.block(ctx, target.handle);
    return {
      id: report.id,
      targetHandle: target.handle,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      blocked: request.alsoBlock === true,
    };
  }

  private async findTarget(ctx: SimulationContext, handle: string): Promise<CharacterEntity> {
    const target = await ctx.manager.findOne(CharacterEntity, { where: { handle: normaliseHandle(handle) } });
    if (!target) throw playerNotFound();
    return target;
  }

  private blockedDto(row: BlockEntity, person: Pick<CharacterEntity, 'id' | 'handle' | 'firstName' | 'lastName'>): BlockedPlayerDto {
    return { characterId: person.id, handle: person.handle, firstName: person.firstName, lastName: person.lastName, blockedAt: row.createdAt.toISOString() };
  }
}
