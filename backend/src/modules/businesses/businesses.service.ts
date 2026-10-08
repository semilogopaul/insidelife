import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BUSINESS_TYPES,
  DISTRICTS,
  MAX_BUSINESSES,
  MINUTES_PER_HOUR,
  businessAllowedIn,
  findBusinessType,
  formatNaira,
  type BusinessExitDto,
  type BusinessPnlDto,
  type BusinessTrait,
  type BusinessTypeDefinition,
  type BusinessTypeDto,
  type BusinessesViewDto,
  type DistrictId,
  type OwnedBusinessDto,
  type StartBusinessRequest,
} from '@insidelife/shared';
import { GameRuleException, ResourceNotFoundException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BusinessAppraiser, type Appraisal } from './business-appraiser.service.js';
import { BusinessesStore } from './businesses.store.js';
import type { BusinessPnlEntity } from './entities/business-pnl.entity.js';
import type { BusinessEntity } from './entities/business.entity.js';
import { computeMonthlyPnl, typicalConditions } from './rules/pnl.js';
import { closureProceeds, saleMultiple, salePrice } from './rules/valuation.js';

/** P&L months shown per business. */
const RECENT_PNL_MONTHS = 6;

/** The Business app: catalogue, start-ups, expansions, sales and closures. */
@Injectable()
export class BusinessesService {
  constructor(
    private readonly store: BusinessesStore,
    private readonly appraiser: BusinessAppraiser,
  ) {}

  async view(ctx: SimulationContext): Promise<BusinessesViewDto> {
    const [active, past] = await Promise.all([this.store.active(ctx), this.store.past(ctx)]);
    const all = [...active, ...past];
    const appraisals = await this.appraiser.appraise(ctx, all);
    return {
      catalogue: BUSINESS_TYPES.map((type) => this.typeDto(ctx, type)),
      mine: all.flatMap((business) => {
        const appraisal = appraisals.get(business.id);
        return appraisal ? [this.ownedDto(ctx, business, appraisal)] : [];
      }),
      maxBusinesses: MAX_BUSINESSES,
    };
  }

  async start(ctx: SimulationContext, request: StartBusinessRequest): Promise<OwnedBusinessDto> {
    const type = findBusinessType(request.typeId);
    if (!type) throw new ResourceNotFoundException('Business type');
    if (ctx.age < type.minAge) throw new GameRuleException('TOO_YOUNG', `You must be ${type.minAge}+ to run a ${type.label.toLowerCase()}`);
    if (!businessAllowedIn(type, request.districtId)) {
      throw new GameRuleException('WRONG_DISTRICT', `A ${type.label.toLowerCase()} can’t be set up in ${DISTRICTS[request.districtId].name}`);
    }
    if ((await this.store.active(ctx)).length >= MAX_BUSINESSES) {
      throw new GameRuleException('TOO_MANY_BUSINESSES', `You can run at most ${MAX_BUSINESSES} businesses. Sell or close one first`);
    }

    const id = randomUUID();
    const capital = ctx.world.price(type.capital, ctx.time);
    const name = request.name.trim();
    await ctx.wallet.pay(capital, 'business', `Start-up capital — ${name} (${type.label})`, `business-capital:${id}`, { metadata: { businessId: id, typeId: type.id } });
    const business = await this.store.save(
      ctx,
      this.store.create(ctx, {
        id,
        typeId: type.id,
        name,
        districtId: request.districtId,
        units: 1,
        investedCapital: capital,
        openedAt: ctx.time,
        status: 'active',
        closedAt: null,
        debt: 0,
        managementMinutesMonth: 0,
        consecutiveLosses: 0,
        traction: 1,
        eventModifier: 1,
        eventCosts: 0,
        lastEventAt: null,
      }),
    );
    this.changed(ctx);
    ctx.notify({
      kind: 'career',
      title: `${type.emoji} ${name} is open for business!`,
      body: `You invested ${formatNaira(capital)} in ${DISTRICTS[request.districtId].name}. Show up to manage it — owners who show up earn more.`,
      tone: 'good',
    });
    return this.ownedOne(ctx, business);
  }

