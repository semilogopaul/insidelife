import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { IsNull, type EntityManager } from 'typeorm';
import { REDIS } from '../../common/redis/redis.module.js';
import type { AppConfig } from '../../config/configuration.js';
import { CharacterDirectory } from '../characters/character-directory.service.js';
import { RealtimeBus } from '../realtime-bus/realtime-bus.service.js';
import { RefreshTokenEntity } from './entities/refresh-token.entity.js';

const CUTOFF_KEY = (userId: string): string => `auth:cutoff:${userId}`;

/**
 * Ends every session of an account at once (suspension, deletion): refresh tokens are revoked in the database (inside
 * the caller's transaction), and after commit a cut-off time goes to Redis so access tokens issued before it stop
 * working on every API node immediately, not when they expire. Open game sockets are closed.
 */
@Injectable()
export class SessionRevocationService {
  private readonly logger = new Logger(SessionRevocationService.name);
  /** Long enough to outlive any access token issued before the cut-off (player or admin). */
  private readonly cutoffTtlSeconds: number;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly directory: CharacterDirectory,
    private readonly bus: RealtimeBus,
    config: ConfigService<AppConfig, true>,
  ) {
    const playerTtl = config.get('auth', { infer: true }).accessTtlSeconds;
    const adminTtl = config.get('admin', { infer: true }).accessTtlSeconds;
    this.cutoffTtlSeconds = Math.max(playerTtl, adminTtl) + 120;
  }

  /** Revoke the account's refresh tokens using the caller's transaction. Returns how many were live. */
  async revokeRefreshTokens(manager: EntityManager, userId: string): Promise<number> {
    const result = await manager.update(RefreshTokenEntity, { userId, revokedAt: IsNull() }, { revokedAt: new Date() });
    return result.affected ?? 0;
  }

  /** After the transaction commits: access tokens issued until now stop working; game sockets close. */
  async cutOff(userId: string, at = Date.now()): Promise<void> {
    await this.redis.set(CUTOFF_KEY(userId), String(at), 'EX', this.cutoffTtlSeconds);
    try {
      const character = await this.directory.findLivingByUser(userId);
      if (character) this.bus.disconnectCharacter(character.id);
    } catch (error) {
      this.logger.warn({ err: error, userId }, 'Could not close the account’s sockets');
    }
  }

  /** True when a token issued at `issuedAtMs` (Unix ms) predates the account's cut-off. */
  async isCutOff(userId: string, issuedAtMs: number | undefined): Promise<boolean> {
    const cutoff = await this.redis.get(CUTOFF_KEY(userId));
    if (cutoff === null) return false;
    return issuedAtMs === undefined || issuedAtMs < Number(cutoff);
  }
}
