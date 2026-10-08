import { Injectable, Logger } from '@nestjs/common';
import {
  CARE_FACILITY_TYPES,
  CONDITIONS,
  FACILITIES,
  checkUpMinutes,
  findVenue,
  healthBand,
  isConditionId,
  type CheckUpResponseDto,
  type FacilityDto,
  type HealthConditionDto,
  type HealthDriftBreakdown,
  type HealthViewDto,
  type HmoPlanId,
  type MedicalRecordDto,
  type TreatmentResponseDto,
} from '@insidelife/shared';
import type { ConditionSeverity as PortSeverity, HealthPort } from '../../common/ports/health.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationEngine } from '../simulation/simulation-engine.service.js';
import { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import { AdmissionsService } from './admissions.service.js';
import { careVenueAt, isCareVenueOpen, nearestCareVenue } from './care-venues.js';
import { ConditionsService } from './conditions.service.js';
import type { HealthConditionEntity } from './entities/health-condition.entity.js';
import { HealthProfileService } from './health-profile.service.js';
import { InsuranceService } from './insurance.service.js';
import { MedicalHistoryService } from './medical-history.service.js';
import { PregnancyService } from './pregnancy.service.js';
import { TreatmentService } from './treatment.service.js';

const HISTORY_LIMIT = 15;
const NO_DRIFT: HealthDriftBreakdown = { lifestyle: 0, mood: 0, fitness: 0, age: 0, conditions: 0, deprivation: 0, recovery: 0, care: 0, total: 0 };

/**
 * The health domain's front door: implements `HEALTH_PORT` for other domains and builds the Health app view.
 * Player commands delegate to the focused services (treatment, insurance).
 */
@Injectable()
export class HealthService implements HealthPort {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly conditions: ConditionsService,
    private readonly treatment: TreatmentService,
    private readonly insurance: InsuranceService,
    private readonly admissions: AdmissionsService,
    private readonly pregnancies: PregnancyService,
    private readonly history: MedicalHistoryService,
    private readonly profiles: HealthProfileService,
    private readonly engine: SimulationEngine,
    private readonly planner: TimelinePlanner,
  ) {}

  // ----- HEALTH_PORT ----------------------------------------------------------------------------------------------

  async inflict(ctx: SimulationContext, conditionId: string, severity: PortSeverity = 'mild'): Promise<void> {
    if (!isConditionId(conditionId) || conditionId === 'pregnancy') {
      this.logger.warn(`Ignoring inflict of unknown condition "${conditionId}"`);
      return;
    }
    await this.conditions.inflict(ctx, conditionId, severity, { source: 'port' });
  }

  async hasCondition(ctx: SimulationContext, conditionId: string): Promise<boolean> {
    return isConditionId(conditionId) && (await this.conditions.has(ctx, conditionId));
  }

  /** Female characters carry the pregnancy themselves; for male characters it is tracked as their partner's. */
  async conceive(ctx: SimulationContext, partnerName: string): Promise<void> {
    await this.pregnancies.conceive(ctx, partnerName);
  }

  /** True while a pregnancy is ongoing — the character's own, or their partner's when tracked through them. */
  async isPregnant(ctx: SimulationContext): Promise<boolean> {
    return (await this.pregnancies.current(ctx)) !== null;
  }

  // ----- Player commands ------------------------------------------------------------------------------------------

  async startTreatment(ctx: SimulationContext, conditionReference: string): Promise<TreatmentResponseDto> {
    const treatment = await this.treatment.start(ctx, conditionReference);
    return { treatment, health: await this.view(ctx) };
  }

  async checkUp(ctx: SimulationContext): Promise<CheckUpResponseDto> {
    const checkUp = await this.treatment.checkUp(ctx);
    return { checkUp, health: await this.view(ctx) };
  }

  async joinInsurance(ctx: SimulationContext, planId: HmoPlanId): Promise<HealthViewDto> {
    await this.insurance.join(ctx, planId);
    return this.view(ctx);
  }

  async cancelInsurance(ctx: SimulationContext): Promise<HealthViewDto> {
    await this.insurance.cancel(ctx);
    return this.view(ctx);
  }

  // ----- View -----------------------------------------------------------------------------------------------------

  async view(ctx: SimulationContext): Promise<HealthViewDto> {
    const character = ctx.character;
    const admission = await this.admissions.current(ctx);
    const membership = await this.insurance.membership(ctx);
    const pregnancy = await this.pregnancies.current(ctx);
    const profile = await this.profiles.get(ctx);
    const strike = this.treatment.strikeAt(ctx, ctx.time);

    const conditions: HealthConditionDto[] = [];
    for (const condition of await this.conditions.current(ctx)) {
      conditions.push(await this.conditionDto(ctx, condition, admission?.conditionRecordId === condition.id));
    }

    const here = careVenueAt(character.locationId);
    const district = (await this.planner.place(ctx, character.locationId)).districtId;
    const facilities: FacilityDto[] = [];
    for (const type of CARE_FACILITY_TYPES) {
      const nearest = nearestCareVenue(type, district);
      const cover = await this.insurance.cover(ctx, type, ctx.world.price(FACILITIES[type].checkUpPrice, ctx.time));
      facilities.push({
        type,
        label: FACILITIES[type].label,
        blurb: FACILITIES[type].blurb,
        nearest: nearest ? { venueId: nearest.id, name: nearest.name, districtId: nearest.districtId, open: isCareVenueOpen(nearest, ctx.time) } : null,
        checkUpPrice: cover.price,
        checkUpYouPay: cover.youPay,
        checkUpMinutes: checkUpMinutes(type, strike),
        strike: strike && type === 'hospital-public',
      });
    }

    const health = Math.round(character.health);
    return {
      asOf: ctx.time,
      health,
      healthLabel: healthBand(health).label,
      fitness: Math.round(character.fitness),
      mood: this.engine.mood(ctx),
      energyCap: await this.conditions.energyCap(ctx, ctx.time),
      drift: profile.lastDrift ?? NO_DRIFT,
      conditions,
      admission: admission ? await this.admissions.dto(ctx, admission) : null,
      insurance: membership ? this.insurance.membershipDto(ctx, membership) : null,
      plans: this.insurance.planDtos(ctx),
      pregnancy: pregnancy ? await this.pregnancies.dto(ctx, pregnancy) : null,
      facilities,
      here: here ? { venueId: here.venue.id, venueName: here.venue.name, facility: here.facility, open: isCareVenueOpen(here.venue, ctx.time) } : null,
      doctorsStrike: strike,
      history: (await this.history.recent(ctx, HISTORY_LIMIT)).map(
        (record): MedicalRecordDto => ({
          id: record.id,
          kind: record.kind,
          summary: record.summary,
          cost: record.cost,
          venueName: record.venueId ? (findVenue(record.venueId)?.name ?? null) : null,
          gameMinute: record.gameMinute,
        }),
      ),
    };
  }

  private async conditionDto(ctx: SimulationContext, condition: HealthConditionEntity, admitted: boolean): Promise<HealthConditionDto> {
    const definition = CONDITIONS[condition.conditionId];
    const symptoms = this.conditions.symptoms(condition, ctx.time);
    const known = condition.diagnosed;
    return {
      ...this.conditions.summary(condition, ctx.time),
      status: condition.status,
      kind: known ? definition.kind : 'unknown',
      emoji: known ? definition.emoji : '🤒',
      chronic: known && definition.chronic,
      onsetAt: condition.onsetAt,
      treatedAt: condition.treatedAt,
      symptoms: { description: symptoms.description, energyCap: symptoms.energyCap, mood: symptoms.mood },
      advice: known ? definition.advice : 'Get a check-up at a pharmacy or hospital to find out what this is.',
      admitted,
      managedUntil: condition.managedUntil,
      quotes: await this.treatment.quotes(ctx, condition),
    };
  }
}
