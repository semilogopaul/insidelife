'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { PlayState, PlayStateDto } from '@insidelife/shared';
import { api } from '@/common/api/http';
import { queryKeys } from '@/common/api/query-keys';
import { gameClock } from './game-clock';

/** Report "playing" at most this often while the player is at the controls (the server's window is 5 real minutes). */
export const PING_EVERY_MS = 45_000;
/** Watching counts: a visible game keeps reporting for this long after the last touch, key or click. */
export const WATCHING_MS = 15 * 60_000;
/** A tab hidden this long is "away" (a quick tab switch isn't). Closing the page is away at once. */
export const HIDDEN_GRACE_MS = 90_000;

/**
 * When to tell the server the player is at the controls or has left. Pure (times passed in) so it's testable; the hook
 * below feeds it DOM events. While "playing" the server's autopilot leaves the character alone: no bed, meals, habits
 * or trips it didn't choose.
 */
export class PlayPresence {
  private lastInput: number;
  private lastPing = Number.NEGATIVE_INFINITY;
  private hiddenSince: number | null;
  private away = false;

  constructor(now: number, visible: boolean) {
    this.lastInput = now;
    this.hiddenSince = visible ? null : now;
  }

  /** Opening the game: report right away when it's on screen. */
  start(): PlayState | null {
    return this.hiddenSince === null ? 'playing' : null;
  }

  /** A touch, key, click or scroll. */
  input(now: number): PlayState | null {
    this.lastInput = now;
    if (this.hiddenSince !== null) return null;
    return this.away || now - this.lastPing >= PING_EVERY_MS ? 'playing' : null;
  }

  /** Every few seconds. */
  tick(now: number): PlayState | null {
    if (this.hiddenSince !== null) return !this.away && now - this.hiddenSince >= HIDDEN_GRACE_MS ? 'away' : null;
    return now - this.lastInput <= WATCHING_MS && now - this.lastPing >= PING_EVERY_MS ? 'playing' : null;
  }

  visibility(visible: boolean, now: number): PlayState | null {
    if (!visible) {
      this.hiddenSince ??= now;
      return null;
    }
    this.hiddenSince = null;
    this.lastInput = now;
    return 'playing';
  }

  /** The page is going away (closed, navigated, frozen on a phone). */
  leave(): PlayState | null {
    return this.away ? null : 'away';
  }

  sent(state: PlayState, now: number): void {
    this.away = state === 'away';
    if (state === 'playing') this.lastPing = now;
  }
}

const INPUT_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Keeps the server told whether the player is at the controls (`PUT /characters/me/play-state`). When a report says
 * the player had been away, the snapshot is refetched (its timeline was planned for the autopilot); when reports stop,
 * the snapshot is refetched as presence lapses so the world shows what the autopilot does next.
 */
export function usePlayState(characterId: string | null): void {
  const client = useQueryClient();
  useEffect(() => {
    if (!characterId) return;
    const tracker = new PlayPresence(Date.now(), document.visibilityState === 'visible');
    let lapse: number | undefined;
    const refetchSnapshot = (): void => void client.invalidateQueries({ queryKey: queryKeys.snapshot }, { cancelRefetch: false });

    const send = (state: PlayState | null): void => {
      if (!state) return;
      tracker.sent(state, Date.now());
      api
        .put<PlayStateDto>('/characters/me/play-state', { state }, { keepalive: state === 'away' })
        .then((result) => {
          if (result.state !== 'playing') return;
          if (result.resumed) refetchSnapshot();
          window.clearTimeout(lapse);
          lapse = window.setTimeout(refetchSnapshot, Math.max(5_000, gameClock.localMsAt(result.presentUntil) - Date.now() + 1_000));
        })
        .catch(() => undefined);
    };

    const onInput = (): void => send(tracker.input(Date.now()));
    const onVisibility = (): void => send(tracker.visibility(document.visibilityState === 'visible', Date.now()));
    const onPageHide = (): void => send(tracker.leave());
    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { passive: true, capture: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    const interval = window.setInterval(() => send(tracker.tick(Date.now())), 5_000);
    send(tracker.start());

    return () => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.clearInterval(interval);
      window.clearTimeout(lapse);
    };
  }, [characterId, client]);
}
