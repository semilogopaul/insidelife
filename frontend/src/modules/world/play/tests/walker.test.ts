import { AVATAR_GAIT_SPEED } from '@/common/three/avatar';
import { describe, expect, it } from 'vitest';
import { HOME_LAYOUTS } from '../../interiors/layouts/catalog';
import { INTERIOR_WALKER_RADIUS } from '../../interiors/walk/colliders';
import { buildRoomPhysics } from '../../interiors/walk/home-walk-runtime';
import { ColliderGrid } from '../physics/collision';
import { JOG_SPEED, MAX_STEP, PACE_BOOST, WALKER_RADIUS, WALK_SPEED, createWalker, stepWalker, type WalkWorld } from '../physics/walker';
import { gaitFor } from '../runtime/play-runtime';

/** The pace the game shipped with before playtesters called it slow. */
const OLD_WALK = 1.9;
const OLD_JOG = 3.7;

const open: WalkWorld = { surfaceAt: () => 'pavement', groundHeightAt: () => 0.2, resolve: () => undefined };

describe('walking pace', () => {
  it('is about 40% faster than it was, walking and jogging', () => {
    expect(PACE_BOOST).toBeCloseTo(1.4);
    expect(WALK_SPEED / OLD_WALK).toBeCloseTo(1.4);
    expect(JOG_SPEED / OLD_JOG).toBeCloseTo(1.4);
    expect(JOG_SPEED).toBeLessThan(8);
  });

  it('reaches the new top speeds, walking and running', () => {
    const walker = createWalker(0, 0, 0, 0.2);
    for (let i = 0; i < 90; i++) stepWalker(walker, { dirX: 1, dirZ: 0, run: false }, 1 / 60, open);
    expect(walker.speed).toBeCloseTo(WALK_SPEED, 1);
    for (let i = 0; i < 90; i++) stepWalker(walker, { dirX: 1, dirZ: 0, run: true }, 1 / 60, open);
    expect(walker.speed).toBeGreaterThan(JOG_SPEED - 0.1);
    expect(walker.speed).toBeLessThanOrEqual(JOG_SPEED + 0.05);
  });

  it('covers the same ground whatever the frame rate', () => {
    const run = (dt: number): number => {
      const walker = createWalker(0, 0, 0, 0.2);
      for (let t = 0; t < 2; t += dt) stepWalker(walker, { dirX: 1, dirZ: 0, run: false }, dt, open);
      return walker.x;
    };
    expect(Math.abs(run(1 / 60) - run(1 / 20))).toBeLessThan(0.4);
  });
});

describe('animation keeps up', () => {
  it('plays the walk at the walking pace and the jog at the jogging pace, planting the feet', () => {
    const walk = gaitFor(WALK_SPEED, 1);
    expect(walk.clip).toBe('walk');
    const jog = gaitFor(JOG_SPEED, 1);
    expect(jog.clip).toBe('jog');
    // The clip speeds up with the pace, in the same proportion as the pace did (and never stalls or blurs).
    const before = gaitFor(OLD_WALK, 1);
    expect(walk.timeScale).toBeGreaterThan(before.timeScale);
    expect(walk.timeScale).toBeCloseTo(Math.min(WALK_SPEED / AVATAR_GAIT_SPEED.walk, 2.6 * PACE_BOOST), 5);
    expect(jog.timeScale).toBeGreaterThan(gaitFor(OLD_JOG, 1).timeScale - 1e-9);
    // Pedestrians and slow movers are unchanged.
    expect(gaitFor(1.3, 1)).toEqual({ clip: 'walk', timeScale: 1.3 / AVATAR_GAIT_SPEED.walk });
    expect(gaitFor(0.1, 1).clip).toBe('idle');
  });

  it('switches gait between the walking and jogging paces, not before', () => {
    expect(gaitFor(WALK_SPEED + 0.3, 1).clip).toBe('walk');
    expect(gaitFor((WALK_SPEED + JOG_SPEED) / 2 + 0.3, 1).clip).toBe('jog');
    expect(gaitFor(JOG_SPEED + 3, 1).clip).toBe('run');
  });
});

describe('collisions stay solid at the new pace', () => {
  it('does not run through a thin wall outdoors, even on a slow frame', () => {
    const wall = { minX: 5, maxX: 5.1, minZ: -20, maxZ: 20, height: 3 };
    const grid = new ColliderGrid([wall], 4);
    const world: WalkWorld = { ...open, resolve: (p, radius) => void grid.resolveCircle(p, radius) };
    for (const dt of [1 / 60, 1 / 30, 1 / 15, 0.25]) {
      const walker = createWalker(0, 0, 0, 0.2);
      for (let t = 0; t < 6; t += dt) stepWalker(walker, { dirX: 1, dirZ: 0, run: true }, dt, world);
      expect(walker.x, `dt ${dt}`).toBeLessThanOrEqual(wall.minX - WALKER_RADIUS + 0.02);
    }
  });

  it('moves in slices short enough that the walker never skips over its own radius', () => {
    expect(JOG_SPEED * MAX_STEP).toBeLessThan(WALKER_RADIUS / 2);
    expect(JOG_SPEED * MAX_STEP).toBeLessThan(INTERIOR_WALKER_RADIUS / 1.5);
  });

  it('keeps the walker inside every room and out of the furniture, running at every wall on slow frames', () => {
    for (const layout of Object.values(HOME_LAYOUTS)) {
      for (const room of layout.rooms) {
        const physics = buildRoomPhysics(room.template);
        const world: WalkWorld = { ...open, resolve: (p, radius) => void physics.grid.resolveCircle(p, radius) };
        const start = room.template.player.default?.at ?? [0, 0];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]] as const) {
          const walker = createWalker(start[0] as number, start[start.length - 1] as number, 0, 0);
          for (let i = 0; i < 80; i++) stepWalker(walker, { dirX: dx, dirZ: dz, run: true }, 1 / 20, world);
          const { width, depth } = room.template.room;
          expect(Math.abs(walker.x), `${layout.id}/${room.id} ${dx},${dz}`).toBeLessThanOrEqual(width / 2);
          expect(Math.abs(walker.z), `${layout.id}/${room.id} ${dx},${dz}`).toBeLessThanOrEqual(depth / 2);
          expect(physics.grid.overlaps(walker.x, walker.z, INTERIOR_WALKER_RADIUS - 0.05), `${layout.id}/${room.id} ${dx},${dz}`).toBe(false);
        }
      }
    }
  });
});
