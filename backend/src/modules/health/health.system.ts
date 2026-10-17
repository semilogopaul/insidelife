import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  actionHours,
  CONDITION_SEVERITIES,
  FACILITIES,
  FOOD_RISK,
  MINUTES_PER_DAY,
  MOSQUITO_NET_FACTOR,
  MOSQUITO_NET_TAG,
  ROAD_INJURY,
  TRANSPORT,
  burnoutDailyChance,
  catarrhDailyChance,
  diabetesYearlyChance,
  exerciseInjuryChance,
  hypertensionYearlyChance,
  malariaDailyChance,
  milderSeverity,
  seasonOf,
  yearsBetween,
  type ActionDefinition,
  type ConditionSeverity,
  type FoodRiskHook,
  type ProfileContext,
  isIntercityMode,
} from '@insidelife/shared';
import { INVENTORY_PORT, type InventoryPort } from '../../common/ports/inventory.port.js';
import type { ActivityState, TravelState } from '../characters/entities/character.entity.js';
import type { ScheduleBlock, SimulationSystem, SummaryContribution } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { ADMITTED_ROWS, AdmissionsService } from './admissions.service.js';
import { ConditionsService, CURRENT_CONDITION_ROWS } from './conditions.service.js';
import type { HealthProfileEntity } from './entities/health-profile.entity.js';
import { HealthProfileService } from './health-profile.service.js';
import { InsuranceService } from './insurance.service.js';
import { MortalityService } from './mortality.service.js';
import { PregnancyService } from './pregnancy.service.js';
import { TreatmentService } from './treatment.service.js';

/** A day counts as stressful below this mood, or below FAIR_MOOD with a stressful job. */
const STRESSED_MOOD = 35;
const FAIR_MOOD = 50;
const HIGH_JOB_STRESS = 0.6;
/** Health gained per hour of exercise (capped per session). */
const EXERCISE_HEALTH_PER_HOUR = 0.25;
const EXERCISE_HEALTH_CAP = 0.6;
const JOG_INJURY_CHANCE = 0.002;

/**
 * The health simulation: daily health drift, getting sick (seasonal malaria, catarrh, food, roads, gyms, stress,
 * chronic conditions on birthdays), the untreated course of illness, symptoms (energy caps, mood, needs), hospital
 * admissions on the routine, HMO premiums, pregnancy and childbirth, and — when it comes — death.
 */
