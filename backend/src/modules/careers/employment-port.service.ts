import { Injectable } from '@nestjs/common';
import { MINUTES_PER_YEAR, findJob } from '@insidelife/shared';
import type { EmploymentPort, EmploymentSnapshot } from '../../common/ports/employment.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { employerOf, titleOf } from './career.presenter.js';
import { CareerStore } from './career.store.js';
import { IncomeSourcesRegistry } from './income-sources.registry.js';
import { levelPay } from './rules/payroll.js';

/** `EMPLOYMENT_PORT` for other domains: the current job and total monthly income (salary + registered sources). */
@Injectable()
export class EmploymentPortService implements EmploymentPort {
  constructor(
    private readonly store: CareerStore,
    private readonly incomeSources: IncomeSourcesRegistry,
  ) {}

  async current(ctx: SimulationContext): Promise<EmploymentSnapshot | null> {
    const employment = await this.store.active(ctx);
    const job = employment ? findJob(employment.jobId) : undefined;
    if (!employment || !job) return null;
    return {
      jobId: job.id,
      title: titleOf(job, employment.level),
      employer: employerOf(job, employment),
      industry: job.industry,
      monthlyPayNaira: this.salaryNaira(ctx, job.currency, levelPay(job, employment.level, employment.payAdjustment)),
      yearsInRole: Math.max(0, ctx.time - employment.startedAt) / MINUTES_PER_YEAR,
      performance: employment.performance,
      workplaceId: job.workplaceId,
    };
  }

  async monthlyIncome(ctx: SimulationContext): Promise<number> {
    const salary = (await this.current(ctx))?.monthlyPayNaira ?? 0;
    let other = 0;
    for (const source of this.incomeSources.all) other += Math.max(0, await source.monthlyIncome(ctx));
    return Math.round(salary + other);
  }

  private salaryNaira(ctx: SimulationContext, currency: 'NGN' | 'USD', pay: number): number {
    return Math.round(currency === 'USD' ? pay * ctx.world.economy(ctx.time).usdRate : pay);
  }
}
