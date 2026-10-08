import { Injectable } from '@nestjs/common';
import {
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  findJob,
  formatGameDuration,
  formatJobSchedule,
  toDateParts,
  type EmploymentEndReason,
  type JobDefinition,
  type PayslipDto,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { employerOf, requireJob, titleOf, workplaceDto } from './career.presenter.js';
import { CareerStore } from './career.store.js';
import type { EmploymentEntity } from './entities/employment.entity.js';
import { PayrollService } from './payroll.service.js';

const END_NOTICES: Readonly<Record<EmploymentEndReason, { title: string; body: (title: string, employer: string) => string; tone: 'good' | 'bad' | 'neutral' }>> = {
  resigned: { title: 'You resigned', body: (title, employer) => `You submitted your resignation as ${title} at ${employer}. New chapter loading…`, tone: 'neutral' },
  fired: { title: 'You’ve been sacked', body: (title, employer) => `${employer} let you go as ${title} for repeated absence. HR said: “Please return the ID card.”`, tone: 'bad' },
  'moved-on': { title: 'On to bigger things', body: (title, employer) => `You served your notice as ${title} at ${employer}.`, tone: 'good' },
  japa: { title: 'Japa!', body: (title, employer) => `You resigned as ${title} at ${employer} to relocate abroad.`, tone: 'neutral' },
  deceased: { title: 'Rest in peace', body: (title, employer) => `${employer} mourns their ${title}.`, tone: 'bad' },
};

/** Starting, ending and pausing (leave) a job. */
@Injectable()
export class EmploymentService {
  constructor(
    private readonly store: CareerStore,
    private readonly payroll: PayrollService,
  ) {}

  /** Start a job tomorrow (ending the current one, if any). */
  async hire(ctx: SimulationContext, job: JobDefinition): Promise<EmploymentEntity> {
    const current = await this.store.active(ctx);
    if (current) await this.end(ctx, current, 'moved-on');

    const startedAt = (Math.floor(ctx.time / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;
    const employment = this.store.createEmployment(ctx, {
      jobId: job.id,
      level: 0,
      startedAt,
      levelStartedAt: startedAt,
      monthIndex: Math.floor(startedAt / MINUTES_PER_MONTH),
      leaveYear: toDateParts(startedAt).year,
      performance: 0.7,
      goodwill: 0,
      payAdjustment: 1,
      employerOverride: null,
      leaveFrom: null,
      leaveUntil: null,
      lastWarningAt: null,
      lastPromotionRequestAt: null,
      lastPayslip: null,
      heldPayslip: null,
    });
    await this.store.save(ctx, employment);
    this.store.forget(ctx);
    this.refreshRoutine(ctx);

    // New colleagues, new contacts.
    ctx.character.connections = Math.min(100, ctx.character.connections + 1);
    const workplace = workplaceDto(job);
    ctx.notify({
      kind: 'career',
      title: `You got the job! ${job.emoji}`,
      body: `${job.employer} wants you as ${titleOf(job, 0)}. You resume tomorrow — ${formatJobSchedule(job.schedule)} at ${workplace.label}.`,
      tone: 'good',
    });
    ctx.report({ label: `Hired: ${titleOf(job, 0)} at ${job.employer}`, tone: 'good' });
    return (await this.store.active(ctx)) ?? employment;
  }

  /** End the current job: final pay, CV entry, routine cleared. Returns the final payslip, if any. */
  async end(ctx: SimulationContext, employment: EmploymentEntity, reason: EmploymentEndReason): Promise<PayslipDto | null> {
    const job = findJob(employment.jobId);
    const finalPay = job ? await this.payroll.finalPay(ctx, employment, job) : null;
    const title = job ? titleOf(job, employment.level) : employment.jobId;
    const employer = job ? employerOf(job, employment) : 'your employer';

    await this.store.addHistory(ctx, {
      employmentId: employment.id,
      jobId: employment.jobId,
      title,
      employer,
      finalLevel: employment.level,
      startedAt: Math.min(employment.startedAt, ctx.time),
      endedAt: ctx.time,
      reason,
      totalEarned: employment.totalEarned,
    });
    await this.store.remove(ctx, employment);
    this.refreshRoutine(ctx);

    const notice = END_NOTICES[reason];
    ctx.notify({ kind: 'career', title: notice.title, body: notice.body(title, employer), tone: notice.tone });
    ctx.report({ label: `${notice.title}: ${title}`, tone: notice.tone });
    return finalPay;
  }

  async resign(ctx: SimulationContext): Promise<{ readonly message: string; readonly finalPay: PayslipDto | null }> {
    const employment = await this.requireActive(ctx);
    const job = findJob(employment.jobId);
    const finalPay = await this.end(ctx, employment, 'resigned');
    const where = job ? employerOf(job, employment) : 'your employer';
    return {
      message: finalPay ? `You’ve resigned from ${where}. Your final pay has landed.` : `You’ve resigned from ${where}.`,
      finalPay,
    };
  }

  /** Book paid leave starting tomorrow. */
  async requestLeave(ctx: SimulationContext, days: number): Promise<void> {
    const employment = await this.requireActive(ctx);
    const job = this.requireJob(employment);
    if (employment.startedAt > ctx.time) throw new GameRuleException('NOT_STARTED', 'You haven’t even resumed yet — leave can wait');
    if (employment.leaveUntil !== null && employment.leaveUntil > ctx.time) {
      throw new GameRuleException('ALREADY_ON_LEAVE', 'You’re already booked for leave');
    }
    const year = toDateParts(ctx.time).year;
    if (employment.leaveYear !== year) {
      employment.leaveYear = year;
      employment.leaveDaysUsed = 0;
    }
    const remaining = job.perks.leaveDays - employment.leaveDaysUsed;
    if (days > remaining) {
      throw new GameRuleException('NOT_ENOUGH_LEAVE', remaining > 0 ? `You only have ${remaining} leave day${remaining === 1 ? '' : 's'} left this year` : 'You’ve used all your leave for this year');
    }

    const from = (Math.floor(ctx.time / MINUTES_PER_DAY) + 1) * MINUTES_PER_DAY;
    employment.leaveFrom = from;
    employment.leaveUntil = from + days * MINUTES_PER_DAY;
    employment.leaveDaysUsed += days;
    await this.store.save(ctx, employment);
    this.refreshRoutine(ctx);
    ctx.notify({
      kind: 'career',
      title: 'Leave approved 🌴',
      body: `${employerOf(job, employment)} approved ${formatGameDuration(days * MINUTES_PER_DAY)} of paid leave from tomorrow. Rest well.`,
      tone: 'good',
    });
  }

  async requireActive(ctx: SimulationContext): Promise<EmploymentEntity> {
    const employment = await this.store.active(ctx);
    if (!employment) throw new GameRuleException('NOT_EMPLOYED', 'You don’t have a job right now — check the Jobs app');
    return employment;
  }

  requireJob(employment: EmploymentEntity): JobDefinition {
    return requireJob(employment.jobId);
  }

  /** The routine, stress and item caches depend on the job. */
  refreshRoutine(ctx: SimulationContext): void {
    ctx.invalidate('schedule');
    ctx.invalidate('profile-context');
  }
}