  async expand(ctx: SimulationContext, id: string): Promise<OwnedBusinessDto> {
    const { business, type } = await this.requireActive(ctx, id);
    if (business.units >= type.expansion.maxUnits) throw new GameRuleException('MAX_SIZE', `${business.name} is already at full size`);
    const cost = ctx.world.price(type.expansion.cost, ctx.time);
    await ctx.wallet.pay(cost, 'business', `${type.expansion.label} — ${business.name}`, `business-expansion:${business.id}:${business.units + 1}`, {
      metadata: { businessId: business.id, units: business.units + 1 },
    });
    business.units += 1;
    business.investedCapital += cost;
    await this.store.save(ctx, business);
    this.changed(ctx);
    ctx.notify({ kind: 'career', title: 'Expansion done 📈', body: `${business.name} now has ${business.units} units. Bigger business, bigger wahala.`, tone: 'good' });
    return this.ownedOne(ctx, business);
  }

  /** Sell to a buyer for ~2-3× trailing annual profit (or the asset value, whichever is higher), minus debts. */
  async sell(ctx: SimulationContext, id: string): Promise<BusinessExitDto> {
    const { business } = await this.requireActive(ctx, id);
    const appraisal = (await this.appraiser.appraise(ctx, [business])).get(business.id);
    const debt = business.debt;
    const price = appraisal ? salePrice(appraisal.salvage, appraisal.trailingAnnualProfit, debt, saleMultiple(business.investedCapital), ctx.rng('business-sale', business.id).next()) : 0;
    const returnOfCapital = Math.min(price, business.investedCapital);
    const gain = price - returnOfCapital;
    await ctx.wallet.receive(returnOfCapital, 'business', `Sale of ${business.name}`, `business-sale:${business.id}`, { income: 'neutral' });
    await ctx.wallet.receive(gain, 'business', `Profit on the sale of ${business.name}`, `business-sale-gain:${business.id}`, { income: 'earned' });
    this.retire(business, 'sold', ctx.time);
    await this.store.save(ctx, business);
    this.changed(ctx);
    const message = `You sold ${business.name} for ${formatNaira(price)}${debt > 0 ? ` (the buyer took over ${formatNaira(debt)} of debts)` : ''}.`;
    ctx.notify({ kind: 'career', title: 'Business sold 🤝', body: message, tone: 'good', amount: price });
    return { businessId: business.id, proceeds: price, debtSettled: debt, message };
  }

  /** Shut down: equipment goes at a fire-sale price; debts come out of that (and your pocket if needed). */
  async close(ctx: SimulationContext, id: string): Promise<BusinessExitDto> {
    const { business } = await this.requireActive(ctx, id);
    const appraisal = (await this.appraiser.appraise(ctx, [business])).get(business.id);
    const net = closureProceeds(appraisal?.salvage ?? 0, business.debt);
    let proceeds = 0;
    let debtSettled = business.debt;
    if (net >= 0) {
      proceeds = net;
      await ctx.wallet.receive(net, 'business', `Closing down ${business.name}`, `business-closure:${business.id}`, { income: 'neutral' });
    } else {
      const owed = -net;
      const payable = Math.min(owed, ctx.wallet.cash);
      await ctx.wallet.tryPay(payable, 'business', `Settling ${business.name}’s debts on closure`, `business-closure-debt:${business.id}`);
      proceeds = -payable;
      debtSettled = business.debt - (owed - payable);
      if (owed > payable) {
        const character = ctx.character;
        character.connections = Math.max(0, character.connections - 3);
      }
    }
    this.retire(business, 'closed', ctx.time);
    await this.store.save(ctx, business);
    this.changed(ctx);
    const message = proceeds >= 0 ? `${business.name} is closed. You sold off the equipment for ${formatNaira(proceeds)}.` : `${business.name} is closed. Settling its debts cost you ${formatNaira(-proceeds)}.`;
    ctx.notify({ kind: 'career', title: 'Business closed', body: message, tone: 'neutral' });
    return { businessId: business.id, proceeds, debtSettled, message };
  }

