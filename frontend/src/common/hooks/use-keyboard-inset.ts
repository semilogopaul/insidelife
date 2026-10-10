'use client';

import { useSyncExternalStore } from 'react';

/**
 * How many CSS pixels at the bottom of the layout viewport an on-screen keyboard covers (0 without one). Phones show
 * the keyboard over the page (Chrome on Android resizes only the visual viewport; iOS Safari also pans it), so a
 * bottom-anchored input lifts itself by this much to stay above the keys. The game's canvas never resizes.
 */
export function keyboardInset(viewport: { readonly height: number; readonly offsetTop: number } | null | undefined, layoutHeight: number): number {
  if (!viewport) return 0;
  const covered = layoutHeight - (viewport.height + viewport.offsetTop);
  // Browser chrome (URL bars) moves the visual viewport by a few pixels; only a keyboard is this tall.
  return covered > 80 ? Math.round(covered) : 0;
}

function subscribe(listener: () => void): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;
  viewport.addEventListener('resize', listener);
  viewport.addEventListener('scroll', listener);
  return () => {
    viewport.removeEventListener('resize', listener);
    viewport.removeEventListener('scroll', listener);
  };
}

const snapshot = (): number => keyboardInset(window.visualViewport, window.innerHeight);

/** Live keyboard inset (see `keyboardInset`); 0 on the server and on desktops. */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}
