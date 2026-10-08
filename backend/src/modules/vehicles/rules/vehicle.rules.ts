import {
  DAYS_PER_MONTH,
  DEALER_OFFER_RANGE,
  MINUTES_PER_DAY,
  PLATE_PREFIXES,
  VEHICLE_REPAIR_RATE,
  dealerStocks,
  findVenue,
  isVenueOpen,
  vehicleMarketValue,
  type DistrictId,
  type GameMinute,
  type Rng,
  type VehicleDefinition,
} from '@insidelife/shared';

/** Condition lost per game day just from Lagos roads and sun. */
export const DAILY_WEAR = 0.04;
/** Extra condition lost per km driven. */
export const WEAR_PER_KM = 0.004;
/** Condition lost for each month-end service the owner couldn't pay for. */
export const SKIPPED_SERVICE_WEAR = 8;
/** A paid service tightens things up a little. */
export const SERVICE_BONUS = 1.5;

export interface BuyerPosition {
  readonly locationId: string;
  readonly travelling: boolean;
  /** Hour of day (0-23). */
  readonly hour: number;
}

/**
 * The dealer venue the car can be bought from in person right now, or null (→ remote purchase with delivery):
 * the buyer must be inside (not on the road) an open car dealer that has this car on the lot.
 */
export function dealerHere(position: BuyerPosition, vehicle: VehicleDefinition): string | null {
  if (position.travelling) return null;
  const venue = findVenue(position.locationId);
  if (!venue || !isVenueOpen(venue, position.hour)) return null;
  return dealerStocks(venue.id, vehicle) ? venue.id : null;
}

/** Condition right now, worn linearly since it was last set. */
export function vehicleConditionNow(condition: number, conditionAt: GameMinute, now: GameMinute): number {
  const days = Math.max(0, now - conditionAt) / MINUTES_PER_DAY;
  return Math.max(0, Math.min(100, condition - DAILY_WEAR * days));
}

/** Market value today (depreciated by age in your hands, scaled by condition and the price index). */
export function currentValue(vehicle: VehicleDefinition, acquiredAt: GameMinute, now: GameMinute, condition: number, priceIndex: number): number {
  return vehicleMarketValue(vehicle, (now - acquiredAt) / MINUTES_PER_DAY, condition, priceIndex);
}

/** What the dealer pays: 65-85% of market value (`roll` is a deterministic 0-1 draw per car per day). */
export function dealerOffer(value: number, roll: number): number {
  const [low, high] = DEALER_OFFER_RANGE;
  const share = low + (high - low) * Math.min(1, Math.max(0, roll));
  return Math.round((value * share) / 1_000) * 1_000;
}

/** Month-end servicing, papers and parts (₦), pro-rated for cars owned part of the month. */
export function monthlyMaintenance(vehicle: VehicleDefinition, priceIndex: number, daysOwned = DAYS_PER_MONTH): number {
  const share = Math.min(1, Math.max(0, daysOwned) / DAYS_PER_MONTH);
  const cost = ((vehicle.price * priceIndex * vehicle.maintenancePerYear) / 12) * share;
  return Math.round(cost / 100) * 100;
}

/** Mechanic bill to restore the car to 100 condition (0 when there's nothing worth fixing). */
export function vehicleRepairCost(vehicle: VehicleDefinition, condition: number, priceIndex: number): number {
  const missing = 100 - Math.min(100, Math.max(0, condition));
  if (missing < 1) return 0;
  return Math.max(5_000, Math.round((vehicle.price * priceIndex * VEHICLE_REPAIR_RATE * missing) / 100 / 1_000) * 1_000);
}

const PLATE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Lagos plate like `KJA-482-KJ`, registered in the given district. */
export function plateNumber(districtId: DistrictId, rng: Rng): string {
  const prefix = PLATE_PREFIXES[districtId] ?? 'LAG';
  const digits = String(rng.int(1, 999)).padStart(3, '0');
  const letters = `${PLATE_LETTERS[rng.int(0, PLATE_LETTERS.length - 1)]}${PLATE_LETTERS[rng.int(0, PLATE_LETTERS.length - 1)]}`;
  return `${prefix}-${digits}-${letters}`;
}

/** Odometer when you buy: Naija-used cars have seen things. */
export function startingMileage(vehicle: VehicleDefinition, rng: Rng): number {
  if (vehicle.grade === 'brand-new') return rng.int(5, 40);
  if (vehicle.grade === 'tokunbo') return rng.int(40_000, 95_000);
  return rng.int(160_000, 280_000);
}

export interface DrivingTestCandidate {
  /** Book sense (theory test). */
  readonly intellect: number;
  /** Street smarts (Lagos road craft). */
  readonly hustle: number;
  /** 0-100. */
  readonly mood: number;
  /** Practised in their own car. */
  readonly ownsCar: boolean;
}

/** Chance to pass the FRSC test: theory, road craft, nerves and practice. */
export function drivingTestPassChance(candidate: DrivingTestCandidate): number {
  const chance =
    0.4 + candidate.intellect / 300 + candidate.hustle / 300 + (candidate.ownsCar ? 0.12 : 0) + (candidate.mood - 50) / 500;
  return Math.min(0.92, Math.max(0.25, chance));
}
