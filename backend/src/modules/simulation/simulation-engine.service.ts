import { Injectable, Logger } from '@nestjs/common';
import {
  actionHours,
  BACKGROUNDS,
  COLLAPSE_TARGET,
  DAYS_PER_MONTH,
  MAX_STATUS,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  applySkillXp,
  computeMood,
  findAction,
  findVenue,
  homeLocationId,
  formatClock,
  moodPerformanceMultiplier,
  projectNeeds,
  startOfDay,
  type ActionDefinition,
  type GameMinute,
  type NeedDrift,
  type SkillKey,
  type Skills,
} from '@insidelife/shared';
import type { ActivityState } from '../characters/entities/character.entity.js';
import { LedgerService } from '../ledger/ledger.service.js';
import type { Segment } from './interfaces/simulation-system.interface.js';
import type { SimulationContext } from './simulation-context.js';
import { hookProfiler } from './hook-profiler.js';
import { daysWithoutSleep, restedThrough, sleepDebtWarningDue } from './rest.js';
import { SimulationRegistry } from './simulation-registry.service.js';
import { TimelinePlanner } from './timeline-planner.service.js';

/** Grace period after deliberately arriving somewhere before autopilot may send the character home. */
const HANG_AROUND_MINUTES = 45;

/** Below these need levels health starts draining every hour (points/hour scale with how deep you are). */
const HEALTH_HUNGER_THRESHOLD = 15;
const HEALTH_ENERGY_THRESHOLD = 8;
/** Health points per game hour at a need of 0 (linear up to the threshold). */
const HEALTH_HUNGER_DRAIN = 0.9;
const HEALTH_ENERGY_DRAIN = 0.6;
const COLLAPSED_MODIFIER = 'collapsed';

/** Hard cap on loop iterations per settle (≈ several game years); the background settler keeps gaps small. */
const MAX_STEPS = 20_000;

/**
 * Advances a locked character from `settledAt` to a target time: applies need drift segment by segment, completes
 * actions and trips, runs daily/monthly ticks for every registered system, and keeps derived stats fresh.
 */
