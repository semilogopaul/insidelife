import { Injectable } from '@nestjs/common';
import {
  BLUEPRINTS,
  DISTRICTS,
  FAMILY_HOMES,
  LAND_TITLES,
  familyLivingCostMultiplier,
  formatDate,
  formatNaira,
  homePrestige,
  portfolioPrestige,
  type BlueprintId,
  type BuyHouseResultDto,
  type BuyLandRequest,
  type ConstructionPaymentPlan,
  type DecorMakeoverRequest,
  type DistrictId,
  type ExteriorMakeoverRequest,
  type HouseListingDto,
  type HousingActionResultDto,
  type HousingOverviewDto,
  type LandOfferDto,
  type RentalListingDto,
  type RentalListingsQuery,
  type TenancyAction,
} from '@insidelife/shared';
import type { HomeSnapshot, HouseholdPort } from '../../common/ports/household.port.js';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { ComfortService } from './comfort.service.js';
import { ConstructionService } from './construction.service.js';
import { ResidenceEntity } from './entities/residence.entity.js';
import { HomeService } from './home.service.js';
import { HousePurchasesService } from './house-purchases.service.js';
import { MakeoverService } from './makeover.service.js';
import { toConstructionDto, toHomeDto, toLeaseDto, toPropertyDto } from './housing.mapper.js';
import { propertyValue } from './housing.rules.js';
import { HousingStore } from './housing.store.js';
import { LandService } from './land.service.js';
import { LettingsService } from './lettings.service.js';
import { MovesService } from './moves.service.js';
import { PowerService } from './power.service.js';
import { PropertySalesService } from './property-sales.service.js';
import { RentalsService } from './rentals.service.js';

type ActionCopy = Omit<HousingActionResultDto, 'housing'>;

/**
 * Housing façade: implements the cross-domain `HouseholdPort`, builds the Homes view, and turns each player command
 * into a warm result card plus the refreshed view. The rules live in the specialised services.
 */
@Injectable()
export class HousingService implements HouseholdPort {
  constructor(
    private readonly store: HousingStore,
    private readonly homes: HomeService,
    private readonly comfort: ComfortService,
    private readonly power: PowerService,
    private readonly rentals: RentalsService,
    private readonly moves: MovesService,
    private readonly land: LandService,
    private readonly construction: ConstructionService,
    private readonly lettings: LettingsService,
    private readonly sales: PropertySalesService,
    private readonly houses: HousePurchasesService,
    private readonly makeovers: MakeoverService,
  ) {}

  // ----- HouseholdPort ----------------------------------------------------------------------------------------------

  async home(ctx: SimulationContext): Promise<HomeSnapshot> {
    const home = await this.homes.current(ctx);
    const comfort = await this.comfort.breakdown(ctx);
    return {
      ownership: home.ownership,
      label: home.label,
      districtId: home.districtId,
      comfort: comfort.bonus,
      annualRent: home.annualRent,
      bedrooms: home.bedrooms,
      decor: home.decor,
    };
  }

  async propertyValue(ctx: SimulationContext): Promise<number> {
    const portfolio = await this.store.portfolio(ctx);
    let total = 0;
    for (const property of await this.store.heldProperties(ctx)) total += propertyValue(property, this.store.buildingOf(portfolio, property.id));
    return total;
  }

