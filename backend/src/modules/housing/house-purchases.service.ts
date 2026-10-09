import { Injectable } from '@nestjs/common';
import {
  BLUEPRINTS,
  DAYS_PER_MONTH,
  DISTRICTS,
  LAND_DISTRICT_IDS,
  LAND_TITLES,
  PLOT_SQM,
  annualRentRoll,
  districtComfortBonus,
  findHouseListing,
  formatNaira,
  generateHouseListings,
  monthIndexOf,
  weekEndsAt,
  weekIndexOf,
  weekStartsAt,
  type DistrictId,
  type HouseListing,
  type HouseListingDto,
} from '@insidelife/shared';
import {
  ConflictException,
  GameRuleException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { BuildingEntity } from './entities/building.entity.js';
import { PropertyEntity } from './entities/property.entity.js';
import { isHouseListingBought, propertyValue } from './housing.rules.js';
import { HousingStore } from './housing.store.js';

export interface HousePurchase {
  readonly listing: HouseListing;
  readonly property: PropertyEntity;
  readonly building: BuildingEntity;
}

/**
 * Ready-built houses: a weekly, seeded market of finished houses (the same districts and titles as land), and buying
 * one outright — the land and a completed building land in your portfolio exactly as a finished construction would
 * leave them, so valuation, upkeep, letting, selling, inheritance and moving in all work unchanged.
 */
@Injectable()
export class HousePurchasesService {
  constructor(private readonly store: HousingStore) {}

  /** This week's houses for sale, cheapest first. */
  async listings(ctx: SimulationContext, districtId?: DistrictId): Promise<HouseListingDto[]> {
    if (districtId) this.assertSellingDistrict(districtId);
    const week = weekIndexOf(ctx.time);
    const acquired = await this.store.acquiredSince(ctx, weekStartsAt(week));
    return (districtId ? [districtId] : LAND_DISTRICT_IDS)
      .flatMap((id) => generateHouseListings(ctx.world.seed, id, week))
      .map((listing) => this.toDto(ctx, listing, isHouseListingBought(listing, acquired)))
      .toSorted((a, b) => a.price - b.price || a.id.localeCompare(b.id));
  }

  /** Pay for a listed house and take the keys (the caller decides whether to move in). */
  async buy(ctx: SimulationContext, listingId: string): Promise<HousePurchase> {
    const listing = findHouseListing(ctx.world.seed, listingId);
    if (!listing) throw new ResourceNotFoundException('Listing');
    if (listing.weekIndex !== weekIndexOf(ctx.time)) {
      throw new GameRuleException(
        'LISTING_GONE',
        'Omo, another buyer don pay for that house. Check this week’s houses for sale.',
      );
    }
    if (isHouseListingBought(listing, await this.store.acquiredSince(ctx, weekStartsAt(listing.weekIndex)))) {
      throw new ConflictException(
        'HOUSE_ALREADY_BOUGHT',
        'You already bought this house — the keys are in your Property tab.',
      );
    }

    const { quote } = listing;
    const district = DISTRICTS[listing.districtId];
    const blueprint = BLUEPRINTS[listing.blueprintId];
    const titleLabel = LAND_TITLES[listing.title].shortLabel;
    if (!ctx.wallet.canAfford(quote.total)) {
      throw new GameRuleException(
        'INSUFFICIENT_FUNDS',
        `The ${blueprint.label.toLowerCase()} at ${listing.label}, ${district.name} costs ${formatNaira(quote.total)} with agency, legal and survey fees. You have ${formatNaira(ctx.wallet.cash)}. Buying land and building lets you pay in stages — if you can wait.`,
      );
    }

    // Keys are per character and listing (the listing id carries the week); buying the same listing twice is refused above.
    const key = `house:${listing.id}`;
    await ctx.wallet.pay(
      quote.price,
      'property',
      `House: ${blueprint.label}, ${listing.label}, ${district.name} (${titleLabel})`,
      key,
    );
    await ctx.wallet.pay(
      quote.costs.total,
      'fee',
      `Agency, legal & survey fees — ${listing.label}`,
      `${key}:fees`,
      { sink: 'fees' },
    );

    const property = ctx.manager.create(PropertyEntity, {
      characterId: ctx.character.id,
      districtId: listing.districtId,
      label: listing.label,
      plots: listing.plots,
      title: listing.title,
      status: 'owned',
      purchasePrice: quote.landShare,
      costBasis: quote.total,
      marketValue: quote.land.marketValue,
      lastAppreciatedMonth: monthIndexOf(ctx.time) - 1,
      valueHistory: [],
      dispute: null,
      titlePerfection: null,
      arrears: 0,
      acquiredAt: ctx.time,
      disposedAt: null,
    });
    const building = ctx.manager.create(BuildingEntity, {
      characterId: ctx.character.id,
      blueprintId: listing.blueprintId,
      status: 'complete',
      paymentPlan: 'upfront',
      budget: quote.buildingShare,
      costPaid: quote.buildingShare,
      progressDays: blueprint.months * DAYS_PER_MONTH,
      durationDays: blueprint.months * DAYS_PER_MONTH,
      milestonesPaid: blueprint.months,
      milestones: blueprint.months,
      startedAt: ctx.time,
      completedAt: ctx.time,
      stalledSince: null,
      overrun: null,
      value: quote.structureValue,
      condition: listing.condition,
      ownerOccupied: false,
      letting: false,
      units: [],
    });
    property.valueHistory = [{ t: ctx.time, value: propertyValue(property, building) }];
    const savedProperty = await this.store.addProperty(ctx, property);
    building.propertyId = savedProperty.id;
    const savedBuilding = await this.store.addBuilding(ctx, building);

    ctx.notify({
      kind: 'property',
      title: 'The keys are yours!',
      body: `You bought the ${blueprint.label.toLowerCase()} at ${listing.label}, ${district.name} (${titleLabel}). Move in, or let it out and collect rent.`,
      tone: 'good',
      amount: -quote.total,
    });
    ctx.report({
      label: `Bought a ${blueprint.label.toLowerCase()} — ${listing.label}`,
      amount: -quote.total,
      tone: 'good',
    });
    return { listing, property: savedProperty, building: savedBuilding };
  }

  private toDto(ctx: SimulationContext, listing: HouseListing, bought: boolean): HouseListingDto {
    const district = DISTRICTS[listing.districtId];
    const blueprint = BLUEPRINTS[listing.blueprintId];
    const title = LAND_TITLES[listing.title];
    const { quote } = listing;
    return {
      id: listing.id,
      districtId: listing.districtId,
      districtName: district.name,
      blueprintId: listing.blueprintId,
      blueprintLabel: blueprint.label,
      label: listing.label,
      title: listing.title,
      titleLabel: title.label,
      plots: listing.plots,
      sizeSqm: listing.plots * PLOT_SQM,
      bedrooms: blueprint.bedrooms,
      units: blueprint.units,
      condition: listing.condition,
      ageYears: listing.ageYears,
      story: listing.story,
      features: listing.features,
      comfort: blueprint.comfort + districtComfortBonus(listing.districtId),
      gridHours: district.gridHours,
      floodRisk: district.floodRisk,
      disputeRiskPerYear: title.disputePerYear,
      demolitionRiskPerYear: title.demolitionPerYear,
      expectedAppreciation: district.landAppreciation,
      annualRentRoll: annualRentRoll(listing.blueprintId, listing.districtId),
      valuation: quote.valuation,
      premium: quote.premium,
      price: quote.price,
      costs: quote.costs,
      total: quote.total,
      affordable: ctx.wallet.canAfford(quote.total),
      bought,
      availableUntil: weekEndsAt(listing.weekIndex),
    };
  }

  private assertSellingDistrict(districtId: DistrictId): void {
    if (DISTRICTS[districtId].landPricePerPlot === null) {
      throw new GameRuleException(
        'NO_HOUSES_HERE',
        `Nobody is selling houses in ${DISTRICTS[districtId].name} — owners there hold tight. Try Ikeja, Lekki, Ikoyi, Ajah, Ikorodu, Ojo or Epe.`,
      );
    }
  }
}
