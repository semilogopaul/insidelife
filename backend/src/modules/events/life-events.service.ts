import { Injectable, type OnModuleInit } from '@nestjs/common';
import { MINUTES_PER_DAY, type LifeEventDto, type LifeEventOutcomeDto } from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { LifeEventEntity } from './entities/life-event.entity.js';
import type { LifeEventDefinition, LifeEventOutcome } from './interfaces/life-event.interface.js';
import { LifeEventsRegistry } from './life-events.registry.js';

/** Average chance per game day that something happens (≈ one card every 2-3 game days ≈ every half hour of play). */
const DAILY_EVENT_CHANCE = 0.4;
const MAX_PENDING = 3;
const DEFAULT_EXPIRY = MINUTES_PER_DAY;
/** Longest cooldown we care about when loading history (game days). */
const HISTORY_DAYS = 400;
/** Re-picks when the drawn card turns out to be ineligible. */
const MAX_DRAWS = 8;
const STATE_KEY = 'life-events-state';

/** Per-transaction view of a character's cards: loaded once per settle, updated in memory. */
interface CardState {
  readonly pending: LifeEventEntity[];
  readonly lastDealtAt: Map<string, number>;
}

/**
 * Rolls, stores and resolves life events. Rolls are seeded per character per day, so refreshing can never reroll
 * fate. Unanswered cards resolve to their default choice when they expire.
 */
@Injectable()
export class LifeEventsService implements SimulationSystem, OnModuleInit {
  readonly key = 'life-events';
  /** Run after every domain has updated its state for the day. */
  readonly order = 900;

  constructor(
    private readonly simulation: SimulationRegistry,
    private readonly events: LifeEventsRegistry,
  ) {}

  onModuleInit(): void {
    this.simulation.register(this);
  }

  async pendingEventCount(ctx: SimulationContext): Promise<number> {
    return (await this.state(ctx)).pending.length;
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    await this.expire(ctx);
    if (ctx.age < 17) return;
    const rng = ctx.rng('life-event', dayIndex);
    if (!rng.chance(DAILY_EVENT_CHANCE)) return;
    const state = await this.state(ctx);
    if (state.pending.length >= MAX_PENDING) return;

    // Draw first, then check eligibility of the drawn card only (eligibility checks can hit the DB).
    let pool = this.events.all.filter((definition) => !this.onCooldown(ctx, state, definition));
    for (let draw = 0; draw < MAX_DRAWS && pool.length > 0; draw++) {
      const definition = rng.weighted(pool.map((value) => ({ value, weight: value.weight })));
      if (await definition.eligible(ctx)) {
        await this.deal(ctx, state, definition);
        return;
      }
      pool = pool.filter((candidate) => candidate !== definition);
    }
  }

  /**
   * Deal a specific card now (domain-driven incidents like an omonile dispute), bypassing the daily roll but respecting
   * the pending cap and the card's cooldown. Returns false when it couldn't be dealt.
   */
  async raise(ctx: SimulationContext, eventId: string): Promise<boolean> {
    const definition = this.events.get(eventId);
    if (!definition) return false;
    const state = await this.state(ctx);
    if (state.pending.length >= MAX_PENDING || this.onCooldown(ctx, state, definition)) return false;
    await this.deal(ctx, state, definition);
    return true;
  }

  private async deal(ctx: SimulationContext, state: CardState, definition: LifeEventDefinition): Promise<void> {
    const params = (await definition.prepare?.(ctx)) ?? {};
    const row = await ctx.manager.save(
      ctx.manager.create(LifeEventEntity, {
        characterId: ctx.character.id,
        eventId: definition.id,
        status: 'pending',
        params,
        createdAtGame: ctx.time,
        expiresAtGame: ctx.time + (definition.expiresIn ?? DEFAULT_EXPIRY),
        choiceId: null,
        outcome: null,
      }),
    );
    state.pending.push(row);
    state.lastDealtAt.set(definition.id, ctx.time);
    ctx.notify({ kind: 'system', title: definition.title(params), body: 'Something came up — decide what to do.', tone: 'neutral' });
  }

  /** Pending cards and when each card was last dealt, loaded once per transaction. */
  private state(ctx: SimulationContext): Promise<CardState> {
    return ctx.memo(STATE_KEY, async () => {
      const characterId = ctx.character.id;
      const pending = await ctx.manager.find(LifeEventEntity, { where: { characterId, status: 'pending' }, order: { createdAtGame: 'ASC' } });
      const rows = (await ctx.manager.query(
        `SELECT event_id, MAX(created_at_game) AS last FROM life_events
          WHERE character_id = $1 AND created_at_game > $2 GROUP BY event_id`,
        [characterId, ctx.time - HISTORY_DAYS * MINUTES_PER_DAY],
      )) as Array<{ event_id: string; last: string }>;
      return { pending, lastDealtAt: new Map(rows.map((row) => [row.event_id, Number(row.last)])) };
    });
  }

