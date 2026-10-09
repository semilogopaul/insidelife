'use client';

import { useEffect } from 'react';
import { refreshSessionOutcome } from '@/common/api/http';
import { useSession } from './session-store';

/** Wait before retrying to restore a session the API couldn't answer for: 1 s, 2 s, 4 s … then every 30 s. */
export function restoreRetryDelay(attempt: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
}

/**
 * On first load, restore the session from the refresh cookie. If the API can't be reached (offline, restarting) the
 * status stays `unknown` and this keeps retrying with backoff (and as soon as the browser is back online), so a
 * signed-in player waits on "Retrying…" instead of being sent to the sign-in page.
 */
export function useSessionBootstrap(): void {
  const status = useSession((state) => state.status);
  useEffect(() => {
    if (status !== 'unknown') return;
    let cancelled = false;
    let running = false;
    let attempt = 0;
    let timer: number | undefined;

    const restore = async (): Promise<void> => {
      if (running || cancelled) return;
      running = true;
      window.clearTimeout(timer);
      const outcome = await refreshSessionOutcome();
      running = false;
      if (cancelled || outcome !== 'unreachable') return;
      timer = window.setTimeout(() => void restore(), restoreRetryDelay(attempt++));
    };
    const onOnline = (): void => void restore();

    void restore();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [status]);
}
