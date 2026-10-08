/** Minimal music theory for the groove engine: scales, diatonic chords, voicing. Pure. */

export type ScaleName = 'major' | 'minor' | 'dorian' | 'mixolydian';

export const SCALES: Readonly<Record<ScaleName, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

/** 3 = triad, 4 = seventh, 5 = ninth. */
export type ChordSize = 3 | 4 | 5;

export interface Chord {
  /** Scale degree, 1-7. */
  readonly degree: number;
  /** MIDI note of the chord root (in the tonic's octave). */
  readonly root: number;
  /** Stacked-thirds chord tones (MIDI), root position. */
  readonly tones: readonly number[];
}

/** MIDI pitch of a (0-based, possibly > 6) scale step above the tonic. */
export function scaleStep(tonic: number, scale: ScaleName, step: number): number {
  const steps = SCALES[scale];
  const octave = Math.floor(step / steps.length);
  const index = ((step % steps.length) + steps.length) % steps.length;
  return tonic + octave * 12 + (steps[index] ?? 0);
}

export function chordOnDegree(tonic: number, scale: ScaleName, degree: number, size: ChordSize): Chord {
  const base = degree - 1;
  const tones: number[] = [];
  for (let i = 0; i < size; i++) tones.push(scaleStep(tonic, scale, base + i * 2));
  return { degree, root: tones[0] ?? tonic, tones };
}

/** Moves a pitch by octaves into [low, low + 12). */
export function intoOctave(midi: number, low: number): number {
  return low + ((((midi - low) % 12) + 12) % 12);
}

/** Close voicing of chord tones inside [low, low + 12) — smooth pads without big jumps between chords. */
export function voiceChord(tones: readonly number[], low: number): number[] {
  return [...new Set(tones.map((tone) => intoOctave(tone, low)))].sort((a, b) => a - b);
}
