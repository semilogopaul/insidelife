import type { OnboardingDto, TourOutcome } from '@insidelife/shared';

export interface TourState {
  readonly phase: 'idle' | 'running' | 'done';
  readonly index: number;
  /** How a finished run ended. */
  readonly outcome: TourOutcome | null;
  /** A replay never writes to the account (the first run already did). */
  readonly replay: boolean;
}

export type TourAction = { readonly type: 'start'; readonly replay: boolean } | { readonly type: 'next' | 'back' | 'skip' | 'reset' };

export const IDLE: TourState = { phase: 'idle', index: 0, outcome: null, replay: false };

export function tourReducer(state: TourState, action: TourAction, total: number): TourState {
  switch (action.type) {
    case 'start':
      return { phase: 'running', index: 0, outcome: null, replay: action.replay };
    case 'reset':
      return IDLE;
    case 'skip':
      return state.phase === 'running' ? { ...state, phase: 'done', outcome: 'skipped' } : state;
    case 'back':
      return state.phase === 'running' ? { ...state, index: Math.max(0, state.index - 1) } : state;
    case 'next':
      if (state.phase !== 'running') return state;
      return state.index + 1 >= total ? { ...state, phase: 'done', outcome: 'completed' } : { ...state, index: state.index + 1 };
  }
}

/**
 * Whether the walkthrough should start by itself: once per account, after the welcome note and the "now live"
 * announcement (that one only while a featured place exists), and never before the character and the server answer.
 */
export function shouldAutoStart(onboarding: OnboardingDto | undefined, hasCharacter: boolean, featuredPending: boolean): boolean {
  if (!onboarding || !hasCharacter) return false;
  if (!onboarding.welcomeSeen) return false;
  if (featuredPending && !onboarding.featuredSeen) return false;
  return onboarding.tourOutcome === null;
}
