/**
 * Pure rate/polyphony limiters (no Web Audio): rapid repeat triggers (a held key, a double-fired event) must not
 * machine-gun or pile up voices.
 */

/** Minimum spacing per key. `tryAcquire` both checks and records. */
export class CooldownGate {
  private readonly last = new Map<string, number>();

  /** True (and records the time) when `key` was not triggered within the last `windowMs`. */
  tryAcquire(key: string, nowMs: number, windowMs: number): boolean {
    const previous = this.last.get(key);
    if (previous !== undefined && nowMs - previous < windowMs) return false;
    this.last.set(key, nowMs);
    return true;
  }

  /** Checks several keys atomically: all must be free, then all are recorded. */
  tryAcquireAll(entries: ReadonlyArray<readonly [key: string, windowMs: number]>, nowMs: number): boolean {
    for (const [key, windowMs] of entries) {
      const previous = this.last.get(key);
      if (previous !== undefined && nowMs - previous < windowMs) return false;
    }
    for (const [key] of entries) this.last.set(key, nowMs);
    return true;
  }

  reset(): void {
    this.last.clear();
  }
}

/** Caps concurrently sounding one-shots by tracking their expected end times. */
export class VoiceLimiter {
  private ends: number[] = [];

  constructor(private readonly maxVoices: number) {}

  /** Reserve a voice that will sound until `nowSec + durationSec`; false when the cap is reached. */
  tryStart(nowSec: number, durationSec: number): boolean {
    this.prune(nowSec);
    if (this.ends.length >= this.maxVoices) return false;
    this.ends.push(nowSec + Math.max(0, durationSec));
    return true;
  }

  active(nowSec: number): number {
    this.prune(nowSec);
    return this.ends.length;
  }

  private prune(nowSec: number): void {
    if (this.ends.length) this.ends = this.ends.filter((end) => end > nowSec);
  }
}

/** Picks a variant index, never the same one twice in a row when there is a choice. */
export class VariantPicker {
  private readonly last = new Map<string, number>();

  pick(key: string, count: number, random: () => number): number {
    if (count <= 1) return 0;
    const previous = this.last.get(key);
    let index = Math.floor(random() * (previous === undefined ? count : count - 1));
    if (previous !== undefined && index >= previous) index += 1;
    this.last.set(key, index);
    return index;
  }
}
