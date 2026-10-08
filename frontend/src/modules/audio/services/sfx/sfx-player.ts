import type { AudioResources } from '../engine/resources';
import { clamp01, dbToGain, gainToDb } from '../engine/gain';
import { CooldownGate, VariantPicker, VoiceLimiter } from '../engine/limits';
import { normalisationDb, type SampleBank } from './sample-bank';
import type { SampleLayer, SfxBus, SfxRecipe } from './sfx-catalog';
import { playSynth } from './synth-voices';

export interface SfxPlayerDeps {
  readonly ctx: AudioContext;
  readonly res: AudioResources;
  readonly bank: SampleBank;
  readonly outputs: Readonly<Record<SfxBus, AudioNode>>;
  readonly random: () => number;
  /** Hold a music duck for `holdMs`. */
  readonly duck: (depthDb: number, holdMs: number) => void;
  /** Background speech (danfo conductor); returns false when it can't be spoken. */
  readonly speak: (line: string) => boolean;
  readonly indoors: () => boolean;
  /** MIDI root of the chord playing now (stingers in key), if any. */
  readonly musicRoot: () => number | null;
  readonly nowMs?: () => number;
}

const MAX_SFX_EVENTS = 24;
const DEFAULT_PITCH_VAR = 0.06;
const SYNTH_ESTIMATE_SEC = 1.2;

/**
 * Plays recipes: cooldowns (per id and per group), a polyphony cap, variant rotation without immediate repeats,
 * ±6 % pitch and ±1 dB level variation, and timed layers.
 */
export class SfxPlayer {
  private readonly cooldowns = new CooldownGate();
  private readonly limiter = new VoiceLimiter(MAX_SFX_EVENTS);
  private readonly picker = new VariantPicker();
  private readonly timers = new Set<number>();

  constructor(private readonly deps: SfxPlayerDeps) {}

  /** `volume` (0-1) scales the whole event (emitters may pass e.g. distance attenuation). */
  play(key: string, recipe: SfxRecipe, volume = 1): boolean {
    const { ctx } = this.deps;
    if (ctx.state !== 'running') return false; // never queue stale sounds while suspended/hidden
    const nowMs = this.deps.nowMs?.() ?? performance.now();
    const gates: Array<readonly [string, number]> = [[key, recipe.cooldownMs]];
    if (recipe.group) gates.push([`group:${recipe.group.id}`, recipe.group.cooldownMs]);
    if (!this.cooldowns.tryAcquireAll(gates, nowMs)) return false;
    if (!this.limiter.tryStart(ctx.currentTime, this.estimateDuration(recipe))) return false;

    const eventDb = gainToDb(clamp01(volume));
    if (eventDb === Number.NEGATIVE_INFINITY) return false;
    for (const layer of recipe.layers) {
      switch (layer.kind) {
        case 'sample':
          this.scheduleSample(key, layer, eventDb);
          break;
        case 'synth':
          playSynth(this.deps.res, layer.voice, this.deps.outputs[recipe.bus], ctx.currentTime + 0.005 + (layer.delayMs ?? 0) / 1000, {
            gainDb: layer.gainDb + eventDb,
            pan: this.pan(layer.pan),
            random: this.deps.random,
            root: this.stingerRoot(),
          });
          break;
        case 'speech':
          if (this.deps.random() < layer.chance) {
            const line = layer.lines[this.picker.pick(`${key}:speech`, layer.lines.length, this.deps.random)];
            if (line) this.later(layer.delayMs ?? 0, () => this.deps.speak(line));
          }
          break;
      }
    }
    if (recipe.duck) this.deps.duck(recipe.duck.depthDb, recipe.duck.holdMs);
    return true;
  }

  dispose(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
  }

  private scheduleSample(key: string, layer: SampleLayer, eventDb: number): void {
    const variants = layer.indoorVariants && this.deps.indoors() ? layer.indoorVariants : layer.variants;
    const repeats = layer.repeat ? Math.round(layer.repeat.count[0] + this.deps.random() * (layer.repeat.count[1] - layer.repeat.count[0])) : 1;
    let delay = layer.delayMs ?? 0;
    for (let i = 0; i < repeats; i++) {
      const variant = variants[this.picker.pick(`${key}:${variants[0] ?? ''}`, variants.length, this.deps.random)];
      if (!variant) return;
      const pitchVar = layer.pitchVar ?? DEFAULT_PITCH_VAR;
      const rate = (layer.rate ?? 1) * (1 + (this.deps.random() * 2 - 1) * pitchVar);
      const db = layer.gainDb + eventDb + normalisationDb(variant) + (this.deps.random() * 2 - 1) - i * (layer.repeat?.decayDb ?? 0);
      const play = (): void => {
        this.deps.bank.play(variant, { gain: dbToGain(db), rate, pan: layer.pan === undefined ? undefined : this.pan(layer.pan), allowLate: layer.allowLate });
      };
      this.later(delay, play);
      if (layer.repeat) delay += layer.repeat.spacingMs[0] + this.deps.random() * (layer.repeat.spacingMs[1] - layer.repeat.spacingMs[0]);
    }
  }

  private later(delayMs: number, run: () => void): void {
    if (delayMs <= 0) {
      run();
      return;
    }
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      run();
    }, delayMs);
    this.timers.add(timer);
  }

  private pan(pan: number | 'random' | undefined): number {
    if (pan === undefined) return 0;
    return pan === 'random' ? this.deps.random() * 1.4 - 0.7 : pan;
  }

  /** Goal plucks sit in the key of whatever is playing (an octave or two up). */
  private stingerRoot(): number {
    const root = this.deps.musicRoot();
    if (root === null) return 72;
    return 72 + ((((root - 72) % 12) + 12) % 12);
  }

  private estimateDuration(recipe: SfxRecipe): number {
    let longest = 0.1;
    for (const layer of recipe.layers) {
      const delay = ('delayMs' in layer ? (layer.delayMs ?? 0) : 0) / 1000;
      if (layer.kind === 'sample') {
        const longestVariant = Math.max(...layer.variants.map((variant) => this.deps.bank.durationSec(variant)));
        const repeatSpan = layer.repeat ? (layer.repeat.count[1] * layer.repeat.spacingMs[1]) / 1000 : 0;
        longest = Math.max(longest, delay + longestVariant + repeatSpan);
      } else if (layer.kind === 'synth') {
        longest = Math.max(longest, delay + SYNTH_ESTIMATE_SEC);
      }
    }
    return longest;
  }
}
