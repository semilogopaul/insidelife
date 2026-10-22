import { Injectable } from '@nestjs/common';
import {
  BLUEPRINTS,
  MINUTES_PER_DAY,
  MINUTES_PER_YEAR,
  formatDate,
  formatNaira,
  marketRent,
  roundRent,
  type TenancyAction,
} from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { BuildingEntity, RentalUnit } from './entities/building.entity.js';
import type { PropertyEntity } from './entities/property.entity.js';
import {
  TENANT_RENEWAL_CHANCE,
  TENANT_SEARCH_DAYS,
  VACANCY_DAYS,
  conditionRentFactor,
  days,
  lettableUnits,
  tenantName,
} from './housing.rules.js';
import { HousingStore } from './housing.store.js';

/**
 * Being a landlord: let a finished building to NPC tenants who pay a year upfront (Lagos-style), renew or pack out
 * each year, and leave units empty for a while in between. The owner can live in one flat of a block and let the rest.
 */
@Injectable()
export class LettingsService {
  constructor(private readonly store: HousingStore) {}

  async setTenancy(ctx: SimulationContext, propertyId: string, action: TenancyAction): Promise<{ property: PropertyEntity; building: BuildingEntity; refund: number }> {
    const property = await this.store.property(ctx, propertyId);
    const building = this.store.buildingOf(await this.store.portfolio(ctx), property.id);
    if (!building || building.status !== 'complete') {
      throw new GameRuleException(
        'NOT_BUILT',
        building?.status === 'under-construction'
          ? 'The building isn’t finished — tenants don’t move into uncompleted houses.'
          : 'There’s no house on this land to let. Build first.',
      );
    }
    return action === 'let' ? { property, building, refund: await this.let(ctx, building) } : { property, building, refund: await this.vacate(ctx, building) };
  }

  /** Can the owner move into this building right now? Throws with the reason if not. */
  /** Whether the owner has a free unit to live in (a building not let out always has). */
  ownerCanMoveIn(building: BuildingEntity): boolean {
    return !building.letting || building.units.some((unit) => unit.tenant === null);
  }

  assertOwnerCanMoveIn(building: BuildingEntity): void {
    if (!this.ownerCanMoveIn(building)) {
      throw new GameRuleException(
        'TENANTS_INSIDE',
        BLUEPRINTS[building.blueprintId].units > 1
          ? 'Every flat has a tenant. Vacate (refund their unused rent) or wait for one to pack out.'
          : 'Your tenant is living there. Vacate first — you’ll refund their unused rent.',
      );
    }
  }

  /** The owner takes one empty unit for themselves. */
  async occupyByOwner(ctx: SimulationContext, building: BuildingEntity): Promise<void> {
    if (building.letting) {
      const free = building.units.findIndex((unit) => unit.tenant === null);
      building.units = building.units.filter((_, index) => index !== free);
      if (building.units.length === 0) building.letting = false;
    }
    building.ownerOccupied = true;
    await this.store.save(ctx, building);
  }

  /** The owner moved out; their flat goes back on the market if letting is on. */
  async releaseOwner(ctx: SimulationContext, buildingId: string): Promise<void> {
    const building = (await this.store.portfolio(ctx)).buildings.find((candidate) => candidate.id === buildingId);
    if (!building || !building.ownerOccupied) return;
    building.ownerOccupied = false;
    if (building.letting && building.units.length < lettableUnits(building)) {
      building.units = [...building.units, this.searchingUnit(ctx, building, this.nextUnitNumber(building))];
    }
    await this.store.save(ctx, building);
  }