@Injectable()
export class SimulationEngine {
  private readonly logger = new Logger(SimulationEngine.name);

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly planner: TimelinePlanner,
    private readonly ledger: LedgerService,
  ) {}

  async settle(ctx: SimulationContext, until: GameMinute): Promise<void> {
    const character = ctx.character;
    if (until <= character.settledAt) return;
    if (!character.alive) {
      character.settledAt = until;
      return;
    }

    // The sleep clock starts at the first settle for characters that predate it.
    character.lastSleptAt ??= character.settledAt;
    const state = this.planner.stateOf(ctx);
    let steps = 0;
    while (ctx.time < until && character.alive) {
      if (++steps > MAX_STEPS) {
        this.logger.warn(`Settle step cap hit for ${character.id}; resuming next request`);
        break;
      }
      const dayEnd = startOfDay(ctx.time) + MINUTES_PER_DAY;
      const horizon = Math.min(until, dayEnd);
      const step = await this.planner.next(ctx, state, ctx.time, horizon);

      if (step.type === 'depart') {
        await this.startRoutineTrip(ctx, step.travel);
        state.travel = character.travel;
        state.activity = character.activity;
        continue;
      }
      if (step.type === 'begin') {
        if (step.activity.targetId === COLLAPSE_TARGET) await this.collapse(ctx, step.activity);
        this.start(ctx, step.activity);
        state.activity = character.activity;
        state.travel = null;
        continue;
      }

      await this.applySegment(ctx, step.segment);
      ctx.time = step.segment.endsAt;

      if (character.activity && ctx.time >= character.activity.endsAt) await this.completeActivity(ctx, character.activity);
      if (character.travel && ctx.time >= character.travel.arriveAt) await this.arrive(ctx);
      state.activity = character.activity;
      state.travel = character.travel;
      state.locationId = character.locationId;
      state.cityId = character.cityId;
      state.energy = character.needs.energy;
      state.hunger = character.needs.hunger;
      state.lastSleptAt = character.lastSleptAt;

      if (ctx.time === dayEnd) await this.endDay(ctx, dayEnd / MINUTES_PER_DAY - 1);
    }

    character.settledAt = Math.max(character.settledAt, ctx.time);
    await ctx.wallet.flush();
    await this.refreshDerived(ctx);
    for (const system of this.registry.all) if (system.onSettled) await hookProfiler.time(`${system.key}.onSettled`, () => system.onSettled!(ctx));
  }

  /**
   * After the player deliberately arrives somewhere, autopilot waits before taking them home (so a 23:00 trip to the
   * club doesn't bounce straight back to bed). Any player action replaces this soft state.
   */
  hangAround(ctx: SimulationContext, from: GameMinute): void {
    ctx.character.activity = {
      actionId: 'hang-around',
      startedAt: from,
      endsAt: from + HANG_AROUND_MINUTES,
      locationId: ctx.character.locationId,
      cost: 0,
    };
  }

  /** Tell every system about an arrival that happened outside the engine's own trips (walking/driving in the open world). */
  async dispatchArrival(ctx: SimulationContext, travel: NonNullable<SimulationContext['character']['travel']>): Promise<void> {
    for (const system of this.registry.all) {
      if (system.onArrival) await hookProfiler.time(`${system.key}.onArrival`, () => system.onArrival!(ctx, travel));
    }
  }

  /** Begin an explicit action (validation and payment happen in the caller). */
  start(ctx: SimulationContext, activity: ActivityState): void {
    ctx.character.activity = activity;
    ctx.character.travel = null;
  }

  mood(ctx: SimulationContext): number {
    const modifier = ctx.character.moodModifiers.filter((m) => m.until > ctx.time).reduce((sum, m) => sum + m.value, 0);
    const healthPenalty = ctx.character.health < 50 ? (50 - ctx.character.health) * 0.4 : 0;
    return computeMood(ctx.character.needs, modifier - healthPenalty);
  }

  private async applySegment(ctx: SimulationContext, segment: Segment): Promise<void> {
    const hours = (segment.endsAt - segment.startsAt) / MINUTES_PER_HOUR;
    const before = ctx.character.needs;
    ctx.character.needs = projectNeeds(before, segment.profile, hours);
    this.applyDeprivation(ctx, before, segment, hours);
    ctx.character.lastSleptAt = restedThrough(segment, ctx.character.activity, ctx.character.lastSleptAt ?? segment.startsAt);
    if (segment.kind !== 'commute' && !ctx.character.travel) ctx.character.locationId = segment.locationId;
    for (const system of this.registry.all) if (system.onSegment) await hookProfiler.time(`${system.key}.onSegment`, () => system.onSegment!(ctx, segment));
  }

  /**
   * Starving or running on empty hurts health directly (hour by hour, not just at day end), so the health bar visibly
   * falls when you skip meals or sleep. The drain is the exact integral over the segment of the need's path (linear
   * drift, then flat at its target), so a span costs the same however it is split into segments or settles.
   */
  private applyDeprivation(ctx: SimulationContext, before: SimulationContext['character']['needs'], segment: Segment, hours: number): void {
    const drain =
      deprivationHours(before.hunger, segment.profile.hunger, hours, HEALTH_HUNGER_THRESHOLD) * HEALTH_HUNGER_DRAIN +
      deprivationHours(before.energy, segment.profile.energy, hours, HEALTH_ENERGY_THRESHOLD) * HEALTH_ENERGY_DRAIN;
    if (drain > 0) ctx.character.health = Math.max(0, ctx.character.health - drain);
  }

  /**
   * Ten game days without a real sleep: the character drops where they are (indoors) and sleeps it off. The planner
   * decides when (`rest.ts`); this is the part the player sees.
   */
  private async collapse(ctx: SimulationContext, activity: ActivityState): Promise<void> {
    const character = ctx.character;
    const days = daysWithoutSleep(character.lastSleptAt ?? activity.startedAt, activity.startedAt);
    const place = await this.planner.placeLabel(ctx, activity.locationId);
    const where = place === 'home' ? 'at home' : place === 'a friend’s place' ? 'at a friend’s place' : `at ${place}`;
    character.moodModifiers = [
      ...character.moodModifiers.filter((modifier) => modifier.id !== COLLAPSED_MODIFIER),
      { id: COLLAPSED_MODIFIER, label: 'Collapsed from exhaustion', value: -12, until: activity.startedAt + MINUTES_PER_DAY },
    ];
    ctx.notify({
      kind: 'health',
      title: 'You collapsed from exhaustion',
      body: `${days} days without a proper sleep caught up with you ${where}. You're out cold until ${formatClock(activity.endsAt)}. Sleep at home regularly so it doesn't happen again.`,
      tone: 'bad',
      gameMinute: activity.startedAt,
    });
    ctx.report({ label: `Collapsed from exhaustion after ${days} days without sleep`, tone: 'bad' });
  }

  private async startRoutineTrip(ctx: SimulationContext, travel: NonNullable<SimulationContext['character']['travel']>): Promise<void> {
    const character = ctx.character;
    let fare = travel.fare;
    if (fare > 0) {
      const key = `commute:${travel.departAt}:${travel.toLocationId}`;
      const paid = await ctx.wallet.tryPay(fare, 'transport', `${travel.mode === 'danfo' ? 'Transport' : 'Ride'} to ${findVenue(travel.toLocationId)?.name ?? 'home'}`, key);
      if (!paid) {
        // Broke players still get where they're going — the hard way. Sapa hurts mood, never traps the player.
        fare = 0;
        character.moodModifiers = [
          ...character.moodModifiers.filter((m) => m.id !== 'sapa-commute'),
          { id: 'sapa-commute', label: 'Trekked because of sapa', value: -8, until: ctx.time + MINUTES_PER_DAY },
        ];
      }
    }
    character.activity = null;
    character.travel = { ...travel, fare };
  }

  private async completeActivity(ctx: SimulationContext, activity: ActivityState): Promise<void> {
    const character = ctx.character;
    const action = findAction(activity.actionId);
    character.activity = null;
    if (!action) return;

    // Actions keep their real-time feel at ×60, so a game hour of one counts double (pacing.ts).
    const hours = actionHours(activity);
    const mood = this.mood(ctx);
    const background = BACKGROUNDS[character.background];
    const xp = action.skillXpPerHour ?? {};
    const skills: Record<SkillKey, number> = { ...character.skills };
    for (const [skill, perHour] of Object.entries(xp) as Array<[SkillKey, number]>) {
      const backgroundFactor = skill === 'hustle' ? background.hustleGain : background.studyGain;
      skills[skill] = applySkillXp(skills[skill], perHour * hours * moodPerformanceMultiplier(mood) * backgroundFactor);
    }
    character.skills = skills as Skills;
    if (action.fitnessPerHour) character.fitness = Math.min(100, character.fitness + action.fitnessPerHour * hours);
    if (action.statusOnComplete) character.status = Math.min(MAX_STATUS, character.status + action.statusOnComplete);

    await this.dispatchCompletion(ctx, action, activity);
  }

  private async dispatchCompletion(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    for (const system of this.registry.all) if (system.onActionComplete) await hookProfiler.time(`${system.key}.onActionComplete`, () => system.onActionComplete!(ctx, action, activity));
  }

  /**
   * Land the character at an airport right now (a flight whose arrival is not in the future): the normal arrival runs, so
   * their location, city and every system's `onArrival` hook see it exactly as for a timed trip.
   */
  async landAt(ctx: SimulationContext, airportVenueId: string, flightId?: string): Promise<void> {
    const character = ctx.character;
    character.travel = {
      fromLocationId: character.locationId,
      toLocationId: airportVenueId,
      mode: 'flight',
      ...(flightId ? { flightId } : {}),
      departAt: ctx.time,
      arriveAt: ctx.time,
      fare: 0,
      explicit: true,
    };
    await this.arrive(ctx);
  }

  private async arrive(ctx: SimulationContext): Promise<void> {
    const character = ctx.character;
    const travel = character.travel;
    if (!travel) return;
    character.travel = null;
    character.locationId = travel.toLocationId;
    character.cityId = (await this.planner.place(ctx, travel.toLocationId)).cityId;
    // Anywhere but your own home (a venue, a friend's place): autopilot waits a while before taking you home.
    if (travel.explicit && travel.toLocationId !== homeLocationId(character.id)) this.hangAround(ctx, travel.arriveAt);
    for (const system of this.registry.all) if (system.onArrival) await hookProfiler.time(`${system.key}.onArrival`, () => system.onArrival!(ctx, travel));
  }

  private async endDay(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const character = ctx.character;
    character.moodModifiers = character.moodModifiers.filter((modifier) => modifier.until > ctx.time);
    if (character.lastSleptAt !== null && sleepDebtWarningDue(character.lastSleptAt, ctx.time)) {
      ctx.notify({
        kind: 'health',
        title: `${daysWithoutSleep(character.lastSleptAt, ctx.time)} days without proper sleep`,
        body: 'Your body is shutting down. Sleep at home soon, or you’ll collapse wherever you are.',
        tone: 'bad',
      });
    }
    // Fitness fades without exercise; clout from one-off flexes fades back toward what your life supports.
    character.fitness = Math.max(0, character.fitness - 0.15);
    character.status = Math.round(character.status * 0.985);

    for (const system of this.registry.all) {
      if (!character.alive) break;
      if (system.onDayEnd) await hookProfiler.time(`${system.key}.onDayEnd`, () => system.onDayEnd!(ctx, dayIndex));
    }
    if (character.alive && (dayIndex + 1) % DAYS_PER_MONTH === 0) {
      const monthIndex = Math.floor(dayIndex / DAYS_PER_MONTH);
      for (const system of this.registry.all) {
        if (!character.alive) break;
        if (system.onMonthEnd) await hookProfiler.time(`${system.key}.onMonthEnd`, () => system.onMonthEnd!(ctx, monthIndex));
      }
    }
    if (!character.alive) await this.handleDeath(ctx);

    // Domain state can change at day end (new job, new home, illness) — drop per-day caches.
    ctx.invalidate('item-tags');
    ctx.invalidate(`profile-context:${dayIndex + 1}`);
    ctx.invalidate(`residence:${dayIndex + 1}`);
    ctx.invalidate(`schedule:${dayIndex + 1}`);
    ctx.invalidate(`schedule:${dayIndex + 2}`);
  }

  private async handleDeath(ctx: SimulationContext): Promise<void> {
    const character = ctx.character;
    character.diedAt ??= ctx.time;
    character.activity = null;
    character.travel = null;
    for (const system of this.registry.all) await system.onDeath?.(ctx);
  }

  /** Recompute status floor and cached net worth (cheap; systems memoise their own loads). */
  private async refreshDerived(ctx: SimulationContext): Promise<void> {
    const character = ctx.character;
    const balances = await this.ledger.balances(ctx.manager, character.id);
    const usdRate = ctx.world.economy(ctx.time).usdRate;
    let baseline = 0;
    let netWorth = balances.cash + balances.savings + balances.pension + Math.round((balances.usd / 100) * usdRate);
    for (const system of this.registry.all) {
      if (system.status) baseline += await hookProfiler.time(`${system.key}.status`, () => system.status!(ctx));
      if (system.netWorth) netWorth += await hookProfiler.time(`${system.key}.netWorth`, () => system.netWorth!(ctx));
    }
    character.status = Math.round(Math.min(MAX_STATUS, Math.max(baseline, character.status)));
    character.netWorth = Math.round(netWorth);
  }

  /** Utility for systems: has the simulation crossed the start of a new day since `t`? */
  static dayOf(t: GameMinute): number {
    return Math.floor(t / MINUTES_PER_DAY);
  }
}

