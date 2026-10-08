/**
 * Lookahead scheduling ("A Tale of Two Clocks"): a coarse JS timer wakes every ~25 ms and schedules every musical
 * step that falls inside the next ~100 ms on the sample-accurate audio clock. Pure: the audio clock and the timer are
 * injected, so the logic runs under test without an AudioContext.
 */

export interface AudioClock {
  /** Seconds on the audio clock (`AudioContext.currentTime`). */
  now(): number;
}

export interface IntervalTimer {
  set(callback: () => void, ms: number): number;
  clear(handle: number): void;
}

export const browserIntervalTimer: IntervalTimer = {
  set: (callback, ms) => window.setInterval(callback, ms),
  clear: (handle) => window.clearInterval(handle),
};

export const LOOKAHEAD_INTERVAL_MS = 25;
export const SCHEDULE_AHEAD_SEC = 0.1;

/** One shared timer for every lookahead client; it only runs while someone listens and the engine isn't paused. */
export class Ticker {
  private readonly listeners = new Set<() => void>();
  private handle: number | null = null;
  private paused = false;

  constructor(
    private readonly timer: IntervalTimer,
    private readonly intervalMs = LOOKAHEAD_INTERVAL_MS,
  ) {}

  add(listener: () => void): () => void {
    this.listeners.add(listener);
    this.sync();
    return () => {
      this.listeners.delete(listener);
      this.sync();
    };
  }

  pause(): void {
    this.paused = true;
    this.sync();
  }

  resume(): void {
    this.paused = false;
    this.sync();
  }

  get running(): boolean {
    return this.handle !== null;
  }

  get size(): number {
    return this.listeners.size;
  }

  /** Runs every listener once (the timer calls this; tests call it directly). */
  tick(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private sync(): void {
    const shouldRun = !this.paused && this.listeners.size > 0;
    if (shouldRun && this.handle === null) {
      this.handle = this.timer.set(() => this.tick(), this.intervalMs);
    } else if (!shouldRun && this.handle !== null) {
      this.timer.clear(this.handle);
      this.handle = null;
    }
  }
}

export interface StepEvent {
  /** Global step index since the clock started (16 per 4/4 bar). */
  readonly index: number;
  /** Audio-clock time the step lands on (before swing). */
  readonly time: number;
}

export interface StepClockOptions {
  readonly clock: AudioClock;
  readonly secondsPerStep: number;
  readonly startTime: number;
  readonly lookahead?: number;
  /** Fell further behind than this (tab throttled, context suspended)? Skip ahead instead of bursting. */
  readonly maxLag?: number;
}

/** A step sequencer clock: emits each step exactly once, in order, slightly ahead of time. */
export class StepClock {
  private index = 0;
  private nextTime: number;
  private readonly secondsPerStep: number;
  private readonly lookahead: number;
  private readonly maxLag: number;

  constructor(private readonly options: StepClockOptions) {
    this.secondsPerStep = options.secondsPerStep;
    this.nextTime = options.startTime;
    this.lookahead = options.lookahead ?? SCHEDULE_AHEAD_SEC;
    this.maxLag = options.maxLag ?? 0.2;
  }

  get nextStepIndex(): number {
    return this.index;
  }

  get nextStepTime(): number {
    return this.nextTime;
  }

  /** Emits every due step; returns how many were emitted. */
  advance(onStep: (step: StepEvent) => void): number {
    const now = this.options.clock.now();
    if (this.nextTime < now - this.maxLag) {
      // Resync on the grid: keep step positions (so bars stay aligned) but drop what we missed.
      const missed = Math.ceil((now - this.nextTime) / this.secondsPerStep);
      this.index += missed;
      this.nextTime += missed * this.secondsPerStep;
    }
    let emitted = 0;
    const horizon = now + this.lookahead;
    while (this.nextTime < horizon) {
      onStep({ index: this.index, time: this.nextTime });
      this.index += 1;
      this.nextTime = this.options.startTime + this.index * this.secondsPerStep;
      emitted += 1;
    }
    return emitted;
  }
}

export const STEPS_PER_BEAT = 4;
export const STEPS_PER_BAR = 16;

export function secondsPerStep(bpm: number): number {
  return 60 / bpm / STEPS_PER_BEAT;
}
