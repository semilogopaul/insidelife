import { Logger } from '@nestjs/common';

interface Bucket {
  ms: number;
  calls: number;
}

/**
 * Opt-in profiler for simulation hooks (`SIM_PROFILE=1`). Measures wall time per `system.hook` so slow domains show
 * up immediately. When disabled, `time()` just runs the function.
 */
class HookProfiler {
  private readonly enabled = process.env.SIM_PROFILE === '1';
  private readonly logger = new Logger('SimulationProfile');
  private buckets = new Map<string, Bucket>();

  get active(): boolean {
    return this.enabled;
  }

  async time<T>(key: string, run: () => Promise<T> | T): Promise<T> {
    if (!this.enabled) return run();
    const started = performance.now();
    try {
      return await run();
    } finally {
      const bucket = this.buckets.get(key) ?? { ms: 0, calls: 0 };
      bucket.ms += performance.now() - started;
      bucket.calls += 1;
      this.buckets.set(key, bucket);
    }
  }

  /** Log the slowest hooks since the last flush, then reset. */
  flush(label: string, totalMs: number): void {
    if (!this.enabled || this.buckets.size === 0) return;
    const rows = [...this.buckets.entries()]
      .toSorted((a, b) => b[1].ms - a[1].ms)
      .slice(0, 25)
      .map(([key, bucket]) => `${bucket.ms.toFixed(1).padStart(9)} ms  ${String(bucket.calls).padStart(6)}×  ${key}`);
    this.logger.log(`${label}: ${totalMs.toFixed(0)} ms total\n${rows.join('\n')}`);
    this.buckets = new Map();
  }
}

export const hookProfiler = new HookProfiler();
