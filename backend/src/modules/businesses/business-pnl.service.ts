import { Injectable } from '@nestjs/common';
import {
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MINUTES_PER_MONTH,
  MONTHS,
  findBusinessType,
  formatNaira,
  seasonOf,
  toDateParts,
  type BusinessTypeDefinition,
} from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BusinessesStore } from './businesses.store.js';
import type { BusinessEntity } from './entities/business.entity.js';
import { BASE_FUEL_PRICE, computeMonthlyPnl, nextTraction, ownerScore, type PnlConditions, type PnlResult } from './rules/pnl.js';
import { shouldFold } from './rules/valuation.js';

/** World conditions averaged over one game month. */
interface MonthWorld {
  readonly dettyDecember: number;
  readonly fuelScarcity: number;
  readonly rainy: boolean;
  readonly priceIndex: number;
  readonly fuelPriceRatio: number;
}

/**
 * Month-end trading for every business: seeded P&L, profit paid out as earned income (after Companies Income Tax
 * and supplier debts), losses covered from the owner's pocket — or carried as debt that can fold the business.
 */
@Injectable()
export class BusinessPnlService {
  constructor(private readonly store: BusinessesStore) {}

  async runMonth(ctx: SimulationContext, monthIndex: number): Promise<void> {
    const businesses = await this.store.active(ctx);
    if (businesses.length === 0) return;
    const world = this.monthWorld(ctx, monthIndex);
    for (const business of businesses) {
      const type = findBusinessType(business.typeId);
      if (!type || (await this.store.pnlExists(ctx, business.id, monthIndex))) continue;
      await this.trade(ctx, business, type, monthIndex, world);
    }
    this.store.forget(ctx);
  }

  private async trade(ctx: SimulationContext, business: BusinessEntity, type: BusinessTypeDefinition, monthIndex: number, world: MonthWorld): Promise<void> {
    const monthStart = monthIndex * MINUTES_PER_MONTH;
    const monthEnd = monthStart + MINUTES_PER_MONTH;
    const operatingShare = Math.max(0, Math.min(1, (monthEnd - Math.max(monthStart, business.openedAt)) / MINUTES_PER_MONTH));
    if (operatingShare <= 0) return;

    const score = ownerScore(type, ctx.character.skills, ctx.character.connections);
    const managementRatio = business.managementMinutesMonth / (type.managementHours * MINUTES_PER_HOUR);
    const conditions: PnlConditions = {
      units: business.units,
      districtId: business.districtId,
      ownerScore: score,
      managementRatio,
      operatingShare,
      ...world,
      eventModifier: business.eventModifier,
      eventCosts: business.eventCosts,
      traction: business.traction,
    };
    const rng = ctx.rng('business-pnl', business.id, monthIndex);
    const result = computeMonthlyPnl(type, conditions, rng.normal());
    const notes = this.notes(type, conditions, result);
    const ownerCashFlow = await this.settle(ctx, business, result, monthIndex, notes);

    business.consecutiveLosses = result.profit < 0 ? business.consecutiveLosses + 1 : 0;
    business.traction = nextTraction(type, business.traction, score, managementRatio, rng.normal());
    business.managementMinutesMonth = 0;
    business.eventModifier = 1;
    business.eventCosts = 0;

    if (shouldFold(business.debt, business.investedCapital)) {
      business.status = 'folded';
      business.closedAt = ctx.time;
      notes.push('Creditors took the equipment — the business has folded.');
      ctx.notify({
        kind: 'career',
        title: `${business.name} has folded 💔`,
        body: `Debts of ${formatNaira(business.debt)} were more than the business could carry. Creditors took the equipment. Dust yourself off.`,
        tone: 'bad',
      });
    } else {
      this.monthlyReport(ctx, business, result, monthIndex);
    }

    await this.store.savePnl(ctx, {
      businessId: business.id,
      monthIndex,
      revenue: result.revenue,
      costs: result.variableCosts + result.fixedCosts,
      eventCosts: result.eventCosts,
      tax: result.tax,
      profit: result.profit,
      ownerCashFlow,
      debtAfter: business.debt,
      notes,
    });
    await this.store.save(ctx, business);
    ctx.report({ label: `${business.name} (${type.label})`, amount: ownerCashFlow, tone: ownerCashFlow >= 0 ? 'good' : 'bad' });
  }

