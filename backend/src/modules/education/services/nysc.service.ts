import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  cityOfVenue,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  NYSC_EXEMPTION_AGE,
  NYSC_MONTHLY_ALLOWANCE,
  NYSC_PPA_END_HOUR,
  NYSC_PPA_START_HOUR,
  NYSC_SERVICE_DAYS,
  VENUES,
  findCourse,
  findVenue,
  formatDate,
  formatNaira,
  toDateParts,
  yearsBetween,
  type NyscServiceDto,
  type NyscStatus,
  type VenueDefinition,
  type VenueType,
} from '@insidelife/shared';
import { GameRuleException } from '../../../common/exceptions/domain.exception.js';
import type { ScheduleBlock, Segment } from '../../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../../simulation/simulation-context.js';
import { WORK_PRIORITY, addMoodModifier, dayWindow, isWorkingDay } from '../education.helpers.js';
import type { EnrolmentEntity } from '../entities/enrolment.entity.js';
import { NyscServiceEntity } from '../entities/nysc-service.entity.js';
import { EDUCATION_MEMO, EducationStore } from './education-store.service.js';

/** Monthly PPA stipend on top of the federal allowance (₦, before the price index): private offices pay best. */
const PPA_STIPEND: Readonly<Partial<Record<VenueType, number>>> = { office: 30_000, government: 10_000, school: 5_000 };
const PPA_VENUES: readonly VenueDefinition[] = VENUES.filter((venue) => venue.type in PPA_STIPEND && cityOfVenue(venue) === 'lagos');
const PPA_MINUTES_PER_DAY = (NYSC_PPA_END_HOUR - NYSC_PPA_START_HOUR) * MINUTES_PER_HOUR;
/** Thursday is Community Development Service day. */
const CDS_WEEKDAY = 3;

/**
 * National Youth Service Corps: university and HND graduates under 30 serve a year at a Place of Primary Assignment
 * (weekday routine), earning the ₦77,000 federal allowance plus a PPA stipend scaled by attendance.
 */
@Injectable()
export class NyscService {
  constructor(private readonly store: EducationStore) {}

  async status(ctx: SimulationContext): Promise<NyscStatus> {
    const service = await this.store.nysc(ctx);
    if (service) return service.status;
    return (await this.qualifyingDegree(ctx)) ? 'pending' : 'not-eligible';
  }

  async register(ctx: SimulationContext): Promise<NyscServiceEntity> {
    const existing = await this.store.nysc(ctx);
    if (existing?.status === 'serving') throw new GameRuleException('ALREADY_SERVING', 'You’re already a corps member. Corper wee!');
    if (existing?.status === 'completed') throw new GameRuleException('ALREADY_SERVED', 'You don pass out already. Your certificate dey your file.');
    if (existing?.status === 'exempt') throw new GameRuleException('EXEMPT', 'You’re exempted from NYSC — your exemption letter works for jobs.');

    const degree = await this.qualifyingDegree(ctx);
    if (!degree) throw new GameRuleException('NOT_ELIGIBLE', 'NYSC is for university and HND graduates. Finish your programme first.');
    if (this.ageAt(ctx, degree.graduatedAt ?? ctx.time) >= NYSC_EXEMPTION_AGE) {
      return this.exempt(ctx, degree);
    }

    const rng = ctx.rng('nysc', degree.id);
    const ppa = rng.pick(PPA_VENUES);
    const { year, month } = toDateParts(ctx.time);
    const batch = month <= 4 ? 'A' : month <= 8 ? 'B' : 'C';
    const service = ctx.manager.create(NyscServiceEntity, {
      id: randomUUID(),
      characterId: ctx.character.id,
      enrolmentId: degree.id,
      status: 'serving',
      stateCode: `LA/${String(year % 100).padStart(2, '0')}${batch}/${rng.int(1000, 9999)}`,
      ppaVenueId: ppa.id,
      ppaStipend: ctx.world.price(PPA_STIPEND[ppa.type] ?? 0, ctx.time),
      startsAt: ctx.time,
      endsAt: ctx.time + NYSC_SERVICE_DAYS * MINUTES_PER_DAY,
      ppaMinutesScheduled: 0,
      ppaMinutesAttended: 0,
      completedAt: null,
    });
    await this.store.insert(ctx, EDUCATION_MEMO.nysc, service);
    ctx.invalidate('schedule');
    ctx.notify({
      kind: 'education',
      title: 'Corper wee! 🫡',
      body: `State code ${service.stateCode}. You’ve been posted to ${ppa.name} — weekdays 8am-4pm, CDS on Thursdays. Allowance: ${formatNaira(NYSC_MONTHLY_ALLOWANCE)} + ${formatNaira(service.ppaStipend)} PPA stipend monthly. Passing out ${formatDate(service.endsAt ?? ctx.time)}.`,
      tone: 'good',
    });
    return service;
  }

  /** Called when a degree is awarded: 30+ at graduation means an exemption letter instead of service. */
  async onGraduated(ctx: SimulationContext, degree: EnrolmentEntity): Promise<void> {
    if (!this.isQualifying(degree) || (await this.store.nysc(ctx))) return;
    if (this.ageAt(ctx, degree.graduatedAt ?? ctx.time) >= NYSC_EXEMPTION_AGE) {
      await this.exempt(ctx, degree);
      return;
    }
    ctx.notify({
      kind: 'education',
      title: 'NYSC is calling',
      body: 'You’re now eligible for national service. Register in the School app to get your call-up letter.',
      tone: 'neutral',
    });
  }

