import { describe, expect, it } from 'vitest';
import { CITY_GEOMETRY_VERSION, layoutToWorld, venueEntrance, type CharacterSnapshotDto } from '@insidelife/shared';
import { loadPose, savePose, type SavedPose } from '../flow/spawn-handoff';
import { resolveStart } from '../flow/start-pose';
import { surfaceAt } from '../physics/surface';

describe('saved poses across the four-lane widening', () => {
  const vehicle = { ownedVehicleId: 'car-1', vehicleId: 'toyota-corolla-2008', name: 'Corolla', model: 'sedan', color: '#fff', plate: 'KJA-1', fuelType: 'petrol', fuelEconomyKmPerLitre: 12, fuelLitres: 30, tankLitres: 50, condition: 80, brokenDown: false } as const;

  it('moves a pose saved on the two-lane roads (and its parked car) out with the road', () => {
    // Beside Ikeja City Mall's door in the first city, the car at the kerb in front of it.
    const legacy = { characterId: 'c1', x: -165, z: -130.9, heading: 0, driving: false, car: { x: -165, z: -127.6, heading: 0, vehicle }, savedAt: Date.now() };
    window.sessionStorage.setItem('insidelife:open-world-pose', JSON.stringify(legacy));
    const pose = loadPose('c1')!;
    expect(pose.geometry).toBe(CITY_GEOMETRY_VERSION);
    expect(pose).toMatchObject(layoutToWorld(legacy));
    expect(pose.car).toMatchObject(layoutToWorld(legacy.car));
    const door = venueEntrance('ikeja-city-mall')!.position;
    expect(Math.hypot(pose.x - door.x, pose.z - door.z)).toBeLessThan(0.01);
    expect(surfaceAt(pose.car!.x, pose.car!.z)).toBe('asphalt');
  });

  it('saves new poses with the geometry version and loads them untouched', () => {
    const pose: SavedPose = { characterId: 'c2', x: 12.5, z: -40, heading: 1, driving: false, car: null, savedAt: Date.now() };
    savePose(pose);
    expect(loadPose('c2')).toEqual({ ...pose, geometry: CITY_GEOMETRY_VERSION });
  });
});

const snapshotAt = (openWorld: CharacterSnapshotDto['openWorld']): CharacterSnapshotDto =>
  ({ character: { id: 'c1', locationId: 'street:yaba' }, openWorld }) as unknown as CharacterSnapshotDto;

describe('resolveStart after a reload', () => {
  const door = venueEntrance('unilag')!;

  it('resumes on foot exactly where the server last accepted the player', () => {
    const start = resolveStart(snapshotAt({ position: door.position, heading: 1.2, mode: 'walk' }), null, null, null);
    expect(start).toMatchObject({ x: door.position.x, z: door.position.z, heading: 1.2, lookupCar: true, driving: false });
  });

  it('steps a driver out onto the pavement nearby, with the car parked at the kerb', () => {
    const start = resolveStart(snapshotAt({ position: door.position, heading: 0, mode: 'car' }), null, null, null);
    expect(Math.hypot(start.x - door.position.x, start.z - door.position.z)).toBeLessThan(25);
    expect(Math.hypot(start.parking.x - start.x, start.parking.z - start.z)).toBeLessThan(10);
  });

  it('falls back to the district when the server has no recent position', () => {
    const start = resolveStart(snapshotAt(null), null, null, null);
    expect(Number.isFinite(start.x) && Number.isFinite(start.z)).toBe(true);
    expect(start.lookupCar).toBe(true);
  });
});
