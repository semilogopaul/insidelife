import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { PresencePlayerDto } from '@insidelife/shared';
import { REDIS } from '../../common/redis/redis.module.js';

const ONLINE_KEY = 'presence:online';
const PLAYER_KEY = (characterId: string): string => `presence:player:${characterId}`;
const VENUE_KEY = (locationId: string): string => `presence:venue:${locationId}`;
/** A connection must heartbeat within this window to count as online. */
const PRESENCE_TTL_SECONDS = 90;

/**
 * Who is online and where, stored in Redis so every API/gateway instance shares one view.
 * - `presence:online`            ZSET characterId → last heartbeat (ms)
 * - `presence:player:<id>`       JSON PresencePlayerDto (expires)
 * - `presence:venue:<location>`  SET of characterIds at that location
 */
@Injectable()
export class PresenceService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async markOnline(player: PresencePlayerDto): Promise<void> {
    const previous = await this.get(player.characterId);
    const pipeline = this.redis.multi();
    pipeline.zadd(ONLINE_KEY, Date.now(), player.characterId);
    pipeline.set(PLAYER_KEY(player.characterId), JSON.stringify(player), 'EX', PRESENCE_TTL_SECONDS);
    if (previous && previous.locationId !== player.locationId) pipeline.srem(VENUE_KEY(previous.locationId), player.characterId);
    pipeline.sadd(VENUE_KEY(player.locationId), player.characterId);
    await pipeline.exec();
  }

  async markOffline(characterId: string): Promise<void> {
    const previous = await this.get(characterId);
    const pipeline = this.redis.multi();
    pipeline.zrem(ONLINE_KEY, characterId);
    pipeline.del(PLAYER_KEY(characterId));
    if (previous) pipeline.srem(VENUE_KEY(previous.locationId), characterId);
    await pipeline.exec();
  }

  async get(characterId: string): Promise<PresencePlayerDto | null> {
    const raw = await this.redis.get(PLAYER_KEY(characterId));
    return raw ? (JSON.parse(raw) as PresencePlayerDto) : null;
  }

  async isOnline(characterId: string): Promise<boolean> {
    const score = await this.redis.zscore(ONLINE_KEY, characterId);
    return score !== null && Date.now() - Number(score) < PRESENCE_TTL_SECONDS * 1000;
  }

  async onlineCount(): Promise<number> {
    await this.evictStale();
    return this.redis.zcard(ONLINE_KEY);
  }

  /** Players currently at a location (capped to keep payloads and draw calls small). */
  async playersAt(locationId: string, limit = 40): Promise<PresencePlayerDto[]> {
    const ids = await this.redis.srandmember(VENUE_KEY(locationId), limit);
    return this.many(ids);
  }

  /** A sample of online players for the city map. */
  async sample(limit = 80): Promise<PresencePlayerDto[]> {
    await this.evictStale();
    const ids = await this.redis.zrevrange(ONLINE_KEY, 0, limit - 1);
    return this.many(ids);
  }

  private async many(ids: readonly string[]): Promise<PresencePlayerDto[]> {
    if (ids.length === 0) return [];
    const raws = await this.redis.mget(ids.map(PLAYER_KEY));
    return raws.filter((raw): raw is string => raw !== null).map((raw) => JSON.parse(raw) as PresencePlayerDto);
  }

  private async evictStale(): Promise<void> {
    await this.redis.zremrangebyscore(ONLINE_KEY, 0, Date.now() - PRESENCE_TTL_SECONDS * 1000);
  }
}
