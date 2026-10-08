import { Injectable } from '@nestjs/common';
import { MINUTES_PER_YEAR, findBusinessType } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BusinessesStore } from './businesses.store.js';
import type { BusinessPnlEntity } from './entities/business-pnl.entity.js';
import type { BusinessEntity } from './entities/business.entity.js';
import { businessValuation, saleMultiple, saleRange, salvageValue, trailingAnnualProfit } from './rules/valuation.js';

export interface Appraisal {
  readonly salvage: number;
  readonly trailingAnnualProfit: number;
  /** Mid-point sale value net of debt (what it adds to net worth). */
  readonly valuation: number;
  readonly saleRange: { readonly low: number; readonly high: number };
  /** Up to 12 months of results, oldest first. */
  readonly history: readonly BusinessPnlEntity[];
}

/** Values businesses from their assets and trailing profits (net worth, sale quotes, income estimates). */
@Injectable()
export class BusinessAppraiser {
  constructor(private readonly store: BusinessesStore) {}

  async appraise(ctx: SimulationContext, businesses: readonly BusinessEntity[]): Promise<Map<string, Appraisal>> {
    const history = await this.store.recentPnl(ctx, businesses.map((business) => business.id));
    const appraisals = new Map<string, Appraisal>();
    for (const business of businesses) {
      const type = findBusinessType(business.typeId);
      if (!type) continue;
      const results = history.get(business.id) ?? [];
      const salvage = salvageValue(type, business.investedCapital, (ctx.time - business.openedAt) / MINUTES_PER_YEAR);
      const trailing = trailingAnnualProfit(results.map((row) => row.profit));
      const multiple = saleMultiple(business.investedCapital);
      appraisals.set(business.id, {
        salvage,
        trailingAnnualProfit: trailing,
        valuation: businessValuation(salvage, trailing, business.debt, multiple),
        saleRange: saleRange(salvage, trailing, business.debt, multiple),
        history: results,
      });
    }
    return appraisals;
  }
}