  /**
   * Hand the deceased's land and buildings (and any sale in progress) to their heir; if the deceased lived in their
   * own house, the heir wakes up there. Returns the value transferred. Intended for succession — proposed as
   * `HouseholdPort.transferEstate` (see the housing report).
   */
  async transferEstate(ctx: SimulationContext, heirCharacterId: string): Promise<number> {
    const portfolio = await this.store.portfolio(ctx);
    const held = await this.store.heldProperties(ctx);
    if (held.length === 0) return 0;
    const value = await this.propertyValue(ctx);
    const ids = new Set(held.map((property) => property.id));
    for (const property of held) {
      property.characterId = heirCharacterId;
      await this.store.save(ctx, property);
    }
    for (const building of portfolio.buildings.filter((candidate) => ids.has(candidate.propertyId))) {
      building.characterId = heirCharacterId;
      await this.store.save(ctx, building);
    }
    for (const sale of portfolio.sales.filter((candidate) => ids.has(candidate.propertyId))) {
      sale.characterId = heirCharacterId;
      await this.store.save(ctx, sale);
    }

    const residence = await this.store.residence(ctx);
    if (residence.kind === 'owned' && residence.buildingId && !(await ctx.manager.exists(ResidenceEntity, { where: { characterId: heirCharacterId } }))) {
      await ctx.manager.save(
        ctx.manager.create(ResidenceEntity, {
          characterId: heirCharacterId,
          kind: 'owned',
          leaseId: null,
          buildingId: residence.buildingId,
          familyDistrictId: residence.familyDistrictId,
          familyComfort: residence.familyComfort,
          movedInAt: ctx.time,
          generatorDryDay: null,
          lastFloodDay: null,
          securityUntil: null,
          familyHints: 0,
        }),
      );
    }
    // The deceased no longer holds any of it.
    portfolio.properties.splice(0, portfolio.properties.length, ...portfolio.properties.filter((property) => !ids.has(property.id)));
    portfolio.buildings.splice(0, portfolio.buildings.length, ...portfolio.buildings.filter((building) => !ids.has(building.propertyId)));
    portfolio.sales.splice(0, portfolio.sales.length, ...portfolio.sales.filter((sale) => !ids.has(sale.propertyId)));
    return value;
  }

  /** Clout from where you live plus being a property owner. */
  async prestige(ctx: SimulationContext): Promise<number> {
    const home = await this.homes.current(ctx);
    return homePrestige(home.districtId, home.prestigeMultiplier, home.ownership) + portfolioPrestige(await this.propertyValue(ctx));
  }

  // ----- Views ------------------------------------------------------------------------------------------------------

  async overview(ctx: SimulationContext): Promise<HousingOverviewDto> {
    const home = await this.homes.current(ctx);
    const comfort = await this.comfort.breakdown(ctx);
    const power = await this.power.status(ctx);
    const lease = await this.store.lease(ctx);
    const portfolio = await this.store.portfolio(ctx);
    const residence = await this.store.residence(ctx);
    const livingCost = await this.homes.livingCostMultiplier(ctx);
    const portfolioValue = await this.propertyValue(ctx);
    const held = await this.store.heldProperties(ctx);
    const properties = held.map((property) =>
      toPropertyDto(property, this.store.buildingOf(portfolio, property.id), this.store.saleOf(portfolio, property.id), ctx.time),
    );
    const constructions = held.flatMap((property) => {
      const building = this.store.buildingOf(portfolio, property.id);
      return building?.status === 'under-construction' ? [toConstructionDto(building, ctx.time)] : [];
    });
    return {
      home: toHomeDto(home, comfort, homePrestige(home.districtId, home.prestigeMultiplier, home.ownership), livingCost),
      lease: lease ? toLeaseDto(lease) : null,
      power,
      family: {
        districtId: residence.familyDistrictId,
        label: `${FAMILY_HOMES[ctx.character.background].label}, ${DISTRICTS[residence.familyDistrictId].name}`,
        livingCostMultiplier: familyLivingCostMultiplier(ctx.age),
      },
      properties,
      constructions,
      portfolioValue,
    };
  }

  listings(ctx: SimulationContext, query: RentalListingsQuery): RentalListingDto[] {
    return this.rentals.listings(ctx, query);
  }

  landOffers(ctx: SimulationContext, districtId?: DistrictId): LandOfferDto[] {
    return this.land.offers(ctx, districtId);
  }

  // ----- Commands ---------------------------------------------------------------------------------------------------

