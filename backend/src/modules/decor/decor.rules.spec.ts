import { describe, expect, it } from 'vitest';
import { carriedPose } from './decor.rules.js';

const rect = (x: number, z: number, rot = 0) => ({ x, z, w: 1.2, d: 0.35, rot });
const onTable = { x: 0.3, z: 0, y: 0.8, rot: 0, wall: null, onId: 't' } as const;

describe('carriedPose', () => {
  it('slides with a table that moves', () => {
    expect(carriedPose(rect(0, 0), rect(2, 1), onTable, 0.8)).toEqual({ x: 2.3, z: 1, y: 0.8, rot: 0, wall: null, onId: 't' });
  });

  it('turns with a table that turns, keeping its place on the surface', () => {
    const turned = carriedPose(rect(0, 0), rect(0, 0, 90), onTable, 0.8);
    expect(turned.rot).toBe(90);
    expect(turned.x).toBeCloseTo(0);
    expect(turned.z).toBeCloseTo(-0.3);
  });

  it('follows the new surface height', () => {
    expect(carriedPose(rect(0, 0), rect(0, 0), onTable, 0.42).y).toBe(0.42);
  });
});
