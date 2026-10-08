import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import {
  CONDITIONS,
  CRITICAL_GRACE_DAYS,
  MINUTES_PER_DAY,
  PREGNANCY_TRIMESTERS,
  addNeeds,
  milderSeverity,
  pregnancyTrimester,
  severityRank,
  symptomsFor,
  worseSeverity,
  type ConditionId,
  type ConditionSeverity,
  type ConditionSummaryDto,
  type ConditionSymptoms,
  type GameMinute,
} from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { HealthConditionEntity } from './entities/health-condition.entity.js';
import { HEALTH_MEMO } from './health.constants.js';
import { MedicalHistoryService } from './medical-history.service.js';
import { illnessModifierId, removeMoodModifier, setMoodModifier } from './mood-modifiers.js';
import { isPlayerPresent } from './player-presence.js';

export interface InflictOptions {
  /** How it started (`season`, `street-food`, `okada`, `port`…). */
  readonly source: string;
  /** What happened, for the notification ("The okada rider skidded…"). */
  readonly story?: string;
  /** No notification (silent conditions like early high blood pressure). */
  readonly silent?: boolean;
}

export interface DailyCourseOptions {
  /** Current mood: rest and good spirits help the body fight things off. */
  readonly mood: number;
  /** Low-salt diet halves high-blood-pressure progression. */
  readonly lowSalt: boolean;
}

/** Mood modifiers are refreshed every day end; this keeps them alive until the next refresh. */
const SYMPTOM_MODIFIER_TTL = MINUTES_PER_DAY + 60;

/**
 * Conditions a character has: onset, diagnosis, the untreated daily course (natural recovery or getting worse),
 * symptoms (energy caps, mood, needs) and recovery. Treatment decisions live in `TreatmentService`.
 */
@Injectable()
export class ConditionsService {
  constructor(private readonly history: MedicalHistoryService) {}

  /** Conditions that aren't over (active or chronic-managed), oldest first. */
  async current(ctx: SimulationContext): Promise<HealthConditionEntity[]> {
    return ctx.memo(HEALTH_MEMO.conditions, () =>
      ctx.manager.find(HealthConditionEntity, {
        where: { characterId: ctx.character.id, status: In(['active', 'chronic-managed']) },
        order: { onsetAt: 'ASC' },
      }),
    );
  }

  async find(ctx: SimulationContext, conditionId: ConditionId): Promise<HealthConditionEntity | undefined> {
    return (await this.current(ctx)).find((condition) => condition.conditionId === conditionId);
  }

  async has(ctx: SimulationContext, conditionId: ConditionId): Promise<boolean> {
    return (await this.find(ctx, conditionId)) !== undefined;
  }

  /** Resolve a player's reference: a condition's record id, or its catalog id once diagnosed. */
  async resolve(ctx: SimulationContext, reference: string): Promise<HealthConditionEntity | undefined> {
    const current = await this.current(ctx);
    return current.find((condition) => condition.id === reference) ?? current.find((condition) => condition.diagnosed && condition.conditionId === reference);
  }

  /** Give the character a condition unless they already have it. Returns the new row, or null if nothing changed. */
  async inflict(ctx: SimulationContext, conditionId: ConditionId, severity: ConditionSeverity, options: InflictOptions): Promise<HealthConditionEntity | null> {
    if (conditionId === 'pregnancy' || (await this.has(ctx, conditionId))) return null;
    const condition = await this.create(ctx, conditionId, severity, options.source);
    const definition = CONDITIONS[conditionId];
    const symptoms = this.symptoms(condition, ctx.time);
    if (condition.diagnosed) {
      await this.history.record(ctx, { kind: 'onset', conditionId, summary: `${definition.label} (${severity}) — ${symptoms.description}` });
    }
    if (!options.silent) {
      const name = condition.diagnosed ? definition.label : definition.undiagnosedLabel.toLowerCase();
      const lead = options.story ? `${options.story} ` : '';
      ctx.notify({
        kind: 'health',
        title: condition.diagnosed ? `${definition.emoji} ${definition.label}` : 'You’re not feeling well',
        body: condition.diagnosed
          ? `${lead}${symptoms.description}. ${definition.advice}`
          : `${lead}You’ve got ${name}. Rest, and if it doesn’t clear, get a check-up at a pharmacy or hospital.`,
        tone: 'bad',
      });
      ctx.report({ label: condition.diagnosed ? `Got ${definition.label.toLowerCase()}` : `Fell ill (${name})`, tone: 'bad' });
      await this.noteWarning(ctx, condition);
    }
    return condition;
  }

