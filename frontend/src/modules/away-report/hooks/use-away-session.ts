'use client';

import { useEffect, useState } from 'react';
import { AWAY_THRESHOLD_MS } from '../services/away-report';
import { readLastSeen, writeLastSeen } from '../services/last-seen';

const HEARTBEAT_MS = 30_000;

export interface AwaySession {
  /** Real ms when the player was last here, if they've been gone long enough for a report. */
  readonly since: number | null;
  readonly awayMs: number;
  clear(): void;
}

/**
 * Tracks "last seen" per character on this device. On load (and when the tab comes back after being hidden), a gap of ≥ 5 real minutes
 * opens an away window. While the game is visible the timestamp is refreshed every 30 s.
 */
export function useAwaySession(characterId: string | null): AwaySession {
  const [away, setWindow] = useState<{ since: number; awayMs: number } | null>(null);

  useEffect(() => {
    if (!characterId) return;
    const id = characterId;
    const check = (): void => {
      const last = readLastSeen(id);
      const now = Date.now();
      if (last !== null && now - last >= AWAY_THRESHOLD_MS) setWindow({ since: last, awayMs: now - last });
      writeLastSeen(id, now);
    };
    check();
    const beat = window.setInterval(() => {
      if (document.visibilityState === 'visible') writeLastSeen(id);
    }, HEARTBEAT_MS);
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') check();
      else writeLastSeen(id);
    };
    const onHide = (): void => writeLastSeen(id);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(beat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      writeLastSeen(id);
    };
  }, [characterId]);

  return { since: away?.since ?? null, awayMs: away?.awayMs ?? 0, clear: () => setWindow(null) };
}