  async ppaBlock(ctx: SimulationContext, dayIndex: number): Promise<ScheduleBlock | null> {
    const service = await this.store.nysc(ctx);
    if (!service || service.status !== 'serving' || !service.ppaVenueId) return null;
    const window = dayWindow(dayIndex, NYSC_PPA_START_HOUR, NYSC_PPA_END_HOUR);
    if (window.startsAt < service.startsAt || (service.endsAt !== null && window.startsAt >= service.endsAt)) return null;
    if (!isWorkingDay(ctx, window.startsAt)) return null;
    const cds = toDateParts(window.startsAt).weekday === CDS_WEEKDAY;
    return {
      kind: 'work',
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      locationId: service.ppaVenueId,
      label: cds ? 'NYSC CDS meeting' : `PPA at ${findVenue(service.ppaVenueId)?.name ?? 'your PPA'}`,
      priority: WORK_PRIORITY,
      commute: true,
    };
  }

  async recordSegment(ctx: SimulationContext, segment: Segment): Promise<void> {
    if (segment.kind !== 'work') return;
    const service = await this.store.nysc(ctx);
    if (!service || service.status !== 'serving' || segment.locationId !== service.ppaVenueId) return;
    service.ppaMinutesAttended += segment.endsAt - segment.startsAt;
    await this.store.save(ctx, service);
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const service = await this.store.nysc(ctx);
    if (!service || service.status !== 'serving') return;
    if (await this.ppaBlock(ctx, dayIndex)) service.ppaMinutesScheduled += PPA_MINUTES_PER_DAY;
    if (service.endsAt !== null && ctx.time >= service.endsAt) {
      service.status = 'completed';
      service.completedAt = ctx.time;
      ctx.invalidate('schedule');
      addMoodModifier(ctx, 'nysc-passing-out', 'Passed out of NYSC', 10, 7);
      ctx.notify({
        kind: 'achievement',
        title: 'Passing out parade! 🎉',
        body: 'You’ve completed national service. Your Certificate of National Service unlocks graduate jobs everywhere.',
        tone: 'good',
      });
      ctx.report({ label: 'Completed NYSC', tone: 'good' });
    }
    await this.store.save(ctx, service);
  }

  /** Allowance for the month that just ended (also paid in the month service ends). */
  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const service = await this.store.nysc(ctx);
    if (!service || service.startsAt >= ctx.time) return;
    const servedThisMonth = service.status === 'serving' || (service.status === 'completed' && service.completedAt === ctx.time);
    if (!servedThisMonth) return;

    const attendance = service.ppaMinutesScheduled > 0 ? Math.min(1, service.ppaMinutesAttended / service.ppaMinutesScheduled) : 1;
    const stipend = Math.round(service.ppaStipend * attendance);
    const total = NYSC_MONTHLY_ALLOWANCE + stipend;
    await ctx.wallet.receive(total, 'salary', 'NYSC allowance + PPA stipend', `nysc:${service.id}:${monthIndex}`, { income: 'earned' });
    service.ppaMinutesScheduled = 0;
    service.ppaMinutesAttended = 0;
    await this.store.save(ctx, service);
    ctx.notify({
      kind: 'salary',
      title: 'Alert! NYSC allowance 💸',
      body: `${formatNaira(NYSC_MONTHLY_ALLOWANCE)} “allawee” + ${formatNaira(stipend)} from your PPA${attendance < 0.8 ? ' (cut for absence)' : ''}.`,
      tone: 'good',
      amount: total,
    });
  }

  async toDto(ctx: SimulationContext): Promise<NyscServiceDto> {
    const service = await this.store.nysc(ctx);
    return {
      status: await this.status(ctx),
      stateCode: service?.stateCode ?? null,
      ppaVenueId: service?.ppaVenueId ?? null,
      ppaName: service?.ppaVenueId ? (findVenue(service.ppaVenueId)?.name ?? null) : null,
      startsAt: service?.startsAt ?? null,
      endsAt: service?.endsAt ?? null,
      monthlyAllowance: NYSC_MONTHLY_ALLOWANCE,
      ppaStipend: service?.ppaStipend ?? 0,
    };
  }

  // --- internals -------------------------------------------------------------------------------------------------

  /** Latest bachelor's degree or HND (ND holders don't serve). */
  private async qualifyingDegree(ctx: SimulationContext): Promise<EnrolmentEntity | null> {
    const degrees = (await this.store.graduated(ctx)).filter((degree) => this.isQualifying(degree));
    return degrees[degrees.length - 1] ?? null;
  }

  private isQualifying(degree: EnrolmentEntity): boolean {
    const credential = findCourse(degree.courseId)?.credential;
    return degree.status === 'graduated' && (credential === 'bachelors' || credential === 'hnd');
  }

  private ageAt(ctx: SimulationContext, t: number): number {
    return yearsBetween(ctx.character.bornAt, t);
  }

  private async exempt(ctx: SimulationContext, degree: EnrolmentEntity): Promise<NyscServiceEntity> {
    const service = ctx.manager.create(NyscServiceEntity, {
      id: randomUUID(),
      characterId: ctx.character.id,
      enrolmentId: degree.id,
      status: 'exempt',
      stateCode: null,
      ppaVenueId: null,
      ppaStipend: 0,
      startsAt: ctx.time,
      endsAt: null,
      ppaMinutesScheduled: 0,
      ppaMinutesAttended: 0,
      completedAt: ctx.time,
    });
    await this.store.insert(ctx, EDUCATION_MEMO.nysc, service);
    ctx.notify({
      kind: 'education',
      title: 'NYSC exemption letter 📄',
      body: `You graduated at ${NYSC_EXEMPTION_AGE}+, so you’re exempted from national service. Straight to the job market!`,
      tone: 'neutral',
    });
    return service;
  }
}