  async signLease(ctx: SimulationContext, listingId: string): Promise<HousingActionResultDto> {
    const outcome = await this.rentals.sign(ctx, listingId);
    if (outcome.kind === 'scammed') {
      const { listing } = outcome;
      return this.result(ctx, {
        outcome: 'scammed',
        title: 'The agent don japa!',
        message: `You paid ${formatNaira(listing.inspectionFee)} inspection fee for “${listing.label}”. At the address, the “agent” had switched off his phone and the real owner had never heard of him. If the price too sweet, run.`,
        tone: 'bad',
      });
    }
    const { lease, paid } = outcome;
    await this.moves.moveIntoLease(ctx, lease);
    const district = DISTRICTS[lease.districtId].name;
    ctx.notify({ kind: 'property', title: 'New keys!', body: `You moved into ${lease.label}, ${district}.`, tone: 'good', amount: -paid });
    return this.result(ctx, {
      outcome: 'moved-in',
      title: 'New keys, new life!',
      message: `You paid ${formatNaira(paid)} upfront and moved into ${lease.label}, ${district}. Rent is good till ${formatDate(lease.endAt)}. Your people will come and “check the place” soon.`,
      tone: 'good',
    });
  }

  async move(ctx: SimulationContext, to: string): Promise<HousingActionResultDto> {
    await this.moves.moveTo(ctx, to);
    const home = await this.homes.current(ctx);
    ctx.notify({ kind: 'property', title: 'Moved house', body: `Home is now ${home.label}.`, tone: 'neutral' });
    return this.result(ctx, {
      outcome: 'moved',
      title: home.ownership === 'family' ? 'Back to base' : 'Welcome home, landlord',
      message:
        home.ownership === 'family'
          ? `You’ve packed your load back to ${home.label}. Mummy has already started cooking — and asking questions.`
          : `You moved into your ${home.label}, ${DISTRICTS[home.districtId].name}. Your own roof, your own rules.`,
      tone: home.ownership === 'family' ? 'neutral' : 'good',
    });
  }

  async buyLand(ctx: SimulationContext, request: BuyLandRequest): Promise<HousingActionResultDto> {
    const property = await this.land.buy(ctx, request);
    const title = LAND_TITLES[property.title];
    const warning = title.disputePerYear >= 0.08 ? ' Weak papers attract omonile — consider perfecting the title.' : '';
    return this.result(ctx, {
      outcome: 'purchased',
      title: 'You don buy land!',
      message: `${property.label}, ${DISTRICTS[property.districtId].name} (${title.shortLabel}) is yours for ${formatNaira(property.costBasis)} all-in.${warning}`,
      tone: 'good',
    });
  }

  async perfectTitle(ctx: SimulationContext, propertyId: string): Promise<HousingActionResultDto> {
    const property = await this.land.perfectTitle(ctx, propertyId);
    const pending = property.titlePerfection;
    return this.result(ctx, {
      outcome: 'perfecting',
      title: 'Papers submitted at Alausa',
      message: pending
        ? `You paid ${formatNaira(pending.fee)} to perfect ${property.label} to ${LAND_TITLES[pending.to].label}. Ready around ${formatDate(pending.readyAt)} — if the file doesn’t “miss”.`
        : 'Your papers are processing.',
      tone: 'neutral',
    });
  }

  async startConstruction(
    ctx: SimulationContext,
    propertyId: string,
    blueprintId: BlueprintId,
    plan: ConstructionPaymentPlan,
  ): Promise<HousingActionResultDto> {
    const building = await this.construction.start(ctx, propertyId, blueprintId, plan);
    const blueprint = BLUEPRINTS[blueprintId];
    return this.result(ctx, {
      outcome: 'building',
      title: 'Foundation don enter ground!',
      message:
        plan === 'upfront'
          ? `You paid ${formatNaira(building.budget)} upfront for a ${blueprint.label.toLowerCase()}. About ${blueprint.months} months to go — watch out for “cement don go up”.`
          : `Contractor mobilised with ${formatNaira(building.costPaid)}. ${blueprint.months - 1} more monthly payments; work stops if a milestone isn’t paid.`,
      tone: 'good',
    });
  }