  /** Low-level create (also used for pregnancies). */
  async create(ctx: SimulationContext, conditionId: ConditionId, severity: ConditionSeverity, source: string): Promise<HealthConditionEntity> {
    const definition = CONDITIONS[conditionId];
    const condition = await ctx.manager.save(
      ctx.manager.create(HealthConditionEntity, {
        characterId: ctx.character.id,
        conditionId,
        severity,
        status: 'active',
        onsetAt: ctx.time,
        diagnosed: definition.obvious,
        treatedAt: null,
        criticalSince: severity === 'critical' ? ctx.time : null,
        warningsSeen: 0,
        managedUntil: null,
        resolvedAt: null,
        source: source.slice(0, 32),
      }),
    );
    this.changed(ctx);
    this.refreshMoodModifier(ctx, condition);
    return condition;
  }

  /** What the condition feels like right now (pregnancy follows the trimester; chronic conditions under control are mild). */
  symptoms(condition: HealthConditionEntity, t: GameMinute): ConditionSymptoms {
    if (condition.conditionId === 'pregnancy') return PREGNANCY_TRIMESTERS[pregnancyTrimester(condition.onsetAt, t)];
    return symptomsFor(CONDITIONS[condition.conditionId], condition.severity, condition.status === 'chronic-managed');
  }

  /** Name shown to the player (vague until diagnosed). */
  label(condition: HealthConditionEntity, t: GameMinute): string {
    const definition = CONDITIONS[condition.conditionId];
    if (condition.conditionId === 'pregnancy') return `Pregnant (${PREGNANCY_TRIMESTERS[pregnancyTrimester(condition.onsetAt, t)].label.toLowerCase()})`;
    if (!condition.diagnosed) return definition.undiagnosedLabel;
    return condition.status === 'chronic-managed' ? `${definition.label} (controlled)` : definition.label;
  }

  /** Energy ceiling from the worst active symptom (100 when healthy). */
  async energyCap(ctx: SimulationContext, t: GameMinute): Promise<number> {
    let cap = 100;
    for (const condition of await this.current(ctx)) cap = Math.min(cap, this.symptoms(condition, t).energyCap);
    return cap;
  }

  async diagnose(ctx: SimulationContext, condition: HealthConditionEntity, venueId: string | null): Promise<boolean> {
    if (condition.diagnosed) return false;
    condition.diagnosed = true;
    await ctx.manager.save(condition);
    this.refreshMoodModifier(ctx, condition);
    const definition = CONDITIONS[condition.conditionId];
    await this.history.record(ctx, {
      kind: 'diagnosis',
      conditionId: condition.conditionId,
      summary: `Diagnosed: ${definition.label} (${condition.severity})`,
      venueId,
    });
    return true;
  }

  async setSeverity(ctx: SimulationContext, condition: HealthConditionEntity, severity: ConditionSeverity): Promise<void> {
    if (condition.severity === severity) return;
    condition.severity = severity;
    condition.criticalSince = severity === 'critical' ? (condition.criticalSince ?? ctx.time) : null;
    if (severity !== 'critical') condition.warningsSeen = 0;
    await ctx.manager.save(condition);
    this.changed(ctx);
    this.refreshMoodModifier(ctx, condition);
  }

