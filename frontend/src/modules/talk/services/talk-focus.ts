'use client';

import { flushSync } from 'react-dom';
import { useSpeech } from '@/common/speech';

/**
 * Opening the Talk box focuses its input in the same tap/keypress: iOS only raises the keyboard for a focus() made
 * while handling the user's gesture, so the box is rendered synchronously first (`flushSync`).
 */
let input: HTMLInputElement | null = null;
/** What had focus before the box opened (focus goes back there when it closes). */
let opener: HTMLElement | null = null;

export function registerTalkInput(element: HTMLInputElement | null): void {
  input = element;
}

export function openTalk(): void {
  const active = typeof document === 'undefined' ? null : document.activeElement;
  opener = active instanceof HTMLElement && active !== document.body ? active : null;
  if (!useSpeech.getState().composerOpen) flushSync(() => useSpeech.getState().openComposer());
  input?.focus();
}

export function closeTalk(): void {
  useSpeech.getState().closeComposer();
  const back = opener;
  opener = null;
  if (back?.isConnected) back.focus();
  else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