  private async requireActive(ctx: SimulationContext, id: string): Promise<{ readonly business: BusinessEntity; readonly type: BusinessTypeDefinition }> {
    const business = await this.store.owned(ctx, id);
    const type = business ? findBusinessType(business.typeId) : undefined;
    if (!business || !type) throw new ResourceNotFoundException('Business');
    if (business.status !== 'active') throw new GameRuleException('BUSINESS_INACTIVE', `${business.name} is no longer trading`);
    return { business, type };
  }

  private retire(business: BusinessEntity, status: 'sold' | 'closed', at: number): void {
    business.status = status;
    business.closedAt = at;
    business.managementMinutesMonth = 0;
  }

  /** Owning a business unlocks the `manage-business` action; net worth and status change too. */
  private changed(ctx: SimulationContext): void {
    this.store.forget(ctx);
    ctx.invalidate('item-tags');
  }

  private async ownedOne(ctx: SimulationContext, business: BusinessEntity): Promise<OwnedBusinessDto> {
    const appraisal = (await this.appraiser.appraise(ctx, [business])).get(business.id);
    if (!appraisal) throw new ResourceNotFoundException('Business');
    return this.ownedDto(ctx, business, appraisal);
  }

  private typeDto(ctx: SimulationContext, type: BusinessTypeDefinition): BusinessTypeDto {
    const capital = ctx.world.price(type.capital, ctx.time);
    const priceIndex = ctx.world.economy(ctx.time).priceIndex;
    const low = computeMonthlyPnl(type, typicalConditions(type, { priceIndex }), -1).profit;
    const high = computeMonthlyPnl(type, typicalConditions(type, { priceIndex }), 1).profit;
    const keyTraits = (Object.entries(type.ownerWeights) as Array<[BusinessTrait, number]>).toSorted((a, b) => b[1] - a[1]).map(([trait]) => trait);
    return {
      id: type.id,
      label: type.label,
      emoji: type.emoji,
      category: type.category,
      blurb: type.blurb,
      capital,
      expansion: { label: type.expansion.label, cost: ctx.world.price(type.expansion.cost, ctx.time), maxUnits: type.expansion.maxUnits },
      typicalMonthlyProfit: { low: roundTo(low, 1_000), high: roundTo(high, 1_000) },
      risk: type.risk,
      allowedDistricts: type.allowedDistricts ? [...type.allowedDistricts] : null,
      keyTraits,
      managementHours: type.managementHours,
      minAge: type.minAge,
      affordable: ctx.wallet.canAfford(capital),
    };
  }

  private ownedDto(ctx: SimulationContext, business: BusinessEntity, appraisal: Appraisal): OwnedBusinessDto {
    const type = findBusinessType(business.typeId);
    if (!type) throw new ResourceNotFoundException('Business type');
    const canExpand = business.status === 'active' && business.units < type.expansion.maxUnits;
    return {
      id: business.id,
      typeId: type.id,
      name: business.name,
      label: type.label,
      emoji: type.emoji,
      districtId: business.districtId as DistrictId,
      units: business.units,
      maxUnits: type.expansion.maxUnits,
      expansionCost: canExpand ? ctx.world.price(type.expansion.cost, ctx.time) : null,
      expansionLabel: type.expansion.label,
      investedCapital: business.investedCapital,
      openedAt: business.openedAt,
      status: business.status,
      debt: business.debt,
      managementHoursThisMonth: Math.round((business.managementMinutesMonth / MINUTES_PER_HOUR) * 10) / 10,
      managementHoursTarget: type.managementHours,
      traction: type.growth ? Math.round(business.traction * 100) / 100 : null,
      trailingAnnualProfit: appraisal.trailingAnnualProfit,
      valuation: business.status === 'active' ? appraisal.valuation : 0,
      saleEstimate: business.status === 'active' ? appraisal.saleRange : { low: 0, high: 0 },
      recentPnl: appraisal.history.slice(-RECENT_PNL_MONTHS).map(pnlDto),
    };
  }
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function pnlDto(row: BusinessPnlEntity): BusinessPnlDto {
  return {
    monthIndex: row.monthIndex,
    revenue: row.revenue,
    costs: row.costs,
    eventCosts: row.eventCosts,
    tax: row.tax,
    profit: row.profit,
    ownerCashFlow: row.ownerCashFlow,
    debtAfter: row.debtAfter,
    notes: row.notes,
  };
}
