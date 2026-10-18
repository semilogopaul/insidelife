import { describe, expect, it } from 'vitest';
import { CAR_CARRIER_FEE, CAR_CARRIER_MINUTES, JERRYCAN, ROADSIDE_MECHANIC, findVehicle, fuelTankLitres, jerrycanPrice, litresForKm, rngFor, workshopRepairCost } from '@insidelife/shared';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { OwnedVehicleEntity } from './entities/owned-vehicle.entity.js';
import { VehiclesService, type GarageCar } from './vehicles.service.js';

const FUEL_PRICE = 1_350;
const PEUGEOT = findVehicle('peugeot-406-2004');
if (!PEUGEOT) throw new RangeError('catalog changed');

/** The service over an in-memory garage, wallet (idempotent by key) and seeded rng. */
function harness(overrides: Partial<OwnedVehicleEntity> = {}, cash = 5_000_000) {
  const row = {
    id: 'car-1',
    characterId: 'c1',
    vehicleId: PEUGEOT!.id,
    paint: PEUGEOT!.defaultPaint,
    plate: 'KJA-123-AB',
    purchasePrice: 2_800_000,
    condition: 80,
    conditionAt: 10_000,
    mileageKm: 200_000.4,
    acquiredAt: 10_000,
    isPrimary: true,
    status: 'owned',
    arrivesAt: null,
    lastDrivenAt: null,
    skippedServices: 0,
    fuelLitres: 30,
    brokenDownAt: null,
    cityId: 'lagos',
    shippingTo: null,
    ...overrides,
  } as OwnedVehicleEntity;
  const paid = new Map<string, number>();
  const notes: string[] = [];
  const wallet = {
    cash,
    canAfford: (amount: number) => wallet.cash >= amount,
    pay: async (amount: number, _kind: string, _memo: string, key: string) => {
      if (paid.has(key)) return false;
      paid.set(key, amount);
      wallet.cash -= amount;
      return true;
    },
  };
  const ctx = {
    time: 10_000,
    character: { id: 'c1', alive: true, locationId: 'street:yaba', cityId: 'lagos', travel: null },
    world: { economy: () => ({ priceIndex: 1, fuelPrice: FUEL_PRICE }), price: (base: number) => base },
    wallet,
    manager: { find: async () => [row], save: async (entity: unknown) => entity },
    memo: async (_key: string, load: () => Promise<unknown>) => load(),
    mayHaveRows: async () => true,
    invalidate: () => undefined,
    rng: (...parts: (string | number)[]) => rngFor('character-seed', ...parts),
    notify: (note: { title: string }) => void notes.push(note.title),
    report: () => undefined,
  } as unknown as SimulationContext;
  const service = new VehiclesService();
  const car: GarageCar = { row, def: PEUGEOT! };
  return { service, ctx, car, row, paid, wallet, notes };
}

describe('the fuel tank', () => {
  it('burns litres by distance (more in go-slow), adds mileage and wear', async () => {
    const { service, ctx, car, row } = harness();
    await service.drive(ctx, car, 22, { trafficFactor: 1.5 });
    expect(row.fuelLitres).toBeCloseTo(30 - litresForKm(PEUGEOT!, 22, 1.5));
    expect(row.mileageKm).toBeCloseTo(200_022.4);
    expect(row.condition).toBeLessThan(80);
  });

  it('runs dry: the car stops counting as drivable but stays with you', async () => {
    const { service, ctx, car, row, notes } = harness({ fuelLitres: 1 });
    const outcome = await service.drive(ctx, car, 40);
    expect(outcome.ranOut).toBe(true);
    expect(row.fuelLitres).toBe(0);
    expect(service.canDrive(ctx, car)).toBe(false);
    expect(await service.driving(ctx)).toBeNull();
    expect((await service.withYou(ctx))?.row.id).toBe('car-1');
    expect(notes).toContain('Out of fuel ⛽');
  });

  it('turns the fuel light on once, when it crosses the line', async () => {
    const tank = fuelTankLitres(PEUGEOT!);
    const { service, ctx, car, notes } = harness({ fuelLitres: tank * 0.16 });
    await service.drive(ctx, car, 11);
    await service.drive(ctx, car, 1);
    expect(notes.filter((title) => title === 'Fuel light is on ⛽')).toHaveLength(1);
  });

  it('keeps your daily ride with you when it is empty, even with a full second car at home', async () => {
    const { service, ctx, row } = harness({ fuelLitres: 0 });
    const spare = { ...row, id: 'car-2', isPrimary: false, fuelLitres: 45 } as OwnedVehicleEntity;
    (ctx.manager as unknown as { find: () => Promise<OwnedVehicleEntity[]> }).find = async () => [row, spare];
    expect((await service.withYou(ctx))?.row.id).toBe('car-1');
    // The planner may still commute in the one that starts.
    expect((await service.driving(ctx))?.row.id).toBe('car-2');
  });

  it('treats cars from before tanks existed as full', () => {
    const { service, car } = harness({ fuelLitres: null });
    expect(service.fuel(car)).toBe(fuelTankLitres(PEUGEOT!));
  });
});

