import { Injectable } from '@nestjs/common';
import { PROPERTY_AGENT_RATE, SALE_DAYS, SALE_PRICE_NOISE, formatDate, formatNaira } from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { PropertySaleEntity } from './entities/property-sale.entity.js';
import type { PropertyEntity } from './entities/property.entity.js';
import { buildingValue, days, landValue, propertyValue, saleProceedsSplit } from './housing.rules.js';
import { HousingStore } from './housing.store.js';

/**
 * Selling through an estate agent: 5% commission, buyers take 1-3 game months, the final price lands within ±10% of
 * the valuation. Proceeds up to what you put in are neutral money; only the profit counts as earned income.
 */
@Injectable()
export class PropertySalesService {
  constructor(private readonly store: HousingStore) {}

  async list(ctx: SimulationContext, propertyId: string): Promise<{ property: PropertyEntity; sale: PropertySaleEntity }> {
    const property = await this.store.property(ctx, propertyId);
    const portfolio = await this.store.portfolio(ctx);
    if (property.status === 'selling') throw new GameRuleException('ALREADY_LISTED', 'Your agent is already showing this property to buyers.');
    if (property.dispute) throw new GameRuleException('DISPUTE_OPEN', 'No serious buyer will touch land with a dispute — settle it first.');
    if (property.titlePerfection) throw new GameRuleException('PERFECTION_IN_PROGRESS', 'Wait for your new title papers before selling — they add value.');
    const building = this.store.buildingOf(portfolio, property.id);
    if (building?.status === 'under-construction') {
      throw new GameRuleException('UNDER_CONSTRUCTION', 'Finish the building first — buyers don’t want uncompleted wahala.');
    }
    if (building?.ownerOccupied) throw new GameRuleException('YOU_LIVE_THERE', 'You still dey live there — move out first.');

    const sellDays = ctx.rng('sale-duration', property.id, ctx.time).int(SALE_DAYS.min, SALE_DAYS.max);
    const sale = await this.store.addSale(
      ctx,
      ctx.manager.create(PropertySaleEntity, {
        characterId: ctx.character.id,
        propertyId: property.id,
        status: 'listed',
        listedAt: ctx.time,
        closesAt: ctx.time + days(sellDays),
        askingPrice: propertyValue(property, building),
        agentRate: PROPERTY_AGENT_RATE,
        salePrice: null,
        proceeds: null,
        closedAt: null,
      }),
    );
    property.status = 'selling';
    await this.store.save(ctx, property);
    return { property, sale };
  }

  async cancel(ctx: SimulationContext, propertyId: string): Promise<PropertyEntity> {
    const property = await this.store.property(ctx, propertyId);
    const sale = this.store.saleOf(await this.store.portfolio(ctx), property.id);
    if (!sale) throw new GameRuleException('NOT_LISTED', 'This property isn’t listed for sale.');
    sale.status = 'cancelled';
    sale.closedAt = ctx.time;
    await this.store.save(ctx, sale);
    property.status = 'owned';
    await this.store.save(ctx, property);
    return property;
  }

  /** Daily: close sales whose buyer has come through. */
  async onDayEnd(ctx: SimulationContext): Promise<void> {
    const portfolio = await this.store.portfolio(ctx);
    for (const sale of portfolio.sales) {
      if (sale.status !== 'listed' || ctx.time < sale.closesAt) continue;
      const property = portfolio.properties.find((candidate) => candidate.id === sale.propertyId);
      if (property?.status !== 'selling') continue;
      await this.close(ctx, property, sale);
    }
  }

  private async close(ctx: SimulationContext, property: PropertyEntity, sale: PropertySaleEntity): Promise<void> {
    if (property.dispute) {
      sale.status = 'fell-through';
      sale.closedAt = ctx.time;
      await this.store.save(ctx, sale);
      property.status = 'owned';
      await this.store.save(ctx, property);
      ctx.notify({
        kind: 'property',
        title: 'Sale fell through',
        body: `The buyer’s lawyer found the dispute on ${property.label} and ran. Settle it, then list again.`,
        tone: 'bad',
      });
      return;
    }

    const building = this.store.buildingOf(await this.store.portfolio(ctx), property.id);
    const valuation = landValue(property) + buildingValue(building);
    const noise = ctx.rng('sale-price', sale.id).float(-SALE_PRICE_NOISE, SALE_PRICE_NOISE);
    const salePrice = Math.round((valuation * (1 + noise)) / 10_000) * 10_000;
    const agentFee = Math.round(salePrice * sale.agentRate);
    const net = Math.max(0, salePrice - agentFee - property.arrears);
    const { principal, gain } = saleProceedsSplit(net, property.costBasis);

    await ctx.wallet.receive(principal, 'property', `Sale of ${property.label}`, `sale:${sale.id}:principal`, { income: 'neutral' });
    await ctx.wallet.receive(gain, 'property', `Profit on sale of ${property.label}`, `sale:${sale.id}:gain`, { income: 'earned' });

    sale.status = 'sold';
    sale.salePrice = salePrice;
    sale.proceeds = net;
    sale.closedAt = ctx.time;
    await this.store.save(ctx, sale);
    property.status = 'sold';
    property.disposedAt = ctx.time;
    property.arrears = 0;
    await this.store.save(ctx, property);

    const profit = net - property.costBasis;
    ctx.notify({
      kind: 'property',
      title: 'Sold!',
      body: `${property.label} sold on ${formatDate(ctx.time)} for ${formatNaira(salePrice)}. After the agent’s ${formatNaira(agentFee)} you received ${formatNaira(net)} — ${
        profit >= 0 ? `${formatNaira(profit)} profit. Odogwu moves.` : `${formatNaira(-profit)} less than you put in. E happen.`
      }`,
      tone: profit >= 0 ? 'good' : 'neutral',
      amount: net,
    });
    ctx.report({ label: `Sold ${property.label}`, amount: net, tone: profit >= 0 ? 'good' : 'neutral' });
  }
}
