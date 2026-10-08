import { Injectable } from '@nestjs/common';
import {
  CONDITIONS,
  CRITICAL_GRACE_DAYS,
  LIFESTYLES,
  MINUTES_PER_DAY,
  dailyMortalityChance,
  healthDailyDrift,
  severityRank,
  type HealthDriftBreakdown,
  type NeedKey,
} from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { ConditionsService } from './conditions.service.js';
import type { HealthConditionEntity } from './entities/health-condition.entity.js';
import type { HealthProfileEntity } from './entities/health-profile.entity.js';
import { MIN_WARNINGS_SEEN, OFFLINE_NATURAL_DEATH_MIN_AGE } from './health.constants.js';
import { MedicalHistoryService } from './medical-history.service.js';
import { isPlayerPresent, isPlayerRecentlyActive } from './player-presence.js';

/** A need below this at day end counts toward deprivation damage ("needs in the red for long"). */
const LOW_NEED_THRESHOLD = 15;
/** Only the body's needs damage the body; boredom and loneliness act on health through mood instead. */
const PHYSICAL_NEEDS: readonly NeedKey[] = ['energy', 'hunger', 'hygiene'];

export interface DailyHealthInputs {
  readonly conditions: readonly HealthConditionEntity[];
  readonly admitted: ReadonlySet<string>;
  /** FACILITIES[x].careQuality while on a ward, else 0. */
  readonly hospitalCare: number;
}

/**
 * Ageing and death. Applies the daily health drift (lifestyle, mood, fitness, age, illness, deprivation, the body's
 * own healing) and decides death: an untreated critical illness after its grace period of daily warnings the player
 * actually saw, or a natural death whose odds rise with age (never before 40, never before 55 while the player is away)
 * and fall with good health and care.
 *
 * Death only marks the character (alive=false, diedAt, causeOfDeath); succession belongs to the family domain.
 */
@Injectable()
export class MortalityService {
  constructor(
    private readonly conditions: ConditionsService,
    private readonly history: MedicalHistoryService,
    private readonly engine: SimulationEngine,
  ) {}

  /** Update low-need streak, apply today's drift and remember the breakdown for the Health app. */
  applyDailyDrift(ctx: SimulationContext, profile: HealthProfileEntity, inputs: DailyHealthInputs): HealthDriftBreakdown {
    const character = ctx.character;
    const lowNeeds = PHYSICAL_NEEDS.filter((key) => character.needs[key] < LOW_NEED_THRESHOLD).length;
    profile.lowNeedStreak = lowNeeds > 0 ? profile.lowNeedStreak + 1 : 0;
    const drift = healthDailyDrift({
      health: character.health,
      age: ctx.age,
      lifestyleDrift: LIFESTYLES[character.lifestyle].healthDrift,
      mood: this.engine.mood(ctx),
      fitness: character.fitness,
      conditionDamage: this.conditions.dailyDamage(inputs.conditions, inputs.admitted, ctx.time),
      lowNeedStreak: profile.lowNeedStreak,
      lowNeeds,
      broke: character.moodModifiers.some((modifier) => modifier.id === 'broke' && modifier.until > ctx.time),
      hospitalCare: inputs.hospitalCare,
    });
    character.health = Math.min(100, Math.max(0, character.health + drift.total));
    profile.lastDrift = drift;
    return drift;
  }

  /**
   * Death from a fatal condition left critical and untreated past its grace period, once health has run out — and only
   * for a player who was recently active and saw the critical warnings live. Away players are never lost to illness
   * (the autopilot gets them admitted instead).
   */
  async checkIllnessDeath(ctx: SimulationContext, conditions: readonly HealthConditionEntity[], admitted: ReadonlySet<string>): Promise<boolean> {
    if (ctx.character.health > 0 || !isPlayerRecentlyActive(ctx)) return false;
    const fatal = conditions.find(
      (condition) =>
        condition.status === 'active' &&
        condition.severity === 'critical' &&
        CONDITIONS[condition.conditionId].canBeFatal &&
        !admitted.has(condition.id) &&
        condition.warningsSeen >= MIN_WARNINGS_SEEN &&
        condition.criticalSince !== null &&
        ctx.time - condition.criticalSince >= CRITICAL_GRACE_DAYS * MINUTES_PER_DAY,
    );
    if (!fatal) return false;
    await this.die(ctx, CONDITIONS[fatal.conditionId].causeOfDeath, fatal.conditionId);
    return true;
  }

  /** Age-related death roll for the day that just ended (zero before 40; never before 55 while the player is away). */
  async checkNaturalDeath(ctx: SimulationContext, dayIndex: number, conditions: readonly HealthConditionEntity[], goodCare: boolean): Promise<boolean> {
    if (ctx.age < OFFLINE_NATURAL_DEATH_MIN_AGE && !isPlayerPresent(ctx)) return false;
    const unmanaged = conditions.filter((condition) => CONDITIONS[condition.conditionId].chronic && condition.status === 'active');
    const chance = dailyMortalityChance({ age: ctx.age, health: ctx.character.health, unmanagedChronic: unmanaged.length, goodCare });
    if (chance <= 0 || !ctx.rng('mortality', dayIndex).chance(chance)) return false;
    const worst = unmanaged.toSorted((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
    const cause =
      worst && severityRank(worst.severity) >= severityRank('severe')
        ? CONDITIONS[worst.conditionId].causeOfDeath
        : ctx.character.health < 30
          ? 'Illness in old age'
          : 'Natural causes';
    await this.die(ctx, cause, worst?.conditionId ?? null);
    return true;
  }

  async die(ctx: SimulationContext, cause: string, conditionId: string | null): Promise<void> {
    const character = ctx.character;
    if (!character.alive) return;
    const age = ctx.age;
    character.alive = false;
    character.diedAt = ctx.time;
    character.causeOfDeath = cause.slice(0, 120);
    await this.history.record(ctx, { kind: 'death', conditionId, summary: `Passed away at ${age}. Cause: ${cause}` });
    ctx.notify({
      kind: 'health',
      title: `Rest in peace, ${character.firstName}`,
      body: `${character.firstName} ${character.lastName} passed away at ${age}. Cause of death: ${cause.toLowerCase()}. Their story continues through the family they leave behind.`,
      tone: 'neutral',
    });
    ctx.report({ label: `${character.firstName} passed away at ${age}`, tone: 'neutral' });
  }
}
