import { Injectable } from '@nestjs/common';
import {
  findAction,
  findVenue,
  formatGameDuration,
  homeLocationId,
  isStreetLocation,
  isVenueOpen,
  toDateParts,
  type ActionDefinition,
  HABIT_TARGET,
  isInterruptibleAction,
  isInterruptibleActivity,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { ActivityState } from '../characters/entities/character.entity.js';
import { unmetRequirement } from '../simulation/action-requirements.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';

/**
 * Player-chosen actions: validate where/when/requirements, charge the cost, start the activity. Completion effects
 * are applied by the engine when the activity's time is up.
 */
@Injectable()
export class ActionsService {
  constructor(
    private readonly engine: SimulationEngine,
    private readonly planner: TimelinePlanner,
  ) {}

  async start(ctx: SimulationContext, actionId: string, durationMinutes?: number, targetId?: string): Promise<void> {
    const action = findAction(actionId);
    if (!action || action.system) throw new GameRuleException('UNKNOWN_ACTION', 'That activity doesn’t exist');
    const character = ctx.character;
    this.assertFree(ctx);

    const duration = durationMinutes ?? action.durations[0] ?? 60;
    if (!action.durations.includes(duration)) {
      throw new GameRuleException('INVALID_DURATION', `Choose one of: ${action.durations.map(formatGameDuration).join(', ')}`);
    }

    await this.assertLocation(ctx, action);
    await this.assertRequirements(ctx, action);

    // Cooking with food in the kitchen uses the stock; otherwise it's a market run at the action's price.
    const fromPantry = action.usesPantry === true && character.pantryMeals > 0;
    if (fromPantry) character.pantryMeals -= 1;
    const cost = fromPantry ? 0 : ctx.world.price(action.cost, ctx.time);
    if (cost > 0) {
      await ctx.wallet.pay(cost, 'purchase', action.label, `action:${action.id}:${ctx.time}`);
    }

    if (character.activity) this.pauseHabit(ctx, character.activity);
    this.engine.start(ctx, {
      actionId: action.id,
      startedAt: ctx.time,
      endsAt: ctx.time + duration,
      locationId: character.locationId,
      targetId,
      cost,
    });
  }

  /** Stop the current action early. Needs already drifted; no completion rewards and no refund. */
  cancel(ctx: SimulationContext): void {
    const character = ctx.character;
    if (!character.activity) throw new GameRuleException('NOTHING_TO_CANCEL', 'You’re not doing anything right now');
    if (character.activity.actionId === 'explore') return;
    const action = findAction(character.activity.actionId);
    // Exams, treatments and tests can't be walked out of (and restarted to re-roll the result).
    if (action?.system && !isInterruptibleAction(action.id)) {
      throw new GameRuleException('CANT_STOP', `You can’t walk out of this — ${action.verb.toLowerCase()} until it’s done`);
    }
    this.pauseHabit(ctx, character.activity);
    character.activity = null;
  }

  private assertFree(ctx: SimulationContext): void {
    const character = ctx.character;
    if (!character.alive) throw new GameRuleException('DECEASED', 'This character has passed on');
    if (character.travel) throw new GameRuleException('TRAVELLING', 'You’re on the move. Arrive first.');
    if (character.activity && !isInterruptibleActivity(character.activity)) {
      const current = findAction(character.activity.actionId);
      throw new GameRuleException('BUSY', `You’re busy (${current?.verb.toLowerCase() ?? 'doing something'}). Cancel it first.`);
    }
  }

  private async assertLocation(ctx: SimulationContext, action: ActionDefinition): Promise<void> {
    const character = ctx.character;
    if (action.where.anywhere) return;
    const residence = await this.planner.residence(ctx, ctx.time);
    const atHome = character.locationId === residence.locationId || character.locationId === homeLocationId(character.id);
    if (atHome && action.where.home) return;

    const venue = findVenue(character.locationId);
    if (!venue || isStreetLocation(character.locationId)) {
      throw new GameRuleException('WRONG_PLACE', action.where.home ? 'Do this at home' : 'Go inside a place that offers this');
    }
    if (!action.where.venueTypes?.includes(venue.type)) {
      throw new GameRuleException('WRONG_PLACE', `You can’t do that at ${venue.name}`);
    }
    if (!isVenueOpen(venue, toDateParts(ctx.time).hour)) {
      throw new GameRuleException('CLOSED', `${venue.name} is closed right now`);
    }
  }

  private async assertRequirements(ctx: SimulationContext, action: ActionDefinition): Promise<void> {
    const unmet = unmetRequirement(action, { age: ctx.age, skills: ctx.character.skills, itemTags: await this.planner.itemTags(ctx) });
    if (unmet) throw new GameRuleException(unmet.code, unmet.message);
  }

  /** Stopping a habit session also stops the autopilot from restarting it for the rest of that session window. */
  private pauseHabit(ctx: SimulationContext, activity: ActivityState): void {
    if (activity.targetId === HABIT_TARGET) ctx.character.habitsPausedUntil = activity.endsAt;
  }
}
