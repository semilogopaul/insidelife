import { Injectable } from '@nestjs/common';
import {
  MINUTES_PER_MONTH,
  MINUTES_PER_YEAR,
  toDateParts,
  type EmploymentDto,
  type EmploymentViewDto,
  type LeaveDto,
  type PromotionOutlookDto,
} from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { applicationDto, employerOf, historyDto, requireJob, scheduleDto, titleOf, workplaceDto } from './career.presenter.js';
import { CareerStore } from './career.store.js';
import type { EmploymentEntity } from './entities/employment.entity.js';
import { PayrollService } from './payroll.service.js';
import { PromotionsService } from './promotions.service.js';
import { displayChance } from './rules/hiring.js';
import { levelPay } from './rules/payroll.js';
import { attendanceRatio } from './rules/schedule.js';

const round = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;

/** Read model for the Jobs app "My job" tab. */
@Injectable()
export class EmploymentViewService {
  constructor(
    private readonly store: CareerStore,
    private readonly payroll: PayrollService,
    private readonly promotions: PromotionsService,
  ) {}

  async view(ctx: SimulationContext): Promise<EmploymentViewDto> {
    // One at a time: these share the session's transaction connection (pg runs one query at a time).
    const employment = await this.store.active(ctx);
    const history = await this.store.history(ctx);
    const applications = await this.store.recentApplications(ctx);
    return {
      employment: employment ? await this.employmentDto(ctx, employment) : null,
      history: history.map(historyDto),
      applications: applications.map(applicationDto),
    };
  }

  async employmentDto(ctx: SimulationContext, employment: EmploymentEntity): Promise<EmploymentDto> {
    const job = requireJob(employment.jobId);
    const usdRate = ctx.world.economy(ctx.time).usdRate;
    const monthlyPay = levelPay(job, employment.level, employment.payAdjustment);
    const monthIndex = Math.floor(ctx.time / MINUTES_PER_MONTH);
    const ratio = attendanceRatio(employment.scheduledMinutesMonth, employment.workedMinutesMonth, employment.lateMinutesMonth);
    const preview = this.payroll.payslip(ctx, employment, job, monthIndex, (monthIndex + 1) * MINUTES_PER_MONTH, true);

    return {
      id: employment.id,
      jobId: job.id,
      title: titleOf(job, employment.level),
      employer: employerOf(job, employment),
      industry: job.industry,
      emoji: job.emoji,
      level: employment.level,
      levels: job.levels.length,
      workplace: workplaceDto(job),
      schedule: scheduleDto(job),
      currency: job.currency,
      monthlyPay: Math.round(monthlyPay),
      monthlyPayNaira: Math.round(job.currency === 'USD' ? monthlyPay * usdRate : monthlyPay),
      perks: job.perks,
      stress: job.stress,
      startedAt: employment.startedAt,
      levelStartedAt: employment.levelStartedAt,
      yearsInRole: round(Math.max(0, ctx.time - employment.startedAt) / MINUTES_PER_YEAR),
      yearsInLevel: round(Math.max(0, ctx.time - employment.levelStartedAt) / MINUTES_PER_YEAR),
      performance: round(employment.performance),
      attendance: {
        scheduledMinutes: employment.scheduledMinutesMonth,
        workedMinutes: employment.workedMinutesMonth,
        absentMinutes: employment.absentMinutesMonth,
        lateMinutes: employment.lateMinutesMonth,
        ratio: round(ratio, 3),
        warnings: employment.warnings,
        strikes: round(employment.strikes),
      },
      payslipPreview: preview,
      lastPayslip: employment.lastPayslip,
      promotion: await this.promotionDto(ctx, employment),
      leave: this.leaveDto(ctx, employment, job.perks.leaveDays),
      salaryHeldUntil: employment.heldPayslip?.payAt ?? null,
    };
  }

  private async promotionDto(ctx: SimulationContext, employment: EmploymentEntity): Promise<PromotionOutlookDto> {
    const job = requireJob(employment.jobId);
    const outlook = await this.promotions.outlook(ctx, employment, job);
    return {
      nextTitle: outlook.next?.title ?? null,
      nextPay: outlook.next ? Math.round(outlook.next.pay * employment.payAdjustment) : null,
      eligibleFrom: outlook.eligibleFrom,
      gates: outlook.gates,
      ready: outlook.next !== null && outlook.blockedReason === null,
      breakout: outlook.breakout,
      blockedReason: outlook.blockedReason,
      estimatedChance: outlook.next && !outlook.breakout ? displayChance(outlook.chance) : 0,
    };
  }

  private leaveDto(ctx: SimulationContext, employment: EmploymentEntity, entitlement: number): LeaveDto {
    const used = employment.leaveYear === toDateParts(ctx.time).year ? employment.leaveDaysUsed : 0;
    const onLeave = employment.leaveFrom !== null && employment.leaveUntil !== null && ctx.time >= employment.leaveFrom && ctx.time < employment.leaveUntil;
    return {
      entitlementDays: entitlement,
      usedDays: used,
      remainingDays: Math.max(0, entitlement - used),
      onLeave,
      from: employment.leaveFrom,
      until: employment.leaveUntil,
    };
  }
}
