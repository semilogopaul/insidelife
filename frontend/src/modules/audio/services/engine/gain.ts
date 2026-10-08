/**
 * Level maths. The mixer thinks in decibels; Web Audio gain params want linear amplitude.
 * Volume sliders (0-1) map through a perceptual curve so "half" sounds roughly half as loud.
 */

/** Anything at or below this is treated as silence. */
export const SILENCE_DB = -96;
/** A slider position quieter than this is rounded down to silence (below it the curve is inaudible anyway). */
export const SLIDER_FLOOR_DB = -60;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
export const clamp01 = (value: number): number => (Number.isFinite(value) ? clamp(value, 0, 1) : 0);

/** Decibels → linear amplitude. `-Infinity` (or ≤ SILENCE_DB) → 0. */
export function dbToGain(db: number): number {
  if (!(db > SILENCE_DB)) return 0;
  return 10 ** (db / 20);
}

/** Linear amplitude → decibels. 0 → `-Infinity`. */
export function gainToDb(gain: number): number {
  if (!(gain > 0)) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(gain);
}

/**
 * Slider → dB with a squared-amplitude law (40·log10 v): 1 → 0 dB, 0.5 → −12 dB, 0.25 → −24 dB, 0.1 → −40 dB.
 * Loudness halves roughly every −10 dB, so equal slider travel feels like equal loudness steps; 0 is true silence.
 */
export function sliderToDb(value: number): number {
  const v = clamp01(value);
  if (v <= 0) return Number.NEGATIVE_INFINITY;
  const db = 40 * Math.log10(v);
  return db < SLIDER_FLOOR_DB ? Number.NEGATIVE_INFINITY : db;
}

export function sliderToGain(value: number): number {
  return dbToGain(sliderToDb(value));
}

/** Sum of dB offsets where any `-Infinity` wins (muted stays muted). */
export function sumDb(...values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (value === Number.NEGATIVE_INFINITY) return Number.NEGATIVE_INFINITY;
    total += value;
  }
  return total;
}

/** Semitones → playback-rate ratio. */
export function semitonesToRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

/** MIDI note → frequency (A4 = 69 = 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
