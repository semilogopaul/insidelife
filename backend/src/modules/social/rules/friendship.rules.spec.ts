import { FRIEND_LIMITS } from '@insidelife/shared';
import { friendshipTransition, type FriendshipContext, type FriendshipView } from './friendship.rules.js';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';

const ctx = (overrides: Partial<FriendshipContext> = {}): FriendshipContext => ({
  actorId: A,
  otherId: B,
  blocked: false,
  actorFriendCount: 0,
  otherFriendCount: 0,
  actorPendingOutgoing: 0,
  ...overrides,
});

const pending = (requesterId: string, addresseeId: string): FriendshipView => ({ status: 'pending', requesterId, addresseeId });
const accepted: FriendshipView = { status: 'accepted', requesterId: A, addresseeId: B };

describe('friendship state machine', () => {
  describe('request', () => {
    it('creates a pending request when there is nothing between the players', () => {
      expect(friendshipTransition(null, 'request', ctx())).toEqual({ type: 'create-request' });
    });

    it('is idempotent when the actor already asked', () => {
      expect(friendshipTransition(pending(A, B), 'request', ctx())).toEqual({ type: 'unchanged' });
    });

    it('auto-accepts when the other player had already asked (mutual intent)', () => {
      expect(friendshipTransition(pending(B, A), 'request', ctx())).toEqual({ type: 'accept' });
    });

    it('rejects when already friends', () => {
      expect(friendshipTransition(accepted, 'request', ctx())).toMatchObject({ type: 'reject', code: 'ALREADY_FRIENDS' });
    });

    it('rejects adding yourself', () => {
      expect(friendshipTransition(null, 'request', ctx({ otherId: A }))).toMatchObject({ type: 'reject', code: 'FRIEND_SELF' });
    });

    it('rejects when either side blocked the other, without saying who', () => {
      const result = friendshipTransition(null, 'request', ctx({ blocked: true }));
      expect(result).toMatchObject({ type: 'reject', code: 'FRIEND_UNAVAILABLE' });
      expect(result.type === 'reject' && result.message).not.toMatch(/block/i);
    });

    it('enforces the pending-request and friend limits', () => {
      expect(friendshipTransition(null, 'request', ctx({ actorPendingOutgoing: FRIEND_LIMITS.maxPendingOutgoing }))).toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      });
      expect(friendshipTransition(null, 'request', ctx({ actorFriendCount: FRIEND_LIMITS.maxFriends }))).toMatchObject({ code: 'FRIEND_LIMIT' });
      expect(friendshipTransition(pending(B, A), 'request', ctx({ otherFriendCount: FRIEND_LIMITS.maxFriends }))).toMatchObject({ code: 'FRIEND_LIMIT' });
    });
  });

  describe('accept', () => {
    it('lets only the addressee accept', () => {
      expect(friendshipTransition(pending(B, A), 'accept', ctx())).toEqual({ type: 'accept' });
      expect(friendshipTransition(pending(A, B), 'accept', ctx())).toMatchObject({ type: 'reject', code: 'NO_REQUEST' });
    });

    it('rejects accepting a request between two other players', () => {
      expect(friendshipTransition(pending(B, C), 'accept', ctx({ otherId: B }))).toMatchObject({ code: 'NO_REQUEST' });
    });

    it('rejects accepting once blocked or an already-accepted friendship', () => {
      expect(friendshipTransition(pending(B, A), 'accept', ctx({ blocked: true }))).toMatchObject({ code: 'FRIEND_UNAVAILABLE' });
      expect(friendshipTransition(accepted, 'accept', ctx())).toMatchObject({ code: 'NO_REQUEST' });
    });
  });

  describe('decline and remove', () => {
    it('lets either side decline/cancel a pending request', () => {
      expect(friendshipTransition(pending(B, A), 'decline', ctx())).toEqual({ type: 'delete' });
      expect(friendshipTransition(pending(A, B), 'decline', ctx())).toEqual({ type: 'delete' });
    });

    it('does not decline an accepted friendship (that is remove)', () => {
      expect(friendshipTransition(accepted, 'decline', ctx())).toMatchObject({ code: 'NO_REQUEST' });
    });

    it('removes only accepted friendships', () => {
      expect(friendshipTransition(accepted, 'remove', ctx())).toEqual({ type: 'delete' });
      expect(friendshipTransition(pending(A, B), 'remove', ctx())).toMatchObject({ code: 'NOT_FRIENDS' });
      expect(friendshipTransition(null, 'remove', ctx())).toMatchObject({ code: 'NOT_FRIENDS' });
    });
  });
});
