import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DISTRICTS, FAMILY_HINT_AGE, NO_EXTERIOR, isFloodDay, type OwnedPropertyMarkerDto, type ProfileContext } from '@insidelife/shared';
import type { SimulationSystem, SummaryContribution } from '../simulation/interfaces/simulation-system.interface.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { SimulationRegistry } from '../simulation/simulation-registry.service.js';
import { ComfortService } from './comfort.service.js';
import { ConstructionService } from './construction.service.js';
import { HomeService } from './home.service.js';
import { HousingService } from './housing.service.js';
import { HOUSING_ROWS, HousingStore } from './housing.store.js';
import { LandService } from './land.service.js';
import { LettingsService } from './lettings.service.js';
import { PowerService } from './power.service.js';
import { PropertySalesService } from './property-sales.service.js';
import { RentalsService } from './rentals.service.js';
import { UpkeepService } from './upkeep.service.js';

/**
 * Housing in the simulation: the family house at birth, the family discount on living costs, home comfort and NEPA
 * in the needs model, and the daily/monthly life of leases, land, construction sites, tenants and upkeep.
 */
@Injectable()
export class HousingSystem implements SimulationSystem, OnModuleInit {
  readonly key = 'housing';
  readonly order = 150;
  readonly rowProbes = Object.values(HOUSING_ROWS);

  constructor(
    private readonly registry: SimulationRegistry,
    private readonly store: HousingStore,
    private readonly homes: HomeService,
    private readonly comfort: ComfortService,
    private readonly power: PowerService,
    private readonly rentals: RentalsService,
    private readonly land: LandService,
    private readonly construction: ConstructionService,
    private readonly lettings: LettingsService,
    private readonly upkeep: UpkeepService,
    private readonly sales: PropertySalesService,
    private readonly housing: HousingService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  /** Born into the family house in the birth district. */
  async onCharacterCreated(ctx: SimulationContext): Promise<void> {
    await this.store.residence(ctx);
  }

  /** Parents feed you while you live at home — less generously after 25. */
  livingCostMultiplier(ctx: SimulationContext): Promise<number> {
    return this.homes.livingCostMultiplier(ctx);
  }

  /** Lifestyle sets the base comfort; the home adds type + area + furniture and NEPA takes some back. */
  async profileContext(ctx: SimulationContext, base: ProfileContext): Promise<ProfileContext> {
    const comfort = await this.comfort.breakdown(ctx);
    return { ...base, comfort: base.comfort + comfort.total, bedQuality: Math.max(0, Math.min(1, comfort.bedQuality)) };
  }

  async onDayEnd(ctx: SimulationContext, dayIndex: number): Promise<void> {
    await this.power.chargeFuel(ctx, dayIndex);
    await this.streetFlood(ctx, dayIndex);
    await this.familyHints(ctx);
    await this.rentals.onDayEnd(ctx);
    await this.land.onDayEnd(ctx, dayIndex);
    await this.construction.onDayEnd(ctx);
    await this.lettings.onDayEnd(ctx, dayIndex);
    await this.upkeep.onDayEnd(ctx, dayIndex);
    await this.sales.onDayEnd(ctx);
  }

  async onMonthEnd(ctx: SimulationContext, monthIndex: number): Promise<void> {
    await this.land.onMonthEnd(ctx, monthIndex);
  }

  async summarize(ctx: SimulationContext): Promise<SummaryContribution> {
    const home = await this.homes.current(ctx);
    const comfort = await this.comfort.breakdown(ctx);
    return {
      home: { label: home.label, districtId: home.districtId, comfort: Math.round(comfort.total), ownership: home.ownership, decor: home.decor },
      properties: await this.markers(ctx),
    };
  }

  /** Your land and houses, for the city map: bare land, a building site, or the finished house. */
  private async markers(ctx: SimulationContext): Promise<OwnedPropertyMarkerDto[]> {
    const portfolio = await this.store.portfolio(ctx);
    return portfolio.properties.map((property) => {
      const building = this.store.buildingOf(portfolio, property.id);
      const standing = building && building.status !== 'demolished' ? building : null;
      return {
        id: property.id,
        districtId: property.districtId,
        label: property.label,
        stage: !standing ? 'land' : standing.status === 'complete' ? 'built' : 'construction',
        blueprintId: standing?.blueprintId ?? null,
        livedIn: ctx.character.homePropertyId === property.id,
        exterior: standing?.exterior ?? NO_EXTERIOR,
      };
    });
  }

  /** Land and buildings at valuation, plus the caution deposit the landlord is holding. */
  async netWorth(ctx: SimulationContext): Promise<number> {
    const lease = await this.store.lease(ctx);
    return (await this.housing.propertyValue(ctx)) + (lease?.status === 'active' ? lease.cautionDeposit : 0);
  }

  status(ctx: SimulationContext): Promise<number> {
    return this.housing.prestige(ctx);
  }

  async onDeath(ctx: SimulationContext): Promise<void> {
    await this.rentals.onDeath(ctx);
  }

  private async streetFlood(ctx: SimulationContext, dayIndex: number): Promise<void> {
    const home = await this.homes.current(ctx);
    if (!isFloodDay(ctx.world.seed, dayIndex, DISTRICTS[home.districtId].floodRisk)) return;
    await this.homes.markStreetFlood(ctx, dayIndex);
    ctx.notify({ kind: 'property', title: 'Flood for your street', body: `Heavy rain flooded ${DISTRICTS[home.districtId].name}. Wade carefully.`, tone: 'bad' });
  }

  /** At 25 the family starts asking when you're moving out (and the free food gets less free). */
  private async familyHints(ctx: SimulationContext): Promise<void> {
    const residence = await this.store.residence(ctx);
    if (residence.kind !== 'family' || residence.familyHints > 0 || ctx.age < FAMILY_HINT_AGE) return;
    residence.familyHints = 1;
    await this.store.save(ctx, residence);
    ctx.notify({
      kind: 'family',
      title: '“So when are you moving out?”',
      body: 'Mummy has started dropping hints at dinner. From now on you contribute more to the house (family discount on living costs drops).',
      tone: 'neutral',
    });
  }
}
