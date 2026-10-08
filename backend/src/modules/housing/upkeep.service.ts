import { Injectable } from '@nestjs/common';
import { DAYS_PER_YEAR, DISTRICTS, UPKEEP_RATE, formatNaira, isFloodDay } from '@insidelife/shared';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { BuildingEntity } from './entities/building.entity.js';
import type { PropertyEntity } from './entities/property.entity.js';
import { BUILDING_DEPRECIATION, heldFraction, landUseCharge, propertyValue } from './housing.rules.js';
import { HousingStore } from './housing.store.js';

/** Unpaid land use charge attracts this penalty. */
const LUC_PENALTY = 0.1;
/** Condition lost when the yearly upkeep can't be paid. */
const NEGLECT_CONDITION_HIT = 10;
const MIN_CONDITION = 20;

/**
 * Owning property costs money: flood repairs in flood-prone districts, 1%/yr upkeep, the Lagos Land Use Charge
 * (charged at year end), and slow depreciation of the structure.
 */
@Injectable()
export class UpkeepService {
  constructor(private readonly store: HousingStore) {}

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const portfolio = await this.store.portfolio(ctx);
    const held = await this.store.heldProperties(ctx);
    for (const property of held) {
      const building = this.store.buildingOf(portfolio, property.id);
      if (building && building.status !== 'demolished' && isFloodDay(ctx.world.seed, dayIndex, DISTRICTS[property.districtId].floodRisk)) {
        await this.floodDamage(ctx, property, building, dayIndex);
      }
    }
    if ((dayIndex + 1) % DAYS_PER_YEAR !== 0) return;
    const year = Math.floor(dayIndex / DAYS_PER_YEAR);
    for (const property of held) await this.yearEnd(ctx, property, this.store.buildingOf(portfolio, property.id), year);
  }

  private async floodDamage(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity, dayIndex: number): Promise<void> {
    const rng = ctx.rng('property-flood', building.id, dayIndex);
    if (building.status === 'under-construction') {
      const setback = rng.int(2, 6);
      building.progressDays = Math.max(0, building.progressDays - setback);
      await this.store.save(ctx, building);
      ctx.notify({ kind: 'property', title: 'Flood on your site', body: `Rain washed blocks away at ${property.label}. About ${setback} days of work lost.`, tone: 'bad' });
      return;
    }
    const damage = rng.int(3, 12);
    const repairs = Math.round((building.value * (damage / 100) * 0.6) / 10_000) * 10_000;
    const paid = repairs > 0 && (await ctx.wallet.tryPay(repairs, 'property', `Flood repairs — ${property.label}`, `flood:${building.id}:${dayIndex}`));
    if (paid) {
      ctx.notify({ kind: 'property', title: 'Flood repairs done', body: `Flood entered ${property.label}. Repairs cost ${formatNaira(repairs)}.`, tone: 'bad', amount: -repairs });
      ctx.report({ label: `Flood repairs — ${property.label}`, amount: -repairs, tone: 'bad' });
      return;
    }
    building.condition = Math.max(MIN_CONDITION, building.condition - damage);
    await this.store.save(ctx, building);
    ctx.notify({
      kind: 'property',
      title: 'Flood damaged your property',
      body: `Flood entered ${property.label} and you couldn’t afford repairs (${formatNaira(repairs)}). The building is in worse shape — rents and value drop.`,
      tone: 'bad',
    });
  }

  private async yearEnd(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity | null, year: number): Promise<void> {
    const ownerOccupied = building?.ownerOccupied ?? false;
    const charge = landUseCharge(propertyValue(property, building) + property.arrears, ownerOccupied, heldFraction(property.acquiredAt, ctx.time));
    const due = charge + property.arrears;
    if (due > 0) {
      const paid = await ctx.wallet.tryPay(due, 'tax', `Land Use Charge ${year} — ${property.label}`, `luc:${property.id}:${year}`, { sink: 'tax' });
      if (paid) {
        property.arrears = 0;
        ctx.report({ label: `Land Use Charge — ${property.label}`, amount: -due, tone: 'neutral' });
      } else {
        property.arrears = Math.round(property.arrears + charge * (1 + LUC_PENALTY));
        ctx.notify({
          kind: 'bill',
          title: 'Land Use Charge unpaid',
          body: `You owe Lagos State ${formatNaira(property.arrears)} on ${property.label} (with penalty). It comes out of the sale price if you sell.`,
          tone: 'bad',
        });
      }
      await this.store.save(ctx, property);
    }

    if (!building || building.status !== 'complete') return;
    const upkeep = Math.round(building.value * UPKEEP_RATE * heldFraction(building.completedAt ?? ctx.time, ctx.time));
    const maintained = await ctx.wallet.tryPay(upkeep, 'property', `Upkeep (${year}) — ${property.label}`, `upkeep:${property.id}:${year}`);
    if (!maintained) building.condition = Math.max(MIN_CONDITION, building.condition - NEGLECT_CONDITION_HIT);
    building.value = Math.round(building.value * (1 - BUILDING_DEPRECIATION));
    await this.store.save(ctx, building);
    ctx.report({ label: maintained ? `Property upkeep — ${property.label}` : `Skipped upkeep — ${property.label}`, amount: maintained ? -upkeep : undefined, tone: maintained ? 'neutral' : 'bad' });
  }
}
