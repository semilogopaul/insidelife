'use client';

import { useSyncExternalStore } from 'react';

/** Wall clock shared by every subscriber, ticking every 15 s (enough for "held until" and "today"). */
let now = 0;
let timer: number | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 15_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

const snapshot = (): number => {
  if (now === 0) now = Date.now();
  return now;
};

/** Current wall-clock ms, safe to read during render. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0);
}

/** Today's date in Lagos (WAT, UTC+1, no DST) as `YYYY-MM-DD`. */
export function lagosToday(ms: number): string {
  return new Date(ms + 3_600_000).toISOString().slice(0, 10);
}