  /** Move the month's money. Returns the owner's cash flow (positive = paid out). */
  private async settle(ctx: SimulationContext, business: BusinessEntity, result: PnlResult, monthIndex: number, notes: string[]): Promise<number> {
    const key = `${business.id}:${monthIndex}`;
    if (result.profitBeforeTax > 0) {
      await ctx.wallet.receive(result.profitBeforeTax, 'business', `${business.name} profit`, `business-profit:${key}`, {
        income: 'earned',
        metadata: { businessId: business.id, monthIndex, revenue: result.revenue },
      });
      if (result.tax > 0) {
        await ctx.wallet.tryPay(result.tax, 'tax', `Companies income tax — ${business.name}`, `business-cit:${key}`, { sink: 'tax' });
        notes.push(`Companies income tax: ${formatNaira(result.tax)}.`);
      }
      const repay = Math.min(business.debt, result.profit);
      if (repay > 0 && (await ctx.wallet.tryPay(repay, 'business', `${business.name}: paying off suppliers`, `business-debt:${key}`))) {
        business.debt -= repay;
        notes.push(`Paid ${formatNaira(repay)} of supplier debt.`);
        return result.profit - repay;
      }
      return result.profit;
    }
    const loss = -result.profit;
    if (loss <= 0) return 0;
    if (await ctx.wallet.tryPay(loss, 'business', `${business.name} loss — topped up from your pocket`, `business-loss:${key}`)) return -loss;
    business.debt += loss;
    notes.push(`You couldn’t cover the ${formatNaira(loss)} loss — suppliers gave credit.`);
    return 0;
  }

  private notes(type: BusinessTypeDefinition, conditions: PnlConditions, result: PnlResult): string[] {
    const notes: string[] = [];
    if (conditions.dettyDecember > 0 && (type.seasonality.dettyDecember ?? 1) > 1) notes.push('Detty December rush 🎄');
    if (conditions.fuelScarcity > 0 && type.seasonality.fuelScarcity !== undefined) {
      notes.push(type.seasonality.fuelScarcity >= 1 ? 'Fuel scarcity queues brought customers' : 'Fuel scarcity cut your trips');
    }
    if (conditions.managementRatio < 0.25) notes.push('Absentee owner — staff relaxed, sales dipped');
    else if (conditions.managementRatio >= 1) notes.push('Hands-on management paid off');
    if (conditions.eventModifier > 1) notes.push('Buzz from social media');
    if (conditions.eventModifier < 1) notes.push('Trouble this month hurt sales');
    if (result.eventCosts > 0) notes.push(`One-off costs: ${formatNaira(result.eventCosts)}`);
    return notes;
  }

  private monthlyReport(ctx: SimulationContext, business: BusinessEntity, result: PnlResult, monthIndex: number): void {
    const month = MONTHS[toDateParts(monthIndex * MINUTES_PER_MONTH).month - 1] ?? 'last month';
    const good = result.profit >= 0;
    ctx.notify({
      kind: 'career',
      title: `${business.name}: ${month} report`,
      body: good
        ? `Revenue ${formatNaira(result.revenue)}, profit ${formatNaira(result.profit)}. Business dey move!`
        : `Revenue ${formatNaira(result.revenue)}, loss ${formatNaira(-result.profit)}. Tough month — check your costs and show up more.`,
      tone: good ? 'good' : 'bad',
      amount: good ? result.profit : undefined,
    });
  }

  private monthWorld(ctx: SimulationContext, monthIndex: number): MonthWorld {
    const monthStart = monthIndex * MINUTES_PER_MONTH;
    const days = MINUTES_PER_MONTH / MINUTES_PER_DAY;
    let detty = 0;
    let scarcity = 0;
    let priceIndex = 0;
    let fuel = 0;
    for (let day = 0; day < days; day++) {
      const t = monthStart + day * MINUTES_PER_DAY + 12 * MINUTES_PER_HOUR;
      if (ctx.world.isActive(t, 'detty-december')) detty += 1;
      if (ctx.world.isActive(t, 'fuel-scarcity')) scarcity += 1;
      const economy = ctx.world.economy(t);
      priceIndex += economy.priceIndex;
      fuel += economy.fuelPrice;
    }
    return {
      dettyDecember: detty / days,
      fuelScarcity: scarcity / days,
      rainy: seasonOf(monthStart + MINUTES_PER_MONTH / 2) === 'rainy',
      priceIndex: priceIndex / days,
      fuelPriceRatio: fuel / days / BASE_FUEL_PRICE,
    };
  }
}
