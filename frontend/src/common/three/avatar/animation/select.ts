import { findAction, type AvatarAnimation, type TimelineSegmentDto } from '@insidelife/shared';
import type { AvatarStance } from './clips';

type ActionLookup = (id: string) => { readonly animation: AvatarAnimation } | undefined;

/**
 * Which animation the avatar plays for a timeline segment:
 * - the running action's animation (`findAction(actionId).animation`),
 * - `sleep` segments sleep, `idle`/`away` idle,
 * - routine segments without an action get a sensible default (work → type, lecture → read, hospital → sleep).
 */
export function animationForSegment(segment: TimelineSegmentDto | undefined, lookup: ActionLookup = findAction): AvatarAnimation {
  if (!segment) return 'idle';
  if (segment.kind === 'sleep') return 'sleep';
  if (segment.actionId) {
    const action = lookup(segment.actionId);
    if (action) return action.animation;
  }
  switch (segment.kind) {
    case 'work':
      return 'type';
    case 'lecture':
      return 'read';
    case 'hospital':
      return 'sleep';
    case 'commute':
    case 'travel':
      return 'walk';
    default:
      return 'idle';
  }
}

/** Animations that read best sitting down when a seat is available. */
export const SEATED_ANIMATIONS: ReadonlySet<AvatarAnimation> = new Set<AvatarAnimation>(['sit', 'eat', 'drink', 'read', 'type', 'drive']);

/** Stance for an animation given whether the spot has a seat. */
export function stanceFor(animation: AvatarAnimation, seated: boolean): AvatarStance {
  if (animation === 'pray') return seated ? 'kneel' : 'stand';
  return seated && SEATED_ANIMATIONS.has(animation) ? 'sit' : 'stand';
}