  /** A chronic condition brought under control with medication paid up to `until`. */
  async manage(ctx: SimulationContext, condition: HealthConditionEntity, until: GameMinute): Promise<void> {
    condition.status = 'chronic-managed';
    condition.severity = 'mild';
    condition.criticalSince = null;
    condition.managedUntil = until;
    await ctx.manager.save(condition);
    this.changed(ctx);
    this.refreshMoodModifier(ctx, condition);
  }

  /** Medication ran out: the chronic condition is uncontrolled again (and can progress). */
  async lapse(ctx: SimulationContext, condition: HealthConditionEntity): Promise<void> {
    condition.status = 'active';
    condition.managedUntil = null;
    await ctx.manager.save(condition);
    this.changed(ctx);
    this.refreshMoodModifier(ctx, condition);
  }

  async recover(ctx: SimulationContext, condition: HealthConditionEntity, how: 'natural' | 'treatment' | 'discharge' | 'delivery', venueId: string | null = null): Promise<void> {
    condition.status = 'recovered';
    condition.resolvedAt = ctx.time;
    condition.criticalSince = null;
    await ctx.manager.save(condition);
    this.changed(ctx);
    removeMoodModifier(ctx, illnessModifierId(condition.conditionId));
    if (how === 'delivery') return;

    const definition = CONDITIONS[condition.conditionId];
    const name = condition.diagnosed ? definition.label : definition.undiagnosedLabel.toLowerCase();
    await this.history.record(ctx, { kind: 'recovery', conditionId: condition.conditionId, summary: `Recovered from ${name}`, venueId });
    if (how === 'natural') {
      ctx.notify({ kind: 'health', title: 'Feeling better', body: `Your body fought off the ${name}. Thank God for good immunity.`, tone: 'good' });
      ctx.report({ label: `Recovered from ${name}`, tone: 'good' });
    }
  }

  /**
   * The untreated daily course of every condition that isn't being handled in hospital: the body may fight it off
   * (or improve a step), or it gets one step worse. Critical conditions get a warning every day.
   */
  async progressDay(ctx: SimulationContext, dayIndex: number, admitted: ReadonlySet<string>, options: DailyCourseOptions): Promise<void> {
    const recoveryBoost = options.mood >= 60 ? 1.25 : options.mood < 30 ? 0.75 : 1;
    for (const condition of await this.current(ctx)) {
      if (condition.conditionId === 'pregnancy' || condition.status !== 'active' || admitted.has(condition.id)) continue;
      const definition = CONDITIONS[condition.conditionId];
      const rng = ctx.rng('condition-course', condition.id, dayIndex);

      if (rng.chance(definition.recoverPerDay[condition.severity] * recoveryBoost)) {
        const milder = milderSeverity(condition.severity);
        if (milder === null) await this.recover(ctx, condition, 'natural');
        else await this.setSeverity(ctx, condition, milder);
        continue;
      }

      const worsen = definition.worsenPerDay[condition.severity] * (condition.conditionId === 'hypertension' && options.lowSalt ? 0.5 : 1);
      const worse = worseSeverity(condition.severity);
      if (worse !== null && rng.chance(worsen)) {
        await this.setSeverity(ctx, condition, worse);
        this.warnEscalation(ctx, condition);
        await this.noteWarning(ctx, condition);
      } else if (condition.severity === 'critical') {
        this.warnCritical(ctx, condition);
        await this.noteWarning(ctx, condition);
      }
    }
  }

  /** Apply each untreated condition's daily need effects and refresh symptom mood modifiers. */
  applyDailySymptoms(ctx: SimulationContext, conditions: readonly HealthConditionEntity[], admitted: ReadonlySet<string>): void {
    for (const condition of conditions) {
      const symptoms = this.symptoms(condition, ctx.time);
      if (symptoms.needs && !admitted.has(condition.id)) ctx.character.needs = addNeeds(ctx.character.needs, symptoms.needs);
      this.refreshMoodModifier(ctx, condition);
    }
  }

