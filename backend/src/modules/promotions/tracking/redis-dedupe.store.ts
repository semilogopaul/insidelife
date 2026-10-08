import type { Redis } from 'ioredis';
import type { DedupeStore } from './view-deduper.js';

/** One round trip per batch: SADD + EXPIRE per key in a pipeline. */
export class RedisDedupeStore implements DedupeStore {
  constructor(private readonly redis: Redis) {}

  async addMembers(entries: ReadonlyArray<{ readonly key: string; readonly member: string }>, ttlSeconds: number): Promise<boolean[]> {
    const pipeline = this.redis.pipeline();
    for (const entry of entries) pipeline.sadd(entry.key, entry.member).expire(entry.key, ttlSeconds);
    const results = (await pipeline.exec()) ?? [];
    return entries.map((_, index) => {
      const [error, added] = results[index * 2] ?? [null, 0];
      return error === null && added === 1;
    });
  }
}
