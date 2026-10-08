import type { MusicContext } from '../../types/audio';
import type { ChordSize, ScaleName } from './theory';

/**
 * Groove styles. Original procedural music in an afrobeats / amapiano / highlife idiom: no samples, just rhythm
 * libraries + harmony rules. Each context picks a style; patterns mutate every 8 bars (see patterns.ts).
 */
export type Instrument = 'kick' | 'clap' | 'rim' | 'shaker' | 'hat' | 'log' | 'bass' | 'pad' | 'guitar' | 'talking';

export const INSTRUMENTS: readonly Instrument[] = ['kick', 'clap', 'rim', 'shaker', 'hat', 'log', 'bass', 'pad', 'guitar', 'talking'];

export type MusicStyleId = 'signature' | 'afro-day' | 'piano-night' | 'home-chill' | 'club-piano' | 'owambe' | 'study';

export interface LayerSpec {
  /** Velocity scale 0-1. */
  readonly level: number;
  /** Probability the layer plays in a given 8-bar section (1 = always). */
  readonly presence: number;
  /** Indices into the instrument's rhythm library that suit this style. */
  readonly rhythms: readonly number[];
}

export interface MusicStyle {
  readonly id: MusicStyleId;
  readonly label: string;
  readonly bpm: number;
  /** Fraction of a 16th the off-16ths are delayed (shuffle). */
  readonly swing: number;
  /** MIDI note of the key's tonic. */
  readonly tonic: number;
  readonly scale: ScaleName;
  readonly chordSize: ChordSize;
  /** Scale-degree loops, one chord per bar. */
  readonly progressions: ReadonlyArray<readonly number[]>;
  readonly layers: Readonly<Partial<Record<Instrument, LayerSpec>>>;
  /** Per-bar chance of a talking-drum phrase. */
  readonly talkingChance: number;
  /** Per-section chance of a breakdown (kick and bass drop out). */
  readonly breakdownChance: number;
  /** Session trim (dB) — club is loud, study music barely there. */
  readonly gainDb: number;
  readonly padWave: OscillatorType;
  readonly padCutoffHz: number;
  readonly kickDecaySec: number;
  readonly kickLowHz: number;
  /** Signature theme: always the same notes for everyone. */
  readonly fixedSeed?: string;
}

const layer = (level: number, presence: number, rhythms: readonly number[]): LayerSpec => ({ level, presence, rhythms });

