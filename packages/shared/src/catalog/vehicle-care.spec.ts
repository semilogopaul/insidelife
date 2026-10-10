import { describe, expect, it } from 'vitest';
import { quoteTrip, trafficMultiplier } from './transport.js';
import { VEHICLES, VEHICLE_BREAKDOWN_CONDITION, findVehicle, type VehicleDefinition } from './vehicles.js';
import {
  FUEL_TANK_LITRES,
  JERRYCAN,
  breakdownChancePerKm,
  canDriveVehicle,
  crashWear,
  dailyWearFor,
  fuelRangeKm,
  fuelTankLitres,
  jerrycanPrice,
  litresForKm,
  pumpPricePerLitre,
  roadsideRepairCost,
  towRepairCost,
  trafficFuelFactor,
  vehicleWarnings,
  workshopRepairCost,
} from './vehicle-care.js';
import { MAP_KM_PER_WORLD_METRE } from '../world-map/world-map.js';
import { SERVICE_POINTS, SERVICE_RADIUS, findServicePoint, fuelStationDry, nearestServicePoint, servicePointFromLocation, serviceLocationId } from '../world-map/service-points.js';
import { CITY_MAP } from '../world-map/city-map.js';

const car = (id: string): VehicleDefinition => {
  const found = findVehicle(id);
  if (!found) throw new RangeError(id);
  return found;
};

describe('fuel', () => {
  it('gives every car a tank that holds a few hundred km', () => {
    for (const vehicle of VEHICLES) {
      expect(fuelTankLitres(vehicle)).toBe(FUEL_TANK_LITRES[vehicle.segment]);
      expect(fuelRangeKm(vehicle, fuelTankLitres(vehicle))).toBeGreaterThanOrEqual(240);
    }
  });

  it('burns litres by distance, more in go-slow', () => {
    const corolla = car('toyota-corolla-2003-taxi');
    expect(litresForKm(corolla, 24)).toBe(2);
    const rush = trafficFuelFactor(trafficMultiplier(8, false, false));
    expect(rush).toBeCloseTo(1.6);
    expect(litresForKm(corolla, 24, rush)).toBeCloseTo(3.2);
    expect(trafficFuelFactor(1)).toBe(1);
  });

  it('lasts a session: ~13 cross-town drives, or about ten game days of autopilot commuting', () => {
    const corolla = car('toyota-corolla-2003-taxi');
    const tank = fuelTankLitres(corolla);
    const crossTown = litresForKm(corolla, 800 * MAP_KM_PER_WORLD_METRE);
    expect(tank / crossTown).toBeGreaterThan(10);
    expect(tank / crossTown).toBeLessThan(16);
    const commute = quoteTrip('yaba', 'ikoyi', 'car', { hour: 8, weekend: false, raining: false, priceIndex: 1 }).distance;
    const day =
      litresForKm(corolla, commute, trafficFuelFactor(trafficMultiplier(8, false, false))) +
      litresForKm(corolla, commute, trafficFuelFactor(trafficMultiplier(17, false, false)));
    expect(tank / day).toBeGreaterThan(5);
    expect(tank / day).toBeLessThan(14);
  });

  it('charges diesel more at the pump, and a jerrycan more than the pump', () => {
    expect(pumpPricePerLitre(1350, 'petrol')).toBe(1350);
    expect(pumpPricePerLitre(1350, 'diesel')).toBe(1755);
    const can = jerrycanPrice(1350, 'petrol', 1);
    expect(can).toBeGreaterThan(JERRYCAN.litres * 1350 * 1.4);
    expect(jerrycanPrice(2160, 'petrol', 1)).toBeGreaterThan(can);
  });
});

describe('wear and breakdowns', () => {
  it('wears older cars faster', () => {
    expect(dailyWearFor(car('toyota-corolla-2003-taxi'), 2029)).toBeGreaterThan(dailyWearFor(car('toyota-corolla-2017'), 2029) * 1.4);
  });

  it('never breaks down in good shape, more often the worse it gets', () => {
    expect(breakdownChancePerKm(100)).toBe(0);
    expect(breakdownChancePerKm(VEHICLE_BREAKDOWN_CONDITION)).toBe(0);
    const chances = [44, 35, 25, 15, 5].map(breakdownChancePerKm);
    for (let i = 1; i < chances.length; i++) expect(chances[i]).toBeGreaterThanOrEqual(chances[i - 1] as number);
    expect(1 / breakdownChancePerKm(40)).toBeGreaterThan(400);
    expect(1 / breakdownChancePerKm(15)).toBeLessThan(80);
  });

  it('caps crash damage per report', () => {
    expect(crashWear(0)).toBe(0);
    expect(crashWear(20)).toBeCloseTo(1);
    expect(crashWear(10_000)).toBe(6);
  });
});

