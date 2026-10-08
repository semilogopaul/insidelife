import { describe, expect, it } from 'vitest';
import { ColliderGrid, pushOutOfBox, pushOutOfCircle, raySlab, type PushResult } from '../physics/collision';

const box = { minX: 0, minZ: 0, maxX: 10, maxZ: 10, height: 6 };

describe('collision resolution', () => {
  it('pushes a circle out of a box face and corner', () => {
    const out: PushResult = { nx: 0, nz: 0, depth: 0 };
    expect(pushOutOfBox({ x: -0.3, z: 5 }, 0.5, box, out)).toBe(true);
    expect(out.nx).toBeCloseTo(-0.2);
    expect(out.nz).toBeCloseTo(0);
    expect(pushOutOfBox({ x: -0.3, z: -0.3 }, 0.5, box, out)).toBe(true);
    expect(out.nx).toBeLessThan(0);
    expect(out.nz).toBeLessThan(0);
    expect(pushOutOfBox({ x: -1, z: 5 }, 0.5, box, out)).toBe(false);
  });

  it('leaves through the nearest face when the centre is inside', () => {
    const out: PushResult = { nx: 0, nz: 0, depth: 0 };
    pushOutOfBox({ x: 9, z: 5 }, 0.4, box, out);
    expect(out.nx).toBeCloseTo(1.4);
    expect(out.nz).toBe(0);
  });

  it('resolves against every overlapping box in the grid (slides into a corner)', () => {
    const grid = new ColliderGrid([box, { minX: 10, minZ: -10, maxX: 20, maxZ: 0, height: 4 }]);
    const p = { x: 10.2, z: 0.2 };
    expect(grid.resolveCircle(p, 0.5)).toBe(true);
    expect(grid.overlaps(p.x, p.z, 0.49)).toBe(false);
    const free = { x: 30, z: 30 };
    expect(grid.resolveCircle(free, 0.5)).toBe(false);
    expect(free).toEqual({ x: 30, z: 30 });
  });

  it('casts camera rays against box volumes (height included)', () => {
    const grid = new ColliderGrid([box]);
    expect(grid.raycast(-5, 2, 5, 1, 0, 0, 20)).toBeCloseTo(5);
    // Over the roof: misses.
    expect(grid.raycast(-5, 8, 5, 1, 0, 0, 20)).toBe(20);
    expect(raySlab(5, 2, 5, 1, 0, 0, box)).toBe(0);
  });

  it('pushes out of moving circles (traffic)', () => {
    const p = { x: 1, z: 0 };
    expect(pushOutOfCircle(p, 0.5, 0, 0, 1)).toBeCloseTo(0.5);
    expect(p.x).toBeCloseTo(1.5);
  });
});
