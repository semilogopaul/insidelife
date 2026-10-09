import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { SHARD_HARD_CAP, SHARD_SOFT_CAP, ShardsService } from './shards.service.js';

/** Just the Redis commands ShardsService uses, in memory. */
function fakeRedis(): Redis {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const set = (key: string): Set<string> => {
    let value = sets.get(key);
    if (!value) sets.set(key, (value = new Set()));
    return value;
  };
  const api = {
    get: async (key: string) => strings.get(key) ?? null,
    set: async (key: string, value: string) => void strings.set(key, value),
    mget: async (keys: string[]) => keys.map((key) => strings.get(key) ?? null),
    incr: async (key: string) => {
      const next = Number(strings.get(key) ?? 0) + 1;
      strings.set(key, String(next));
      return next;
    },
    sadd: async (key: string, member: string) => set(key).add(member).size,
    srem: async (key: string, member: string) => Number(set(key).delete(member)),
    sismember: async (key: string, member: string) => Number(set(key).has(member)),
    scard: async (key: string) => set(key).size,
    smembers: async (key: string) => [...set(key)],
    srandmember: async (key: string, count: number) => [...set(key)].slice(0, count),
  };
  const chain = () => {
    const ops: (() => Promise<unknown>)[] = [];
    const proxy: Record<string, unknown> = {
      exec: async () => Promise.all(ops.map(async (op) => [null, await op()])),
    };
    for (const name of ['sadd', 'set', 'scard'] as const) {
      proxy[name] = (...args: unknown[]) => {
        ops.push(() => (api[name] as (...a: unknown[]) => Promise<unknown>)(...args));
        return proxy;
      };
    }
    return proxy;
  };
  return { ...api, multi: chain, pipeline: chain } as unknown as Redis;
}

describe('Lagos instances', () => {
  it('fills an instance up to the soft cap before opening the next', async () => {
    const shards = new ShardsService(fakeRedis());
    const placed: string[] = [];
    for (let i = 0; i < SHARD_SOFT_CAP + 5; i++) placed.push(await shards.assign(`p${i}`, []));
    expect(new Set(placed.slice(0, SHARD_SOFT_CAP))).toEqual(new Set(['lagos-1']));
    expect(placed.at(-1)).toBe('lagos-2');
  });

  it('puts you with your online friends, up to the hard cap', async () => {
    const shards = new ShardsService(fakeRedis());
    for (let i = 0; i < SHARD_SOFT_CAP; i++) await shards.assign(`p${i}`, []);
    expect(await shards.assign('stranger', [])).toBe('lagos-2');
    // A friend of p3 joins the full-ish lagos-1 rather than the emptier one.
    expect(await shards.assign('friend-of-p3', ['p3', 'nobody'])).toBe('lagos-1');
  });

  it('never goes past the hard cap to follow friends', async () => {
    const shards = new ShardsService(fakeRedis());
    for (let i = 0; i < SHARD_SOFT_CAP; i++) await shards.assign(`p${i}`, []);
    for (let i = SHARD_SOFT_CAP; i < SHARD_HARD_CAP; i++) await shards.assign(`f${i}`, ['p0']);
    expect(await shards.size('lagos-1')).toBe(SHARD_HARD_CAP);
    expect(await shards.assign('one-too-many', ['p0'])).not.toBe('lagos-1');
  });

  it('reconnecting puts you back where you were; leaving frees the seat', async () => {
    const shards = new ShardsService(fakeRedis());
    const first = await shards.assign('ada', []);
    await shards.assign('bayo', []);
    await shards.leave('ada');
    expect(await shards.size(first)).toBe(1);
    expect(await shards.assign('ada', [])).toBe(first);
    expect(await shards.assign('ada', [])).toBe(first);
    expect(await shards.size(first)).toBe(2);
  });
});
