/**
 * Running a car in Lagos — owned by the vehicles domain: the fuel tank, wear, breakdowns and what mechanics charge.
 * Pure rules shared by the server (authoritative: it burns the fuel, rolls breakdowns and charges) and the client
 * (the HUD's gauge and warnings, prices on the buttons). Distances are map km (`MAP_KM_PER_WORLD_METRE`: one world
 * metre of open-world driving is 0.05 km, so a cross-town drive is ~40 km of fuel).
 *
 * Balance (see GAME_DESIGN "Running a car"): a Naija-used Corolla-class car (45 L, 11-12 km/L) holds ~500-540 km.
 * Driving it yourself in the open world (≈ 45 km of fuel per real minute at city speed) empties it in ~12 real
 * minutes, about 13 cross-town drives. Left to the autopilot, a city commute (~14 km each way, rush-hour go-slow
 * burning 60-70% more per km) uses ~4.5 L a game day, so the tank lasts ~10 game days (≈ 2 hours of play).
 */
import type { VehicleDefinition, VehicleSegment } from './vehicles.js';
import { VEHICLE_BREAKDOWN_CONDITION, VEHICLE_REPAIR_RATE, VEHICLE_UNDRIVABLE_CONDITION } from './vehicles.js';

// ---------------------------------------------------------------------------------------------------------------
// Fuel
// ---------------------------------------------------------------------------------------------------------------

/** Tank size (litres) by segment: a Corolla holds ~50 L, a G-Wagon or Land Cruiser ~80-100 L. */
export const FUEL_TANK_LITRES: Readonly<Record<VehicleSegment, number>> = {
  economy: 45,
  family: 60,
  executive: 70,
  luxury: 80,
  exotic: 80,
  commercial: 70,
};

export function fuelTankLitres(vehicle: Pick<VehicleDefinition, 'segment'>): number {
  return FUEL_TANK_LITRES[vehicle.segment];
}

/** A car leaves the dealer (or arrives as a gift) with half a tank. */
export const NEW_CAR_FUEL_SHARE = 0.5;

/** Diesel costs this much more than petrol at the pump (≈ ₦1,750 vs ₦1,350). */
export const DIESEL_PUMP_PREMIUM = 1.3;

/** Pump price per litre for a fuel type, from the world's petrol price (`EconomyState.fuelPrice`, scarcity included). */
export function pumpPricePerLitre(petrolPricePerLitre: number, fuelType: VehicleDefinition['fuelType']): number {
  return Math.round(petrolPricePerLitre * (fuelType === 'diesel' ? DIESEL_PUMP_PREMIUM : 1));
}

/** Lagos go-slow: crawling and idling burn fuel. Each unit of traffic slowdown adds half as much fuel per km. */
export function trafficFuelFactor(trafficMultiplier: number): number {
  return 1 + 0.5 * Math.max(0, trafficMultiplier - 1);
}

/** Litres burnt over `km` map km. */
export function litresForKm(vehicle: Pick<VehicleDefinition, 'fuelEconomyKmPerLitre'>, km: number, trafficFactor = 1): number {
  return (Math.max(0, km) / Math.max(1, vehicle.fuelEconomyKmPerLitre)) * Math.max(1, trafficFactor);
}

/** Map km left on `litres` (open road, no traffic). */
export function fuelRangeKm(vehicle: Pick<VehicleDefinition, 'fuelEconomyKmPerLitre'>, litres: number): number {
  return Math.max(0, litres) * vehicle.fuelEconomyKmPerLitre;
}

/** The fuel light comes on at this share of the tank. */
export const FUEL_LOW_SHARE = 0.15;
/** Below this the tank is empty (the engine dies). */
export const FUEL_EMPTY_LITRES = 0.05;
/** Smallest pump sale. */
export const MIN_FUEL_PURCHASE_LITRES = 1;
/** "Top up" button at the pump. */
export const FUEL_TOP_UP_LITRES = 10;

/** Jerrycan: an okada boy brings 10 L anywhere in Lagos, at 1.5× the pump price plus ₦3,000 for the ride. */
export const JERRYCAN = { litres: 10, markup: 1.5, delivery: 3_000 } as const;

