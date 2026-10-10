'use client';

import { useEffect } from 'react';
import { gameEvents } from '@/common/game/game-events';
import { useUi } from '@/common/game/ui-store';
import { useWorld } from '@/common/game/world-store';

function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  return target.closest('[role="dialog"]') !== null;
}

/** Hide or show the HUD (clean screen). Remembered per device. */
export function toggleHud(): void {
  const { settings, updateSettings } = useUi.getState();
  updateSettings({ hudHidden: !settings.hudHidden });
  gameEvents.emit('sfx', { id: settings.hudHidden ? 'ui-open' : 'ui-close' });
}

/** Settling into the world after a load (the play layer may switch walking → driving): not a change of yours. */
const SETTLE_MS = 1_500;

/**
 * The HUD comes back by itself when something changes around you: you enter a place (venue or home), get in or out
 * of a car, or start or end a ride. Stepping back outside keeps a clean screen you chose inside, and so does reloading.
 */
export function useAutoShowHud(): void {
  useEffect(() => {
    let settledAt = 0;
    return useWorld.subscribe((state, previous) => {
      if (state.mode === previous.mode) return;
      if (previous.mode === 'loading' || state.mode === 'loading') {
        settledAt = Date.now() + SETTLE_MS;
        return;
      }
      if (Date.now() < settledAt || (previous.mode === 'inside' && state.mode === 'walking')) return;
      const { settings, updateSettings } = useUi.getState();
      if (settings.hudHidden) updateSettings({ hudHidden: false });
    });
  }, []);
}

/** H hides or shows the HUD — except at the wheel, where H is the horn. */
export function useHudKeys(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyH' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingIn(event.target) || useUi.getState().phoneOpen || useWorld.getState().mode === 'driving') return;
      toggleHud();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