/** A worn car (condition 20) driven in 5 km hops until it breaks down. */
async function driveUntilBreakdown(): Promise<{ km: number; mileage: number }> {
  const { service, ctx, car, row } = harness({ condition: 20, fuelLitres: 45 });
  let km = 0;
  while (row.brokenDownAt === null && km < 2_000) {
    row.fuelLitres = 45;
    await service.drive(ctx, car, 5);
    km += 5;
  }
  return { km, mileage: row.mileageKm };
}

describe('breakdowns', () => {
  it('never happen to a car in good shape', async () => {
    const { service, ctx, car, row } = harness({ condition: 90, fuelLitres: 45 });
    for (let i = 0; i < 20; i++) await service.drive(ctx, car, 20);
    expect(row.brokenDownAt).toBeNull();
  });

  it('are seeded by car and odometer: the same drive breaks down at the same km', async () => {
    const first = await driveUntilBreakdown();
    expect(first.km).toBeLessThan(2_000);
    expect(await driveUntilBreakdown()).toEqual(first);
  });

  it('stop the car until a mechanic sees it', async () => {
    const { service, ctx, car } = harness({ brokenDownAt: 9_000 });
    expect(service.canDrive(ctx, car)).toBe(false);
    expect(service.toDto(ctx, car)).toMatchObject({ brokenDown: true, canDrive: false, drivable: false });
  });
});

describe('the pump', () => {
  it('fills the tank at the pump price, through the ledger, and never twice for one press', async () => {
    const { service, ctx, car, row, paid, wallet } = harness({ fuelLitres: 10 });
    const sale = await service.refuel(ctx, car, null, 'Fuel at Ikorodu Road Mega Station', 'fuel:station:press-1');
    expect(sale.litres).toBe(35);
    expect(sale.cost).toBe(35 * FUEL_PRICE);
    expect(row.fuelLitres).toBe(45);
    expect(paid.get('fuel:station:press-1')).toBe(35 * FUEL_PRICE);
    // The same press again (a retry): nothing charged, nothing added.
    row.fuelLitres = 10;
    const replay = await service.refuel(ctx, car, null, 'Fuel', 'fuel:station:press-1');
    expect(replay.litres).toBe(0);
    expect(row.fuelLitres).toBe(10);
    expect(wallet.cash).toBe(5_000_000 - 35 * FUEL_PRICE);
  });

  it('sells part of a tank, and refuses a full one or one you can’t pay for', async () => {
    const { service, ctx, car, row } = harness({ fuelLitres: 10 });
    expect((await service.refuel(ctx, car, 10, 'Fuel', 'k1')).litres).toBe(10);
    expect(row.fuelLitres).toBe(20);
    const full = harness({ fuelLitres: 45 });
    await expect(full.service.refuel(full.ctx, full.car, null, 'Fuel', 'k2')).rejects.toBeInstanceOf(GameRuleException);
    const broke = harness({ fuelLitres: 0 }, 2_000);
    await expect(broke.service.refuel(broke.ctx, broke.car, null, 'Fuel', 'k3')).rejects.toThrow(/afford 1.4 L/);
  });

  it('delivers a jerrycan anywhere at a premium', async () => {
    const { service, ctx, row, paid } = harness({ fuelLitres: 0 });
    const result = await service.jerrycan(ctx, 'car-1', 'press-2');
    expect(result.litres).toBe(JERRYCAN.litres);
    expect(result.cost).toBe(jerrycanPrice(FUEL_PRICE, 'petrol', 1));
    expect(row.fuelLitres).toBe(JERRYCAN.litres);
    expect(paid.has('vehicle-jerrycan:car-1:press-2')).toBe(true);
  });
});

