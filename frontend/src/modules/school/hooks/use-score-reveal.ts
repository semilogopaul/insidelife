'use client';

import { useCallback, useSyncExternalStore } from 'react';

const key = (examId: string): string => `insidelife:jamb-revealed:${examId}`;
const listeners = new Set<() => void>();
const revealedThisSession = new Set<string>();

function isRevealed(examId: string): boolean {
  if (revealedThisSession.has(examId)) return true;
  try {
    return window.localStorage.getItem(key(examId)) === '1';
  } catch {
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether this viewer has already "opened" a JAMB result — a per-device convenience so the dramatic reveal plays
 * once (the score itself always comes from the server). Every component reading the same exam stays in sync.
 */
export function useScoreReveal(examId: string): {
  readonly revealed: boolean;
  readonly markRevealed: () => void;
} {
  const revealed = useSyncExternalStore(
    subscribe,
    () => isRevealed(examId),
    () => false,
  );
  const markRevealed = useCallback(() => {
    revealedThisSession.add(examId);
    try {
      window.localStorage.setItem(key(examId), '1');
    } catch {
      // Private mode: remembered for this session only.
    }
    for (const listener of listeners) listener();
  }, [examId]);
  return { revealed, markRevealed };
}
