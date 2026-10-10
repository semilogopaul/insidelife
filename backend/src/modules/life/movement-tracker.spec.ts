import { describe, expect, it } from 'vitest';
import { CITY_GEOMETRY_VERSION, layoutToWorld, venueEntrance } from '@insidelife/shared';
import type { Redis } from 'ioredis';
import { MovementTracker } from './movement-tracker.service.js';

/** A Redis with just the calls the tracker makes. */
function fakeRedis(): { readonly store: Map<string, string>; readonly redis: Redis } {
  const store = new Map<string, string>();
  const redis = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
  };
  return { store, redis: redis as unknown as Redis };
}

describe('MovementTracker across the four-lane widening', () => {
  it('moves a fix saved on the two-lane roads outwards with the road, so resuming and anti-teleport agree', async () => {
    const { store, redis } = fakeRedis();
    const tracker = new MovementTracker(redis);
    // Standing at Ikeja City Mall's door in the first city (no geometry version on the fix).
    const legacy = { x: -165, z: -130.9, at: Date.now(), mode: 'walk' as const, heading: 0.5 };
    store.set('move:last:c1', JSON.stringify(legacy));

    const fix = await tracker.last('c1');
    expect(fix).toMatchObject({ ...layoutToWorld(legacy), heading: 0.5, mode: 'walk', at: legacy.at, v: CITY_GEOMETRY_VERSION });
    const door = venueEntrance('ikeja-city-mall')!.position;
    expect(Math.hypot(fix!.x - door.x, fix!.z - door.z)).toBeLessThan(0.01);
    // Walking in at the (moved) door straight away is plausible: no false teleport after the deploy.
    expect((await tracker.isPlausible('c1', door, 'walk')).ok).toBe(true);
  });

  it('stores new fixes with the geometry version and never moves them again', async () => {
    const { store, redis } = fakeRedis();
    const tracker = new MovementTracker(redis);
    await tracker.anchor('c2', { x: 12.5, z: -40 }, 'car', 1);
    expect(JSON.parse(store.get('move:last:c2')!)).toMatchObject({ x: 12.5, z: -40, v: CITY_GEOMETRY_VERSION });
    expect(await tracker.last('c2')).toMatchObject({ x: 12.5, z: -40, mode: 'car', heading: 1 });
  });
});
