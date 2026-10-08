import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { MAX_PLAUSIBLE_SPEED, roadDistance, type WorldPoint } from '@insidelife/shared';
import { REDIS } from '../../common/redis/redis.module.js';

export interface Fix extends WorldPoint {
  readonly at: number;
  readonly mode: 'walk' | 'car';
  /** Radians; 0 for fixes saved before headings were recorded. */
  readonly heading?: number;
}

const KEY = (characterId: string): string => `move:last:${characterId}`;
/** Positions older than this are stale (player went offline); we stop trusting them. */
const FIX_TTL_SECONDS = 15 * 60;
/** Grace for network jitter and spawn snapping (metres). */
const SLACK_METRES = 25;

/**
 * Anti-teleport bookkeeping for the open world. The client reports positions; the server only accepts moves that a
 * car (or a pair of legs) could plausibly have made since the last accepted fix.
 */
@Injectable()
export class MovementTracker {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async last(characterId: string): Promise<Fix | null> {
    const raw = await this.redis.get(KEY(characterId));
    return raw ? (JSON.parse(raw) as Fix) : null;
  }

  async anchor(characterId: string, point: WorldPoint, mode: 'walk' | 'car', heading = 0): Promise<void> {
    const fix: Fix = { x: point.x, z: point.z, at: Date.now(), mode, heading };
    await this.redis.set(KEY(characterId), JSON.stringify(fix), 'EX', FIX_TTL_SECONDS);
  }

  /** Could the character have travelled from the last fix to `point` by now? */
  async isPlausible(characterId: string, point: WorldPoint, mode: 'walk' | 'car'): Promise<{ ok: boolean; distance: number; from: Fix | null }> {
    const from = await this.last(characterId);
    if (!from) return { ok: true, distance: 0, from: null };
    const distance = roadDistance(from, point);
    const elapsedSeconds = Math.max(0.5, (Date.now() - from.at) / 1000);
    const speedCap = MAX_PLAUSIBLE_SPEED[mode === 'car' || from.mode === 'car' ? 'car' : 'walk'];
    return { ok: distance <= speedCap * elapsedSeconds + SLACK_METRES, distance, from };
  }

  async clear(characterId: string): Promise<void> {
    await this.redis.del(KEY(characterId));
  }
}
