import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  AUTOPILOT_TARGET,
  LIFE_CHAPTERS,
  crossesLagoon,
  seasonOf,
  type ActionDefinition,
  progressionCounter,
} from '@insidelife/shared';
import type { ActivityState, TravelState } from '../characters/entities/character.entity.js';
import type { LifeEventResolution, Segment, SimulationSystem } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import type { ProgressionProfileEntity } from './entities/progression-profile.entity.js';
import {
  ACHIEVEMENT_CONDITION_INDEX,
  GOAL_CONDITION_INDEX,
  LONG_TRIP_MINUTES,
  STREET_LATE_WINDOW,
  SUNSET_WINDOW,
  TRACKED_ILLNESSES,
  evaluateCondition,
  isPromotion,
  jobKeyOf,
  overlapsDailyWindow,
  placeOf,
  presenceFlags,
  probeWeight,
  shouldProbeDay,
  type EvaluationTrigger,
  type FactSource,
} from './progression.rules.js';
import { AchievementsService } from './services/achievements.service.js';
import { CountersService } from './services/counters.service.js';
import { FactsService } from './services/facts.service.js';
import { GoalsService } from './services/goals.service.js';
import { MilestonesService } from './services/milestones.service.js';
import { ProfilesService } from './services/profiles.service.js';

/** Actions the engine manages that say nothing about the player's choices. */
const IGNORED_ACTIONS: ReadonlySet<string> = new Set(['explore', 'home-meal']);

/**
 * Progression's simulation system (order 850 — after every domain has updated its state for the moment).
 *
 * Cheap by design:
 * - presence (`onSegment`) is a set lookup once a place is known; only first visits touch the database;
 * - action completions and arrivals bump counters in one statement and re-check only goals/achievements that read
 *   those counters;
 * - domain state (credentials, job, home, family…) is probed through the ports once per game day at most (weekly
 *   during long offline catch-ups), and only for sources some pending goal or achievement still needs.
 */
