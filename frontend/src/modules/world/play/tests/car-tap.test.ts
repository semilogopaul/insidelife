import { Ray, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { carTapDistance, CAR_TAP_REACH } from '../interaction/TapHandler';
import { createVehicle, vehicleSpecFor } from '../physics/vehicle';
import { CAR_REACH } from '../player/player-controller';

const spec = vehicleSpecFor('sedan');

/** A car at (x, z) facing east (heading 0). */
function car(x: number, z: number, heading = 0) {
  return { state: createVehicle(x, z, heading), spec, y: 0.1 };
}

/** A ray from a camera above and behind (x, z) looking at `target`. */
function rayAt(target: Vector3, from = new Vector3(target.x - 8, 6, target.z + 8)): Ray {
  return new Ray(from, target.clone().sub(from).normalize());
}

describe('tapping your own car', () => {
  it('hits the car body, a little beyond its edges (fingers are fat)', () => {
    const parked = car(10, 20);
    expect(carTapDistance(rayAt(new Vector3(10, 0.8, 20)), parked)).not.toBeNull();
    // Just past the bumper still counts.
    expect(carTapDistance(rayAt(new Vector3(10 + spec.halfLength + 0.4, 0.5, 20)), parked)).not.toBeNull();
  });

  it('misses the empty road beside it', () => {
    const parked = car(10, 20);
    expect(carTapDistance(rayAt(new Vector3(10, 0, 20 + spec.halfWidth + 3)), parked)).toBeNull();
  });

  it('follows the car when it is parked at an angle', () => {
    const parked = car(0, 0, Math.PI / 2);
    // Facing south: the body runs along z, so a point 2 m south is on it and 2 m east is not.
    expect(carTapDistance(rayAt(new Vector3(0, 0.6, 2)), parked)).not.toBeNull();
    const east = new Vector3(spec.halfWidth + 2, 0.6, 0);
    expect(carTapDistance(rayAt(east, new Vector3(east.x, 10, east.z)), parked)).toBeNull();
  });

  it('reaches further than the context button does', () => {
    expect(CAR_TAP_REACH).toBeGreaterThan(CAR_REACH);
  });
});