@Injectable()
export class HealthSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'health';
  readonly order = 120;
  readonly rowProbes = [ADMITTED_ROWS, CURRENT_CONDITION_ROWS];

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly planner: TimelinePlanner,
    private readonly engine: SimulationEngine,
    private readonly conditions: ConditionsService,
    private readonly treatment: TreatmentService,
    private readonly admissions: AdmissionsService,
    private readonly insurance: InsuranceService,
    private readonly pregnancy: PregnancyService,
    private readonly mortality: MortalityService,
    private readonly profiles: HealthProfileService,
    @Inject(INVENTORY_PORT) private readonly inventory: InventoryPort,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async scheduleForDay(ctx: SimulationContext, dayIndex: number): Promise<readonly ScheduleBlock[]> {
    return this.admissions.blocksForDay(ctx, dayIndex);
  }

  /** The worst active symptom caps energy (severe malaria → 35). */
  async profileContext(ctx: SimulationContext, base: ProfileContext): Promise<ProfileContext> {
    const cap = await this.conditions.energyCap(ctx, ctx.time);
    return cap < base.energyCap ? { ...base, energyCap: cap } : base;
  }

  async onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    if (action.id === 'treatment') {
      await this.treatment.complete(ctx, activity);
      return;
    }
    for (const hook of action.hooks ?? []) {
      if (hook === 'food-risk-low' || hook === 'food-risk-high') await this.foodRisk(ctx, hook, action, activity);
      else if (hook === 'exercise') await this.exercise(ctx, action, activity);
    }
  }

  async onArrival(ctx: SimulationContext, travel: TravelState): Promise<void> {
    await this.admissions.onTravel(ctx, travel);
    await this.roadIncident(ctx, travel);
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const profile = await this.profiles.get(ctx);
    const mood = this.engine.mood(ctx);

    await this.admissions.onDayEnd(ctx, dayIndex);
    const lowSalt = this.profiles.isProtected(profile, 'low-salt', ctx.time);
    await this.conditions.progressDay(ctx, dayIndex, await this.admissions.admittedConditionIds(ctx), { mood, lowSalt });
    await this.treatment.refillMedication(ctx, dayIndex);
    await this.rollIllnesses(ctx, dayIndex, profile, mood);
    await this.pregnancy.onDayEnd(ctx, dayIndex);
    await this.treatment.autopilotCare(ctx, dayIndex);

    const admitted = await this.admissions.admittedConditionIds(ctx);
    const conditions = await this.conditions.current(ctx);
    this.conditions.applyDailySymptoms(ctx, conditions, admitted);
    const admission = await this.admissions.current(ctx);
    this.mortality.applyDailyDrift(ctx, profile, { conditions, admitted, hospitalCare: admission ? FACILITIES[admission.facility].careQuality : 0 });
    await this.profiles.save(ctx, profile);

    await this.treatment.rescue(ctx, dayIndex);
    const latest = await this.conditions.current(ctx);
    const stillAdmitted = await this.admissions.admittedConditionIds(ctx);
    if (await this.mortality.checkIllnessDeath(ctx, latest, stillAdmitted)) return;
    await this.mortality.checkNaturalDeath(ctx, dayIndex, latest, await this.insurance.hasGoodCare(ctx));
  }

  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    await this.insurance.onMonthEnd(ctx, monthIndex);
  }

  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    return { conditions: await this.conditions.summaries(ctx) };
  }

  async onDeath(ctx: SimulationContext): Promise<void> {
    await this.admissions.endOnDeath(ctx);
    await this.insurance.endOnDeath(ctx);
    await this.pregnancy.endOnDeath(ctx);
  }

  /** Seasonal malaria, catarrh, burnout from sustained stress, and chronic conditions checked on birthdays. */
  private async rollIllnesses(ctx: SimulationContext, dayIndex: number, profile: HealthProfileEntity, mood: number): Promise<void> {
    const dayStart = dayIndex * MINUTES_PER_DAY;
    const season = seasonOf(dayStart);
    const context = await this.planner.profileContext(ctx, dayStart);

    if (!(await this.conditions.has(ctx, 'malaria'))) {
      const fumigated = this.profiles.isProtected(profile, 'fumigated', ctx.time);
      const rng = ctx.rng('malaria', dayIndex);
      const bitten = rng.chance(malariaDailyChance({ season, comfort: context.comfort, hasNet: false, fumigated }));
      // A treated net stops most bites (the shop is only asked on the rare days a mosquito gets through).
      const netSaved = bitten && (await this.sleepsUnderNet(ctx, profile)) && rng.chance(1 - MOSQUITO_NET_FACTOR);
      if (bitten && !netSaved) {
        await this.conditions.inflict(ctx, 'malaria', 'mild', { source: 'season', story: season === 'rainy' ? 'The rainy-season mosquitoes found you.' : undefined });
      }
    }

    if (!(await this.conditions.has(ctx, 'catarrh')) && ctx.rng('catarrh', dayIndex).chance(catarrhDailyChance(season))) {
      await this.conditions.inflict(ctx, 'catarrh', 'mild', { source: 'season', story: season === 'harmattan' ? 'The harmattan dust got into your chest.' : undefined });
    }

    const stressful = mood < STRESSED_MOOD || (context.jobStress >= HIGH_JOB_STRESS && mood < FAIR_MOOD);
    profile.stressStreak = stressful ? profile.stressStreak + 1 : Math.max(0, profile.stressStreak - 2);
    if (!(await this.conditions.has(ctx, 'burnout')) && ctx.rng('burnout', dayIndex).chance(burnoutDailyChance(profile.stressStreak))) {
      await this.conditions.inflict(ctx, 'burnout', 'mild', { source: 'stress' });
      profile.stressStreak = 0;
    }

    const age = ctx.age;
    if (age > yearsBetween(ctx.character.bornAt, ctx.time - MINUTES_PER_DAY)) {
      const stress = Math.min(1, profile.stressStreak / 10 + context.jobStress * 0.5);
      const risk = { age, lifestyle: ctx.character.lifestyle, fitness: ctx.character.fitness, stress };
      const hasHypertension = await this.conditions.has(ctx, 'hypertension');
      if (!hasHypertension && ctx.rng('chronic', 'hypertension', age).chance(hypertensionYearlyChance(risk))) {
        // The silent killer: no notification until someone checks your BP.
        await this.conditions.inflict(ctx, 'hypertension', 'mild', { source: 'birthday-check', silent: true });
      }
      if (!(await this.conditions.has(ctx, 'diabetes')) && ctx.rng('chronic', 'diabetes', age).chance(diabetesYearlyChance({ ...risk, hasHypertension }))) {
        await this.conditions.inflict(ctx, 'diabetes', 'mild', { source: 'birthday-check' });
      }
    }
  }

  private async sleepsUnderNet(ctx: SimulationContext, profile: HealthProfileEntity): Promise<boolean> {
    return this.profiles.isProtected(profile, 'bed-net', ctx.time) || this.inventory.hasTag(ctx, MOSQUITO_NET_TAG);
  }

  private async foodRisk(ctx: SimulationContext, hook: FoodRiskHook, action: ActionDefinition, activity: ActivityState): Promise<void> {
    const odds = FOOD_RISK[hook];
    const rng = ctx.rng('food-risk', hook, activity.startedAt);
    if (rng.chance(odds['food-poisoning'])) {
      await this.conditions.inflict(ctx, 'food-poisoning', 'mild', { source: action.id, story: `Something in that ${action.label.toLowerCase()} didn’t agree with you.` });
    } else if (rng.chance(odds.typhoid)) {
      await this.conditions.inflict(ctx, 'typhoid', 'mild', { source: action.id });
    }
  }

  /** Exercise is good for you (fitness itself is applied by the engine) — and occasionally humbling. */
  private async exercise(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    const hours = actionHours(activity);
    ctx.character.health = Math.min(100, ctx.character.health + Math.min(EXERCISE_HEALTH_CAP, EXERCISE_HEALTH_PER_HOUR * hours));
    await this.profiles.adjustStress(ctx, -1);

    const chance = action.id === 'gym' ? exerciseInjuryChance(ctx.character.needs.energy) : action.id === 'jog' ? JOG_INJURY_CHANCE : 0;
    if (chance > 0 && ctx.rng('exercise-injury', activity.startedAt).chance(chance)) {
      const story = action.id === 'gym' ? 'You tried to lift more than your ego could carry and pulled something.' : 'You twisted your ankle on an uneven path.';
      await this.conditions.inflict(ctx, 'injury', 'mild', { source: action.id, story });
    }
  }

  /**
   * Okada and keke crashes (and the odd danfo mishap) cause injuries on booked rides and routine commutes. Own-car
   * crashes belong to the vehicles domain; open-world movement is player-controlled, so it never rolls here.
   */
  private async roadIncident(ctx: SimulationContext, travel: TravelState): Promise<void> {
    if (travel.source === 'open-world' || isIntercityMode(travel.mode)) return;
    const profile = ROAD_INJURY[travel.mode];
    if (!profile) return;
    const rng = ctx.rng('road-injury', travel.departAt, travel.toLocationId);
    if (!rng.chance(TRANSPORT[travel.mode].incidentRisk * profile.injuryShare)) return;
    if (await this.conditions.has(ctx, 'injury')) return;

    let severity: ConditionSeverity = rng.weighted(CONDITION_SEVERITIES.map((value) => ({ value, weight: profile.severity[value] })));
    const firstAid = this.profiles.isProtected(await this.profiles.get(ctx), 'first-aid', ctx.time);
    if (firstAid) severity = milderSeverity(severity) ?? severity;
    await this.conditions.inflict(ctx, 'injury', severity, { source: travel.mode, story: profile.story });
  }
}
