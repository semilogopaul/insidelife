import { Injectable } from '@nestjs/common';
import { MINUTES_PER_DAY } from '@insidelife/shared';
import { LifeEventsService } from '../../events/life-events.service.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { FamilyTriggerEntity, type FamilyTriggerParams } from '../entities/family-trigger.entity.js';

const TRIGGERS_KEY = 'family:triggers';
/** A queued card nobody got round to dealing is dropped after this many game days. */
const TRIGGER_TTL_DAYS = 20;

/**
 * Queue of family facts that must become life-event cards (black-tax requests, funerals, naming ceremonies, a child
 * sent home). Deduplicated per character by a deterministic key, so replays never queue twice. The matching card's
 * `prepare` takes the trigger, so a fact is dealt exactly once whether raised immediately or drawn later.
 */
@Injectable()
export class FamilyTriggersService {
  constructor(private readonly lifeEvents: LifeEventsService) {}

  /**
   * Queue a family fact and try to deal its card right away (a funeral or a naming ceremony shouldn't wait for the
   * daily draw). If the player already has a full hand, it stays queued and wins the next draws.
   */
  async enqueue(ctx: SimulationContext, eventId: string, dedupeKey: string, params: FamilyTriggerParams): Promise<void> {
    await ctx.manager
      .createQueryBuilder()
      .insert()
      .into(FamilyTriggerEntity)
      .values({
        characterId: ctx.character.id,
        eventId,
        dedupeKey: dedupeKey.slice(0, 120),
        params,
        status: 'queued',
        createdAtGame: ctx.time,
        deliveredAtGame: null,
      })
      .orIgnore()
      .execute();
    ctx.invalidate(TRIGGERS_KEY);
    if (await this.has(ctx, eventId)) await this.lifeEvents.raise(ctx, eventId);
  }

  queued(ctx: SimulationContext): Promise<FamilyTriggerEntity[]> {
    return ctx.memo(TRIGGERS_KEY, () =>
      ctx.manager.find(FamilyTriggerEntity, {
        where: { characterId: ctx.character.id, status: 'queued' },
        order: { createdAtGame: 'ASC' },
      }),
    );
  }

  async has(ctx: SimulationContext, eventId: string): Promise<boolean> {
    return (await this.queued(ctx)).some((trigger) => trigger.eventId === eventId);
  }

  /** Take the oldest queued trigger for an event (called when the card is dealt); its params become the card's. */
  async take(ctx: SimulationContext, eventId: string): Promise<FamilyTriggerParams> {
    const trigger = (await this.queued(ctx)).find((candidate) => candidate.eventId === eventId);
    if (!trigger) return {};
    trigger.status = 'delivered';
    trigger.deliveredAtGame = ctx.time;
    await ctx.manager.save(FamilyTriggerEntity, trigger);
    ctx.invalidate(TRIGGERS_KEY);
    return { ...trigger.params, triggerId: trigger.id };
  }

  /** Drop stale triggers; returns them so the caller can apply the "you ignored it" consequences. */
  async expireStale(ctx: SimulationContext): Promise<FamilyTriggerEntity[]> {
    const cutoff = ctx.time - TRIGGER_TTL_DAYS * MINUTES_PER_DAY;
    const stale = (await this.queued(ctx)).filter((trigger) => trigger.createdAtGame < cutoff);
    if (stale.length === 0) return [];
    for (const trigger of stale) trigger.status = 'expired';
    await ctx.manager.save(FamilyTriggerEntity, stale);
    ctx.invalidate(TRIGGERS_KEY);
    return stale;
  }
}
