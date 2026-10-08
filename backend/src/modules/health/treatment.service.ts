import { Injectable } from '@nestjs/common';
import {
  CARE_FACILITY_TYPES,
  CONDITIONS,
  FACILITIES,
  MINUTES_PER_DAY,
  admissionDaysFor,
  canDiagnoseAt,
  canTreatAt,
  checkUpMinutes,
  doctorsStrikeAt,
  findAction,
  formatGameDuration,
  formatNaira,
  severityRank,
  treatmentBasePrice,
  treatmentMinutes,
  treatmentSuccessChance,
  type CareFacilityType,
  type CheckUpFindingDto,
  type CheckUpResultDto,
  type GameMinute,
  type TreatmentQuoteDto,
  type TreatmentStartedDto,
  type VenueDefinition,
  isInterruptibleActivity,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { ActivityState } from '../characters/entities/character.entity.js';
import type { NotificationDraft } from '../notifications/notifications.service.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { AdmissionsService } from './admissions.service.js';
import { careVenueAt, isCareVenueOpen, nearestCareVenue, type CareVenue } from './care-venues.js';
import { ConditionsService } from './conditions.service.js';
import type { HealthConditionEntity } from './entities/health-condition.entity.js';
import type { PregnancyEntity } from './entities/pregnancy.entity.js';
import {
  AUTOPILOT_MILD_AFTER_DAYS,
  AUTOPILOT_MILD_CONDITIONS,
  AUTOPILOT_MODERATE_AFTER_DAYS,
  CHARITY_CONNECTIONS_PENALTY,
  CHARITY_MOOD_PENALTY,
  FAMILY_RESCUE_COOLDOWN,
  MEDICATION_PERIOD,
  RESCUE_CHANCE,
  TREATMENT_TARGET,
} from './health.constants.js';
import { HealthProfileService } from './health-profile.service.js';
import { InsuranceService, type CoverQuote } from './insurance.service.js';
import { MedicalHistoryService } from './medical-history.service.js';
import { setMoodModifier } from './mood-modifiers.js';
import { isPlayerPresent } from './player-presence.js';
import { PregnancyService } from './pregnancy.service.js';

const TREATMENT_ACTION_ID = 'treatment';

/** One visit to a pharmacy or hospital whose outcome is being decided. */
interface Visit {
  readonly startedAt: GameMinute;
  /** What the character paid. */
  readonly cost: number;
  /** Decided by the character on autopilot (results go to the away report). */
  readonly autopilot: boolean;
}

type Notice = Omit<NotificationDraft, 'gameMinute'>;

/** Who ended up paying for an emergency admission, and how much (family: the shortfall they covered). */
interface EmergencyBill {
  readonly payer: 'self' | 'family' | 'charity';
  readonly amount: number;
}

/**
 * Seeing a pharmacist or doctor.
 *
 * - **Treatment** (player command): must be inside an open pharmacy or hospital; priced by facility tier and severity
 *   with the HMO's share deducted; runs as the `treatment` system action for the facility's visit time (public
 *   hospitals queue longer, much longer during strikes); the outcome is rolled when the visit completes. Serious
 *   cases that respond are admitted to the ward.
 * - **Check-ups** diagnose what the facility can test for.
 * - **Chronic medication** refills monthly (or the condition lapses).
 * - **Autopilot care** (player away): lingering illness gets the cheapest effective treatment the character can afford;
 *   anything severe or critical means a guaranteed public-hospital admission paid by them, else family, else charity.
 * - **Rescue** (player watching but ignoring warnings): neighbours may rush a critically ill character to hospital.
 */
@Injectable()
export class TreatmentService {
  constructor(
    private readonly conditions: ConditionsService,
    private readonly insurance: InsuranceService,
    private readonly admissions: AdmissionsService,
    private readonly pregnancies: PregnancyService,
    private readonly history: MedicalHistoryService,
    private readonly profiles: HealthProfileService,
    private readonly engine: SimulationEngine,
    private readonly planner: TimelinePlanner,
  ) {}

  strikeAt(ctx: SimulationContext, t: GameMinute): boolean {
    return doctorsStrikeAt(ctx.world.seed, t) !== null;
  }

  /** Price, odds and time to treat a condition at each kind of facility right now. */
  async quotes(ctx: SimulationContext, condition: HealthConditionEntity): Promise<TreatmentQuoteDto[]> {
    const quotes: TreatmentQuoteDto[] = [];
    for (const facility of CARE_FACILITY_TYPES) quotes.push(await this.quote(ctx, condition, facility));
    return quotes;
  }

  async quote(ctx: SimulationContext, condition: HealthConditionEntity, facility: CareFacilityType): Promise<TreatmentQuoteDto> {
    const definition = FACILITIES[facility];
    const strike = this.strikeAt(ctx, ctx.time);
    const check = canTreatAt(condition.conditionId, condition.severity, facility);
    const price = this.price(ctx, condition, facility);
    const pregnancy = condition.conditionId === 'pregnancy' ? await this.pregnancies.current(ctx) : null;
    const cover = await this.insurance.cover(ctx, facility, price, pregnancy ? { maternityConceivedAt: pregnancy.conceivedAt } : {});
    const admissionDays = admissionDaysFor(condition.conditionId, condition.severity, facility);
    const ward = definition.admissionPerDay === null ? 0 : ctx.world.price(definition.admissionPerDay, ctx.time);
    const wardCover = await this.insurance.cover(ctx, facility, ward);
    return {
      facility,
      facilityLabel: definition.label,
      available: check.ok,
      reason: check.reason,
      price,
      coveredByHmo: cover.covered,
      youPay: cover.youPay,
      durationMinutes: treatmentMinutes(condition.conditionId, condition.severity, facility, strike),
      successChance: treatmentSuccessChance(condition.conditionId, condition.severity, facility, { diagnosed: condition.diagnosed, strike }),
      admissionDays,
      admissionPerDay: admissionDays > 0 ? wardCover.youPay : 0,
    };
  }

  /** POST /health/treatments: pay and start the visit. The outcome is applied when the visit completes. */
  async start(ctx: SimulationContext, reference: string): Promise<TreatmentStartedDto> {
    this.assertFree(ctx);
    const here = this.assertAtOpenFacility(ctx);
    const condition = await this.conditions.resolve(ctx, reference);
    const pregnancy = await this.pregnancies.current(ctx);
    if (pregnancy && (condition?.conditionId === 'pregnancy' || (!condition && (reference === pregnancy.id || reference === 'pregnancy')))) {
      return this.startAntenatal(ctx, here, pregnancy);
    }
    if (!condition) throw new ResourceNotFoundException('Condition');

    const admission = await this.admissions.current(ctx);
    if (admission?.conditionRecordId === condition.id) {
      throw new GameRuleException('ALREADY_ADMITTED', 'You’re already on the ward for this — the doctors are on it');
    }
    const check = canTreatAt(condition.conditionId, condition.severity, here.facility);
    if (!check.ok) throw new GameRuleException('CANNOT_TREAT_HERE', check.reason ?? 'They can’t treat this here');

    // A doctor examines you before treating; a pharmacist can only go by what you describe.
    if (here.facility !== 'pharmacy') await this.conditions.diagnose(ctx, condition, here.venue.id);
    const quote = await this.quote(ctx, condition, here.facility);
    const cover = await this.insurance.cover(ctx, here.facility, quote.price);
    const label = this.conditions.label(condition, ctx.time);
    if (cover.youPay > 0) {
      await ctx.wallet.pay(cover.youPay, 'health', `${label} treatment — ${here.venue.name}`, `treatment:${condition.id}:${ctx.time}`, {
        metadata: { conditionId: condition.conditionId, facility: here.facility, covered: cover.covered },
      });
    }
    await this.insurance.claim(ctx, cover);
    this.engine.start(ctx, this.activity(ctx, here, `${TREATMENT_TARGET.condition}${condition.id}`, quote.durationMinutes, cover.youPay));

    const strike = here.facility === 'hospital-public' && this.strikeAt(ctx, ctx.time);
    return {
      conditionId: condition.id,
      label,
      severity: condition.severity,
      facility: here.facility,
      venueName: here.venue.name,
      price: cover.price,
      coveredByHmo: cover.covered,
      paid: cover.youPay,
      durationMinutes: quote.durationMinutes,
      endsAt: ctx.time + quote.durationMinutes,
      successChance: quote.successChance,
      message: this.startMessage(here, condition, quote.durationMinutes, strike),
    };
  }

  /** POST /health/check-ups: pay, get examined, learn what you have. */
  async checkUp(ctx: SimulationContext): Promise<CheckUpResultDto> {
    this.assertFree(ctx);
    const here = this.assertAtOpenFacility(ctx);
    const minutes = checkUpMinutes(here.facility, this.strikeAt(ctx, ctx.time));
    const cover = await this.insurance.cover(ctx, here.facility, ctx.world.price(FACILITIES[here.facility].checkUpPrice, ctx.time));
    if (cover.youPay > 0) {
      await ctx.wallet.pay(cover.youPay, 'health', `Check-up — ${here.venue.name}`, `check-up:${ctx.time}`, { metadata: { facility: here.facility, covered: cover.covered } });
    }
    await this.insurance.claim(ctx, cover);

    const findings: CheckUpFindingDto[] = [];
    let unexplained = 0;
    for (const condition of await this.conditions.current(ctx)) {
      if (!canDiagnoseAt(condition.conditionId, here.facility)) {
        if (!condition.diagnosed) unexplained++;
        continue;
      }
      const newlyDiagnosed = await this.conditions.diagnose(ctx, condition, here.venue.id);
      findings.push({
        conditionId: condition.id,
        label: this.conditions.label(condition, ctx.time),
        severity: condition.severity,
        newlyDiagnosed,
        advice: CONDITIONS[condition.conditionId].advice,
      });
    }
    this.engine.start(ctx, this.activity(ctx, here, TREATMENT_TARGET.checkUp, minutes, cover.youPay));
    await this.history.record(ctx, {
      kind: 'check-up',
      summary: findings.length === 0 ? `Check-up at ${here.venue.name}: nothing found` : `Check-up at ${here.venue.name}: ${findings.map((finding) => finding.label).join(', ')}`,
      cost: cover.youPay,
      venueId: here.venue.id,
    });

    const fresh = findings.filter((finding) => finding.newlyDiagnosed);
    const message =
      findings.length === 0 && unexplained === 0
        ? 'Clean bill of health! Drink water, sleep well and keep moving.'
        : fresh.length > 0
          ? `Diagnosis: ${fresh.map((finding) => `${finding.label} (${finding.severity})`).join(', ')}. You can start treatment right here.`
          : unexplained > 0
            ? 'They couldn’t pin down what’s wrong here — a hospital can run proper tests.'
            : 'Nothing new — stick to your treatment plan.';
    return {
      facility: here.facility,
      venueName: here.venue.name,
      price: cover.price,
      coveredByHmo: cover.covered,
      paid: cover.youPay,
      durationMinutes: minutes,
      findings,
      unexplained,
      message,
    };
  }

  /** The `treatment` system action finished: roll the outcome. */
  async complete(ctx: SimulationContext, activity: ActivityState): Promise<void> {
    const target = activity.targetId ?? '';
    const here = careVenueAt(activity.locationId);
    if (!here) return;
    if (target.startsWith(TREATMENT_TARGET.antenatal)) {
      await this.pregnancies.completeAntenatal(ctx, target.slice(TREATMENT_TARGET.antenatal.length), here.venue.id, here.facility);
      return;
    }
    if (!target.startsWith(TREATMENT_TARGET.condition)) return;
    const id = target.slice(TREATMENT_TARGET.condition.length);
    const condition = (await this.conditions.current(ctx)).find((candidate) => candidate.id === id);
    if (!condition || condition.conditionId === 'pregnancy') return;
    await this.resolve(ctx, condition, here, { startedAt: activity.startedAt, cost: activity.cost, autopilot: false });
  }

  /** Chronic medication runs out monthly; refill automatically (pharmacy price, HMO share) or the condition lapses. */
  async refillMedication(ctx: SimulationContext, dayIndex: number): Promise<void> {
    for (const condition of await this.conditions.current(ctx)) {
      if (condition.status !== 'chronic-managed' || condition.managedUntil === null || condition.managedUntil > ctx.time) continue;
      const definition = CONDITIONS[condition.conditionId];
      const cover = await this.insurance.cover(ctx, 'pharmacy', ctx.world.price(definition.monthlyMedication ?? 0, ctx.time));
      const paid = await ctx.wallet.tryPay(cover.youPay, 'health', `${definition.label} medication (1 month)`, `medication:${condition.id}:${dayIndex}`);
      if (paid) {
        await this.insurance.claim(ctx, cover);
        condition.managedUntil = ctx.time + MEDICATION_PERIOD;
        await ctx.manager.save(condition);
        await this.history.record(ctx, { kind: 'medication', conditionId: condition.conditionId, summary: `${definition.label} medication refilled`, cost: cover.youPay });
        ctx.report({ label: `${definition.label} medication`, amount: -cover.youPay, tone: 'neutral' });
        continue;
      }
      await this.conditions.lapse(ctx, condition);
      ctx.notify({
        kind: 'health',
        title: `Out of ${definition.label.toLowerCase()} medication`,
        body: `You couldn’t afford this month’s drugs (${formatNaira(cover.youPay)}), so your ${definition.label.toLowerCase()} is uncontrolled again. Get a refill at any pharmacy or hospital as soon as you can.`,
        tone: 'bad',
      });
    }
  }

  /**
   * Offline safety net ("loss that teaches, not punishes"). While the player isn't watching, the character looks after
   * themselves: anything severe or critical that could kill gets them onto a public ward no matter what (they pay, else
   * family pays, else charity care), and lingering milder illness gets the cheapest effective treatment they can afford.
   */
  async autopilotCare(ctx: SimulationContext, dayIndex: number): Promise<void> {
    if (isPlayerPresent(ctx) || (await this.admissions.current(ctx))) return;
    const current = await this.conditions.current(ctx);
    const emergency = current.find(
      (condition) =>
        condition.status === 'active' &&
        CONDITIONS[condition.conditionId].canBeFatal &&
        severityRank(condition.severity) >= severityRank('severe'),
    );
    if (emergency) {
      await this.emergencyAdmission(ctx, emergency, dayIndex);
      return;
    }
    for (const condition of current) {
      if (!this.dueForSelfCare(ctx, condition)) continue;
      await this.selfCare(ctx, condition, dayIndex);
      if (await this.admissions.current(ctx)) return;
    }
  }

  /**
   * Somebody rushes a critically ill character to the nearest public hospital (if a deposit can be raised and the
   * doctors manage to stabilise them). One more chance for a player who is watching but ignoring the warnings.
   */
  async rescue(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const character = ctx.character;
    // Away players are covered by the guaranteed emergency admission in autopilotCare.
    if (!isPlayerPresent(ctx) || character.travel || character.activity?.actionId === TREATMENT_ACTION_ID || (await this.admissions.current(ctx))) return;
    const critical = (await this.conditions.current(ctx)).find(
      (condition) => condition.status === 'active' && condition.severity === 'critical' && CONDITIONS[condition.conditionId].canBeFatal,
    );
    if (!critical) return;
    const rng = ctx.rng('rescue', critical.id, dayIndex);
    if (!rng.chance(RESCUE_CHANCE)) return;

    const venue = nearestCareVenue('hospital-public', (await this.planner.place(ctx, character.locationId)).districtId);
    if (!venue) return;
    const strike = this.strikeAt(ctx, ctx.time);
    if (!rng.chance(treatmentSuccessChance(critical.conditionId, 'critical', 'hospital-public', { diagnosed: true, strike }))) return;

    const cover = await this.insurance.cover(ctx, 'hospital-public', this.price(ctx, critical, 'hospital-public'));
    const paid = await ctx.wallet.tryPay(cover.youPay, 'health', `Emergency care — ${venue.name}`, `emergency:${critical.id}:${dayIndex}`);
    if (!paid) {
      ctx.notify({
        kind: 'health',
        title: 'They couldn’t raise the deposit',
        body: `Your neighbours tried to rush you to ${venue.name}, but the emergency deposit is ${formatNaira(cover.youPay)} and you don’t have it. Find the money — fast.`,
        tone: 'bad',
      });
      return;
    }
    await this.insurance.claim(ctx, cover);
    await this.conditions.diagnose(ctx, critical, venue.id);
    critical.treatedAt = ctx.time;
    await this.conditions.setSeverity(ctx, critical, 'moderate');
    character.activity = null;
    const days = admissionDaysFor(critical.conditionId, 'critical', 'hospital-public');
    const label = CONDITIONS[critical.conditionId].label;
    await this.admissions.admit(ctx, { venueId: venue.id, facility: 'hospital-public', days, reason: `Emergency: ${label}`, conditionRecordId: critical.id });
    await this.history.record(ctx, { kind: 'treatment', conditionId: critical.conditionId, summary: `Emergency treatment for ${label}`, cost: cover.youPay, venueId: venue.id });
    ctx.notify({
      kind: 'health',
      title: '🚑 Rushed to hospital',
      body: `Your neighbours rushed you to ${venue.name}. The doctors stabilised you and admitted you for ${days} days. Emergency deposit: ${formatNaira(cover.youPay)}.`,
      tone: 'neutral',
      amount: -cover.youPay,
    });
    ctx.report({ label: `Emergency admission at ${venue.name}`, amount: -cover.youPay, tone: 'bad' });
  }

  /** Roll a visit's outcome: fake drugs, failure, or success (cured, controlled, or admitted to the ward). */
  private async resolve(ctx: SimulationContext, condition: HealthConditionEntity, here: CareVenue, visit: Visit): Promise<void> {
    const definition = CONDITIONS[condition.conditionId];
    const label = this.conditions.label(condition, ctx.time);
    const tell = (notice: Notice): void => {
      if (visit.autopilot) ctx.report({ label: `${notice.title} — ${label}`, tone: notice.tone ?? 'neutral' });
      else ctx.notify(notice);
    };
    const strike = here.facility === 'hospital-public' && this.strikeAt(ctx, visit.startedAt);
    const trusted = here.facility === 'pharmacy' && this.profiles.isProtected(await this.profiles.get(ctx), 'trusted-pharmacy', ctx.time);
    const rng = ctx.rng('treatment', condition.id, visit.startedAt);
    const fake = !trusted && rng.chance(FACILITIES[here.facility].fakeDrugRisk);
    const success = !fake && rng.chance(treatmentSuccessChance(condition.conditionId, condition.severity, here.facility, { diagnosed: condition.diagnosed, strike }));

    if (!success) {
      await this.history.record(ctx, { kind: 'treatment-failed', conditionId: condition.conditionId, summary: `${label}: treatment at ${here.venue.name} didn’t work`, cost: visit.cost, venueId: here.venue.id });
      if (fake) setMoodModifier(ctx, { id: 'fake-drugs', label: 'Sold fake drugs', value: -5, until: ctx.time + MINUTES_PER_DAY });
      tell({
        kind: 'health',
        title: fake ? 'Those drugs were fake!' : 'The treatment didn’t work this time',
        body: fake
          ? `The drugs from ${here.venue.name} did nothing — NAFDAC has been warning about fakes. Try a hospital.`
          : here.facility === 'pharmacy'
            ? `The pharmacist did their best, but this needs a doctor. ${definition.advice}`
            : `The doctors at ${here.venue.name} couldn’t turn it around yet. You can try again${here.facility === 'hospital-public' ? ' or go private' : ''}.`,
        tone: 'bad',
      });
      return;
    }

    condition.treatedAt = ctx.time;
    await ctx.manager.save(condition);
    await this.history.record(ctx, { kind: 'treatment', conditionId: condition.conditionId, summary: `${label} treated at ${here.venue.name}`, cost: visit.cost, venueId: here.venue.id });
    if (condition.conditionId === 'burnout') {
      setMoodModifier(ctx, { id: 'doctors-orders', label: 'Doctor’s orders: rest', value: 8, until: ctx.time + 3 * MINUTES_PER_DAY });
      await this.profiles.resetStress(ctx);
    }

    const days = admissionDaysFor(condition.conditionId, condition.severity, here.facility);
    if (days > 0) {
      if (severityRank(condition.severity) > severityRank('moderate')) await this.conditions.setSeverity(ctx, condition, 'moderate');
      const admission = await this.admissions.admit(ctx, { venueId: here.venue.id, facility: here.facility, days, reason: `${label} treatment`, conditionRecordId: condition.id });
      const nightly = (await this.admissions.dto(ctx, admission)).dailyBill;
      ctx.notify({
        kind: 'health',
        title: `Admitted at ${here.venue.name}`,
        body: `The treatment is working. The doctors are keeping you on the ward for ${days} day${days > 1 ? 's' : ''}${nightly > 0 ? ` (${formatNaira(nightly)} per night)` : ''}.`,
        tone: 'neutral',
      });
      return;
    }
    if (definition.chronic) {
      await this.conditions.manage(ctx, condition, Math.max(ctx.time, condition.managedUntil ?? 0) + MEDICATION_PERIOD);
      tell({
        kind: 'health',
        title: `${definition.label} under control`,
        body: `You’re on medication now. It refills automatically every month (about ${formatNaira(ctx.world.price(definition.monthlyMedication ?? 0, ctx.time))}) — don’t stop taking it.`,
        tone: 'good',
      });
      return;
    }
    await this.conditions.recover(ctx, condition, 'treatment', here.venue.id);
    tell({ kind: 'health', title: 'Treatment worked', body: `You’re feeling much better after the treatment at ${here.venue.name}.`, tone: 'good' });
  }

  private async startAntenatal(ctx: SimulationContext, here: CareVenue, pregnancy: PregnancyEntity): Promise<TreatmentStartedDto> {
    if (here.facility === 'pharmacy') throw new GameRuleException('CANNOT_TREAT_HERE', 'Antenatal care happens at a hospital');
    const strike = here.facility === 'hospital-public' && this.strikeAt(ctx, ctx.time);
    const minutes = treatmentMinutes('pregnancy', 'mild', here.facility, strike);
    const quote = await this.pregnancies.antenatalQuote(ctx, pregnancy, here.facility);
    if (quote.youPay > 0) {
      await ctx.wallet.pay(quote.youPay, 'health', `Antenatal visit — ${here.venue.name}`, `antenatal:${pregnancy.id}:${ctx.time}`, { metadata: { covered: quote.covered } });
    }
    await this.insurance.claim(ctx, quote);
    this.engine.start(ctx, this.activity(ctx, here, `${TREATMENT_TARGET.antenatal}${pregnancy.id}`, minutes, quote.youPay));
    return {
      conditionId: pregnancy.id,
      label: 'Antenatal visit',
      severity: 'mild',
      facility: here.facility,
      venueName: here.venue.name,
      price: quote.price,
      coveredByHmo: quote.covered,
      paid: quote.youPay,
      durationMinutes: minutes,
      endsAt: ctx.time + minutes,
      successChance: 1,
      message: `${pregnancy.carrier === 'self' ? 'You’re' : `You and ${pregnancy.partnerName} are`} in the antenatal clinic queue (${formatGameDuration(minutes)}).${strike ? ' Resident doctors are on strike, so it’s slow.' : ''}`,
    };
  }

  /** Has an illness lingered long enough that an unattended character would go and get it seen to? */
  private dueForSelfCare(ctx: SimulationContext, condition: HealthConditionEntity): boolean {
    if (condition.status !== 'active' || condition.conditionId === 'pregnancy') return false;
    // Silent chronic conditions go unnoticed until someone checks.
    if (CONDITIONS[condition.conditionId].chronic && !condition.diagnosed) return false;
    const days = (ctx.time - condition.onsetAt) / MINUTES_PER_DAY;
    if (condition.severity === 'mild') return AUTOPILOT_MILD_CONDITIONS.includes(condition.conditionId) && days >= AUTOPILOT_MILD_AFTER_DAYS;
    return days >= AUTOPILOT_MODERATE_AFTER_DAYS;
  }

  /** The cheapest facility that can actually handle it (a pharmacy only within its limits) that the character can afford. */
  private async selfCare(ctx: SimulationContext, condition: HealthConditionEntity, dayIndex: number): Promise<void> {
    const district = (await this.planner.place(ctx, ctx.character.locationId)).districtId;
    const options: Array<{ readonly venue: VenueDefinition; readonly facility: CareFacilityType; readonly cover: CoverQuote }> = [];
    for (const facility of CARE_FACILITY_TYPES) {
      if (!this.effectiveAt(condition, facility)) continue;
      const venue = nearestCareVenue(facility, district);
      if (!venue) continue;
      const cover = await this.insurance.cover(ctx, facility, this.price(ctx, condition, facility));
      if (ctx.wallet.canAfford(cover.youPay)) options.push({ venue, facility, cover });
    }
    const choice = options.toSorted((a, b) => a.cover.youPay - b.cover.youPay)[0];
    if (!choice) return;
    const label = this.conditions.label(condition, ctx.time);
    const paid = await ctx.wallet.tryPay(choice.cover.youPay, 'health', `${label} treatment — ${choice.venue.name}`, `autopilot-treatment:${condition.id}:${dayIndex}`);
    if (!paid) return;
    await this.insurance.claim(ctx, choice.cover);
    if (choice.facility !== 'pharmacy') await this.conditions.diagnose(ctx, condition, choice.venue.id);
    ctx.report({ label: `Went to ${choice.venue.name} for ${label.toLowerCase()}`, amount: -choice.cover.youPay, tone: 'neutral' });
    await this.resolve(ctx, condition, { venue: choice.venue, facility: choice.facility }, { startedAt: ctx.time, cost: choice.cover.youPay, autopilot: true });
  }

  /** Can this facility treat it properly (not just sell something)? */
  private effectiveAt(condition: HealthConditionEntity, facility: CareFacilityType): boolean {
    if (!canTreatAt(condition.conditionId, condition.severity, facility).ok) return false;
    if (facility !== 'pharmacy') return true;
    const limit = CONDITIONS[condition.conditionId].pharmacyLimit;
    return limit !== null && severityRank(condition.severity) <= severityRank(limit);
  }

  /** Get a seriously ill, unattended character onto the nearest public ward — poverty must never make this fatal. */
  private async emergencyAdmission(ctx: SimulationContext, condition: HealthConditionEntity, dayIndex: number): Promise<void> {
    const venue = nearestCareVenue('hospital-public', (await this.planner.place(ctx, ctx.character.locationId)).districtId);
    if (!venue) return;
    const definition = CONDITIONS[condition.conditionId];
    const days = Math.max(1, admissionDaysFor(condition.conditionId, condition.severity, 'hospital-public'));
    const cover = await this.insurance.cover(ctx, 'hospital-public', this.price(ctx, condition, 'hospital-public'));
    const bill = await this.settleEmergencyBill(ctx, condition, venue.name, cover, dayIndex);

    await this.conditions.diagnose(ctx, condition, venue.id);
    condition.treatedAt = ctx.time;
    await this.conditions.setSeverity(ctx, condition, 'moderate');
    ctx.character.activity = null;
    await this.admissions.admit(ctx, {
      venueId: venue.id,
      facility: 'hospital-public',
      days,
      reason: `Emergency: ${definition.label}`,
      conditionRecordId: condition.id,
      // Family- and charity-funded stays are a package: no nightly ward bill on top.
      dailyRate: bill.payer === 'self' ? undefined : 0,
    });
    await this.history.record(ctx, {
      kind: 'treatment',
      conditionId: condition.conditionId,
      summary: `Emergency admission for ${definition.label} (${bill.payer === 'self' ? 'self-paid' : bill.payer === 'family' ? 'family paid' : 'charity care'})`,
      cost: bill.payer === 'self' ? bill.amount : 0,
      venueId: venue.id,
    });
    const stay = `You’re on the ward for ${days} day${days > 1 ? 's' : ''}.`;
    ctx.notify(
      bill.payer === 'self'
        ? { kind: 'health', title: '🚑 Rushed to hospital', body: `You were too ill to look after yourself, so your neighbours rushed you to ${venue.name}. Emergency care: ${formatNaira(bill.amount)}. ${stay}`, tone: 'neutral', amount: -bill.amount }
        : bill.payer === 'family'
          ? { kind: 'family', title: `🚑 Your family rushed you to ${venue.name} and paid ${formatNaira(bill.amount)}`, body: `You were seriously ill and couldn’t afford care, so family stepped in. ${stay} You’ll hear about it at every family meeting.`, tone: 'neutral' }
          : { kind: 'health', title: `🚑 Charity care at ${venue.name}`, body: `Family couldn’t help again so soon, so the hospital’s social welfare unit waived the ${formatNaira(bill.amount)} bill. You’re safe — but owing everybody stings. ${stay}`, tone: 'neutral' },
    );
    ctx.report({ label: `Emergency admission at ${venue.name}`, amount: bill.payer === 'self' ? -bill.amount : undefined, tone: 'bad' });
  }

  /** Who pays for an emergency: the character, else family (once a game month, as unearned support), else charity. */
  private async settleEmergencyBill(ctx: SimulationContext, condition: HealthConditionEntity, venueName: string, cover: CoverQuote, dayIndex: number): Promise<EmergencyBill> {
    const memo = `Emergency care — ${venueName}`;
    const key = `emergency:${condition.id}:${dayIndex}`;
    if (await ctx.wallet.tryPay(cover.youPay, 'health', memo, key)) {
      await this.insurance.claim(ctx, cover);
      return { payer: 'self', amount: cover.youPay };
    }
    const profile = await this.profiles.get(ctx);
    if (profile.familyRescueAt === null || ctx.time - profile.familyRescueAt >= FAMILY_RESCUE_COOLDOWN) {
      const shortfall = cover.youPay - ctx.wallet.cash;
      await ctx.wallet.receive(shortfall, 'family-support', 'Family paid your emergency hospital bill', `family-rescue:${condition.id}:${dayIndex}`, { income: 'unearned' });
      if (await ctx.wallet.tryPay(cover.youPay, 'health', memo, key)) {
        await this.insurance.claim(ctx, cover);
        profile.familyRescueAt = ctx.time;
        await this.profiles.save(ctx, profile);
        return { payer: 'family', amount: shortfall };
      }
    }
    setMoodModifier(ctx, { id: 'charity-ward', label: 'Treated on the charity ward', value: CHARITY_MOOD_PENALTY, until: ctx.time + 3 * MINUTES_PER_DAY });
    ctx.character.connections = Math.max(0, ctx.character.connections - CHARITY_CONNECTIONS_PENALTY);
    return { payer: 'charity', amount: cover.youPay };
  }

  /** Treatment price at today's prices (0 when the facility can't treat it). */
  private price(ctx: SimulationContext, condition: HealthConditionEntity, facility: CareFacilityType): number {
    const base = treatmentBasePrice(condition.conditionId, condition.severity, facility);
    return base === null ? 0 : ctx.world.price(base, ctx.time);
  }

  private activity(ctx: SimulationContext, here: CareVenue, targetId: string, minutes: number, cost: number): ActivityState {
    return { actionId: TREATMENT_ACTION_ID, startedAt: ctx.time, endsAt: ctx.time + minutes, locationId: here.venue.id, targetId, cost };
  }

  private startMessage(here: CareVenue, condition: HealthConditionEntity, minutes: number, strike: boolean): string {
    const wait = formatGameDuration(minutes);
    if (here.facility === 'pharmacy') {
      const limit = CONDITIONS[condition.conditionId].pharmacyLimit;
      const tooSerious = limit !== null && severityRank(condition.severity) > severityRank(limit);
      return tooSerious
        ? `The pharmacist is selling you something, but they’ve warned you: this needs a doctor. (${wait})`
        : `The pharmacist is sorting you out (${wait}). Take the full dose o.`;
    }
    if (strike) return `Resident doctors are on strike — the queue at ${here.venue.name} is very long (${wait}).`;
    return here.facility === 'hospital-public'
      ? `You’re in the queue at ${here.venue.name}. Bring patience (${wait}).`
      : `A doctor will see you shortly at ${here.venue.name} (${wait}).`;
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

  private assertAtOpenFacility(ctx: SimulationContext): CareVenue {
    const here = careVenueAt(ctx.character.locationId);
    if (!here) throw new GameRuleException('WRONG_PLACE', 'Go to a pharmacy or hospital first — check the Health app for the nearest one');
    if (!isCareVenueOpen(here.venue, ctx.time)) throw new GameRuleException('CLOSED', `${here.venue.name} is closed right now`);
    return here;
  }
}
