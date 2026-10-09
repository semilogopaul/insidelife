import { Inject, Injectable } from '@nestjs/common';
import { PROGRESSION_SIGNALS_PORT, type ProgressionSignalsPort } from '../../common/ports/progression.port.js';
import { InjectDataSource } from '@nestjs/typeorm';
import { IsNull, type DataSource, type EntityManager } from 'typeorm';
import {
  FRIEND_LIMITS,
  type FriendDto,
  type FriendRequestDto,
  type FriendRequestResultDto,
  type FriendsOverviewDto,
  type PlayerCardDto,
  type ProfileLocationVisibility,
} from '@insidelife/shared';
import { CharacterEntity } from '../characters/entities/character.entity.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import { FriendshipEntity, friendshipPairKey } from './entities/friendship.entity.js';
import { PlayerCardsService } from './player-cards.service.js';
import { friendshipTransition, type FriendshipAction, type FriendshipTransition } from './rules/friendship.rules.js';
import { friendlyLocationLabel } from './rules/profile.rules.js';
import { SocialGuard } from './social-guard.service.js';
import { SocialNotifier } from './social-notifier.service.js';
import { normaliseHandle, playerNotFound, ruleException } from './social-errors.js';

const MUTUAL_SAMPLE = 5;

const otherOf = (row: Pick<FriendshipEntity, 'requesterId' | 'addresseeId'>, characterId: string): string =>
  row.requesterId === characterId ? row.addresseeId : row.requesterId;

/**
 * Friend requests and friendships. Every mutation runs inside the actor's `CharacterSession`; the other player is
 * notified with a row written in the same transaction and a push after commit.
 */
