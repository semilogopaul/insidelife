import { gameMinuteAt, realMsAt, type GameClockConfig, type GameMinute, type WorldClockDto } from '@insidelife/shared';

/**
 * Client-side game clock. Synced once from `GET /world/clock` (with a round-trip-corrected server offset) and then
 * computed locally — no polling. 3D code reads `gameClock.now()` inside `useFrame` without touching React state.
 */
class GameClock {
  private config: GameClockConfig | null = null;
  private offsetMs = 0;
  private seed = '';
  private readonly listeners = new Set<() => void>();

  /** Notified after every (re)sync so subscribers can re-render immediately. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sync(dto: WorldClockDto, requestStartedAt: number, responseReceivedAt: number): void {
    const midpoint = (requestStartedAt + responseReceivedAt) / 2;
    this.offsetMs = dto.serverNowMs - midpoint;
    this.config = { epochRealMs: dto.epochRealMs, epochGameMinute: dto.epochGameMinute, scale: dto.scale };
    this.seed = dto.worldSeed;
    for (const listener of this.listeners) listener();
  }

  get ready(): boolean {
    return this.config !== null;
  }

  get worldSeed(): string {
    return this.seed;
  }

  get scale(): number {
    return this.config?.scale ?? 120;
  }

  /** Server-corrected wall clock (ms). */
  serverNow(): number {
    return Date.now() + this.offsetMs;
  }

  /** Fractional game minute right now. */
  now(): GameMinute {
    if (!this.config) return 0;
    return gameMinuteAt(this.config, this.serverNow());
  }

  /** Local wall-clock ms when the game clock reaches `t` (for scheduling refetches). */
  localMsAt(t: GameMinute): number {
    if (!this.config) return Date.now();
    return realMsAt(this.config, t) - this.offsetMs;
  }
}

/**
 * One clock per page. Kept on `globalThis` so a module reload (dev hot reload, a re-imported chunk) can't swap in a
 * fresh, unsynced clock that reads minute 0 while the rest of the app keeps going.
 */
const holder = globalThis as typeof globalThis & { __insidelifeGameClock?: GameClock };
export const gameClock: GameClock = (holder.__insidelifeGameClock ??= new GameClock());
