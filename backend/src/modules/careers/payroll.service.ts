import { Injectable } from '@nestjs/common';
import {
  MINUTES_PER_DAY,
  MINUTES_PER_MONTH,
  findJob,
  formatNaira,
  toDateParts,
  type GameMinute,
  type JobDefinition,
  type PayslipDto,
} from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { employerOf, titleOf } from './career.presenter.js';
import { CareerStore } from './career.store.js';
import type { EmploymentEntity } from './entities/employment.entity.js';
import { payslipFor } from './rules/payroll.js';
import { attendanceRatio } from './rules/schedule.js';

/**
 * Month-end payroll: gross × attendance → PAYE (NTA 2025) → 8% pension, plus the employer's 10% into the RSA.
 * Every posting is keyed by employment and month, so replays can never pay twice.
 */
@Injectable()
export class PayrollService {
  constructor(private readonly store: CareerStore) {}

  /**
   * This month's payslip for `employment`, covering the month up to `periodEnd`. `preview` shows the expected
   * (mean) pay so volatile jobs don't reveal this month's luck in advance.
   */
  payslip(ctx: SimulationContext, employment: EmploymentEntity, job: JobDefinition, monthIndex: number, periodEnd: GameMinute, preview = false): PayslipDto {
    const monthStart = monthIndex * MINUTES_PER_MONTH;
    const proration = Math.max(0, Math.min(1, (periodEnd - Math.max(monthStart, employment.startedAt)) / MINUTES_PER_MONTH));
    const attendance = attendanceRatio(employment.scheduledMinutesMonth, employment.workedMinutesMonth, employment.lateMinutesMonth);
    // A draw of σ/2 makes the mean-preserving log-normal multiplier exactly 1.
    const volatilityDraw = preview ? job.payVolatility / 2 : ctx.rng('pay-volatility', employment.id, monthIndex).normal();
    return payslipFor({
      job,
      level: employment.level,
      monthIndex,
      usdRate: ctx.world.economy(ctx.time).usdRate,
      proration,
      attendance,
      payAdjustment: employment.payAdjustment,
      volatilityDraw,
      dettyDecember: toDateParts(monthStart).month === 12,
    });
  }

  /** Engine hook: the month that just ended. */
  async runMonth(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const employment = await this.store.active(ctx);
    if (!employment) return;
    const job = findJob(employment.jobId);
    if (!job) return;

    const slip = this.payslip(ctx, employment, job, monthIndex, (monthIndex + 1) * MINUTES_PER_MONTH);
    this.resetMonth(employment, monthIndex + 1);

    if (slip.gross > 0 && employment.salaryDelayDays > 0) {
      employment.heldPayslip = { ...slip, payAt: ctx.time + employment.salaryDelayDays * MINUTES_PER_DAY };
      ctx.notify({
        kind: 'salary',
        title: 'Salary delay',
        body: `Government says salaries “will be paid next week”. Your ${formatNaira(slip.net)} is held for ${employment.salaryDelayDays} days.`,
        tone: 'bad',
      });
      ctx.report({ label: 'Salary delayed by government', tone: 'bad' });
      employment.salaryDelayDays = 0;
    } else if (slip.gross > 0) {
      await this.disburse(ctx, employment, job, slip);
    }
    await this.store.save(ctx, employment);
  }

  /** Pay a held (delayed) payslip once its day comes. */
  async releaseHeld(ctx: SimulationContext, employment: EmploymentEntity): Promise<void> {
    const held = employment.heldPayslip;
    if (!held || ctx.time < held.payAt) return;
    const job = findJob(employment.jobId);
    if (!job) return;
    const { payAt: _payAt, ...slip } = held;
    employment.heldPayslip = null;
    await this.disburse(ctx, employment, job, slip, 'Finally! Salary landed');
  }

  /** Final pro-rated pay when a job ends mid-month (plus anything still held). */
  async finalPay(ctx: SimulationContext, employment: EmploymentEntity, job: JobDefinition): Promise<PayslipDto | null> {
    if (employment.heldPayslip) {
      const { payAt: _payAt, ...held } = employment.heldPayslip;
      employment.heldPayslip = null;
      await this.disburse(ctx, employment, job, held);
    }
    const monthIndex = Math.floor(ctx.time / MINUTES_PER_MONTH);
    const slip = this.payslip(ctx, employment, job, monthIndex, ctx.time);
    if (slip.gross <= 0) return null;
    await this.disburse(ctx, employment, job, slip, 'Final pay landed');
    return slip;
  }

  resetMonth(employment: EmploymentEntity, monthIndex: number): void {
    employment.monthIndex = monthIndex;
    employment.scheduledMinutesMonth = 0;
    employment.workedMinutesMonth = 0;
    employment.absentMinutesMonth = 0;
    employment.lateMinutesMonth = 0;
  }

  private async disburse(ctx: SimulationContext, employment: EmploymentEntity, job: JobDefinition, slip: PayslipDto, title = 'Alert! Salary landed'): Promise<void> {
    const key = `${employment.id}:${slip.monthIndex}`;
    const employer = employerOf(job, employment);
    const jobTitle = titleOf(job, employment.level);
    const metadata = { jobId: job.id, level: employment.level, monthIndex: slip.monthIndex, grossUsd: slip.grossUsd };

    await ctx.wallet.receive(slip.gross, 'salary', `Salary — ${jobTitle}, ${employer}`, `salary:${key}`, { income: 'earned', metadata });
    if (slip.tax > 0) {
      await ctx.wallet.tryPay(slip.tax, 'tax', job.currency === 'USD' ? 'Income tax (LIRS self-assessment)' : 'PAYE income tax (LIRS)', `paye:${key}`, { sink: 'tax' });
    }
    if (slip.pensionEmployee > 0 && ctx.wallet.canAfford(slip.pensionEmployee)) {
      await ctx.wallet.move('cash', 'pension', slip.pensionEmployee, 'pension', 'Pension contribution (8%)', `pension-ee:${key}`);
    }
    if (slip.pensionEmployer > 0) {
      await ctx.wallet.receive(slip.pensionEmployer, 'pension', `Employer pension (10%) — ${employer}`, `pension-er:${key}`, {
        account: 'pension',
        income: 'earned',
      });
    }

    employment.totalEarned += slip.net;
    employment.lastPayslip = slip;
    const usd = slip.grossUsd !== null ? ` ($${slip.grossUsd.toLocaleString('en-US')} at today’s rate)` : '';
    ctx.notify({
      kind: 'salary',
      title,
      body: `Credit: ${formatNaira(slip.net)} from ${employer}${usd}. PAYE ${formatNaira(slip.tax)} · pension ${formatNaira(slip.pensionEmployee)}.`,
      tone: 'good',
      amount: slip.net,
    });
    ctx.report({ label: `Salary from ${employer}`, amount: slip.net, tone: 'good' });
    const character = ctx.character;
    character.moodModifiers = [
      ...character.moodModifiers.filter((modifier) => modifier.id !== 'payday'),
      { id: 'payday', label: 'Just got paid', value: 8, until: ctx.time + 2 * MINUTES_PER_DAY },
    ];
  }
}