  async pending(ctx: SimulationContext): Promise<LifeEventDto[]> {
    const rows = (await this.state(ctx)).pending;
    const result: LifeEventDto[] = [];
    for (const row of rows) {
      const definition = this.events.get(row.eventId);
      if (!definition) continue;
      const choices = [];
      for (const choice of definition.choices) {
        const reason = (await choice.unavailable?.(ctx, row.params)) ?? null;
        choices.push({
          id: choice.id,
          label: choice.label(row.params),
          hint: choice.hint?.(row.params),
          disabled: reason !== null,
          disabledReason: reason ?? undefined,
        });
      }
      result.push({
        id: row.id,
        eventId: row.eventId,
        title: definition.title(row.params),
        body: definition.body(row.params),
        art: definition.art,
        choices,
        createdAt: row.createdAtGame,
        expiresAt: row.expiresAtGame,
      });
    }
    return result;
  }

  async resolve(ctx: SimulationContext, id: string, choiceId: string): Promise<LifeEventOutcomeDto> {
    const row = await ctx.manager.findOne(LifeEventEntity, { where: { id, characterId: ctx.character.id }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new ResourceNotFoundException('Event');
    if (row.status !== 'pending') throw new GameRuleException('ALREADY_DECIDED', 'You already made that decision');
    const definition = this.events.get(row.eventId);
    if (!definition) throw new ResourceNotFoundException('Event');
    const choice = definition.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) throw new GameRuleException('UNKNOWN_CHOICE', 'Pick one of the options');
    const reason = (await choice.unavailable?.(ctx, row.params)) ?? null;
    if (reason) throw new GameRuleException('CHOICE_UNAVAILABLE', reason);

    const outcome = await this.apply(ctx, row, choice.id);
    return { title: outcome.title, body: outcome.body, tone: outcome.tone, moneyDelta: outcome.moneyDelta ?? 0 };
  }

  private async expire(ctx: SimulationContext): Promise<void> {
    const state = await this.state(ctx);
    // Collect first: applying an outcome removes the row from `state.pending`.
    const due = state.pending.filter((row) => row.expiresAtGame <= ctx.time);
    for (const row of due) {
      const definition = this.events.get(row.eventId);
      if (!definition) {
        row.status = 'expired';
        await ctx.manager.save(row);
        continue;
      }
      const outcome = await this.apply(ctx, row, definition.defaultChoiceId, 'expired');
      ctx.report({ label: `${definition.title(row.params)} — ${outcome.title}`, amount: outcome.moneyDelta, tone: outcome.tone });
    }
  }

  private async apply(ctx: SimulationContext, row: LifeEventEntity, choiceId: string, status: 'resolved' | 'expired' = 'resolved'): Promise<LifeEventOutcome> {
    const definition = this.events.get(row.eventId);
    const choice = definition?.choices.find((candidate) => candidate.id === choiceId);
    let outcome: LifeEventOutcome = { title: 'Life goes on', body: '', tone: 'neutral' };
    if (choice) {
      const unavailable = (await choice.unavailable?.(ctx, row.params)) ?? null;
      outcome = unavailable ? { title: 'You couldn’t act in time', body: unavailable, tone: 'neutral' } : await choice.resolve(ctx, row.params);
    }
    row.status = status;
    row.choiceId = choiceId;
    row.outcome = outcome;
    await ctx.manager.save(row);
    const state = await this.state(ctx);
    const index = state.pending.findIndex((candidate) => candidate.id === row.id);
    if (index >= 0) state.pending.splice(index, 1);
    const resolution = { eventId: row.eventId, choiceId, tone: outcome.tone, moneyDelta: outcome.moneyDelta ?? 0, expired: status === 'expired' };
    for (const system of this.simulation.all) await system.onLifeEventResolved?.(ctx, resolution);
    return outcome;
  }

  private onCooldown(ctx: SimulationContext, state: CardState, definition: LifeEventDefinition): boolean {
    const last = state.lastDealtAt.get(definition.id);
    return last !== undefined && last > ctx.time - definition.cooldownDays * MINUTES_PER_DAY;
  }
}