/** Jerrycan price right now (`priceIndex` scales the delivery). */
export function jerrycanPrice(petrolPricePerLitre: number, fuelType: VehicleDefinition['fuelType'], priceIndex: number): number {
  const fuel = JERRYCAN.litres * pumpPricePerLitre(petrolPricePerLitre, fuelType) * JERRYCAN.markup;
  return Math.round((fuel + JERRYCAN.delivery * priceIndex) / 100) * 100;
}

/** Share of filling stations with nothing to sell on a scarcity day (seeded per station per day). */
export const SCARCITY_DRY_STATION_SHARE = 0.4;

// ---------------------------------------------------------------------------------------------------------------
// Wear and breakdowns
// ---------------------------------------------------------------------------------------------------------------

/** Condition a new-ish car loses per game day from Lagos roads and sun (older cars lose more: `dailyWearFor`). */
export const VEHICLE_DAILY_WEAR = 0.04;
/** Condition lost per map km driven. */
export const VEHICLE_WEAR_PER_KM = 0.004;
/** Below this the engine light is on: time for a service. */
export const VEHICLE_SERVICE_SOON_CONDITION = 60;
/** Condition lost per m/s of speed lost in a hard hit (crashes into walls, cars, poles). */
export const CRASH_WEAR_PER_MPS = 0.05;
/** Most crash damage one heartbeat can report (a bad 15 s, not a write-off). */
export const MAX_CRASH_WEAR_PER_REPORT = 6;

/** Daily wear for a car of this model year: +1/12 for every year of age (a 2003 car in 2029 wears ~3× faster). */
export function dailyWearFor(vehicle: Pick<VehicleDefinition, 'year'>, gameYear: number): number {
  return VEHICLE_DAILY_WEAR * (1 + Math.max(0, gameYear - vehicle.year) / 12);
}

/** Condition lost to hard hits worth `bumps` m/s of lost speed (capped per report). */
export function crashWear(bumps: number): number {
  return Math.min(MAX_CRASH_WEAR_PER_REPORT, Math.max(0, bumps) * CRASH_WEAR_PER_MPS);
}

/**
 * Chance per km driven that the car breaks down: nothing at or above the breakdown condition (45), then rising with
 * the square of how far below it the car is — ~1 in 700 km at 40, ~1 in 120 km at 25, ~1 in 48 km near 12.
 */
export function breakdownChancePerKm(condition: number): number {
  if (condition >= VEHICLE_BREAKDOWN_CONDITION) return 0;
  const below = (VEHICLE_BREAKDOWN_CONDITION - Math.max(12, condition)) / (VEHICLE_BREAKDOWN_CONDITION - 12);
  return 0.001 + 0.02 * below * below;
}

// ---------------------------------------------------------------------------------------------------------------
// Mechanics
// ---------------------------------------------------------------------------------------------------------------

/** Workshop minimum bill (₦, before the price index): even a quick fix costs this. */
export const MECHANIC_MIN_BILL = 5_000;
/** Towing a dead car to a workshop (the Motors app's "tow & fix", from anywhere). */
export const MECHANIC_TOW_FEE = 35_000;
/** Roadside mechanic: call-out fee, markup on parts and labour, and the condition he patches the car up to. */
export const ROADSIDE_MECHANIC = { callOut: 20_000, markup: 1.5, patchTo: 50 } as const;

/** Labour and parts to take a car from `from` to `to` condition (no minimum). */
function repairBetween(vehicle: Pick<VehicleDefinition, 'price'>, from: number, to: number, priceIndex: number): number {
  const points = Math.max(0, Math.min(100, to) - Math.max(0, from));
  return (vehicle.price * priceIndex * VEHICLE_REPAIR_RATE * points) / 100;
}

/**
 * A workshop's bill to fix the car properly (back to 100, any breakdown cleared). Zero when there's nothing to fix.
 * Price index applied; rounded to ₦1,000.
 */
export function workshopRepairCost(vehicle: Pick<VehicleDefinition, 'price'>, condition: number, brokenDown: boolean, priceIndex: number): number {
  const missing = 100 - Math.min(100, Math.max(0, condition));
  if (missing < 1 && !brokenDown) return 0;
  const bill = repairBetween(vehicle, condition, 100, priceIndex);
  return Math.max(MECHANIC_MIN_BILL * priceIndex, Math.round(bill / 1_000) * 1_000);
}

