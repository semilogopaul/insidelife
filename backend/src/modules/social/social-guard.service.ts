import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource, EntityManager } from 'typeorm';
import { ForbiddenActionException } from '../../common/exceptions/domain.exception.js';
import { BlockEntity } from './entities/block.entity.js';
import { FriendshipEntity, friendshipPairKey } from './entities/friendship.entity.js';

/**
 * Read-only social checks for other domains (wallet transfers, DMs, romance, gifts). Import `SocialGuardModule`
 * and inject `SocialGuard`. Inside a `CharacterSession`, pass `ctx.manager` so the check sees the same transaction.
 *
 * Blocks are symmetric for interactions: if either player blocked the other, they can't interact.
 */
@Injectable()
export class SocialGuard {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** True if either character has blocked the other. */
  async isBlocked(a: string, b: string, manager: EntityManager = this.dataSource.manager): Promise<boolean> {
    if (a === b) return false;
    return manager.exists(BlockEntity, {
      where: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    });
  }

  /** Directional: did `blockerId` block `blockedId`? (Profiles hide people who blocked you.) */
  async hasBlocked(blockerId: string, blockedId: string, manager: EntityManager = this.dataSource.manager): Promise<boolean> {
    if (blockerId === blockedId) return false;
    return manager.exists(BlockEntity, { where: { blockerId, blockedId } });
  }

  /** Throws a player-friendly 403 that never reveals who blocked whom. */
  async assertNotBlocked(a: string, b: string, manager?: EntityManager): Promise<void> {
    if (await this.isBlocked(a, b, manager)) throw new ForbiddenActionException('You can’t interact with this player');
  }

  async areFriends(a: string, b: string, manager: EntityManager = this.dataSource.manager): Promise<boolean> {
    if (a === b) return false;
    return manager.exists(FriendshipEntity, { where: { pairKey: friendshipPairKey(a, b), status: 'accepted' } });
  }

  /** Accepted friends (up to `limit`), e.g. to put friends in the same Lagos instance. */
  async friendIds(characterId: string, limit = 500, manager: EntityManager = this.dataSource.manager): Promise<string[]> {
    const rows = await manager.find(FriendshipEntity, {
      where: [
        { requesterId: characterId, status: 'accepted' },
        { addresseeId: characterId, status: 'accepted' },
      ],
      select: { requesterId: true, addresseeId: true },
      take: limit,
    });
    return rows.map((row) => (row.requesterId === characterId ? row.addresseeId : row.requesterId));
  }

  /** Everyone this character blocked or was blocked by (for filtering lists). */
  async blockedIds(characterId: string, manager: EntityManager = this.dataSource.manager): Promise<Set<string>> {
    const rows = await manager.find(BlockEntity, {
      where: [{ blockerId: characterId }, { blockedId: characterId }],
      select: { blockerId: true, blockedId: true },
    });
    return new Set(rows.map((row) => (row.blockerId === characterId ? row.blockedId : row.blockerId)));
  }
}
