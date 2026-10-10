import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { monitorEventLoopDelay, type ELDHistogram } from 'node:perf_hooks';
import type { AppConfig } from '../../config/configuration.js';
import { MetricsService } from '../../metrics/metrics.service.js';

/** The event-loop delay is judged over windows this long. */
export const OVERLOAD_WINDOW_MS = 1_000;
/** What a shed HTTP request is told to wait (the client adds jitter and backs off further). */
export const OVERLOAD_RETRY_AFTER_SECONDS = 3;
/** What a refused socket is told to wait (`world:full`); the client waits 20–40 s, jittered, whatever it is told. */
export const OVERLOAD_SOCKET_RETRY_SECONDS = 20;

/**
 * Is this node overloaded? Measures how late the event loop runs (`monitorEventLoopDelay`): when the p99 delay over the
 * last second passes OVERLOAD_LAG_MS, every new request would only queue behind work the node can't finish in time, so
 * new HTTP requests are refused at once (503 SERVER_BUSY, see `loadShedding`) and new sockets are turned away until a
 * window comes in under the threshold again. Requests already running are never touched. OVERLOAD_LAG_MS=0 turns it off.
 */
@Injectable()
export class OverloadMonitor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OverloadMonitor.name);
  private readonly thresholdMs: number;
  private histogram: ELDHistogram | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastP99Ms = 0;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly metrics: MetricsService,
  ) {
    this.thresholdMs = config.get('overload', { infer: true }).lagMs;
  }

  /** Start once the app is up (module loading and migrations lag the loop on purpose; they don't count). */
  onApplicationBootstrap(): void {
    if (this.thresholdMs <= 0) return;
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    this.histogram = histogram;
    this.timer = setInterval(() => {
      // Nanoseconds; an empty window (no samples yet) reads as 0.
      const p99Ms = histogram.count > 0 ? histogram.percentile(99) / 1e6 : 0;
      histogram.reset();
      this.record(p99Ms);
    }, OVERLOAD_WINDOW_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.histogram?.disable();
  }

  /** True while the last window's p99 event-loop delay was over the threshold. */
  get overloaded(): boolean {
    return this.busy;
  }

  /** Judge one window (exposed for tests). */
  record(p99Ms: number): void {
    this.lastP99Ms = p99Ms;
    this.metrics.eventLoopDelayP99.set(p99Ms / 1000);
    const busy = this.thresholdMs > 0 && p99Ms > this.thresholdMs;
    if (busy !== this.busy) {
      if (busy) this.logger.warn(`Overloaded: event-loop delay p99 ${Math.round(p99Ms)} ms > ${this.thresholdMs} ms; shedding new requests`);
      else this.logger.log(`Recovered: event-loop delay p99 ${Math.round(p99Ms)} ms`);
    }
    this.busy = busy;
  }

  /** The p99 delay of the last window, in ms. */
  get lagMs(): number {
    return this.lastP99Ms;
  }
}
