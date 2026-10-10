import { Injectable, type OnModuleInit } from '@nestjs/common';
import { LifeEventsService } from '../events/life-events.service.js';
import { findJob, type ActionDefinition, type ProfileContext } from '@insidelife/shared';
import type { ActivityState } from '../characters/entities/character.entity.js';
import type { ScheduleBlock, Segment, SimulationSystem, SummaryContribution } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { ApplicationsService } from './applications.service.js';
import { AttendanceService } from './attendance.service.js';
import { employerOf, titleOf } from './career.presenter.js';
import { CareerStore, EMPLOYMENT_ROWS } from './career.store.js';
import { EmploymentService } from './employment.service.js';
import { FreelanceService } from './freelance.service.js';
import { PayrollService } from './payroll.service.js';
import { PromotionsService } from './promotions.service.js';
import { levelPay } from './rules/payroll.js';

/** Seniority adds a little stress on top of the job's base level. */
const STRESS_PER_LEVEL = 0.03;

/**
 * Careers in the simulation: work blocks on the routine, attendance, application decisions, performance and
 * discipline, licences and promotion nudges, monthly payroll, freelance gigs, job stress, status and summary.
 */
@Injectable()
export class CareersSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'careers';
  readonly order = 200;
  readonly rowProbes = [EMPLOYMENT_ROWS];

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly store: CareerStore,
    private readonly attendance: AttendanceService,
    private readonly applications: ApplicationsService,
    private readonly employment: EmploymentService,
    private readonly payroll: PayrollService,
    private readonly promotions: PromotionsService,
    private readonly freelance: FreelanceService,
    private readonly lifeEvents: LifeEventsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  scheduleForDay(ctx: SimulationContext, dayIndex: number): Promise<readonly ScheduleBlock[]> {
    return this.attendance.blocksForDay(ctx, dayIndex);
  }

  async profileContext(ctx: SimulationContext, base: ProfileContext): Promise<ProfileContext> {
    const employment = await this.store.active(ctx);
    const job = employment ? findJob(employment.jobId) : undefined;
    if (!employment || !job) return base;
    return { ...base, jobStress: Math.min(1, job.stress + employment.level * STRESS_PER_LEVEL) };
  }

  onSegment(ctx: SimulationContext, segment: Segment): Promise<void> {
    return this.attendance.record(ctx, segment);
  }

  onActionComplete(ctx: SimulationContext, action: ActionDefinition, activity: ActivityState): Promise<void> {
    return this.freelance.onActionComplete(ctx, action, activity);
  }

  async onDayEnd(ctx: SimulationContext): Promise<void> {
    // Shortlisted candidates always get their interview card (not left to the daily event roll).
    if ((await this.applications.interviewCandidates(ctx)).length > 0) await this.lifeEvents.raise(ctx, 'job-interview');
    await this.applications.decideDue(ctx);
    await this.attendance.closeDay(ctx);
    const employment = await this.store.active(ctx);
    const job = employment ? findJob(employment.jobId) : undefined;
    if (!employment || !job) return;
    await this.payroll.releaseHeld(ctx, employment);
    await this.promotions.daily(ctx, employment, job);
    await this.store.save(ctx, employment);
  }

  onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    return this.payroll.runMonth(ctx, monthIndex);
  }

  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    const employment = await this.store.active(ctx);
    const job = employment ? findJob(employment.jobId) : undefined;
    if (!employment || !job) return {};
    return {
      job: {
        title: titleOf(job, employment.level),
        employer: employerOf(job, employment),
        monthlyPay: Math.round(levelPay(job, employment.level, employment.payAdjustment)),
        currency: job.currency,
      },
    };
  }

  async status(ctx: SimulationContext): Promise<number> {
    const employment = await this.store.active(ctx);
    const job = employment ? findJob(employment.jobId) : undefined;
    return job?.levels[employment?.level ?? 0]?.status ?? 0;
  }

  async onDeath(ctx: SimulationContext): Promise<void> {
    const employment = await this.store.active(ctx);
    if (employment) await this.employment.end(ctx, employment, 'deceased');
  }
}
