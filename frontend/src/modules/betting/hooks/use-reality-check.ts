'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'insidelife:betting:session-start';

/** When this tab's betting session started (kept across app switches in the tab; a convenience, never game state). */
function sessionStart(now: number): number {
  try {
    const stored = Number(window.sessionStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 0 && stored <= now) return stored;
    window.sessionStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // Private mode or blocked storage: the session starts now.
  }
  return now;
}

/**
 * The reality check: every `intervalMinutes` of real time in the betting app, `due` turns true until dismissed, so the
 * app can say how long you've been playing and what today has cost.
 */
export function useRealityCheck(intervalMinutes: number): { readonly due: boolean; readonly minutes: number; readonly dismiss: () => void } {
  const [start] = useState(() => sessionStart(Date.now()));
  const [nextAt, setNextAt] = useState(() => start + intervalMinutes * 60_000);
  const [now, setNow] = useState(() => Date.now());

  // A shorter interval chosen in Play safe applies from now.
  useEffect(() => {
    setNextAt((current) => Math.min(current, Date.now() + intervalMinutes * 60_000));
  }, [intervalMinutes]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const dismiss = useCallback(() => {
    const current = Date.now();
    setNow(current);
    setNextAt(current + intervalMinutes * 60_000);
  }, [intervalMinutes]);

  return { due: now >= nextAt, minutes: Math.max(0, Math.round((now - start) / 60_000)), dismiss };
}
