import type { DataSource, EntityManager, FindManyOptions } from 'typeorm';
import { ForbiddenActionException } from '../../common/exceptions/domain.exception.js';
import { BlockEntity } from './entities/block.entity.js';
import { FriendshipEntity, friendshipPairKey } from './entities/friendship.entity.js';
import { SocialGuard } from './social-guard.service.js';

type Row = Record<string, unknown>;

/** Minimal in-memory EntityManager: evaluates `where` objects/arrays with equality. */
class FakeManager {
  constructor(private readonly tables: Map<unknown, Row[]>) {}

  async exists(entity: unknown, options?: FindManyOptions<object>): Promise<boolean> {
    return (await this.find(entity, options)).length > 0;
  }

  async find(entity: unknown, options?: FindManyOptions<object>): Promise<Row[]> {
    const rows = this.tables.get(entity) ?? [];
    const where = options?.where;
    const clauses = (Array.isArray(where) ? where : where ? [where] : [{}]) as Row[];
    return rows.filter((row) => clauses.some((clause) => Object.entries(clause).every(([key, value]) => row[key] === value)));
  }
}

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
const C = 'c0000000-0000-4000-8000-000000000003';

function guardWith(blocks: Array<[string, string]>, friendships: Array<[string, string, 'pending' | 'accepted']> = []): SocialGuard {
  const tables = new Map<unknown, Row[]>([
    [BlockEntity, blocks.map(([blockerId, blockedId]) => ({ blockerId, blockedId }))],
    [FriendshipEntity, friendships.map(([a, b, status]) => ({ pairKey: friendshipPairKey(a, b), requesterId: a, addresseeId: b, status }))],
  ]);
  const manager = new FakeManager(tables) as unknown as EntityManager;
  return new SocialGuard({ manager } as unknown as DataSource);
}

describe('SocialGuard', () => {
  it('treats a block as symmetric for interactions', async () => {
    const guard = guardWith([[A, B]]);
    expect(await guard.isBlocked(A, B)).toBe(true);
    expect(await guard.isBlocked(B, A)).toBe(true);
    expect(await guard.isBlocked(A, C)).toBe(false);
  });

  it('knows who blocked whom when it matters (profiles)', async () => {
    const guard = guardWith([[A, B]]);
    expect(await guard.hasBlocked(A, B)).toBe(true);
    expect(await guard.hasBlocked(B, A)).toBe(false);
  });

  it('never blocks you from yourself', async () => {
    expect(await guardWith([[A, A]]).isBlocked(A, A)).toBe(false);
  });

  it('throws a 403 that does not reveal who blocked whom', async () => {
    const guard = guardWith([[B, A]]);
    await expect(guard.assertNotBlocked(A, B)).rejects.toBeInstanceOf(ForbiddenActionException);
    await expect(guard.assertNotBlocked(A, B)).rejects.toThrow('You can’t interact with this player');
    await expect(guardWith([]).assertNotBlocked(A, B)).resolves.toBeUndefined();
  });

  it('lists everyone on either side of a block', async () => {
    const ids = await guardWith([[A, B], [C, A]]).blockedIds(A);
    expect([...ids].toSorted()).toEqual([B, C].toSorted());
  });

  it('only counts accepted friendships as friends, in either direction', async () => {
    const guard = guardWith([], [[A, B, 'accepted'], [A, C, 'pending']]);
    expect(await guard.areFriends(B, A)).toBe(true);
    expect(await guard.areFriends(A, C)).toBe(false);
  });

  it('uses the caller’s transaction manager when given one', async () => {
    const guard = guardWith([]);
    const txManager = new FakeManager(new Map([[BlockEntity, [{ blockerId: A, blockedId: C }]]])) as unknown as EntityManager;
    expect(await guard.isBlocked(A, C)).toBe(false);
    expect(await guard.isBlocked(A, C, txManager)).toBe(true);
  });
});
