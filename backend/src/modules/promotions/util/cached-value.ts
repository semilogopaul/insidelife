/**
 * A value recomputed at most once per `ttlMs`, with single-flight loading (concurrent readers share one load) and a
 * stale fallback when a refresh fails. Per instance; other instances converge within one TTL.
 */
export class CachedValue<T> {
  private value: T | null = null;
  private expiresAt = 0;
  private inflight: Promise<T> | null = null;
  /** Bumped by `invalidate`, so a load that started before an invalidation isn't cached as fresh. */
  private generation = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
  ) {}

  async get(nowMs: number = Date.now()): Promise<T> {
    if (this.value !== null && nowMs < this.expiresAt) return this.value;
    this.inflight ??= this.refresh();
    return this.inflight;
  }

  invalidate(): void {
    this.expiresAt = 0;
    this.generation += 1;
  }

  private async refresh(): Promise<T> {
    const generation = this.generation;
    try {
      const value = await this.load();
      this.value = value;
      this.expiresAt = generation === this.generation ? Date.now() + this.ttlMs : 0;
      return value;
    } catch (error) {
      if (this.value === null) throw error;
      // Serve the stale value and retry shortly instead of on every request.
      this.expiresAt = Date.now() + Math.min(this.ttlMs, 5_000);
      return this.value;
    } finally {
      this.inflight = null;
    }
  }
}