@Injectable()
export class FriendsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cards: PlayerCardsService,
    private readonly guard: SocialGuard,
    private readonly notifier: SocialNotifier,
    @Inject(PROGRESSION_SIGNALS_PORT) private readonly signals: ProgressionSignalsPort,
  ) {}

  async overview(characterId: string): Promise<FriendsOverviewDto> {
    const rows = await this.dataSource.getRepository(FriendshipEntity).find({
      where: [{ requesterId: characterId }, { addresseeId: characterId }],
      order: { createdAt: 'DESC' },
    });
    const otherIds = rows.map((row) => otherOf(row, characterId));
    const [cards, locations] = await Promise.all([
      this.cards.cards(otherIds),
      this.sharedLocations(rows.filter((row) => row.status === 'accepted').map((row) => otherOf(row, characterId))),
    ]);

    const friends: FriendDto[] = [];
    const incoming: FriendRequestDto[] = [];
    const outgoing: FriendRequestDto[] = [];
    for (const row of rows) {
      const card = cards.get(otherOf(row, characterId));
      if (!card) continue;
      if (row.status === 'accepted') friends.push(this.friendDto(row, card, locations.get(card.id) ?? null));
      else (row.requesterId === characterId ? outgoing : incoming).push(this.requestDto(row, characterId, card));
    }
    friends.sort((a, b) => Number(b.online) - Number(a.online) || a.firstName.localeCompare(b.firstName));
    return { friends, incoming, outgoing, limits: { ...FRIEND_LIMITS } };
  }

  async request(ctx: SimulationContext, handle: string): Promise<FriendRequestResultDto> {
    const me = ctx.character.id;
    const target = await this.findLiving(ctx.manager, handle);
    const pairKey = friendshipPairKey(me, target.id);

    // Two attempts: if the other player asked us at the same instant, our insert yields and we accept theirs instead.
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await this.lockPair(ctx.manager, pairKey);
      const transition = await this.decide(ctx, current, 'request', target.id);
      if (transition.type === 'unchanged' && current) {
        return { state: 'pending', request: this.requestDto(current, me, await this.cardOrThrow(ctx, target.id)), friend: null };
      }
      if (transition.type === 'accept' && current) return { state: 'accepted', request: null, friend: await this.accept(ctx, current) };
      if (transition.type !== 'create-request') continue;

      const inserted = await ctx.manager
        .createQueryBuilder()
        .insert()
        .into(FriendshipEntity)
        .values({ pairKey, requesterId: me, addresseeId: target.id, status: 'pending', acceptedAt: null })
        .orIgnore()
        .returning(['id'])
        .execute();
      const id = (inserted.raw as Array<{ id: string }>)[0]?.id;
      if (!id) continue;

      const row = await ctx.manager.findOneByOrFail(FriendshipEntity, { id });
      await this.notifier.notify(
        ctx,
        target.id,
        {
          kind: 'social',
          title: 'New friend request',
          body: `@${ctx.character.handle} (${ctx.character.firstName}) wants to be your friend.`,
          tone: 'neutral',
        },
        'friend-request',
      );
      return { state: 'pending', request: this.requestDto(row, me, await this.cardOrThrow(ctx, target.id)), friend: null };
    }
    throw ruleException('TRY_AGAIN', 'Something moved at the same time — try again');
  }

  async acceptRequest(ctx: SimulationContext, requestId: string): Promise<FriendDto> {
    const row = await ctx.manager.findOne(FriendshipEntity, { where: { id: requestId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw ruleException('NO_REQUEST', 'That friend request isn’t waiting for you');
    await this.decide(ctx, row, 'accept', otherOf(row, ctx.character.id));
    return this.accept(ctx, row);
  }

  /** Decline an incoming request or cancel your own outgoing one. */
  async declineRequest(ctx: SimulationContext, requestId: string): Promise<void> {
    const row = await ctx.manager.findOne(FriendshipEntity, { where: { id: requestId }, lock: { mode: 'pessimistic_write' } });
    if (!row || (row.requesterId !== ctx.character.id && row.addresseeId !== ctx.character.id)) {
      throw ruleException('NO_REQUEST', 'There’s no pending request to decline');
    }
    await this.decide(ctx, row, 'decline', otherOf(row, ctx.character.id));
    await ctx.manager.delete(FriendshipEntity, { id: row.id });
  }

  async remove(ctx: SimulationContext, otherId: string): Promise<void> {
    const row = await this.lockPair(ctx.manager, friendshipPairKey(ctx.character.id, otherId));
    await this.decide(ctx, row, 'remove', otherId);
    if (row) await ctx.manager.delete(FriendshipEntity, { id: row.id });
    this.notifier.invalidate(ctx, otherId, 'friends');
  }

  /** Ids of accepted friends. */
  async friendIds(characterId: string, manager: EntityManager = this.dataSource.manager): Promise<string[]> {
    const rows: Array<{ id: string }> = await manager.query(
      `SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
         FROM social_friendships
        WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)`,
      [characterId],
    );
    return rows.map((row) => row.id);
  }

  async friendCount(characterId: string, manager: EntityManager = this.dataSource.manager): Promise<number> {
    return manager.count(FriendshipEntity, {
      where: [
        { requesterId: characterId, status: 'accepted' },
        { addresseeId: characterId, status: 'accepted' },
      ],
    });
  }

  /** The row between two players (any status), if any. */
  pair(a: string, b: string, manager: EntityManager = this.dataSource.manager): Promise<FriendshipEntity | null> {
    return manager.findOne(FriendshipEntity, { where: { pairKey: friendshipPairKey(a, b) } });
  }

  async mutualFriends(a: string, b: string): Promise<{ count: number; sample: PlayerCardDto[] }> {
    if (a === b) return { count: 0, sample: [] };
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `WITH fa AS (
              SELECT CASE WHEN requester_id = $1 THEN addressee_id ELSE requester_id END AS id
                FROM social_friendships WHERE status = 'accepted' AND (requester_id = $1 OR addressee_id = $1)),
            fb AS (
              SELECT CASE WHEN requester_id = $2 THEN addressee_id ELSE requester_id END AS id
                FROM social_friendships WHERE status = 'accepted' AND (requester_id = $2 OR addressee_id = $2))
       SELECT fa.id FROM fa JOIN fb ON fb.id = fa.id`,
      [a, b],
    );
    const sampleIds = rows.slice(0, MUTUAL_SAMPLE).map((row) => row.id);
    const cards = await this.cards.cards(sampleIds);
    return { count: rows.length, sample: sampleIds.map((id) => cards.get(id)).filter((card): card is PlayerCardDto => card !== undefined) };
  }

  private async accept(ctx: SimulationContext, row: FriendshipEntity): Promise<FriendDto> {
    const other = otherOf(row, ctx.character.id);
    row.status = 'accepted';
    row.acceptedAt = new Date();
    await ctx.manager.save(row);
    await this.notifier.notify(
      ctx,
      other,
      {
        kind: 'social',
        title: 'You have a new friend',
        body: `You and @${ctx.character.handle} are now friends. Gist don start.`,
        tone: 'good',
      },
      'friends',
    );
    await this.signals.record(ctx, 'friend-added');
    const card = await this.cardOrThrow(ctx, other);
    const locations = await this.sharedLocations([other], ctx.manager);
    return this.friendDto(row, card, locations.get(other) ?? null);
  }

  /** Run the state machine with fresh counts and block status; throws on rejection. */
  private async decide(ctx: SimulationContext, row: FriendshipEntity | null, action: FriendshipAction, otherId: string): Promise<FriendshipTransition> {
    const me = ctx.character.id;
    const needsCounts = action === 'request' || action === 'accept';
    const [blocked, actorFriendCount, otherFriendCount, actorPendingOutgoing] = await Promise.all([
      action === 'request' || action === 'accept' ? this.guard.isBlocked(me, otherId, ctx.manager) : Promise.resolve(false),
      needsCounts ? this.friendCount(me, ctx.manager) : Promise.resolve(0),
      needsCounts ? this.friendCount(otherId, ctx.manager) : Promise.resolve(0),
      action === 'request' ? ctx.manager.count(FriendshipEntity, { where: { requesterId: me, status: 'pending' } }) : Promise.resolve(0),
    ]);
    const transition = friendshipTransition(row, action, { actorId: me, otherId, blocked, actorFriendCount, otherFriendCount, actorPendingOutgoing });
    if (transition.type === 'reject') throw ruleException(transition.code, transition.message);
    return transition;
  }

  private lockPair(manager: EntityManager, pairKey: string): Promise<FriendshipEntity | null> {
    return manager.findOne(FriendshipEntity, { where: { pairKey }, lock: { mode: 'pessimistic_write' } });
  }

  private async findLiving(manager: EntityManager, handle: string): Promise<CharacterEntity> {
    const target = await manager.findOne(CharacterEntity, { where: { handle: normaliseHandle(handle), alive: true, hiddenAt: IsNull() } });
    if (!target) throw playerNotFound();
    return target;
  }

  private async cardOrThrow(ctx: SimulationContext, id: string): Promise<PlayerCardDto> {
    const card = await this.cards.card(id, ctx.manager);
    if (!card) throw playerNotFound();
    return card;
  }

  /** Location labels for friends who share their location with friends. */
  private async sharedLocations(ids: readonly string[], manager: EntityManager = this.dataSource.manager): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows: Array<{ id: string; location_id: string; location_visibility: ProfileLocationVisibility | null }> = await manager.query(
      `SELECT c.id, c.location_id, p.location_visibility
         FROM characters c LEFT JOIN social_profiles p ON p.character_id = c.id
        WHERE c.id = ANY($1::uuid[]) AND c.alive AND c.hidden_at IS NULL`,
      [ids],
    );
    return new Map(
      rows
        .filter((row) => (row.location_visibility ?? 'friends') === 'friends')
        .map((row) => [row.id, friendlyLocationLabel(row.location_id, row.id)]),
    );
  }

  private friendDto(row: FriendshipEntity, card: PlayerCardDto, locationLabel: string | null): FriendDto {
    return { ...card, since: (row.acceptedAt ?? row.createdAt).toISOString(), locationLabel };
  }

  private requestDto(row: FriendshipEntity, viewerId: string, player: PlayerCardDto): FriendRequestDto {
    return { id: row.id, direction: row.requesterId === viewerId ? 'outgoing' : 'incoming', player, createdAt: row.createdAt.toISOString() };
  }
}
