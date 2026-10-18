import { Inject, Injectable } from '@nestjs/common';
import {
  COLLAPSE_TARGET,
  findAction,
  findVenue,
  formatClock12,
  formatGameDuration,
  HOTEL_ROOM_ACTION_IDS,
  homeLocationId,
  hotelOffers,
  isHomeLocation,
  isStreetLocation,
  isVenueOpen,
  toDateParts,
  type ActionDefinition,
  HABIT_TARGET,
  isInterruptibleAction,
  isInterruptibleActivity,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import { HOME_ACCESS_PORT, type HomeAccessPort } from '../../common/ports/home-access.port.js';
import type { ActivityState } from '../characters/entities/character.entity.js';
import { LedgerTransactionEntity } from '../ledger/entities/ledger-transaction.entity.js';
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
    @Inject(HOME_ACCESS_PORT) private readonly homes: HomeAccessPort,
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
      const key = `action:${action.id}:${ctx.time}`;
      // The ledger ignores a repeated key, so a cancel-and-restart inside the same game minute (half a real second)
      // would run free. Refuse it instead.
      if (await ctx.manager.exists(LedgerTransactionEntity, { where: { idempotencyKey: `${character.id}:${key}` } })) {
        throw new GameRuleException('TOO_SOON', 'You just started that — give it a moment');
      }
      await ctx.wallet.pay(cost, 'purchase', action.label, key);
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
    this.assertConscious(ctx);
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
    this.assertConscious(ctx);
    if (character.activity && !isInterruptibleActivity(character.activity)) {
      const current = findAction(character.activity.actionId);
      throw new GameRuleException('BUSY', `You’re busy (${current?.verb.toLowerCase() ?? 'doing something'}). Cancel it first.`);
    }
  }

  /** Collapsed from exhaustion: out cold until it's slept off (no cancelling, no replacing it). */
  private assertConscious(ctx: SimulationContext): void {
    const activity = ctx.character.activity;
    if (activity?.targetId === COLLAPSE_TARGET && activity.endsAt > ctx.time) {
      throw new GameRuleException('COLLAPSED', `You collapsed from exhaustion. You’ll come round at ${formatClock12(activity.endsAt)}.`);
    }
  }

  private async assertLocation(ctx: SimulationContext, action: ActionDefinition): Promise<void> {
    const character = ctx.character;
    if (action.where.anywhere) return;
    const residence = await this.planner.residence(ctx, ctx.time);
    const atHome = character.locationId === residence.locationId || character.locationId === homeLocationId(character.id);
    if (atHome && action.where.home) {
      // A hotel room is a home for a bed and a shower only: no kitchen, TV set or workshop of your own.
      const inHotelRoom = character.locationId !== homeLocationId(character.id) && findVenue(character.locationId)?.type === 'hotel';
      if (inHotelRoom && !HOTEL_ROOM_ACTION_IDS.has(action.id)) throw new GameRuleException('WRONG_PLACE', 'You can’t do that from a hotel room');
      return;
    }
    // At someone else's place on an accepted invite: only what a guest does there.
    if (!atHome && isHomeLocation(character.locationId)) {
      if (action.where.visit && (await this.homes.invitedDoor(ctx, character.locationId.slice('home:'.length)))) return;
      throw new GameRuleException('WRONG_PLACE', action.where.home ? 'Do this in your own house' : 'You can’t do that at someone else’s house');
    }
    if (action.where.visit) throw new GameRuleException('WRONG_PLACE', 'Do this at a friend’s place');

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
    if (action.amenity && !hotelOffers(venue.id, action.amenity)) {
      throw new GameRuleException('WRONG_PLACE', `${venue.name} has no ${action.amenity}`);
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