describe('mechanics', () => {
  const peugeot = car('peugeot-406-2004');
  it('charges nothing for a car in top shape, more the worse it is', () => {
    expect(workshopRepairCost(peugeot, 100, false, 1)).toBe(0);
    expect(workshopRepairCost(peugeot, 40, false, 1)).toBeGreaterThan(workshopRepairCost(peugeot, 70, false, 1));
    // A breakdown is never free, even on a car that's otherwise fine.
    expect(workshopRepairCost(peugeot, 100, true, 1)).toBeGreaterThan(0);
  });

  it('makes the tow and the roadside call cost extra', () => {
    expect(towRepairCost(peugeot, 40, true, 1)).toBeGreaterThan(workshopRepairCost(peugeot, 40, true, 1));
    // Roadside only patches to 50 but charges a premium per point.
    const patch = workshopRepairCost(peugeot, 40, true, 1) * (10 / 60);
    expect(roadsideRepairCost(peugeot, 40, true, 1)).toBeGreaterThan(patch * 1.4);
    expect(roadsideRepairCost(peugeot, 80, false, 1)).toBe(0);
    expect(roadsideRepairCost(peugeot, 80, true, 1)).toBeGreaterThan(0);
  });
});

describe('running state', () => {
  const base = { fuelLitres: 30, tankLitres: 45, rangeKm: 360, condition: 80, brokenDown: false };
  it('starts only with fuel, in one piece and in shape', () => {
    expect(canDriveVehicle(base)).toBe(true);
    expect(canDriveVehicle({ ...base, fuelLitres: 0 })).toBe(false);
    expect(canDriveVehicle({ ...base, brokenDown: true })).toBe(false);
    expect(canDriveVehicle({ ...base, condition: 5 })).toBe(false);
  });

  it('warns early, most urgent first', () => {
    expect(vehicleWarnings(base)).toEqual([]);
    expect(vehicleWarnings({ ...base, fuelLitres: 1, rangeKm: 12 }).map((w) => w.text)).toEqual(['Fuel low: 12 km left']);
    expect(vehicleWarnings({ ...base, condition: 55 }).map((w) => w.text)).toEqual(['Engine light on: service soon']);
    expect(vehicleWarnings({ ...base, fuelLitres: 0, rangeKm: 0, brokenDown: true }).map((w) => w.kind)).toEqual(['broken-down', 'fuel-empty']);
    expect(vehicleWarnings({ ...base, condition: 30 })[0]?.kind).toBe('breakdown-risk');
  });
});

describe('filling stations and mechanics', () => {
  it('puts them on roadside building lots, never on a home, the same everywhere', () => {
    expect(SERVICE_POINTS.filter((point) => point.kind === 'fuel').length).toBeGreaterThanOrEqual(10);
    expect(SERVICE_POINTS.filter((point) => point.kind === 'mechanic').length).toBeGreaterThanOrEqual(6);
    const lots = new Map(CITY_MAP.lots.map((lot) => [lot.id, lot]));
    for (const point of SERVICE_POINTS) {
      expect(lots.get(point.lotId)?.kind).toBe('building');
      expect(findServicePoint(point.id)).toBe(point);
      expect(servicePointFromLocation(serviceLocationId(point))).toBe(point);
    }
    expect(new Set(SERVICE_POINTS.map((point) => point.lotId)).size).toBe(SERVICE_POINTS.length);
  });

  it('finds the nearest one and knows when you are at it', () => {
    const station = SERVICE_POINTS.find((point) => point.kind === 'fuel');
    if (!station) throw new RangeError('no station');
    const at = { x: station.entrance.position.x + SERVICE_RADIUS - 1, z: station.entrance.position.z };
    expect(nearestServicePoint('fuel', at, SERVICE_RADIUS)?.id).toBe(station.id);
    expect(nearestServicePoint('fuel', { x: 1e5, z: 1e5 }, SERVICE_RADIUS)).toBeNull();
  });

  it('runs some stations dry on scarcity days only, deterministically', () => {
    const ids = SERVICE_POINTS.filter((point) => point.kind === 'fuel').map((point) => point.id);
    expect(ids.some((id) => fuelStationDry('seed', id, 12, false))).toBe(false);
    const dry = ids.filter((id) => fuelStationDry('seed', id, 12, true));
    expect(dry).toEqual(ids.filter((id) => fuelStationDry('seed', id, 12, true)));
    expect(dry.length).toBeLessThan(ids.length);
  });
});