@Injectable()
export class ProgressionSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'progression';
  readonly order = 850;

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly counters: CountersService,
    private readonly profiles: ProfilesService,
    private readonly facts: FactsService,
    private readonly goals: GoalsService,
    private readonly achievements: AchievementsService,
    private readonly milestones: MilestonesService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  /** Card outcomes that count toward badges (other domains' events, no coupling needed). */
  async onLifeEventResolved(ctx: SimulationContext, resolution: LifeEventResolution): Promise<void> {
    if (resolution.eventId === 'police-checkpoint' && resolution.tone !== 'bad') {
      await this.counters.increment(ctx, new Map([[progressionCounter.signal('checkpoint-survived'), 1]]));
    }
  }

  // ----- Hooks -------------------------------------------------------------------------------------------------------

  async onCharacterCreated(ctx: SimulationContext): Promise<void> {
    await this.ensureSeeded(ctx);
    if (ctx.character.generation > 1) {
      await this.milestones.enqueue(ctx, 'heir-takes-over', { detail: ` — generation ${ctx.character.generation}` });
    }
  }

  async onSegment(ctx: SimulationContext, segment: Segment): Promise<void> {
    if (segment.kind === 'commute' || segment.kind === 'sleep') return;
    const place = placeOf(segment.locationId, ctx.character.id, ctx.character.homeDistrictId);
    const flags = presenceFlags(place);
    if (place.street && overlapsDailyWindow(segment.startsAt, segment.endsAt, STREET_LATE_WINDOW)) flags.push('street-late');
    const changed = await this.counters.markFlags(ctx, flags);
    if (changed.length > 0) await this.evaluate(ctx, { kind: 'counters', keys: new Set(changed) });
  }

  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    if (IGNORED_ACTIONS.has(action.id) || activity.targetId === AUTOPILOT_TARGET) return;
    const deltas = new Map<string, number>([
      [`action:${action.id}`, 1],
      [`category:${action.category}`, 1],
    ]);
    for (const hook of action.hooks ?? []) deltas.set(`hook:${hook}`, 1);
    if (action.id === 'club-night' && seasonOf(activity.endsAt) === 'detty-december') deltas.set('detty-club', 1);

    const changed = new Set(await this.counters.increment(ctx, deltas));
    const place = placeOf(activity.locationId, ctx.character.id, ctx.character.homeDistrictId);
    for (const key of await this.counters.markFlags(ctx, presenceFlags(place))) changed.add(key);
    await this.evaluate(ctx, { kind: 'counters', keys: changed });
  }

  async onArrival(ctx: SimulationContext, travel: TravelState): Promise<void> {
    const character = ctx.character;
    const from = placeOf(travel.fromLocationId, character.id, character.homeDistrictId);
    const to = placeOf(travel.toLocationId, character.id, character.homeDistrictId);
    const deltas = new Map<string, number>([
      ['trips', 1],
      [`trip:${travel.mode}`, 1],
    ]);
    if (ctx.world.weather(travel.departAt).raining) deltas.set(`rain-trip:${travel.mode}`, 1);
    if (from.districtId && to.districtId) {
      if (crossesLagoon(from.districtId, to.districtId)) {
        deltas.set('lagoon-crossings', 1);
        if (travel.mode === 'car') {
          deltas.set('bridge-drives', 1);
          // Arrival-based approximation of "on the bridge at sunset": the trip overlapped 18:00-19:00.
          if (overlapsDailyWindow(travel.departAt, travel.arriveAt, SUNSET_WINDOW)) deltas.set('bridge-sunset', 1);
        }
      }
      if (travel.arriveAt - travel.departAt >= LONG_TRIP_MINUTES) deltas.set('long-trips', 1);
    }

    const changed = new Set(await this.counters.increment(ctx, deltas));
    for (const key of await this.counters.markFlags(ctx, ['outside', ...presenceFlags(to)])) changed.add(key);
    await this.evaluate(ctx, { kind: 'counters', keys: changed });
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const profile = await this.ensureSeeded(ctx);
    if (!shouldProbeDay(dayIndex, profile.lastProbedDay, ctx.now)) return;
    const weight = probeWeight(dayIndex, profile.lastProbedDay);
    await this.profiles.update(ctx, profile, { lastProbedDay: dayIndex });

    // Observers only record facts; the day-end pass below re-checks everything still pending.
    await this.observeEmployment(ctx, profile);
    await this.observeStrike(ctx, weight);
    await this.observeIllnesses(ctx);
    await this.evaluate(ctx, { kind: 'day-end' });
  }

  async onMonthEnd(ctx: SimulationContext): Promise<void> {
    const profile = await this.ensureSeeded(ctx);
    const earned = ctx.character.earnedTotal;
    const salaryNotified = ctx.notifications.some((draft) => draft.kind === 'salary' && draft.tone !== 'bad' && draft.gameMinute === ctx.time);
    const earnedSinceMark = earned > profile.earnedMark;
    await this.profiles.update(ctx, profile, { earnedMark: earned });
    if (!salaryNotified && !earnedSinceMark) return;
    if (!(await this.facts.employment(ctx))) return;
    const changed = await this.counters.increment(ctx, new Map([['salary-months', 1]]));
    await this.evaluate(ctx, { kind: 'counters', keys: new Set(changed) });
  }

  /** Permanent clout from goals and achievements, part of the status baseline. */
  async status(ctx: SimulationContext): Promise<number> {
    return (await this.profiles.peek(ctx))?.clout ?? 0;
  }

  // ----- Orchestration -----------------------------------------------------------------------------------------------

  /** Make sure the character has a profile and goal rows (new characters, heirs and pre-existing lives alike). */
  async ensureSeeded(ctx: SimulationContext): Promise<ProgressionProfileEntity> {
    const { profile } = await this.profiles.ensure(ctx);
    await this.goals.rows(ctx);
    return profile;
  }

  /**
   * Player-initiated refresh (opening the Life Goals sheet): record where they are right now (so "Step outside" ticks
   * even before the next segment settles) and re-check active goals plus cheap achievements.
   */
  async refresh(ctx: SimulationContext): Promise<void> {
    await this.ensureSeeded(ctx);
    const place = placeOf(ctx.character.locationId, ctx.character.id, ctx.character.homeDistrictId);
    const changed = await this.counters.markFlags(ctx, presenceFlags(place));
    if (changed.length > 0) await this.evaluate(ctx, { kind: 'counters', keys: new Set(changed) });
    await this.evaluate(ctx, { kind: 'refresh' });
  }

  /**
   * Check the goals and achievements a trigger can affect; complete/unlock what's met. When a chapter opens, the new
   * goals are checked straight away (players who are ahead get their ticks immediately).
   */
  async evaluate(ctx: SimulationContext, initial: EvaluationTrigger): Promise<void> {
    const profile = await this.ensureSeeded(ctx);
    const rows = await this.goals.rows(ctx);
    const unlocked = await this.achievements.unlocked(ctx);
    let trigger = initial;

    for (let pass = 0; pass <= LIFE_CHAPTERS.length; pass++) {
      const goalCandidates = this.goals.candidates(rows, trigger);
      const achievementCandidates = this.achievements.candidates(unlocked, trigger);
      if (goalCandidates.length === 0 && achievementCandidates.length === 0) return;

      const sources = new Set<FactSource>();
      for (const goal of goalCandidates) for (const source of GOAL_CONDITION_INDEX.get(goal.id)?.sources ?? []) sources.add(source);
      for (const achievement of achievementCandidates) {
        for (const source of ACHIEVEMENT_CONDITION_INDEX.get(achievement.id)?.sources ?? []) sources.add(source);
      }
      const facts = await this.facts.gather(ctx, sources);

      let completedAny = false;
      for (const goal of goalCandidates) {
        if (!evaluateCondition(goal.condition, facts).met) continue;
        if (await this.goals.complete(ctx, profile, rows, goal, facts)) completedAny = true;
      }
      // Clout from goals can push status over a threshold — re-read the character before checking badges.
      const badgeFacts = completedAny ? { ...facts, character: this.facts.character(ctx) } : facts;
      const earned = achievementCandidates.filter((achievement) => evaluateCondition(achievement.condition, badgeFacts).met);
      await this.achievements.unlock(ctx, unlocked, earned);

      if (!completedAny) return;
      const transition = await this.goals.syncChapters(ctx, profile, rows);
      if (transition.newlyActive.size === 0) return;
      trigger = { kind: 'activated', goalIds: transition.newlyActive };
    }
  }

  // ----- Observers (state the ports don't remember for us) ------------------------------------------------------------

  /** Same job, new title → promotion (counted, celebrated). Remembers the job for next time. */
  private async observeEmployment(ctx: SimulationContext, profile: ProgressionProfileEntity): Promise<void> {
    const job = await this.facts.employment(ctx);
    if (job === undefined) return;
    if (job && isPromotion(profile.jobKey, job)) {
      await this.counters.increment(ctx, new Map([['promotions', 1]]));
      await this.milestones.enqueue(ctx, 'promotion', {
        occurrence: `${job.jobId}:${job.title}`,
        detail: ` to ${job.title} at ${job.employer}`,
        stats: [{ label: 'New title', value: job.title }],
      });
    }
    await this.profiles.update(ctx, profile, { jobKey: jobKeyOf(job) });
  }

  /** Enrolled while ASUU is on strike → strike days (weighted by how many days this probe stands for). */
  private async observeStrike(ctx: SimulationContext, weight: number): Promise<void> {
    if (!ctx.world.isActive(ctx.time - 1, 'asuu-strike')) return;
    const credentials = await this.facts.credentials(ctx);
    if (credentials?.enrolled) await this.counters.increment(ctx, new Map([['strike-days', weight]]));
  }

  /** Remember illnesses the character has had, for "survived it" badges — only while such a badge is still locked. */
  private async observeIllnesses(ctx: SimulationContext): Promise<void> {
    if (TRACKED_ILLNESSES.length === 0) return;
    const unlocked = await this.achievements.unlocked(ctx);
    const pending = [...ACHIEVEMENT_CONDITION_INDEX].some(([id, index]) => !unlocked.has(id) && index.sources.has('health'));
    if (!pending) return;
    const illnesses = await this.facts.illnesses(ctx);
    if (illnesses && illnesses.size > 0) await this.counters.markFlags(ctx, [...illnesses].map((illness) => `had:${illness}`));
  }
}
