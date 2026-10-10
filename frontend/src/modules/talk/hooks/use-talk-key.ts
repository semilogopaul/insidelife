'use client';

import { useEffect } from 'react';
import { useUi } from '@/common/game/ui-store';
import { useSpeech } from '@/common/speech';
import { openTalk } from '../services/talk-focus';

/** True when the key belongs to a text field or an open dialog (the phone, sheets). */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  return target.closest('[role="dialog"]') !== null;
}

/** T opens the Talk box (not while typing somewhere else or with the phone open). */
export function useTalkKey(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.code !== 'KeyT' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingIn(event.target) || useUi.getState().phoneOpen || useSpeech.getState().composerOpen) return;
      // Don't type the "t" into the box that's about to take focus.
      event.preventDefault();
      openTalk();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
