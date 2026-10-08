import { describe, expect, it } from 'vitest';
import { ColliderGrid, type MutablePoint, type PushResult } from '../physics/collision';
import type { Surface } from '../physics/surface';
import { CITY_SPEED_CAP, ROUGH_SPEED_CAP, createVehicle, speedKmh, stepVehicle, vehicleSpecFor, type DriveIntent, type DriveWorld } from '../physics/vehicle';

const spec = vehicleSpecFor('sedan', { topSpeedKmh: 200, zeroToHundredSeconds: 9.8, handling: 0.6, braking: 0.6 });
const open = (surface: (x: number, z: number) => Surface = () => 'asphalt', grid = new ColliderGrid([])): DriveWorld => ({
  surfaceAt: surface,
  resolve: (p: MutablePoint, radius: number, out: PushResult) => grid.resolveCircle(p, radius, out),
});
const intent = (patch: Partial<DriveIntent> = {}): DriveIntent => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, ...patch });
const run = (state: ReturnType<typeof createVehicle>, input: DriveIntent, seconds: number, world = open()): void => {
  for (let t = 0; t < seconds; t += 1 / 60) stepVehicle(state, input, spec, 1 / 60, world);
};

describe('vehicle physics step', () => {
  it('accelerates briskly and tops out at the ~60 km/h city cap', () => {
    const car = createVehicle(0, 0, 0);
    run(car, intent({ throttle: 1 }), 2);
    expect(speedKmh(car)).toBeGreaterThan(25);
    run(car, intent({ throttle: 1 }), 20);
    expect(car.speed).toBeLessThanOrEqual(CITY_SPEED_CAP + 0.01);
    expect(speedKmh(car)).toBeGreaterThan(55);
    // Heading east (0): it moved along +x only.
    expect(car.x).toBeGreaterThan(100);
    expect(Math.abs(car.z)).toBeLessThan(0.01);
  });

  it('brakes to a stop, then reverses while the brake is held', () => {
    const car = createVehicle(0, 0, 0);
    run(car, intent({ throttle: 1 }), 4);
    const moving = car.speed;
    run(car, intent({ brake: 1 }), 0.5);
    expect(car.speed).toBeLessThan(moving - 3);
    run(car, intent({ brake: 1 }), 4);
    expect(car.speed).toBeLessThan(-1);
    expect(car.speed).toBeGreaterThanOrEqual(-spec.reverseSpeed - 0.01);
  });

  it('coasts down when nothing is pressed', () => {
    const car = createVehicle(0, 0, 0);
    run(car, intent({ throttle: 1 }), 3);
    run(car, intent(), 30);
    expect(Math.abs(car.speed)).toBeLessThan(0.05);
  });

  it('steers right with positive input and its lock narrows with speed', () => {
    const slow = createVehicle(0, 0, 0);
    run(slow, intent({ throttle: 0.3 }), 1.5);
    run(slow, intent({ throttle: 0.3, steer: 1 }), 1);
    expect(slow.steer).toBeGreaterThan(0.4);
    expect(slow.heading).toBeGreaterThan(0);
    const fast = createVehicle(0, 0, 0);
    run(fast, intent({ throttle: 1 }), 12);
    run(fast, intent({ throttle: 1, steer: 1 }), 1);
    expect(fast.steer).toBeLessThan(0.25);
    expect(fast.steer).toBeLessThan(slow.steer);
  });

  it('drifts a little with the handbrake in a fast corner, and grip takes the slip away', () => {
    const car = createVehicle(0, 0, 0);
    run(car, intent({ throttle: 1 }), 8);
    run(car, intent({ throttle: 1, steer: 1, handbrake: true }), 0.6);
    expect(Math.abs(car.slip)).toBeGreaterThan(0.3);
    run(car, intent({ throttle: 0.4 }), 3);
    expect(Math.abs(car.slip)).toBeLessThan(0.2);
  });

  it('crawls over pavements and sand', () => {
    const car = createVehicle(0, 0, 0);
    run(car, intent({ throttle: 1 }), 6, open(() => 'pavement'));
    expect(car.speed).toBeLessThanOrEqual(ROUGH_SPEED_CAP + 0.2);
  });

  it('never drives into water or onto lot ground: it slides along the edge or stops', () => {
    const wall = (x: number): Surface => (x > 20 ? 'water' : 'asphalt');
    const car = createVehicle(0, 0, 0);
    run(car, intent({ throttle: 1 }), 8, open((x) => wall(x)));
    expect(car.x + spec.halfLength).toBeLessThanOrEqual(20.2);
    expect(Math.abs(car.speed)).toBeLessThan(2);
    // Driving diagonally at a north-south edge keeps sliding south.
    const slider = createVehicle(0, 0, Math.PI / 4);
    run(slider, intent({ throttle: 1 }), 8, open((x) => (x > 20 ? 'ground' : 'asphalt')));
    expect(slider.x + spec.halfLength * 0.72).toBeLessThanOrEqual(20.5);
    expect(slider.z).toBeGreaterThan(20);
  });

  it('stops against a building and records the impact', () => {
    const grid = new ColliderGrid([{ minX: 30, minZ: -10, maxX: 40, maxZ: 10, height: 10 }]);
    const car = createVehicle(0, 0, 0);
    let impact = 0;
    for (let t = 0; t < 8; t += 1 / 60) {
      stepVehicle(car, intent({ throttle: 1 }), spec, 1 / 60, open(undefined, grid));
      impact = Math.max(impact, car.impact);
    }
    expect(car.x + spec.halfLength).toBeLessThanOrEqual(30.3);
    expect(impact).toBeGreaterThan(5);
    expect(Math.abs(car.speed)).toBeLessThan(1.5);
  });
});
