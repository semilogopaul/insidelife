/**
 * Karplus-Strong plucked string, rendered offline into a Float32Array (Web Audio has no sub-128-sample feedback
 * delay without an AudioWorklet, and pre-rendering is cheaper anyway: ~20k samples, well under a millisecond).
 * Pure and deterministic for a given seed.
 */
export interface PluckOptions {
  readonly frequency: number;
  readonly sampleRate: number;
  readonly durationSec: number;
  /** 0 = dull/muted thumb pluck, 1 = bright pick attack. */
  readonly brightness: number;
  /** Excitation noise seed (same seed → identical samples). */
  readonly seed: number;
  /** Per-period loss (0.990-0.999). Higher rings longer. */
  readonly sustain?: number;
}

/**
 * A render rate at which the string's loop length is an exact integer (+½), so every note is perfectly in tune
 * without a fractional-delay filter: rate = f · (N + ½) with the smallest N giving rate ≥ `minRate`.
 */
export function pluckSampleRate(frequency: number, minRate = 22_050): number {
  const n = Math.max(2, Math.ceil(minRate / frequency - 0.5));
  return frequency * (n + 0.5);
}

export function renderPluck(options: PluckOptions): Float32Array<ArrayBuffer> {
  const { frequency, sampleRate, durationSec } = options;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const out = new Float32Array(new ArrayBuffer(length * 4));
  // The two-point average adds half a sample of delay: the loop length is N + ½.
  const period = Math.max(2, Math.round(sampleRate / Math.max(20, frequency) - 0.5));
  const brightness = Math.min(1, Math.max(0, options.brightness));
  // Higher notes lose energy faster per second (more periods/sec), so scale loss with pitch to keep sustain musical.
  const sustain = options.sustain ?? Math.min(0.999, 0.9965 + 0.0025 * (1 - Math.min(1, frequency / 1500)));

  // Excitation: seeded noise, low-passed by (1 - brightness) for a softer, thumb-like pluck.
  let state = (options.seed >>> 0) || 1;
  const random = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967295) * 2 - 1;
  };
  const smoothing = 0.15 + (1 - brightness) * 0.7;
  let previous = 0;
  for (let i = 0; i < Math.min(period, length); i++) {
    const value = random();
    previous = previous * smoothing + value * (1 - smoothing);
    out[i] = previous;
  }

  // The string: average two adjacent delayed samples (a gentle low-pass in the loop) with a small loss.
  // y[n] = s · ½(y[n−N] + y[n−N−1]): each recirculation (one period) loses a factor `sustain`.
  for (let i = period; i < length; i++) {
    const j = i - period;
    out[i] = sustain * 0.5 * ((out[j] ?? 0) + (out[j > 0 ? j - 1 : 0] ?? 0));
  }

  // Remove DC, normalise to -2 dBFS, and fade the last 30 ms so the buffer ends at silence.
  let mean = 0;
  for (const sample of out) mean += sample;
  mean /= length;
  let peak = 0;
  for (let i = 0; i < length; i++) {
    const centred = (out[i] ?? 0) - mean;
    out[i] = centred;
    peak = Math.max(peak, Math.abs(centred));
  }
  const scale = peak > 0 ? 0.79 / peak : 0;
  const fade = Math.min(length, Math.floor(sampleRate * 0.03));
  for (let i = 0; i < length; i++) {
    const tail = i >= length - fade ? (length - i) / fade : 1;
    out[i] = (out[i] ?? 0) * scale * tail;
  }
  return out;
}
