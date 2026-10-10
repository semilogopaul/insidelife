import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../common/redis/redis.module.js';

/** Rankings are read far more than they change: every board and Fobes page is shared by all viewers for this long. */
export const RANKING_CACHE_TTL_SECONDS = 60;

/**
 * Redis read-through cache for rankings (leaderboards and Fobes). A Redis hiccup degrades to computing fresh rather
 * than failing the request. Cache raw rows here; privacy is applied per viewer after the read.
 */
@Injectable()
export class RankingCache {
  private readonly logger = new Logger(RankingCache.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async get<T>(key: string, load: () => Promise<T>, ttlSeconds: number = RANKING_CACHE_TTL_SECONDS): Promise<T> {
    try {
      const hit = await this.redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch (error) {
      this.logger.warn(`Ranking cache read failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
    const value = await load();
    try {
      await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Ranking cache write failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }
    return value;
  }
}
