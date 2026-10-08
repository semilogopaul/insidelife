import { Injectable, type OnModuleInit } from '@nestjs/common';
import { IncomeSourcesRegistry, type IncomeSource } from '../careers/income-sources.registry.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BusinessAppraiser } from './business-appraiser.service.js';
import { BusinessesStore } from './businesses.store.js';

/** Feeds average monthly business profit into `EmploymentPort.monthlyIncome` (affordability, black-tax sizing). */
@Injectable()
export class BusinessIncomeSource implements IncomeSource, OnModuleInit {
  readonly key = 'businesses';

  constructor(
    private readonly registry: IncomeSourcesRegistry,
    private readonly store: BusinessesStore,
    private readonly appraiser: BusinessAppraiser,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async monthlyIncome(ctx: SimulationContext): Promise<number> {
    const businesses = await this.store.active(ctx);
    if (businesses.length === 0) return 0;
    let annual = 0;
    for (const appraisal of (await this.appraiser.appraise(ctx, businesses)).values()) annual += Math.max(0, appraisal.trailingAnnualProfit);
    return Math.round(annual / 12);
  }
}