  /** Daily: new tenants for empty units, yearly renewals, departures. */
  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const portfolio = await this.store.portfolio(ctx);
    for (const property of await this.store.heldProperties(ctx)) {
      const building = this.store.buildingOf(portfolio, property.id);
      if (!building || building.status !== 'complete' || building.units.length === 0) continue;
      await this.tendUnits(ctx, property, building, dayIndex);
    }
  }

  private async let(ctx: SimulationContext, building: BuildingEntity): Promise<number> {
    if (building.letting) throw new GameRuleException('ALREADY_LETTING', 'Your agent is already finding tenants for this place.');
    const lettable = lettableUnits(building);
    if (lettable === 0) {
      throw new GameRuleException('YOU_LIVE_THERE', 'You live in this house — move out first (or build a block of flats and keep one for yourself).');
    }
    building.letting = true;
    building.units = Array.from({ length: lettable }, (_, index) => this.searchingUnit(ctx, building, index + 1));
    await this.store.save(ctx, building);
    return 0;
  }

  /** Stop letting: tenants get their unused rent back and pack out. */
  private async vacate(ctx: SimulationContext, building: BuildingEntity): Promise<number> {
    if (!building.letting && building.units.length === 0) throw new GameRuleException('NOT_LETTING', 'There are no tenants to vacate.');
    const refund = building.units.reduce(
      (sum, unit) => sum + (unit.tenant && unit.paidUntil !== null && unit.paidUntil > ctx.time ? Math.round((unit.annualRent * (unit.paidUntil - ctx.time)) / MINUTES_PER_YEAR) : 0),
      0,
    );
    if (refund > 0) {
      if (!ctx.wallet.canAfford(refund)) {
        throw new GameRuleException('INSUFFICIENT_FUNDS', `Your tenants paid upfront. Refund their unused rent (${formatNaira(refund)}) and they’ll pack out.`);
      }
      await ctx.wallet.pay(refund, 'refund', 'Unused rent refunded to tenants', `vacate:${building.id}:${ctx.time}`);
      // Refunded rent was counted as earned income when collected; take it back out so let→vacate cycles can't pad
      // the self-made rich list. (The wallet has no "reverse income" posting yet — see the housing report.)
      ctx.character.earnedTotal = Math.max(0, ctx.character.earnedTotal - refund);
    }
    building.letting = false;
    building.units = [];
    await this.store.save(ctx, building);
    return refund;
  }

  private async tendUnits(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity, dayIndex: number): Promise<void> {
    let changed = false;
    const units: RentalUnit[] = [];
    for (const unit of building.units) {
      if (unit.tenant === null) {
        if (building.letting && unit.vacantUntil !== null && ctx.time >= unit.vacantUntil) {
          units.push(await this.moveTenantIn(ctx, property, building, unit, dayIndex));
          changed = true;
        } else {
          units.push(unit);
        }
        continue;
      }
      if (unit.paidUntil === null || ctx.time < unit.paidUntil) {
        units.push(unit);
        continue;
      }
      changed = true;
      const next = building.letting ? await this.renewOrLeave(ctx, property, building, unit) : null;
      if (next) units.push(next);
    }
    if (!changed) return;
    building.units = units;
    await this.store.save(ctx, building);
  }

  private async moveTenantIn(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity, unit: RentalUnit, dayIndex: number): Promise<RentalUnit> {
    const rng = ctx.rng('tenant', building.id, unit.unit, dayIndex);
    const rent = roundRent(marketRent(property.districtId, BLUEPRINTS[building.blueprintId].unitType) * conditionRentFactor(building.condition) * rng.float(0.9, 1.05));
    const tenant = tenantName(rng);
    await this.collect(ctx, property, building, unit.unit, rent, `${tenant} moved in`);
    return { unit: unit.unit, tenant, annualRent: rent, paidUntil: ctx.time + MINUTES_PER_YEAR, vacantUntil: null };
  }

  private async renewOrLeave(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity, unit: RentalUnit): Promise<RentalUnit> {
    const rng = ctx.rng('tenant-renewal', building.id, unit.unit, unit.paidUntil ?? 0);
    if (unit.tenant && unit.paidUntil !== null && rng.chance(TENANT_RENEWAL_CHANCE)) {
      const rent = roundRent(unit.annualRent * (1 + rng.float(0, 0.1)));
      await this.collect(ctx, property, building, unit.unit, rent, `${unit.tenant} renewed`);
      return { ...unit, annualRent: rent, paidUntil: unit.paidUntil + MINUTES_PER_YEAR };
    }
    const vacantUntil = ctx.time + days(rng.int(VACANCY_DAYS.min, VACANCY_DAYS.max));
    ctx.notify({
      kind: 'property',
      title: 'Tenant packed out',
      body: `${unit.tenant ?? 'Your tenant'} left ${property.label}. Your agent is looking for someone new (by about ${formatDate(vacantUntil)}).`,
      tone: 'neutral',
    });
    return { unit: unit.unit, tenant: null, annualRent: 0, paidUntil: null, vacantUntil };
  }

  /** Annual rent, upfront — earned income. */
  private async collect(ctx: SimulationContext, property: PropertyEntity, building: BuildingEntity, unit: number, rent: number, what: string): Promise<void> {
    const dueDay = Math.floor(ctx.time / MINUTES_PER_DAY);
    await ctx.wallet.receive(rent, 'rental-income', `Rent from ${property.label} (unit ${unit})`, `rent-in:${building.id}:${unit}:${dueDay}`, {
      income: 'earned',
    });
    ctx.notify({ kind: 'property', title: 'Alert! Rent don land', body: `${what} at ${property.label} and paid ${formatNaira(rent)} for the year.`, tone: 'good', amount: rent });
    ctx.report({ label: `Rent collected — ${property.label}`, amount: rent, tone: 'good' });
  }

  private searchingUnit(ctx: SimulationContext, building: BuildingEntity, unit: number): RentalUnit {
    const searchDays = ctx.rng('tenant-search', building.id, unit, ctx.time).int(TENANT_SEARCH_DAYS.min, TENANT_SEARCH_DAYS.max);
    return { unit, tenant: null, annualRent: 0, paidUntil: null, vacantUntil: ctx.time + days(searchDays) };
  }

  private nextUnitNumber(building: BuildingEntity): number {
    const taken = new Set(building.units.map((unit) => unit.unit));
    for (let unit = 1; ; unit++) if (!taken.has(unit)) return unit;
  }
}
