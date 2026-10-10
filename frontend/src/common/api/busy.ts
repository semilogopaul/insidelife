import { toast } from '@/common/components/toast-store';

/**
 * "The server is busy, come back in a moment": 503 `SERVER_BUSY` (a node shedding load, see the backend's
 * `OVERLOAD_LAG_MS`) and 429 (rate limited). Neither ran the request, so a read or an idempotent command can simply be
 * sent again after a pause. Anything else (a 5xx from a crash, a proxy error page) is not this.
 */
export function isBusyAnswer(status: number, body: unknown): boolean {
  if (status === 429) return true;
  if (status !== 503) return false;
  return typeof body === 'object' && body !== null && 'errorCode' in body && body.errorCode === 'SERVER_BUSY';
}

/** Retries per request before the busy answer is handed to the caller (TanStack Query may then retry on its own). */
export const BUSY_MAX_RETRIES = 4;
/** Backoff starts here and doubles per retry, capped. */
export const BUSY_BASE_DELAY_MS = 1_000;
export const BUSY_MAX_DELAY_MS = 15_000;
/** At most one "busy" toast this often, however many requests are waiting. */
export const BUSY_TOAST_EVERY_MS = 30_000;

/** `Retry-After` in ms: delta-seconds or an HTTP date; null when absent or unreadable. */
export function retryAfterMs(header: string | null, now: number = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/**
 * How long to wait before retry number `attempt` (0-based): exponential backoff, never sooner than the server asked,
 * plus up to 50% jitter so a crowd of clients that were turned away together doesn't come back together.
 */
export function busyDelayMs(attempt: number, retryAfter: number | null, random: () => number = Math.random): number {
  const backoff = Math.min(BUSY_MAX_DELAY_MS, BUSY_BASE_DELAY_MS * 2 ** attempt);
  const base = Math.max(retryAfter ?? 0, backoff);
  return Math.round(base + random() * base * 0.5);
}

let lastToastAt = Number.NEGATIVE_INFINITY;

/** One friendly, non-blocking note while requests wait for the server (not one per request). */
export function noteBusy(now: number = Date.now()): void {
  if (now - lastToastAt < BUSY_TOAST_EVERY_MS) return;
  lastToastAt = now;
  toast({ title: 'Lagos is busy right now — retrying…', tone: 'neutral' });
}

/** Tests: forget when the last toast was shown. */
export function resetBusyNotice(): void {
  lastToastAt = Number.NEGATIVE_INFINITY;
}

/** Wait `ms`, or reject with the signal's AbortError if the caller gives up first. */
export function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