  /** Health lost today to conditions not being treated in hospital. */
  dailyDamage(conditions: readonly HealthConditionEntity[], admitted: ReadonlySet<string>, t: GameMinute): number {
    return conditions.filter((condition) => !admitted.has(condition.id)).reduce((sum, condition) => sum + this.symptoms(condition, t).healthPerDay, 0);
  }

  async summaries(ctx: SimulationContext): Promise<ConditionSummaryDto[]> {
    return (await this.current(ctx)).map((condition) => this.summary(condition, ctx.time));
  }

  summary(condition: HealthConditionEntity, t: GameMinute): ConditionSummaryDto {
    return {
      id: condition.id,
      conditionId: condition.diagnosed ? condition.conditionId : 'undiagnosed',
      label: this.label(condition, t),
      severity: condition.severity,
      diagnosed: condition.diagnosed,
    };
  }

  refreshMoodModifier(ctx: SimulationContext, condition: HealthConditionEntity): void {
    const id = illnessModifierId(condition.conditionId);
    if (condition.status === 'recovered') {
      removeMoodModifier(ctx, id);
      return;
    }
    const symptoms = this.symptoms(condition, ctx.time);
    if (symptoms.mood === 0) {
      removeMoodModifier(ctx, id);
      return;
    }
    setMoodModifier(ctx, { id, label: this.label(condition, ctx.time), value: symptoms.mood, until: ctx.time + SYMPTOM_MODIFIER_TTL });
  }

  private warnEscalation(ctx: SimulationContext, condition: HealthConditionEntity): void {
    const definition = CONDITIONS[condition.conditionId];
    const name = condition.diagnosed ? definition.label : 'Whatever you have';
    const symptoms = this.symptoms(condition, ctx.time);
    const rank = severityRank(condition.severity);
    const body =
      condition.severity === 'critical'
        ? `${symptoms.description}. Get to a hospital immediately — untreated, this can be fatal within days.`
        : rank >= severityRank('severe')
          ? `${symptoms.description}. See a doctor today — a pharmacy won’t cut it.`
          : `${symptoms.description}. ${condition.diagnosed ? definition.advice : 'Get a check-up before it gets worse.'}`;
    ctx.notify({
      kind: 'health',
      title: condition.severity === 'critical' ? `🚨 Emergency: ${name.toLowerCase()} is critical` : `${name} is getting worse`,
      body,
      tone: 'bad',
    });
    ctx.report({ label: `${name} got worse (${condition.severity})`, tone: 'bad' });
  }

  private warnCritical(ctx: SimulationContext, condition: HealthConditionEntity): void {
    const definition = CONDITIONS[condition.conditionId];
    if (!definition.canBeFatal) return;
    const days = condition.criticalSince === null ? 0 : Math.floor((ctx.time - condition.criticalSince) / MINUTES_PER_DAY);
    const health = Math.round(ctx.character.health);
    const urgency = days + 1 >= CRITICAL_GRACE_DAYS || health < 20 ? 'Your family is begging you — go to the hospital now.' : 'Every day counts.';
    ctx.notify({
      kind: 'health',
      title: `🚨 Still critical (health ${health}/100)`,
      body: `${this.symptoms(condition, ctx.time).description}. ${urgency} Any public or private hospital can admit you.`,
      tone: 'bad',
    });
  }

  /** A critical-stage warning only counts toward a possible illness death if the player was there to see it. */
  private async noteWarning(ctx: SimulationContext, condition: HealthConditionEntity): Promise<void> {
    if (condition.severity !== 'critical' || !CONDITIONS[condition.conditionId].canBeFatal || !isPlayerPresent(ctx)) return;
    condition.warningsSeen += 1;
    await ctx.manager.save(condition);
  }

  private changed(ctx: SimulationContext): void {
    ctx.invalidate(HEALTH_MEMO.conditions);
    ctx.invalidate('profile-context');
  }
}
