import { describe, expect, it } from 'vitest';
import { findVehicle, isVehicleModel, paintSurcharge, VEHICLE_PAINTS, VEHICLES } from './vehicles.js';

describe('vehicle catalog', () => {
  it('gives every car a known body, its own default paint among its paints, and a unique id', () => {
    const ids = new Set<string>();
    for (const vehicle of VEHICLES) {
      expect(isVehicleModel(vehicle.model), vehicle.id).toBe(true);
      expect(vehicle.paints, vehicle.id).toContain(vehicle.defaultPaint);
      expect(vehicle.color).toBe(VEHICLE_PAINTS[vehicle.defaultPaint].hex);
      expect(ids.has(vehicle.id), vehicle.id).toBe(false);
      ids.add(vehicle.id);
    }
  });

  it('keeps status under the clout a top job gives', () => {
    for (const vehicle of VEHICLES) expect(vehicle.status, vehicle.id).toBeLessThanOrEqual(450);
  });
});

describe('paintSurcharge', () => {
  const lambo = findVehicle('lamborghini-aventador-svj-2021');
  const corolla = findVehicle('toyota-corolla-2003-taxi');
  const gWagon = findVehicle('mercedes-g-wagon-2022');

  it('charges nothing for the colour on the lot or a solid colour', () => {
    expect(lambo && paintSurcharge(lambo, lambo.defaultPaint)).toBe(0);
    expect(corolla && paintSurcharge(corolla, 'pearl-white')).toBe(Math.round((3_200_000 * 0.025) / 1000) * 1000);
    expect(gWagon && paintSurcharge(gWagon, 'army-green')).toBe(0);
  });

  it('prices premium finishes as a share of the car, so the same colour costs more on a dearer car', () => {
    expect(lambo && paintSurcharge(lambo, 'lime-green')).toBe(28_750_000); // pearl: 2.5% of ₦1.15B
    expect(lambo && paintSurcharge(lambo, 'matte-black')).toBe(46_000_000); // matte: 4%
    expect(lambo && paintSurcharge(lambo, 'chrome-gold')).toBe(80_500_000); // special: 7%
  });

  it('ignores unknown paints', () => {
    expect(lambo && paintSurcharge(lambo, 'unicorn-glitter')).toBe(0);
  });
});
