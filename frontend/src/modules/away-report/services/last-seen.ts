/** Per-device "last seen" timestamp (a convenience for the away report, never game state). */
const KEY = 'insidelife:last-seen';

export function readLastSeen(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastSeen(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(KEY, String(now));
  } catch {
    // Storage unavailable (private mode): the report simply won't show.
  }
}
