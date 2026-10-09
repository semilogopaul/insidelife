'use client';

import { useSyncExternalStore } from 'react';
import { useUi, type StickSide } from '@/common/game/ui-store';

const COARSE_QUERY = '(pointer: coarse)';

function subscribeCoarse(listener: () => void): () => void {
  try {
    const query = window.matchMedia(COARSE_QUERY);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  } catch {
    return () => undefined;
  }
}

function coarseSnapshot(): boolean {
  try {
    return window.matchMedia(COARSE_QUERY).matches || navigator.maxTouchPoints > 0;
  } catch {
    return false;
  }
}

/** Touch-first device (phones, tablets): on-screen controls are shown. */
export function useTouchUi(): boolean {
  return useSyncExternalStore(subscribeCoarse, coarseSnapshot, () => false);
}

/**
 * The side of the screen the walking stick lives on for this player (touch screens only; null with a mouse). The
 * HUD keeps that thumb's corner clear: its context and phone buttons go to the other side.
 */
export function useStickSide(): StickSide | null {
  const touch = useTouchUi();
  const side = useUi((state) => state.settings.walkStick);
  return touch ? side : null;
}
