import { Injectable } from '@nestjs/common';
import {
  NO_DECOR,
  NO_EXTERIOR,
  decorQuote,
  exteriorQuote,
  formatNaira,
  type DecorMakeoverRequest,
  type ExteriorMakeoverRequest,
  type HomeDecor,
  type HouseExterior,
  type StyleQuote,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { HomeService } from './home.service.js';
import { HousingStore } from './housing.store.js';

/** A fresh coat of paint outside also fixes the wear it covers (cracks, mould, faded render). */
const REPAINT_CONDITION_BONUS = 5;

/**
 * Making a house yours: paint, roofing sheets, gate colour and gate plate for a finished house you own; wall paint and
 * floors inside the home you live in when it's rented or owned (never the family house or a hostel). Only what
 * changes is charged, at today's prices (`exteriorQuote` / `decorQuote`).
 */
@Injectable()
export class MakeoverService {
  constructor(
    private readonly store: HousingStore,
    private readonly homes: HomeService,
  ) {}

  async exterior(
    ctx: SimulationContext,
    propertyId: string,
    request: ExteriorMakeoverRequest,
  ): Promise<{ readonly label: string; readonly quote: StyleQuote }> {
    const property = await this.store.property(ctx, propertyId);
    const building = this.store.buildingOf(await this.store.portfolio(ctx), property.id);
    if (!building || building.status !== 'complete') {
      throw new GameRuleException('NOT_BUILT', 'There’s no finished house there to paint yet.');
    }
    const current: HouseExterior = building.exterior ?? NO_EXTERIOR;
    const next: Partial<HouseExterior> = {
      ...request,
      name: request.name === undefined ? undefined : request.name?.trim() || null,
    };
    const quote = exteriorQuote(building.blueprintId, current, next, ctx.world.economy(ctx.time).priceIndex);
    if (quote.total === 0) throw new GameRuleException('NOTHING_TO_CHANGE', 'That’s how it already looks.');

    await ctx.wallet.pay(
      quote.total,
      'property',
      `House makeover — ${property.label}: ${quote.lines.map((line) => line.label).join(', ')}`,
      `makeover:${building.id}:${ctx.time}`,
    );
    building.exterior = {
      paint: next.paint ?? current.paint,
      roof: next.roof ?? current.roof,
      gate: next.gate ?? current.gate,
      name: next.name === undefined ? current.name : next.name,
    };
    if (next.paint && next.paint !== current.paint)
      building.condition = Math.min(100, building.condition + REPAINT_CONDITION_BONUS);
    await this.store.save(ctx, building);
    ctx.notify({
      kind: 'property',
      title: 'Fresh look!',
      body: `${property.label} looks brand new. Neighbours dey look.`,
      tone: 'good',
      amount: -quote.total,
    });
    return { label: property.label, quote };
  }

  async decor(
    ctx: SimulationContext,
    request: DecorMakeoverRequest,
  ): Promise<{ readonly label: string; readonly quote: StyleQuote }> {
    const home = await this.homes.current(ctx);
    if (home.ownership !== 'rented' && home.ownership !== 'owned') {
      throw new GameRuleException(
        'NOT_YOUR_HOUSE',
        'This isn’t your house to repaint — rent or buy your own place first.',
      );
    }
    const current: HomeDecor = home.decor ?? NO_DECOR;
    const quote = decorQuote(home.bedrooms, current, request, ctx.world.economy(ctx.time).priceIndex);
    if (quote.total === 0) throw new GameRuleException('NOTHING_TO_CHANGE', 'That’s how it already looks.');
    const next: HomeDecor = { paint: request.paint ?? current.paint, floor: request.floor ?? current.floor };

    const key = `decor:${home.leaseId ?? home.buildingId}:${ctx.time}`;
    await ctx.wallet.pay(
      quote.total,
      'property',
      `Painters & tilers — ${home.label}: ${quote.lines.map((line) => line.label).join(', ')}`,
      key,
    );
    if (home.ownership === 'rented') {
      const lease = await this.store.lease(ctx);
      if (!lease || lease.id !== home.leaseId)
        throw new GameRuleException('NOT_YOUR_HOUSE', 'Your lease isn’t active.');
      lease.decor = next;
      await this.store.save(ctx, lease);
    } else {
      const building = (await this.store.portfolio(ctx)).buildings.find(
        (candidate) => candidate.id === home.buildingId,
      );
      if (!building) throw new GameRuleException('NOT_YOUR_HOUSE', 'That house isn’t yours any more.');
      building.interior = next;
      await this.store.save(ctx, building);
    }
    ctx.invalidate('residence');
    const note = home.ownership === 'rented' ? ' (The landlord keeps it when you move — no refund.)' : '';
    ctx.notify({
      kind: 'property',
      title: 'Painters don finish',
      body: `Your place looks new.${note} Paid ${formatNaira(quote.total)}.`,
      tone: 'good',
      amount: -quote.total,
    });
    return { label: home.label, quote };
  }
}
