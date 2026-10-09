/**
 * A value recomputed at most once per `ttlMs`, with single-flight loading (concurrent readers share one load) and a
 * stale fallback when a refresh fails. Per instance; other instances converge within one TTL (or at once, when they
 * are told to `invalidate`).
 *
 * After `invalidate()`, no reader gets data loaded before it: a load already in flight is left to finish for the
 * readers that were waiting on it, but the next `get()` starts a fresh load, and the older load can't overwrite the
 * newer value or be cached as fresh.
 */
export class CachedValue<T> {
  private value: T | null = null;
  private expiresAt = 0;
  private inflight: Promise<T> | null = null;
  /** Bumped by `invalidate`: loads from an earlier generation are never cached, and new readers don't join them. */
  private generation = 0;
  /** Generation of the cached `value`. */
  private valueGeneration = -1;

  constructor(
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
  ) {}

  async get(nowMs: number = Date.now()): Promise<T> {
    if (this.value !== null && this.valueGeneration === this.generation && nowMs < this.expiresAt) return this.value;
    this.inflight ??= this.refresh();
    return this.inflight;
  }

  invalidate(): void {
    this.expiresAt = 0;
    this.generation += 1;
    // Don't let new readers join a load that may have read the old data.
    this.inflight = null;
  }

  private refresh(): Promise<T> {
    const generation = this.generation;
    let run: Promise<T> | null = null;
    run = (async (): Promise<T> => {
      try {
        const value = await this.load();
        if (generation === this.generation) {
          this.value = value;
          this.valueGeneration = generation;
          this.expiresAt = Date.now() + this.ttlMs;
        }
        return value;
      } catch (error) {
        if (this.value === null) throw error;
        // Degraded mode (the source is down): serve the last value and retry shortly instead of on every request. After
        // an invalidation the next read retries at once (the cached value belongs to an older generation).
        if (generation === this.generation) this.expiresAt = Date.now() + Math.min(this.ttlMs, 5_000);
        return this.value;
      } finally {
        if (this.inflight === run) this.inflight = null;
      }
    })();
    return run;
  }
}
