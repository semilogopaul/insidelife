/**
 * "Last seen" per character on this device (a convenience for the away report, never game state). Keyed by character so
 * a new account or an heir on the same phone never inherits someone else's absence.
 */
const keyFor = (characterId: string): string => `insidelife:last-seen:${characterId}`;

export function readLastSeen(characterId: string): number | null {
  try {
    const raw = window.localStorage.getItem(keyFor(characterId));
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeLastSeen(characterId: string, now: number = Date.now()): void {
  try {
    window.localStorage.setItem(keyFor(characterId), String(now));
  } catch {
    // Storage unavailable (private mode): the report simply won't show.
  }
}
