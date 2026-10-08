import { describe, expect, it } from 'vitest';
import { BUS_TRIM_DB, MASTER_TRIM_DB, busLevelsFor, isMusicAudible, isSfxAudible, speechVolumeFor } from '../services/engine/bus-levels';
import { DuckState } from '../services/engine/ducker';
import { dbToGain, gainToDb, semitonesToRatio, sliderToDb, sliderToGain, sumDb } from '../services/engine/gain';
import type { AudioSettings } from '../types/audio';

const SETTINGS: AudioSettings = { masterVolume: 1, musicVolume: 1, sfxVolume: 1, voiceVolume: 1, voiceGuidance: true };

describe('dB ↔ gain', () => {
  it('round-trips and treats silence as zero', () => {
    for (const db of [-60, -24, -6, 0, 6]) expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 9);
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(dbToGain(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(dbToGain(-200)).toBe(0);
    expect(gainToDb(0)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('sums offsets with mute winning', () => {
    expect(sumDb(-3, -6)).toBe(-9);
    expect(sumDb(-3, Number.NEGATIVE_INFINITY, 6)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('converts semitones to playback rates', () => {
    expect(semitonesToRatio(12)).toBeCloseTo(2);
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5);
  });
});

describe('perceptual slider curve', () => {
  it('maps full scale to 0 dB, half to −12 dB and zero to silence', () => {
    expect(sliderToDb(1)).toBeCloseTo(0);
    expect(sliderToDb(0.5)).toBeCloseTo(-12.04, 1);
    expect(sliderToDb(0.25)).toBeCloseTo(-24.08, 1);
    expect(sliderToDb(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(sliderToGain(0)).toBe(0);
  });

  it('is monotonic and floors inaudible positions to silence', () => {
    let previous = Number.NEGATIVE_INFINITY;
    for (let v = 0.04; v <= 1; v += 0.04) {
      const db = sliderToDb(v);
      expect(db).toBeGreaterThan(previous);
      previous = db;
    }
    expect(sliderToGain(0.02)).toBe(0); // −68 dB → below the floor
  });

  it('clamps garbage input', () => {
    expect(sliderToDb(2)).toBeCloseTo(0);
    expect(sliderToDb(-1)).toBe(Number.NEGATIVE_INFINITY);
    expect(sliderToDb(Number.NaN)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('settings → bus levels', () => {
  it('applies the bus trims at full volume', () => {
    const levels = busLevelsFor(SETTINGS);
    expect(levels.master.db).toBeCloseTo(MASTER_TRIM_DB);
    expect(levels.music.db).toBeCloseTo(BUS_TRIM_DB.music);
    expect(levels.sfx.db).toBeCloseTo(BUS_TRIM_DB.sfx);
    expect(levels.ui.db).toBeCloseTo(BUS_TRIM_DB.ui);
    expect(levels.voice.db).toBeCloseTo(BUS_TRIM_DB.voice);
  });

  it('routes each slider to its buses (ambience and UI follow effects)', () => {
    const levels = busLevelsFor({ ...SETTINGS, sfxVolume: 0.5, musicVolume: 0.25 });
    expect(levels.sfx.db).toBeCloseTo(-12.04 + BUS_TRIM_DB.sfx, 1);
    expect(levels.ui.db).toBeCloseTo(-12.04 + BUS_TRIM_DB.ui, 1);
    expect(levels.ambience.db).toBeCloseTo(-12.04 + BUS_TRIM_DB.ambience, 1);
    expect(levels.music.db).toBeCloseTo(-24.08 + BUS_TRIM_DB.music, 1);
    expect(levels.music.gain).toBeCloseTo(dbToGain(levels.music.db));
  });

  it('mutes voice when guidance is off and silences everything at master 0', () => {
    expect(busLevelsFor({ ...SETTINGS, voiceGuidance: false }).voice.gain).toBe(0);
    expect(busLevelsFor({ ...SETTINGS, masterVolume: 0 }).master.gain).toBe(0);
  });

  it('only schedules music when it can be heard', () => {
    expect(isMusicAudible(SETTINGS)).toBe(true);
    expect(isMusicAudible({ ...SETTINGS, musicVolume: 0 })).toBe(false);
    expect(isMusicAudible({ ...SETTINGS, masterVolume: 0 })).toBe(false);
    expect(isSfxAudible({ ...SETTINGS, sfxVolume: 0 })).toBe(false);
  });

  it('derives the speech volume from master × voice', () => {
    expect(speechVolumeFor(SETTINGS)).toBeCloseTo(1);
    expect(speechVolumeFor({ ...SETTINGS, voiceVolume: 0.5 })).toBeCloseTo(0.25, 2);
    expect(speechVolumeFor({ ...SETTINGS, voiceGuidance: false })).toBe(0);
  });
});

describe('ducking', () => {
  it('uses the deepest active hold and releases idempotently', () => {
    const duck = new DuckState();
    expect(duck.depthDb).toBe(0);
    const voice = duck.hold('voice', -9);
    const stinger = duck.hold('stinger', -14);
    expect(duck.depthDb).toBe(-14);
    stinger();
    stinger();
    expect(duck.depthDb).toBe(-9);
    voice();
    expect(duck.depthDb).toBe(0);
    expect(duck.active).toBe(false);
  });

  it('never boosts and can release by reason', () => {
    const duck = new DuckState();
    duck.hold('cash', 6);
    expect(duck.depthDb).toBe(0);
    duck.hold('voice', -9);
    duck.hold('voice', -6);
    duck.releaseAll('voice');
    expect(duck.depthDb).toBe(0);
  });
});
