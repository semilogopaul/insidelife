import { Injectable } from '@nestjs/common';
import {
  CONDITIONS,
  FACILITIES,
  MINUTES_PER_DAY,
  findVenue,
  formatNaira,
  startOfDay,
  type AdmissionDto,
  type CareFacilityType,
} from '@insidelife/shared';
import type { TravelState } from '../characters/entities/character.entity.js';
import type { ScheduleBlock } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { ConditionsService } from './conditions.service.js';
import { HospitalAdmissionEntity } from './entities/hospital-admission.entity.js';
import { DISCHARGE_MINUTE_OF_DAY, HEALTH_MEMO, MEDICATION_PERIOD } from './health.constants.js';
import { InsuranceService } from './insurance.service.js';
import { MedicalHistoryService } from './medical-history.service.js';
import { isPlayerPresent } from './player-presence.js';

export interface AdmitParams {
  readonly venueId: string;
  readonly facility: CareFacilityType;
  readonly days: number;
  readonly reason: string;
  readonly conditionRecordId?: string | null;
  readonly pregnancyId?: string | null;
  /** Override the ward rate (0 for package deals like deliveries). */
  readonly dailyRate?: number;
}

/** Hospital blocks outrank work, lectures and trips. */
const ADMISSION_PRIORITY = 100;

/**
 * Hospital admissions: the ward stay after serious treatment or a delivery. While admitted the planner keeps the
 * character on the ward (a `hospital` block without commute), the ward bill is charged nightly (HMO covers its share)
 * and discharge happens mid-morning. Leaving early or failing to pay (while the player is watching) ends the stay with
 * the condition unresolved; while the player is away an unpaid night is waived instead.
 */
@Injectable()
export class AdmissionsService {
  constructor(
    private readonly conditions: ConditionsService,
    private readonly insurance: InsuranceService,
    private readonly history: MedicalHistoryService,
  ) {}

  async current(ctx: SimulationContext): Promise<HospitalAdmissionEntity | null> {
    return ctx.memo(HEALTH_MEMO.admission, () =>
      ctx.manager.findOne(HospitalAdmissionEntity, { where: { characterId: ctx.character.id, status: 'admitted' } }),
    );
  }

  /** Condition ids currently handled on a ward (no untreated course, no symptom damage). */
  async admittedConditionIds(ctx: SimulationContext): Promise<ReadonlySet<string>> {
    const admission = await this.current(ctx);
    return new Set(admission?.conditionRecordId ? [admission.conditionRecordId] : []);
  }

  async admit(ctx: SimulationContext, params: AdmitParams): Promise<HospitalAdmissionEntity> {
    const days = Math.max(1, params.days);
    let dischargeAt = startOfDay(ctx.time + days * MINUTES_PER_DAY) + DISCHARGE_MINUTE_OF_DAY;
    if (dischargeAt <= ctx.time) dischargeAt = ctx.time + days * MINUTES_PER_DAY;

    const existing = await this.current(ctx);
    if (existing) {
      // Already on a ward: the stay simply gets longer.
      existing.dischargeAt = Math.max(existing.dischargeAt, dischargeAt);
      existing.conditionRecordId ??= params.conditionRecordId ?? null;
      await ctx.manager.save(existing);
      this.changed(ctx);
      return existing;
    }

    const admission = await ctx.manager.save(
      ctx.manager.create(HospitalAdmissionEntity, {
        characterId: ctx.character.id,
        venueId: params.venueId,
        facility: params.facility,
        conditionRecordId: params.conditionRecordId ?? null,
        pregnancyId: params.pregnancyId ?? null,
        reason: params.reason.slice(0, 120),
        admittedAt: ctx.time,
        dischargeAt,
        dailyRate: params.dailyRate ?? FACILITIES[params.facility].admissionPerDay ?? 0,
        status: 'admitted',
        endedAt: null,
      }),
    );
    this.changed(ctx);
    await this.history.record(ctx, { kind: 'admission', summary: `Admitted: ${params.reason} (${days} day${days > 1 ? 's' : ''})`, venueId: params.venueId });
    return admission;
  }

  /** Routine block that keeps the character on the ward for the part of `day` they are admitted. */
  async blocksForDay(ctx: SimulationContext, day: number): Promise<readonly ScheduleBlock[]> {
    const admission = await this.current(ctx);
    if (!admission) return [];
    const dayStart = day * MINUTES_PER_DAY;
    const startsAt = Math.max(admission.admittedAt, dayStart);
    const endsAt = Math.min(admission.dischargeAt, dayStart + MINUTES_PER_DAY);
    if (endsAt <= startsAt) return [];
    return [
      {
        kind: 'hospital',
        startsAt,
        endsAt,
        locationId: admission.venueId,
        label: `Admitted at ${findVenue(admission.venueId)?.name ?? 'the hospital'}`,
        priority: ADMISSION_PRIORITY,
        commute: false,
      },
    ];
  }