/**
 * Hour-weighted depth below `threshold` of a need drifting from `value` under `drift` for `hours`:
 * ∫ max(0, (threshold − need(τ)) / threshold) dτ, with need(τ) moving linearly toward the target, then flat.
 */
export function deprivationHours(value: number, drift: NeedDrift, hours: number, threshold: number): number {
  if (hours <= 0) return 0;
  const target = Math.min(100, Math.max(0, drift.target));
  const rate = drift.rate > 0 ? (target < value ? -drift.rate : drift.rate) : 0;
  const reach = rate === 0 || target === value ? 0 : Math.min(hours, (target - value) / rate);
  const depth = (need: number): number => Math.max(0, threshold - need) / threshold;
  // Linear part: integrate a piecewise-linear function exactly by splitting where it crosses the threshold.
  let total = 0;
  if (reach > 0) {
    const end = value + rate * reach;
    const cross = (threshold - value) / rate;
    if (cross > 0 && cross < reach) {
      total += ((depth(value) + depth(threshold)) / 2) * cross + ((depth(threshold) + depth(end)) / 2) * (reach - cross);
    } else {
      total += ((depth(value) + depth(end)) / 2) * reach;
    }
  }
  const flat = reach > 0 ? value + rate * reach : value;
  return total + depth(flat) * (hours - reach);
}
