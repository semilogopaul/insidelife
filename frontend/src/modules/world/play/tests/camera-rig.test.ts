import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { AD_PLACEMENTS } from '@insidelife/shared';
import { CameraRig } from '../camera/camera-rig';
import { ColliderGrid, type Aabb } from '../physics/collision';
import { adStructureBoxes } from '../physics/obstacles';

const inside = (box: Aabb, x: number, y: number, z: number): boolean =>
  x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ && y < box.height;

/** Run the rig for `seconds` with the player standing still at the origin, facing +x. */
function settle(boxes: readonly Aabb[], seconds = 4): { readonly camera: PerspectiveCamera; readonly rig: CameraRig } {
  const camera = new PerspectiveCamera(52, 390 / 844, 0.1, 500);
  const rig = new CameraRig();
  const grid = new ColliderGrid(boxes);
  const subject = { x: 0, y: 0, z: 0, heading: 0, speed: 0 };
  rig.snap(subject);
  for (let t = 0; t < seconds; t += 1 / 60) rig.update(camera, subject, 1 / 60, 10, grid, true);
  return { camera, rig };
}

describe('the street camera near walls and street furniture', () => {
  it('never sits inside a lightbox or a wall right behind you, and keeps off your head', () => {
    // A wall behind the player and a lightbox beside the gate: the case that trapped the camera at a front door.
    const wall: Aabb = { minX: -1.6, maxX: -1.3, minZ: -6, maxZ: 6, height: 3 };
    const lightbox: Aabb = { minX: -1.2, maxX: -0.84, minZ: 0.6, maxZ: 2.4, height: 2.8 };
    const { camera } = settle([wall, lightbox]);
    const { x, y, z } = camera.position;
    expect(inside(wall, x, y, z)).toBe(false);
    expect(inside(lightbox, x, y, z)).toBe(false);
    expect(Math.hypot(x, y - 1.55, z)).toBeGreaterThanOrEqual(1);
  });

  it('swings round to the open side when you stand with your back to a wall', () => {
    const wall: Aabb = { minX: -2.2, maxX: -1.9, minZ: -0.8, maxZ: 0.8, height: 4 };
    const { camera } = settle([wall]);
    // Pulled well back (beyond the wall's reach) instead of pressed against it.
    expect(Math.hypot(camera.position.x, camera.position.z)).toBeGreaterThan(3);
  });

  it('makes the street ads solid: lightboxes, shelter panels and billboard poles', () => {
    const boxes = adStructureBoxes(AD_PLACEMENTS);
    expect(boxes.length).toBe(AD_PLACEMENTS.filter((spot) => spot.kind === 'totem' || spot.kind === 'bus-shelter' || spot.kind === 'street-billboard').length);
    for (const box of boxes) {
      expect(box.maxX - box.minX).toBeGreaterThan(0.1);
      expect(box.maxZ - box.minZ).toBeGreaterThan(0.1);
      expect(box.height).toBeGreaterThan(1);
    }
  });
});
