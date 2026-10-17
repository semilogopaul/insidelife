import { describe, expect, it } from 'vitest';
import {
  BASELINE_CONDITION,
  DAYS_PER_YEAR,
  MINUTES_PER_DAY,
  STARTER_FUND,
  VEHICLES,
  VEHICLE_MODELS,
  VEHICLE_PAINTS,
  VEHICLE_SCRAP_FLOOR,
  createRng,
  findVehicle,
  vehicleMarketValue,
  type VehicleDefinition,
} from '@insidelife/shared';
import {
  dealerHere,
  dealerOffer,
  drivingTestPassChance,
  monthlyMaintenance,
  plateNumber,
  vehicleConditionNow,
  vehicleRepairCost,
  type BuyerPosition,
} from './vehicle.rules.js';

const car = (id: string): VehicleDefinition => {
  const found = findVehicle(id);
  if (!found) throw new RangeError(`missing vehicle ${id}`);
  return found;
};

describe('vehicle catalog', () => {
  it('maps every car to a Kenney model and offers its default paint', () => {
    for (const vehicle of VEHICLES) {
      expect(VEHICLE_MODELS).toContain(vehicle.model);
      expect(vehicle.paints).toContain(vehicle.defaultPaint);
      expect(vehicle.color).toBe(VEHICLE_PAINTS[vehicle.defaultPaint].hex);
    }
  });

  it('has a decent first car a new player can afford with the starter fund', () => {
    const affordable = VEHICLES.filter((vehicle) => vehicle.price < STARTER_FUND);
    expect(affordable.length).toBeGreaterThanOrEqual(1);
    expect(affordable.map((vehicle) => vehicle.id)).toEqual(expect.arrayContaining(['peugeot-406-2004']));
  });
});

describe('depreciation', () => {
  const corolla = car('toyota-corolla-2017');
  const baseline = BASELINE_CONDITION[corolla.grade];

  it('is worth its price on day one at baseline condition', () => {
    expect(vehicleMarketValue(corolla, 0, baseline)).toBe(corolla.price);
  });

  it('compounds the yearly rate over the days you own it', () => {
    const afterOneYear = vehicleMarketValue(corolla, DAYS_PER_YEAR, baseline);
    expect(afterOneYear).toBeCloseTo(corolla.price * (1 - corolla.depreciationPerYear), -4);
    const afterHalfYear = vehicleMarketValue(corolla, DAYS_PER_YEAR / 2, baseline);
    expect(afterHalfYear).toBeGreaterThan(afterOneYear);
    expect(afterHalfYear).toBeLessThan(corolla.price);
  });

  it('loses value with poor condition and follows the price index', () => {
    expect(vehicleMarketValue(corolla, 0, 40)).toBeLessThan(vehicleMarketValue(corolla, 0, baseline));
    expect(vehicleMarketValue(corolla, 0, baseline, 1.2)).toBe(Math.round((corolla.price * 1.2) / 1_000) * 1_000);
  });

  it('never drops below scrap value', () => {
    expect(vehicleMarketValue(corolla, DAYS_PER_YEAR * 60, 0)).toBe(Math.round((corolla.price * VEHICLE_SCRAP_FLOOR) / 1_000) * 1_000);
  });

  it('wears 0.04 condition per day while parked', () => {
    expect(vehicleConditionNow(80, 0, 100 * MINUTES_PER_DAY)).toBeCloseTo(76);
  });
});

const position = (locationId: string, hour = 12, travelling = false): BuyerPosition => ({ locationId, hour, travelling });

describe('dealer purchase location rules', () => {
  const accord = car('honda-accord-2005');
  const gWagon = car('mercedes-g-wagon-2022');
  const corolla = car('toyota-corolla-2017');

  it('sells Naija-used cars at Berger and luxury at Lekki', () => {
    expect(dealerHere(position('berger-car-market'), accord)).toBe('berger-car-market');
    expect(dealerHere(position('lekki-car-mart'), accord)).toBeNull();
    expect(dealerHere(position('lekki-car-mart'), gWagon)).toBe('lekki-car-mart');
    expect(dealerHere(position('berger-car-market'), gWagon)).toBeNull();
    expect(dealerHere(position('berger-car-market'), corolla)).toBe('berger-car-market');
    expect(dealerHere(position('lekki-car-mart'), corolla)).toBe('lekki-car-mart');
  });

  it('sells brand-new and clean tokunbo cars at Polanco, never Naija-used', () => {
    expect(dealerHere(position('polanco-motors'), accord)).toBeNull();
    expect(dealerHere(position('polanco-motors'), corolla)).toBe('polanco-motors');
    expect(dealerHere(position('polanco-motors'), gWagon)).toBe('polanco-motors');
  });

  it('requires being inside an open dealer (otherwise it is a remote purchase)', () => {
    expect(dealerHere(position('ikeja-city-mall'), accord)).toBeNull();
    expect(dealerHere(position('street:ikeja'), accord)).toBeNull();
    expect(dealerHere(position('berger-car-market', 12, true), accord)).toBeNull();
    expect(dealerHere(position('berger-car-market', 21), accord)).toBeNull();
  });
});

describe('running costs and sale', () => {
  const accord = car('honda-accord-2005');

  it('dealers pay 65-85% of market value', () => {
    expect(dealerOffer(1_000_000, 0)).toBe(650_000);
    expect(dealerOffer(1_000_000, 1)).toBe(850_000);
  });

  it('pro-rates monthly maintenance for part-months', () => {
    const full = monthlyMaintenance(accord, 1);
    expect(full).toBe(Math.round((accord.price * accord.maintenancePerYear) / 12 / 100) * 100);
    expect(monthlyMaintenance(accord, 1, 15)).toBeCloseTo(full / 2, -2);
  });

  it('charges nothing to repair a car in top shape', () => {
    expect(vehicleRepairCost(accord, 100, 1)).toBe(0);
    expect(vehicleRepairCost(accord, 50, 1)).toBeGreaterThan(vehicleRepairCost(accord, 80, 1));
  });

  it('makes deterministic Lagos plates', () => {
    const plate = plateNumber('ikeja', createRng('seed-1'));
    expect(plate).toMatch(/^KJA-\d{3}-[A-Z]{2}$/);
    expect(plateNumber('ikeja', createRng('seed-1'))).toBe(plate);
  });

  it('bounds the driving test pass chance', () => {
    expect(drivingTestPassChance({ intellect: 0, hustle: 0, mood: 0, ownsCar: false })).toBeCloseTo(0.3);
    expect(drivingTestPassChance({ intellect: 100, hustle: 100, mood: 100, ownsCar: true })).toBe(0.92);
    const practised = drivingTestPassChance({ intellect: 30, hustle: 20, mood: 60, ownsCar: true });
    expect(practised).toBeGreaterThan(drivingTestPassChance({ intellect: 30, hustle: 20, mood: 60, ownsCar: false }));
  });
});
