import { describe, expect, it, vi } from 'vitest';
import { MAP_KM_PER_WORLD_METRE, SERVICE_POINTS, SERVICE_RADIUS, fuelStationDry, type DrivenVehicleDto } from '@insidelife/shared';
import type { HomeAccessPort } from '../../common/ports/home-access.port.js';
import type { VehiclePort } from '../../common/ports/vehicle.port.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { SimulationEngine } from '../simulation/simulation-engine.service.js';
import type { TimelinePlanner } from '../simulation/timeline-planner.service.js';
import type { MovementTracker } from './movement-tracker.service.js';
import { MovementService } from './movement.service.js';

const car = (overrides: Partial<DrivenVehicleDto> = {}): DrivenVehicleDto => ({
  ownedVehicleId: 'car-1',
  vehicleId: 'peugeot-406-2004',
  name: 'Peugeot 406 2004',
  model: 'sedan',
  color: '#ffffff',
  plate: 'KJA-1',
  fuelType: 'petrol',
  fuelEconomyKmPerLitre: 11,
  fuelLitres: 20,
  tankLitres: 45,
  condition: 70,
  brokenDown: false,
  ...overrides,
});

/** MovementService over a fake tracker (last fix 10 s ago, `distance` m away) and a fake vehicle port. */
function harness(driven: DrivenVehicleDto | null, distance: number, options: { scarcity?: boolean } = {}) {
  const plausible = vi.fn(async (_id: string, _point: unknown, mode: 'walk' | 'car') => ({
    ok: distance <= (mode === 'car' ? 40 : 8) * 10 + 25,
    distance,
    from: { x: 0, z: 0, at: Date.now() - 10_000, mode: 'car' as const },
  }));
  const anchor = vi.fn(async () => undefined);
  const tracker = { isPlausible: plausible, anchor } as unknown as MovementTracker;
  const drive = vi.fn(async () => driven);
  const refuel = vi.fn(async () => (driven ? { litres: 25, pricePerLitre: 1350, cost: 33_750, car: driven } : null));
  const vehicles: VehiclePort = { driving: async () => driven, drive, refuel, workshopRepair: async () => null, parkedElsewhere: async () => null };
  const ctx = {
    time: 50_000,
    character: { id: 'c1', locationId: 'street:yaba', activity: null },
    world: { seed: 'world', isActive: () => options.scarcity === true },
  } as unknown as SimulationContext;
  const service = new MovementService({} as TimelinePlanner, {} as SimulationEngine, tracker, vehicles, {} as HomeAccessPort);
  return { service, ctx, plausible, anchor, drive, refuel };
}

describe('open-world driving on the server', () => {
  it('burns fuel for the road distance driven since the last fix', async () => {
    const { service, ctx, drive } = harness(car(), 300);
    const outcome = await service.heartbeat(ctx, { x: 300, z: 0 }, 'car', 0, 12);
    expect(outcome.accepted).toBe(true);
    expect(drive).toHaveBeenCalledWith(ctx, 300 * MAP_KM_PER_WORLD_METRE, 12);
    expect(outcome.car?.ownedVehicleId).toBe('car-1');
  });

  it('only lets an empty or broken-down car be pushed: car speed is refused, nothing burnt', async () => {
    for (const stuck of [car({ fuelLitres: 0 }), car({ brokenDown: true }), car({ condition: 5 })]) {
      const fast = harness(stuck, 300);
      expect(await fast.service.heartbeat(fast.ctx, { x: 300, z: 0 }, 'car')).toMatchObject({ accepted: false, reason: 'car-disabled' });
      expect(fast.drive).not.toHaveBeenCalled();
      const pushed = harness(stuck, 12);
      expect((await pushed.service.heartbeat(pushed.ctx, { x: 12, z: 0 }, 'car')).accepted).toBe(true);
      expect(pushed.plausible).toHaveBeenCalledWith('c1', { x: 12, z: 0 }, 'walk');
      expect(pushed.drive).not.toHaveBeenCalled();
    }
  });

  it('refuses car mode without a car', async () => {
    const { service, ctx } = harness(null, 10);
    expect(await service.heartbeat(ctx, { x: 10, z: 0 }, 'car')).toMatchObject({ accepted: false, reason: 'no-car' });
  });
});

describe('filling stations on the server', () => {
  const station = SERVICE_POINTS.find((point) => point.kind === 'fuel');
  if (!station) throw new RangeError('no station');
  const at = station.entrance.position;

  it('sells fuel at the forecourt with a key per press', async () => {
    const { service, ctx, refuel } = harness(car(), 5);
    await service.buyFuel(ctx, station.id, at, null, 'press-1');
    expect(refuel).toHaveBeenCalledWith(ctx, null, station.name, `fuel:${station.id}:press-1`);
  });

  it('refuses from down the road, and at a mechanic id', async () => {
    const { service, ctx } = harness(car(), 5);
    await expect(service.buyFuel(ctx, station.id, { x: at.x + SERVICE_RADIUS + 5, z: at.z }, null, 'k')).rejects.toThrow(/Pull up at the pumps/);
    const mechanic = SERVICE_POINTS.find((point) => point.kind === 'mechanic');
    await expect(service.buyFuel(ctx, mechanic?.id ?? '', mechanic?.entrance.position ?? at, null, 'k')).rejects.toThrow();
  });

  it('has dry stations during fuel scarcity', async () => {
    const dayIndex = Math.floor(50_000 / (24 * 60));
    const dry = SERVICE_POINTS.find((point) => point.kind === 'fuel' && fuelStationDry('world', point.id, dayIndex, true));
    if (!dry) return;
    const { service, ctx, refuel } = harness(car(), 5, { scarcity: true });
    await expect(service.buyFuel(ctx, dry.id, dry.entrance.position, null, 'k')).rejects.toThrow(/no fuel today/);
    expect(refuel).not.toHaveBeenCalled();
  });
});
