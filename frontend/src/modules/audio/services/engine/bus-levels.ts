import type { AudioSettings, BusId } from '../../types/audio';
import { clamp01, dbToGain, sliderToDb, sumDb } from './gain';

/**
 * Static mix trims (headroom). Music sits under effects, ambience under music, UI a touch under world SFX; the
 * master trim plus the limiter keep stacked events (celebration + cash + horn) from clipping.
 */
export const MASTER_TRIM_DB = -2;
export const BUS_TRIM_DB: Readonly<Record<BusId, number>> = {
  music: -9,
  ambience: -8,
  sfx: -3,
  ui: -5,
  voice: 0,
};

/** Which player slider drives each bus (ambience is "effects"; UI follows SFX). */
const BUS_SLIDER: Readonly<Record<BusId, keyof AudioSettings>> = {
  music: 'musicVolume',
  ambience: 'sfxVolume',
  sfx: 'sfxVolume',
  ui: 'sfxVolume',
  voice: 'voiceVolume',
};

export interface BusLevel {
  readonly db: number;
  readonly gain: number;
}

export type BusLevels = Readonly<Record<BusId | 'master', BusLevel>>;

const level = (db: number): BusLevel => ({ db, gain: dbToGain(db) });

/** Settings → per-bus levels (master separately so bus faders don't need recomputing when master moves). */
export function busLevelsFor(settings: AudioSettings): BusLevels {
  const bus = (id: BusId): BusLevel => {
    const slider = settings[BUS_SLIDER[id]];
    const muted = id === 'voice' && !settings.voiceGuidance;
    return level(muted ? Number.NEGATIVE_INFINITY : sumDb(sliderToDb(typeof slider === 'number' ? slider : 0), BUS_TRIM_DB[id]));
  };
  return {
    master: level(sumDb(sliderToDb(settings.masterVolume), MASTER_TRIM_DB)),
    music: bus('music'),
    ambience: bus('ambience'),
    sfx: bus('sfx'),
    ui: bus('ui'),
    voice: bus('voice'),
  };
}

/** Music is worth scheduling at all (CPU saver: nothing is generated when it can't be heard). */
export function isMusicAudible(settings: AudioSettings): boolean {
  return clamp01(settings.masterVolume) > 0 && clamp01(settings.musicVolume) > 0;
}

/** Ambience/SFX audible. */
export function isSfxAudible(settings: AudioSettings): boolean {
  return clamp01(settings.masterVolume) > 0 && clamp01(settings.sfxVolume) > 0;
}

/**
 * `SpeechSynthesisUtterance.volume` (0-1). Speech can't be routed through Web Audio, so master × voice is applied
 * per utterance with the same perceptual curve.
 */
export function speechVolumeFor(settings: AudioSettings): number {
  if (!settings.voiceGuidance) return 0;
  return clamp01(dbToGain(sumDb(sliderToDb(settings.masterVolume), sliderToDb(settings.voiceVolume))));
}