describe('mechanics', () => {
  it('a workshop fixes it properly: back to 100, breakdown and missed services forgiven', async () => {
    const { service, ctx, car, row, paid } = harness({ condition: 30, brokenDownAt: 9_000, skippedServices: 2 });
    const cost = await service.workshopRepair(ctx, car, 'Mechanic', 'mechanic:w:press-3');
    expect(cost).toBe(workshopRepairCost(PEUGEOT!, 30, true, 1));
    expect(paid.get('mechanic:w:press-3')).toBe(cost);
    expect([row.condition, row.brokenDownAt, row.skippedServices]).toEqual([100, null, 0]);
  });

  it('a roadside mechanic gets it going at a premium, patched to 50 only', async () => {
    const { service, ctx, row } = harness({ condition: 30, brokenDownAt: 9_000 });
    const result = await service.roadsideRepair(ctx, 'car-1', 'press-4');
    expect(result.cost).toBeGreaterThan(workshopRepairCost(PEUGEOT!, 30, true, 1) * (20 / 70));
    expect([row.condition, row.brokenDownAt]).toEqual([ROADSIDE_MECHANIC.patchTo, null]);
    expect(result.vehicle.canDrive).toBe(true);
  });

  it('tow & fix from the Motors app costs the workshop bill plus the tow', async () => {
    const { service, ctx } = harness({ condition: 40, brokenDownAt: 9_000 });
    const result = await service.repair(ctx, 'car-1');
    expect(result.cost).toBeGreaterThan(workshopRepairCost(PEUGEOT!, 40, true, 1));
    expect(result.vehicle).toMatchObject({ condition: 100, brokenDown: false });
  });
});

describe('a car belongs to the city it is parked in', () => {
  it('is with you only in its own city', async () => {
    const lagos = harness();
    expect((await lagos.service.withYou(lagos.ctx))?.row.id).toBe('car-1');
    expect((await lagos.service.drivable(lagos.ctx)).length).toBe(1);
    const inAbuja = harness({ cityId: 'abuja' });
    expect(await inAbuja.service.withYou(inAbuja.ctx)).toBeNull();
    expect(await inAbuja.service.drivable(inAbuja.ctx)).toEqual([]);
    expect(inAbuja.service.toDto(inAbuja.ctx, inAbuja.car)).toMatchObject({ cityId: 'abuja', drivable: false, canDrive: false });
    // The player flies to Abuja: the Lagos car is no longer near them.
    lagos.ctx.character.cityId = 'abuja';
    expect(await lagos.service.withYou(lagos.ctx)).toBeNull();
  });

  it('does not bring a jerrycan or a roadside mechanic to a car in the other city', async () => {
    const { service, ctx } = harness({ cityId: 'abuja', fuelLitres: 5 });
    await expect(service.jerrycan(ctx, 'car-1', 'tap-1')).rejects.toMatchObject({ errorCode: 'CAR_ELSEWHERE' });
    await expect(service.roadsideRepair(ctx, 'car-1', 'tap-2')).rejects.toMatchObject({ errorCode: 'CAR_ELSEWHERE' });
  });
});

describe('shipping a car to the other city', () => {
  it('charges the carrier once, keeps the car off the road for two days, then parks it in the other city', async () => {
    const { service, ctx, row, paid, wallet, notes } = harness();
    const before = wallet.cash;
    const result = await service.ship(ctx, 'car-1', 'tap-1');
    expect(result).toMatchObject({ toCityId: 'abuja', fee: CAR_CARRIER_FEE, arrivesAt: 10_000 + CAR_CARRIER_MINUTES });
    expect(wallet.cash).toBe(before - CAR_CARRIER_FEE);
    expect([...paid.keys()]).toEqual(['vehicle-ship:car-1:tap-1']);
    expect(row).toMatchObject({ status: 'in-transit', shippingTo: 'abuja', cityId: 'lagos' });
    expect(await service.drivable(ctx)).toEqual([]);
    expect(await service.withYou(ctx)).toBeNull();
    await expect(service.ship(ctx, 'car-1', 'tap-2')).rejects.toMatchObject({ errorCode: 'NOT_DELIVERED' });

    // Not there yet one minute early; there at the minute, parked in Abuja and announced.
    ctx.time = 10_000 + CAR_CARRIER_MINUTES - 1;
    await service.deliverDue(ctx);
    expect(row.status).toBe('in-transit');
    ctx.time = 10_000 + CAR_CARRIER_MINUTES;
    await service.deliverDue(ctx);
    expect(row).toMatchObject({ status: 'owned', cityId: 'abuja', shippingTo: null, arrivesAt: null });
    expect(notes).toContain('Your car has arrived 🚗');
    // In Lagos it is now the one that is away; in Abuja it is with you.
    expect(await service.withYou(ctx)).toBeNull();
    ctx.character.cityId = 'abuja';
    expect((await service.withYou(ctx))?.row.id).toBe('car-1');
  });

  it('refuses when you cannot pay, and charges nothing', async () => {
    const { service, ctx, row, paid } = harness({}, 1_000);
    await expect(service.ship(ctx, 'car-1', 'tap-1')).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_FUNDS' });
    expect(paid.size).toBe(0);
    expect(row.status).toBe('owned');
  });

  it('a replayed press with the same key is not charged twice', async () => {
    const { service, ctx, row, paid } = harness();
    await service.ship(ctx, 'car-1', 'tap-1');
    row.status = 'owned';
    row.shippingTo = null;
    await service.ship(ctx, 'car-1', 'tap-1');
    expect(paid.size).toBe(1);
    expect(row.status).toBe('owned');
  });
});