  /** Nightly ward bill and mid-morning discharge. */
  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const admission = await this.current(ctx);
    if (!admission) return;
    if (ctx.time >= admission.dischargeAt) {
      await this.discharge(ctx, admission);
      return;
    }
    if (admission.dailyRate <= 0) return;

    const venueName = findVenue(admission.venueId)?.name ?? 'the hospital';
    const quote = await this.insurance.cover(ctx, admission.facility, ctx.world.price(admission.dailyRate, ctx.time));
    const paid = await ctx.wallet.tryPay(quote.youPay, 'health', `Ward bill — ${venueName}`, `admission:${admission.id}:${dayIndex}`, {
      metadata: { admissionId: admission.id, covered: quote.covered },
    });
    if (paid) {
      await this.insurance.claim(ctx, quote);
      return;
    }
    if (!isPlayerPresent(ctx)) {
      // Nobody gets put out on the street while their player is away: social welfare covers the night.
      ctx.report({ label: `Ward bill at ${venueName} waived (social welfare)`, tone: 'neutral' });
      return;
    }
    await this.end(ctx, admission, 'left');
    ctx.notify({
      kind: 'health',
      title: 'Discharged early — bill unpaid',
      body: `You couldn’t pay the ${formatNaira(quote.youPay)} ward bill at ${venueName}, so they let you go home before you were fully well. Keep an eye on your symptoms and go back when you can.`,
      tone: 'bad',
    });
  }

  /**
   * Going home after the discharge time is the normal end of a stay (the ward block ends mid-morning, the books close at
   * day end); leaving mid-stay counts as discharging yourself against medical advice.
   */
  async onTravel(ctx: SimulationContext, travel: TravelState): Promise<void> {
    const admission = await this.current(ctx);
    if (!admission || travel.toLocationId === admission.venueId || travel.departAt < admission.admittedAt) return;
    if (travel.departAt >= admission.dischargeAt) {
      await this.discharge(ctx, admission);
      return;
    }
    await this.end(ctx, admission, 'left');
    ctx.notify({
      kind: 'health',
      title: 'You discharged yourself',
      body: 'You left the ward against medical advice. Whatever they were treating isn’t finished — go back if you feel worse.',
      tone: 'bad',
    });
  }

  async endOnDeath(ctx: SimulationContext): Promise<void> {
    const admission = await this.current(ctx);
    if (admission) await this.end(ctx, admission, 'left');
  }

  async dto(ctx: SimulationContext, admission: HospitalAdmissionEntity): Promise<AdmissionDto> {
    const quote = await this.insurance.cover(ctx, admission.facility, ctx.world.price(admission.dailyRate, ctx.time));
    return {
      id: admission.id,
      venueId: admission.venueId,
      venueName: findVenue(admission.venueId)?.name ?? 'Hospital',
      reason: admission.reason,
      admittedAt: admission.admittedAt,
      dischargeAt: admission.dischargeAt,
      dailyBill: admission.dailyRate > 0 ? quote.youPay : 0,
    };
  }

  private async discharge(ctx: SimulationContext, admission: HospitalAdmissionEntity): Promise<void> {
    admission.status = 'discharged';
    admission.endedAt = admission.dischargeAt;
    await ctx.manager.save(admission);
    this.changed(ctx);

    const venueName = findVenue(admission.venueId)?.name ?? 'the hospital';
    const condition = admission.conditionRecordId
      ? (await this.conditions.current(ctx)).find((candidate) => candidate.id === admission.conditionRecordId)
      : undefined;
    if (condition) {
      if (CONDITIONS[condition.conditionId].chronic) await this.conditions.manage(ctx, condition, ctx.time + MEDICATION_PERIOD);
      else await this.conditions.recover(ctx, condition, 'discharge', admission.venueId);
    }
    await this.history.record(ctx, { kind: 'discharge', summary: `Discharged from ${venueName}`, venueId: admission.venueId });
    if (admission.pregnancyId) return;
    ctx.notify({ kind: 'health', title: 'Discharged — welcome back!', body: `The doctors at ${venueName} have discharged you. Take it easy for a few days.`, tone: 'good' });
    ctx.report({ label: `Discharged from ${venueName}`, tone: 'good' });
  }

  private async end(ctx: SimulationContext, admission: HospitalAdmissionEntity, status: 'left'): Promise<void> {
    admission.status = status;
    admission.endedAt = ctx.time;
    await ctx.manager.save(admission);
    this.changed(ctx);
    await this.history.record(ctx, { kind: 'discharge', summary: 'Left the hospital before discharge', venueId: admission.venueId });
  }

  private changed(ctx: SimulationContext): void {
    ctx.invalidate(HEALTH_MEMO.admission);
    ctx.invalidate('schedule');
  }
}
