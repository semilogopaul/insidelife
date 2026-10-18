import { describe, expect, it } from 'vitest';
import { hasLanded, nextLanding } from '../landing';

const plane = (airborne: boolean, arrivesAt: number | null) => ({ airborne, arrivesAt });

describe('aircraft landings on the client', () => {
  it('finds the earliest landing still ahead, and ignores parked planes and past landings', () => {
    expect(nextLanding([plane(true, 500), plane(true, 300), plane(false, null)], 100)).toBe(300);
    expect(nextLanding([plane(true, 90)], 100)).toBeNull();
    expect(nextLanding([], 100)).toBeNull();
  });

  it('treats a plane listed in the air whose time has passed as landed', () => {
    expect(hasLanded(plane(true, 100), 100)).toBe(true);
    expect(hasLanded(plane(true, 101), 100)).toBe(false);
    expect(hasLanded(plane(false, null), 100)).toBe(false);
  });
});
