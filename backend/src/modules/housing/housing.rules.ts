import {
  BLUEPRINTS,
  BUILDING_COMPLETION_PREMIUM,
  LAND_TITLES,
  LAND_USE_CHARGE_RATE,
  MAX_RENT_INCREASE,
  MINUTES_PER_DAY,
  MINUTES_PER_YEAR,
  OVERRUN_RANGE,
  weekIndexOf,
  type HouseListing,
  type LandTitleId,
  type Rng,
} from '@insidelife/shared';
import type { BuildingEntity } from './entities/building.entity.js';
import type { PropertyEntity } from './entities/property.entity.js';

/**
 * Pure housing rules used by the services (and unit-tested): valuations, renewal increases, sale splits, fees.
 * Nothing here touches the database or the wallet.
 */

export const days = (n: number): number => Math.round(n * MINUTES_PER_DAY);

/** An omonile dispute or demolition notice left unanswered this long resolves itself (badly or in court). */
export const DISPUTE_AUTO_RESOLVE_DAYS = 30;
/** Unanswered overruns resolve to cheaper materials after this many days. */
export const OVERRUN_AUTO_RESOLVE_DAYS = 20;
/** Court cases take this long. */
export const COURT_DAYS = { min: 60, max: 120 } as const;
/** Days the renewal terms are decided before the lease ends. */
export const RENEWAL_NOTICE_DAYS = 30;
/** Chance a landlord wants two years upfront at renewal (only on leases of at least ₦500k). */
export const TWO_YEARS_DEMAND_CHANCE = 0.12;
/** Chance an NPC tenant renews at the end of their year. */
export const TENANT_RENEWAL_CHANCE = 0.72;
/** Days it takes to find a tenant for an empty unit. */
export const TENANT_SEARCH_DAYS = { min: 7, max: 45 } as const;
/** Days a unit stays empty after a tenant packs out. */
export const VACANCY_DAYS = { min: 15, max: 90 } as const;
/** An unfinished building is worth this share of what has been spent on it. */
export const UNFINISHED_BUILDING_VALUE = 0.6;
/** A newly completed building is valued at cost plus this premium (shared, so house listings price it the same way). */
export const COMPLETION_PREMIUM = BUILDING_COMPLETION_PREMIUM;
/** Structures lose this much value a year to age. */
export const BUILDING_DEPRECIATION = 0.015;
/** Months of value history kept for the chart. */
export const VALUE_HISTORY_LENGTH = 36;

export function landValue(property: Pick<PropertyEntity, 'marketValue' | 'title'>): number {
  return Math.round(property.marketValue * LAND_TITLES[property.title].priceMultiplier);
}

export function buildingValue(building: Pick<BuildingEntity, 'status' | 'value' | 'condition' | 'costPaid'> | null | undefined): number {
  if (!building) return 0;
  if (building.status === 'complete') return Math.round(building.value * (building.condition / 100));
  if (building.status === 'under-construction') return Math.round(building.costPaid * UNFINISHED_BUILDING_VALUE);
  return 0;
}

/** What the property would fetch today (before agent fees), net of unpaid land use charge. */
export function propertyValue(
  property: Pick<PropertyEntity, 'marketValue' | 'title' | 'arrears'>,
  building: Pick<BuildingEntity, 'status' | 'value' | 'condition' | 'costPaid'> | null | undefined,
): number {
  return Math.max(0, landValue(property) + buildingValue(building) - property.arrears);
}

/**
 * The landlord's increase for the next term: ~55% of landlords hold rent, the rest add 5-30% (mostly 10-20%).
 * Returns a fraction, rounded to whole percent.
 */
export function rollRentIncrease(rng: Rng): number {
  if (rng.chance(0.55)) return 0;
  const pct = rng.weighted([
    { value: 5, weight: 15 },
    { value: 10, weight: 30 },
    { value: 15, weight: 25 },
    { value: 20, weight: 18 },
    { value: 25, weight: 7 },
    { value: 30, weight: 5 },
  ]);
  return Math.min(MAX_RENT_INCREASE, pct / 100);
}

export function increasedRent(annualRent: number, increase: number): number {
  return Math.round((annualRent * (1 + increase)) / 10_000) * 10_000;
}

/** Landlords "find" damages: keep 0-30% of the caution deposit. */
export function cautionRefund(deposit: number, rng: Rng): { refund: number; deducted: number } {
  const deductionRate = rng.chance(0.4) ? 0 : rng.float(0.05, 0.3);
  const deducted = Math.round((deposit * deductionRate) / 1_000) * 1_000;
  return { refund: Math.max(0, deposit - deducted), deducted };
}

