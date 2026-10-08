import { describe, expect, it } from 'vitest';
import { venueEntrance, type CharacterSnapshotDto } from '@insidelife/shared';
import { resolveStart } from '../flow/start-pose';

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
