import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from '../../common/redis/redis.module.js';

/** Instances fill up to this before a new one is opened (lively but not crowded). */
export const SHARD_SOFT_CAP = 150;
/** Never more than this in one instance, even to join friends. */
export const SHARD_HARD_CAP = 200;
/** Reconnecting within this window puts you back in the same instance. */
const STICKY_SECONDS = 6 * 60 * 60;

const OF = (characterId: string): string => `shard:of:${characterId}`;
const MEMBERS = (shardId: string): string => `shard:members:${shardId}`;
const ALL = 'shard:all';
const SEQ = 'shard:seq';

/**
 * Lagos instances ("shards") for the open world: each online player is in one instance of up to ~200 people, and only
 * hears positions, arrivals and Lagos chat from that instance. Everything else stays global — the economy, DMs, friends,
 * parties, visits, ads and venue/home presence.
 *
 * Placement (`assign`): the instance you were in a moment ago (reconnects), else the one most of your online friends
 * are in (if it has room), else the fullest instance under the soft cap (fill-first keeps streets lively), else a new
 * one. Stored in Redis so every gateway node agrees:
 * - `shard:of:<characterId>`   instance id (sticky for a few hours)
 * - `shard:members:<shardId>`  SET of online characterIds
 * - `shard:all`                SET of instance ids
 * Concurrent placements may overfill an instance by a few players; the caps are soft by design.
 */
@Injectable()
export class ShardsService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async assign(characterId: string, friendIds: readonly string[]): Promise<string> {
    const sticky = await this.redis.get(OF(characterId));
    if (sticky && (await this.redis.sismember(MEMBERS(sticky), characterId)) === 1)
      return this.join(characterId, sticky);
    if (sticky && (await this.redis.scard(MEMBERS(sticky))) < SHARD_HARD_CAP)
      return this.join(characterId, sticky);

    const byFriends = await this.friendsShard(friendIds);
    if (byFriends) return this.join(characterId, byFriends);

    const shards = await this.redis.smembers(ALL);
    let best: { id: string; size: number } | null = null;
    if (shards.length > 0) {
      const pipeline = this.redis.pipeline();
      for (const id of shards) pipeline.scard(MEMBERS(id));
      const sizes = (await pipeline.exec()) ?? [];
      shards.forEach((id, index) => {
        const size = Number(sizes[index]?.[1] ?? 0);
        if (size < SHARD_SOFT_CAP && (!best || size > best.size || (size === best.size && id < best.id)))
          best = { id, size };
      });
    }
    const chosen = best as { id: string; size: number } | null;
    return this.join(characterId, chosen ? chosen.id : await this.open());
  }

  /** The player's last connection closed. Their instance stays sticky for a while. */
  async leave(characterId: string): Promise<void> {
    const shardId = await this.redis.get(OF(characterId));
    if (shardId) await this.redis.srem(MEMBERS(shardId), characterId);
  }

  async shardOf(characterId: string): Promise<string | null> {
    return this.redis.get(OF(characterId));
  }

  async size(shardId: string): Promise<number> {
    return this.redis.scard(MEMBERS(shardId));
  }

  /** Up to `limit` players in an instance (for the arrival snapshot). */
  async sample(shardId: string, limit: number): Promise<string[]> {
    return this.redis.srandmember(MEMBERS(shardId), limit);
  }

  /** The instance holding most of your online friends, if it has room. */
  private async friendsShard(friendIds: readonly string[]): Promise<string | null> {
    if (friendIds.length === 0) return null;
    const shards = await this.redis.mget(friendIds.map(OF));
    const counts = new Map<string, number>();
    for (const id of shards) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [id] of ranked) if ((await this.redis.scard(MEMBERS(id))) < SHARD_HARD_CAP) return id;
    return null;
  }

  private async open(): Promise<string> {
    const n = await this.redis.incr(SEQ);
    const id = `lagos-${n}`;
    await this.redis.sadd(ALL, id);
    return id;
  }

  private async join(characterId: string, shardId: string): Promise<string> {
    await this.redis
      .multi()
      .sadd(MEMBERS(shardId), characterId)
      .sadd(ALL, shardId)
      .set(OF(characterId), shardId, 'EX', STICKY_SECONDS)
      .exec();
    return shardId;
  }
}