/** "Tow & fix" from anywhere: the workshop bill plus the tow truck. */
export function towRepairCost(vehicle: Pick<VehicleDefinition, 'price'>, condition: number, brokenDown: boolean, priceIndex: number): number {
  const bill = workshopRepairCost(vehicle, condition, brokenDown, priceIndex);
  return bill === 0 ? 0 : bill + Math.round((MECHANIC_TOW_FEE * priceIndex) / 1_000) * 1_000;
}

/**
 * Roadside mechanic: gets a broken-down or tired car going again (breakdown cleared, patched up to 50) at a premium
 * — call-out plus 1.5× parts and labour. Zero when the car runs and is already at 50 or better.
 */
export function roadsideRepairCost(vehicle: Pick<VehicleDefinition, 'price'>, condition: number, brokenDown: boolean, priceIndex: number): number {
  const patch = repairBetween(vehicle, condition, Math.max(condition, ROADSIDE_MECHANIC.patchTo), priceIndex);
  if (patch < 1 && !brokenDown) return 0;
  return Math.round((ROADSIDE_MECHANIC.callOut * priceIndex + patch * ROADSIDE_MECHANIC.markup) / 1_000) * 1_000;
}

// ---------------------------------------------------------------------------------------------------------------
// Running state (what the HUD and the server agree on)
// ---------------------------------------------------------------------------------------------------------------

export interface VehicleRunningState {
  readonly fuelLitres: number;
  readonly tankLitres: number;
  /** Map km left on the tank. */
  readonly rangeKm: number;
  /** 0-100. */
  readonly condition: number;
  readonly brokenDown: boolean;
}

/** Can the engine run: fuel in the tank, not broken down, in good enough shape to start. */
export function canDriveVehicle(state: Pick<VehicleRunningState, 'fuelLitres' | 'condition' | 'brokenDown'>): boolean {
  return !state.brokenDown && state.condition >= VEHICLE_UNDRIVABLE_CONDITION && state.fuelLitres > FUEL_EMPTY_LITRES;
}

export type VehicleWarningKind = 'broken-down' | 'wont-start' | 'fuel-empty' | 'fuel-low' | 'breakdown-risk' | 'service-soon';

export interface VehicleWarning {
  readonly kind: VehicleWarningKind;
  /** `stop`: the car won't go; `warn`: deal with it soon. */
  readonly severity: 'stop' | 'warn';
  /** Who fixes it: a filling station or a mechanic. */
  readonly fix: 'fuel' | 'mechanic';
  readonly text: string;
}

/** Everything wrong with the car, most urgent first ("Fuel low: 12 km left", "Engine light on: service soon"). */
export function vehicleWarnings(state: VehicleRunningState): readonly VehicleWarning[] {
  const warnings: VehicleWarning[] = [];
  if (state.brokenDown) warnings.push({ kind: 'broken-down', severity: 'stop', fix: 'mechanic', text: 'Broken down: call a mechanic or push it to one' });
  else if (state.condition < VEHICLE_UNDRIVABLE_CONDITION) warnings.push({ kind: 'wont-start', severity: 'stop', fix: 'mechanic', text: 'Won’t start: it needs a mechanic' });
  if (state.fuelLitres <= FUEL_EMPTY_LITRES) warnings.push({ kind: 'fuel-empty', severity: 'stop', fix: 'fuel', text: 'Out of fuel: push it or get a jerrycan' });
  else if (state.fuelLitres <= state.tankLitres * FUEL_LOW_SHARE) {
    warnings.push({ kind: 'fuel-low', severity: 'warn', fix: 'fuel', text: `Fuel low: ${Math.max(1, Math.round(state.rangeKm))} km left` });
  }
  if (!state.brokenDown && state.condition >= VEHICLE_UNDRIVABLE_CONDITION) {
    if (state.condition < VEHICLE_BREAKDOWN_CONDITION) warnings.push({ kind: 'breakdown-risk', severity: 'warn', fix: 'mechanic', text: 'Engine light on: it could break down any time' });
    else if (state.condition < VEHICLE_SERVICE_SOON_CONDITION) warnings.push({ kind: 'service-soon', severity: 'warn', fix: 'mechanic', text: 'Engine light on: service soon' });
  }
  return warnings;
}