export const MUSIC_STYLES: Readonly<Record<MusicStyleId, MusicStyle>> = {
  signature: {
    id: 'signature',
    label: 'Inside Life theme',
    bpm: 104,
    swing: 0.08,
    tonic: 57, // A minor → bright C major moments
    scale: 'dorian',
    chordSize: 4,
    progressions: [[1, 4, 6, 5]],
    layers: {
      kick: layer(0.85, 1, [0]),
      clap: layer(0.7, 1, [0]),
      rim: layer(0.55, 1, [0]),
      shaker: layer(0.6, 1, [0]),
      log: layer(0.75, 0.6, [0]),
      bass: layer(0.8, 1, [0]),
      pad: layer(0.55, 1, [0]),
      guitar: layer(0.9, 1, [3]),
      talking: layer(0.7, 1, [0]),
    },
    talkingChance: 0.25,
    breakdownChance: 0.15,
    gainDb: 0,
    padWave: 'sawtooth',
    padCutoffHz: 1500,
    kickDecaySec: 0.34,
    kickLowHz: 48,
    fixedSeed: 'inside-life-signature',
  },
  'afro-day': {
    id: 'afro-day',
    label: 'Afrobeats (day)',
    bpm: 106,
    swing: 0.1,
    tonic: 57, // A major — bright
    scale: 'major',
    chordSize: 3,
    progressions: [
      [1, 5, 6, 4],
      [6, 4, 1, 5],
      [1, 4, 5, 4],
      [2, 5, 1, 1],
    ],
    layers: {
      kick: layer(0.9, 1, [0, 1, 2]),
      clap: layer(0.7, 1, [0, 2, 3]),
      rim: layer(0.55, 0.8, [0, 1, 2]),
      shaker: layer(0.55, 1, [0, 1]),
      bass: layer(0.8, 1, [0, 2]),
      pad: layer(0.35, 0.6, [0]),
      guitar: layer(0.8, 0.85, [0, 1, 2]),
      log: layer(0.55, 0.3, [1, 2]),
      talking: layer(0.6, 1, [0]),
    },
    talkingChance: 0.12,
    breakdownChance: 0.2,
    gainDb: -1,
    padWave: 'triangle',
    padCutoffHz: 1800,
    kickDecaySec: 0.32,
    kickLowHz: 50,
  },
  'piano-night': {
    id: 'piano-night',
    label: 'Amapiano (night)',
    bpm: 112,
    swing: 0.06,
    tonic: 54, // F# minor — deeper
    scale: 'minor',
    chordSize: 4,
    progressions: [
      [1, 4, 6, 5],
      [1, 6, 7, 4],
      [4, 1, 6, 6],
    ],
    layers: {
      kick: layer(0.7, 0.85, [3, 5]),
      clap: layer(0.5, 0.7, [0, 1]),
      shaker: layer(0.45, 1, [0, 2]),
      hat: layer(0.3, 0.4, [1]),
      log: layer(0.85, 1, [0, 3]),
      pad: layer(0.5, 1, [0]),
      guitar: layer(0.35, 0.25, [2]),
    },
    talkingChance: 0,
    breakdownChance: 0.3,
    gainDb: -2,
    padWave: 'sawtooth',
    padCutoffHz: 900,
    kickDecaySec: 0.42,
    kickLowHz: 44,
  },
  'home-chill': {
    id: 'home-chill',
    label: 'Home (chill)',
    bpm: 96,
    swing: 0.12,
    tonic: 50, // D major 7ths — soft, Rhodes-ish
    scale: 'major',
    chordSize: 4,
    progressions: [
      [1, 4, 1, 4],
      [2, 5, 1, 6],
      [4, 3, 2, 1],
    ],
    layers: {
      kick: layer(0.5, 0.8, [5, 6]),
      rim: layer(0.35, 0.7, [1, 3]),
      shaker: layer(0.3, 0.8, [1, 2]),
      bass: layer(0.6, 1, [1]),
      pad: layer(0.6, 1, [0]),
      guitar: layer(0.45, 0.6, [2]),
    },
    talkingChance: 0,
    breakdownChance: 0.25,
    gainDb: -5,
    padWave: 'triangle',
    padCutoffHz: 1100,
    kickDecaySec: 0.3,
    kickLowHz: 50,
  },
  'club-piano': {
    id: 'club-piano',
    label: 'Club (amapiano)',
    bpm: 113,
    swing: 0.07,
    tonic: 55, // G minor
    scale: 'minor',
    chordSize: 5,
    progressions: [
      [1, 4, 6, 5],
      [1, 1, 4, 4],
      [6, 7, 1, 1],
      [1, 3, 4, 6],
    ],
    layers: {
      kick: layer(1, 1, [3, 4]),
      clap: layer(0.8, 1, [0, 3]),
      rim: layer(0.45, 0.5, [3]),
      shaker: layer(0.7, 1, [0]),
      hat: layer(0.45, 0.8, [0, 1]),
      log: layer(1, 1, [0, 1, 2]),
      pad: layer(0.55, 1, [0]),
      guitar: layer(0.3, 0.2, [2]),
    },
    talkingChance: 0.05,
    breakdownChance: 0.22,
    gainDb: 3,
    padWave: 'sawtooth',
    padCutoffHz: 1300,
    kickDecaySec: 0.45,
    kickLowHz: 42,
  },
  owambe: {
    id: 'owambe',
    label: 'Owambe (party)',
    bpm: 110,
    swing: 0.1,
    tonic: 60, // C major — highlife/juju brightness
    scale: 'mixolydian',
    chordSize: 3,
    progressions: [
      [1, 4, 5, 1],
      [1, 7, 4, 1],
      [4, 5, 1, 1],
    ],
    layers: {
      kick: layer(1, 1, [1, 2]),
      clap: layer(0.8, 1, [2, 0]),
      rim: layer(0.65, 1, [0, 2]),
      shaker: layer(0.7, 1, [0]),
      hat: layer(0.3, 0.5, [1]),
      bass: layer(0.9, 1, [2, 0]),
      guitar: layer(0.9, 1, [0, 1]),
      log: layer(0.5, 0.35, [2]),
      talking: layer(0.9, 1, [0]),
    },
    talkingChance: 0.4,
    breakdownChance: 0.15,
    gainDb: 2,
    padWave: 'triangle',
    padCutoffHz: 1600,
    kickDecaySec: 0.34,
    kickLowHz: 48,
  },
  study: {
    id: 'study',
    label: 'Study (subtle)',
    bpm: 92,
    swing: 0.08,
    tonic: 52, // E major, sparse
    scale: 'major',
    chordSize: 4,
    progressions: [
      [1, 6, 4, 5],
      [4, 1, 4, 5],
    ],
    layers: {
      shaker: layer(0.25, 0.7, [2]),
      pad: layer(0.5, 1, [0]),
      guitar: layer(0.3, 0.5, [2]),
      bass: layer(0.35, 0.5, [1]),
    },
    talkingChance: 0,
    breakdownChance: 0.4,
    gainDb: -12,
    padWave: 'triangle',
    padCutoffHz: 900,
    kickDecaySec: 0.3,
    kickLowHz: 50,
  },
};

export interface StyleChoice {
  readonly styleId: MusicStyleId | null;
  /** Extra trim for this situation (a bar is quieter than a club). */
  readonly trimDb: number;
}

/** Context (+ time of day + energy) → style. `null` = music off (hospital, places of worship). */
export function styleForContext(context: MusicContext, night: boolean, energy: number): StyleChoice {
  const energyTrim = Math.round((Math.min(1, Math.max(0, energy)) - 1) * 8);
  switch (context) {
    case 'menu':
      return { styleId: 'signature', trimDb: 0 };
    case 'city':
      return { styleId: night ? 'piano-night' : 'afro-day', trimDb: 0 };
    case 'home':
      return { styleId: 'home-chill', trimDb: night ? -2 : 0 };
    case 'club':
      return { styleId: 'club-piano', trimDb: energyTrim };
    case 'party':
      return { styleId: 'owambe', trimDb: energyTrim };
    case 'campus':
      return { styleId: 'study', trimDb: 0 };
    case 'office':
      return { styleId: 'study', trimDb: -4 };
    case 'hospital':
      return { styleId: null, trimDb: 0 };
  }
}
