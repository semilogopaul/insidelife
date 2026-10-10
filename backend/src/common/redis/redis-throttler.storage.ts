import { createHash } from 'node:crypto';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface.js';
import type { Redis } from 'ioredis';

/**
 * Rate-limit counters in Redis, so the limits hold across every API node (the default in-memory store counts per
 * process). One atomic script per request: count the hit in a fixed window, and start a block when the limit is passed.
 * Returns seconds, like the built-in store.
 */
const SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = redis.call('PTTL', KEYS[2])
if blocked <= 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blocked = tonumber(ARGV[3])
end
return { hits, ttl, blocked }
`;

/** Redis caches scripts by SHA1: send the 40-character digest per request, and the script only when Redis lost it. */
const SCRIPT_SHA = createHash('sha1').update(SCRIPT).digest('hex');
const isNoScript = (error: unknown): boolean => error instanceof Error && error.message.startsWith('NOSCRIPT');

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  private async hit(keys: readonly [string, string], args: readonly number[]): Promise<unknown> {
    try {
      return await this.redis.evalsha(SCRIPT_SHA, 2, ...keys, ...args);
    } catch (error) {
      if (!isNoScript(error)) throw error;
      return this.redis.eval(SCRIPT, 2, ...keys, ...args);
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `throttle:${throttlerName}:${key}`;
    const [hits, ttlMs, blockedMs] = (await this.hit([`${base}:hits`, `${base}:block`], [ttl, limit, Math.max(1, blockDuration)])) as [number, number, number];
    const isBlocked = blockedMs > 0;
    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockedMs / 1000) : 0,
    };
  }
}