/** Sale proceeds count as neutral money up to what you put in; only the profit is earned income. */
export function saleProceedsSplit(netProceeds: number, costBasis: number): { principal: number; gain: number } {
  const net = Math.max(0, Math.round(netProceeds));
  const principal = Math.min(net, Math.max(0, Math.round(costBasis)));
  return { principal, gain: net - principal };
}

/** Milestone payment due next (the remaining budget spread over the remaining milestones). */
export function nextMilestoneAmount(building: Pick<BuildingEntity, 'budget' | 'costPaid' | 'milestones' | 'milestonesPaid'>): number {
  const remaining = Math.max(0, building.budget - building.costPaid);
  const left = Math.max(1, building.milestones - building.milestonesPaid);
  return remaining === 0 ? 0 : Math.ceil(remaining / left);
}

export function constructionProgress(building: Pick<BuildingEntity, 'progressDays' | 'durationDays'>): number {
  return Math.min(1, building.progressDays / Math.max(1, building.durationDays));
}

export function overrunAmount(budget: number, rng: Rng): number {
  return Math.round((budget * rng.float(OVERRUN_RANGE.min, OVERRUN_RANGE.max)) / 10_000) * 10_000;
}

/** What the omonile want to "settle the family": 5-15% of the land's value (at least ₦250k). */
export function omonileDemand(landWorth: number, rng: Rng): number {
  return Math.max(250_000, Math.round((landWorth * rng.float(0.05, 0.15)) / 10_000) * 10_000);
}

/** Lawyer's fees to fight a land case: 3% of the land's value, at least ₦300k. */
export function legalFeesFor(landWorth: number): number {
  return Math.max(300_000, Math.round((landWorth * 0.03) / 10_000) * 10_000);
}

/** LASG regularisation fee: the next title's perfection fee on the C of O value plus 5% of the structure. */
export function regularisationFee(property: Pick<PropertyEntity, 'marketValue' | 'title'>, structureValue: number): number {
  const feeRate = LAND_TITLES[property.title].perfection?.feeRate ?? 0.05;
  return Math.max(500_000, Math.round((property.marketValue * feeRate + structureValue * 0.05) / 10_000) * 10_000);
}

export function nextTitle(title: LandTitleId): LandTitleId {
  return LAND_TITLES[title].perfection?.to ?? title;
}

/** Yearly land use charge, pro-rated for the share of the year the property was held. */
export function landUseCharge(value: number, ownerOccupied: boolean, yearShare: number): number {
  const rate = ownerOccupied ? LAND_USE_CHARGE_RATE.ownerOccupied : LAND_USE_CHARGE_RATE.other;
  return Math.round(value * rate * Math.max(0, Math.min(1, yearShare)));
}

export function heldFraction(acquiredAt: number, periodEnd: number): number {
  return Math.max(0, Math.min(1, (periodEnd - acquiredAt) / MINUTES_PER_YEAR));
}

/** Rent a unit fetches given its condition (a flood-damaged flat rents for less). */
export function conditionRentFactor(condition: number): number {
  return 0.6 + 0.4 * Math.max(0, Math.min(100, condition)) / 100;
}

/** How many units a building can let (the owner keeps one if they live there). */
export function lettableUnits(building: Pick<BuildingEntity, 'blueprintId' | 'ownerOccupied'>): number {
  return Math.max(0, BLUEPRINTS[building.blueprintId].units - (building.ownerOccupied ? 1 : 0));
}

const TENANT_NAMES = [
  'Mr Adebayo',
  'Mrs Okafor',
  'Bros Emeka',
  'Aunty Funmi',
  'Alhaji Musa',
  'Dr Nwosu',
  'Pastor Tunde',
  'Mrs Bello',
  'Engr. Ogunleye',
  'Barrister Eze',
  'Mama Ibeji',
  'Mr Johnson',
  'Chef Kemi',
  'Mr & Mrs Danjuma',
];

export function tenantName(rng: Rng): string {
  return rng.pick(TENANT_NAMES);
}

/**
 * A bought house becomes a property named after its address, acquired in the listing's week — so whether this
 * character already bought a listing is read off their properties (sold or lost ones included), no extra table.
 */
export function isHouseListingBought(
  listing: Pick<HouseListing, 'districtId' | 'label' | 'weekIndex'>,
  properties: readonly Pick<PropertyEntity, 'districtId' | 'label' | 'acquiredAt'>[],
): boolean {
  return properties.some(
    (property) => property.districtId === listing.districtId && property.label === listing.label && weekIndexOf(property.acquiredAt) === listing.weekIndex,
  );
}
