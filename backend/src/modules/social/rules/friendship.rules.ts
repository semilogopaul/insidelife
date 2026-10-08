import { FRIEND_LIMITS } from '@insidelife/shared';
import type { FriendshipStatus } from '../entities/friendship.entity.js';

export type FriendshipAction = 'request' | 'accept' | 'decline' | 'remove';

/** The current row between two players, if any. */
export interface FriendshipView {
  readonly status: FriendshipStatus;
  readonly requesterId: string;
  readonly addresseeId: string;
}

export interface FriendshipContext {
  readonly actorId: string;
  readonly otherId: string;
  readonly blocked: boolean;
  /** Accepted friends of the actor and of the other player (limits apply to both when a friendship forms). */
  readonly actorFriendCount: number;
  readonly otherFriendCount: number;
  readonly actorPendingOutgoing: number;
}

export type FriendshipTransition =
  | { readonly type: 'create-request' }
  | { readonly type: 'accept' }
  | { readonly type: 'delete' }
  /** Request already sent: idempotent success. */
  | { readonly type: 'unchanged' }
  | { readonly type: 'reject'; readonly code: string; readonly message: string };

const reject = (code: string, message: string): FriendshipTransition => ({ type: 'reject', code, message });

/**
 * The friendship state machine (one row per pair):
 *
 *   none ──request──▶ pending ──accept (addressee)──▶ accepted ──remove──▶ none
 *                       │  └─request from the addressee (mutual)──▶ accepted
 *                       └──decline (addressee) / cancel (requester)──▶ none
 *
 * Blocks stop new requests in either direction (the message never says who blocked whom).
 */
export function friendshipTransition(current: FriendshipView | null, action: FriendshipAction, context: FriendshipContext): FriendshipTransition {
  const { actorId, otherId } = context;
  if (actorId === otherId) return reject('FRIEND_SELF', 'You are already your own best friend');
  const involved = current !== null && [current.requesterId, current.addresseeId].includes(actorId) && [current.requesterId, current.addresseeId].includes(otherId);
  const row = involved ? current : null;

  switch (action) {
    case 'request': {
      if (context.blocked) return reject('FRIEND_UNAVAILABLE', 'You can’t add this player');
      if (row?.status === 'accepted') return reject('ALREADY_FRIENDS', 'You’re already friends');
      if (row?.status === 'pending' && row.requesterId === actorId) return { type: 'unchanged' };
      const limit = friendLimitBreach(context);
      if (row?.status === 'pending') return limit ?? { type: 'accept' };
      if (context.actorPendingOutgoing >= FRIEND_LIMITS.maxPendingOutgoing) {
        return reject('TOO_MANY_REQUESTS', 'You have too many pending requests — wait for people to respond');
      }
      return limit ?? { type: 'create-request' };
    }
    case 'accept': {
      if (row?.status !== 'pending' || row.addresseeId !== actorId) return reject('NO_REQUEST', 'That friend request isn’t waiting for you');
      if (context.blocked) return reject('FRIEND_UNAVAILABLE', 'You can’t add this player');
      return friendLimitBreach(context) ?? { type: 'accept' };
    }
    case 'decline':
      if (row?.status !== 'pending') return reject('NO_REQUEST', 'There’s no pending request to decline');
      return { type: 'delete' };
    case 'remove':
      if (row?.status !== 'accepted') return reject('NOT_FRIENDS', 'You’re not friends');
      return { type: 'delete' };
  }
}

function friendLimitBreach(context: FriendshipContext): FriendshipTransition | null {
  if (context.actorFriendCount >= FRIEND_LIMITS.maxFriends) {
    return reject('FRIEND_LIMIT', `You’ve reached ${FRIEND_LIMITS.maxFriends} friends — make some space first`);
  }
  if (context.otherFriendCount >= FRIEND_LIMITS.maxFriends) return reject('FRIEND_LIMIT', 'Their friend list is full');
  return null;
}
