import { Howl, Howler } from 'howler';
import { clamp } from '../engine/gain';
import { AUDIO_ASSETS, type AudioAssetKey } from './audio-assets.generated';
import type { SfxBus } from './sfx-catalog';

/**
 * Sample playback through Howler, running on the engine's AudioContext (one context for the whole game).
 *
 * Howler connects every sound to the global `Howler.masterGain` at the moment the sound node is created (Howl
 * construction, `play()` when the pool grows, `stereo()`). Each asset belongs to exactly one bus, so we point
 * `Howler.masterGain` at that bus for the duration of those calls (`withOutput`) — public API only, no internals.
 * Howler's own unlock/auto-suspend are disabled: the engine owns the context lifecycle.
 */

/** Samples are loudness-matched to this level before the recipe's gain is applied. */
export const REFERENCE_LOUDNESS_DB = -16;

export function normalisationDb(key: AudioAssetKey): number {
  const asset = AUDIO_ASSETS[key];
  return clamp(REFERENCE_LOUDNESS_DB - asset.loudnessDb, -10, 6);
}

export function assetUrls(key: AudioAssetKey): string[] {
  const base = `/assets/audio/${key}`;
  // Howler picks the first format the browser can decode (Safari < 18.4 → MP3).
  return AUDIO_ASSETS[key].mp3 ? [`${base}.ogg`, `${base}.mp3`] : [`${base}.ogg`];
}

/** Each asset belongs to one bus: UI, money and stingers on `ui`; the world (doors, steps, vehicles) on `sfx`. */
export function busOf(key: AudioAssetKey): SfxBus {
  return key.startsWith('world/') ? 'sfx' : 'ui';
}

export interface SamplePlayOptions {
  /** Linear gain for this play. */
  readonly gain: number;
  readonly rate: number;
  /** Stereo position, only applied when defined. */
  readonly pan?: number;
  /** Queue until loaded instead of dropping (stingers). */
  readonly allowLate?: boolean;
}

export class SampleBank {
  private readonly howls = new Map<AudioAssetKey, Howl>();
  private readonly failed = new Set<AudioAssetKey>();
  private loadedCount = 0;

  constructor(private readonly outputs: Readonly<Record<SfxBus, GainNode>>, ctx: AudioContext) {
    Howler.autoUnlock = false;
    Howler.autoSuspend = false;
    Howler.ctx = ctx;
    Howler.masterGain = outputs.sfx;
  }

  get loaded(): number {
    return this.loadedCount;
  }

  get failures(): number {
    return this.failed.size;
  }

  preload(keys: readonly AudioAssetKey[]): void {
    for (const key of keys) this.ensure(key);
  }

  isLoaded(key: AudioAssetKey): boolean {
    return this.howls.get(key)?.state() === 'loaded';
  }

  /** Returns false when the sample can't sound now (failed, or still loading and not allowed to be late). */
  play(key: AudioAssetKey, options: SamplePlayOptions): boolean {
    if (this.failed.has(key)) return false;
    const howl = this.ensure(key);
    const state = howl.state();
    if (state === 'unloaded') howl.load();
    if (state !== 'loaded' && !options.allowLate) return false;
    return this.withOutput(busOf(key), () => {
      const id = howl.play();
      if (typeof id !== 'number') return false;
      // Howler ignores volumes outside 0-1 (it treats them as a getter call).
      howl.volume(clamp(options.gain, 0, 1), id);
      howl.rate(clamp(options.rate, 0.5, 2), id);
      if (options.pan !== undefined) howl.stereo(clamp(options.pan, -1, 1), id);
      return true;
    });
  }

  durationSec(key: AudioAssetKey): number {
    return AUDIO_ASSETS[key].durationMs / 1000;
  }

  dispose(): void {
    for (const howl of this.howls.values()) howl.unload();
    this.howls.clear();
  }

  private ensure(key: AudioAssetKey): Howl {
    let howl = this.howls.get(key);
    if (!howl) {
      howl = this.withOutput(busOf(key), () =>
        new Howl({
          src: assetUrls(key),
          preload: true,
          pool: 4,
          onload: () => {
            this.loadedCount += 1;
          },
          onloaderror: () => {
            this.failed.add(key);
          },
        }),
      );
      this.howls.set(key, howl);
    }
    return howl;
  }

  private withOutput<T>(bus: SfxBus, run: () => T): T {
    const previous = Howler.masterGain;
    Howler.masterGain = this.outputs[bus];
    try {
      return run();
    } finally {
      Howler.masterGain = previous;
    }
  }
}