  async setTenancy(ctx: SimulationContext, propertyId: string, action: TenancyAction): Promise<HousingActionResultDto> {
    const { property, building, refund } = await this.lettings.setTenancy(ctx, propertyId, action);
    if (action === 'let') {
      return this.result(ctx, {
        outcome: 'letting',
        title: 'To Let signboard is up',
        message: `Your agent is finding tenants for ${building.units.length} unit${building.units.length > 1 ? 's' : ''} at ${property.label}. Tenants pay a full year upfront.`,
        tone: 'good',
      });
    }
    return this.result(ctx, {
      outcome: 'vacated',
      title: 'Tenants packing out',
      message: refund > 0 ? `You refunded ${formatNaira(refund)} of unused rent and the tenants are leaving ${property.label}.` : `${property.label} is off the rental market.`,
      tone: 'neutral',
    });
  }

  async listForSale(ctx: SimulationContext, propertyId: string): Promise<HousingActionResultDto> {
    const { property, sale } = await this.sales.list(ctx, propertyId);
    return this.result(ctx, {
      outcome: 'listed',
      title: 'For Sale signboard is up',
      message: `Your agent values ${property.label} at about ${formatNaira(sale.askingPrice)} and expects a buyer by ${formatDate(sale.closesAt)}. Commission: ${Math.round(sale.agentRate * 100)}%.`,
      tone: 'neutral',
    });
  }

  async cancelSale(ctx: SimulationContext, propertyId: string): Promise<HousingActionResultDto> {
    const property = await this.sales.cancel(ctx, propertyId);
    return this.result(ctx, { outcome: 'sale-cancelled', title: 'Sale cancelled', message: `${property.label} is off the market.`, tone: 'neutral' });
  }

  // ----- Houses for sale (ready-built) ------------------------------------------------------------------------------

  houseListings(ctx: SimulationContext, districtId?: DistrictId): Promise<HouseListingDto[]> {
    return this.houses.listings(ctx, districtId);
  }

  async buyHouse(ctx: SimulationContext, listingId: string): Promise<BuyHouseResultDto> {
    const { property, building } = await this.houses.buy(ctx, listingId);
    const title = LAND_TITLES[property.title];
    const warning = title.disputePerYear >= 0.08 ? ' Weak papers attract omonile — consider perfecting the title.' : '';
    // A house you buy is a house you live in: move straight in (the old lease ends as with any move). If that can't
    // happen right now, the purchase still stands and Homes explains why.
    const movedIn = await this.moves.moveTo(ctx, property.id).then(
      () => true,
      (error: unknown) => {
        if (error instanceof GameRuleException) return false;
        throw error;
      },
    );
    const what = `The ${BLUEPRINTS[building.blueprintId].label.toLowerCase()} at ${property.label}, ${DISTRICTS[property.districtId].name} (${title.shortLabel})`;
    const result = await this.result(ctx, {
      outcome: 'house-purchased',
      title: movedIn ? 'Welcome home, landlord!' : 'The keys are yours!',
      message: movedIn
        ? `${what} is yours for ${formatNaira(property.costBasis)} all-in, and you’ve moved in. Your own roof, your own rules.${warning}`
        : `${what} is yours for ${formatNaira(property.costBasis)} all-in. Move in from Homes, or let it out and collect rent.${warning}`,
      tone: 'good',
    });
    return { ...result, propertyId: property.id };
  }

  // ----- Makeovers ---------------------------------------------------------------------------------------------------

  async restyleHouse(ctx: SimulationContext, propertyId: string, request: ExteriorMakeoverRequest): Promise<HousingActionResultDto> {
    const { label, quote } = await this.makeovers.exterior(ctx, propertyId, request);
    return this.result(ctx, { outcome: 'house-restyled', title: 'Fresh look!', message: `${label}: ${quote.lines.map((line) => line.label).join(', ')} — ${formatNaira(quote.total)}.`, tone: 'good' });
  }

  async redecorate(ctx: SimulationContext, request: DecorMakeoverRequest): Promise<HousingActionResultDto> {
    const { quote } = await this.makeovers.decor(ctx, request);
    return this.result(ctx, { outcome: 'home-redecorated', title: 'Painters don finish', message: `${quote.lines.map((line) => line.label).join(', ')} — ${formatNaira(quote.total)}.`, tone: 'good' });
  }

  private async result(ctx: SimulationContext, copy: ActionCopy): Promise<HousingActionResultDto> {
    return { ...copy, housing: await this.overview(ctx) };
  }
}
