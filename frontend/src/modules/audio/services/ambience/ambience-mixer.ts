import type { AudioResources } from '../engine/resources';
import { dbToGain } from '../engine/gain';
import { playSynth } from '../sfx/synth-voices';
import { SILENT_AMBIENCE, type AmbienceTargets } from './ambience-state';

/**
 * Looping beds (traffic, rain, insects, generator, room tone) + random one-shots (distant horns, kekes, thunder,
 * frogs). Beds are created only while audible and torn down after fading out, so a quiet scene costs ~nothing.
 */

type BedId = 'traffic' | 'rain' | 'insects' | 'generator' | 'room';

interface Bed {
  /** Level stage (dB targets ramp here). */
  readonly level: GainNode;
  readonly sources: readonly AudioScheduledSourceNode[];
  readonly nodes: readonly AudioNode[];
  /** Live parameter tweaks (filter cutoffs) — optional per bed. */
  readonly tune?: (targets: AmbienceTargets, now: number) => void;
  disposeTimer: number | null;
}

const FADE_TAU = 0.8;
const TEARDOWN_MS = 4000;

export class AmbienceMixer {
  private readonly beds = new Map<BedId, Bed>();
  private targets: AmbienceTargets = SILENT_AMBIENCE;
  private readonly muffle: BiquadFilterNode;
  private readonly oneShotBus: GainNode;
  private nextEventAt = new Map<'horn' | 'keke' | 'thunder' | 'frog', number>();
  private lastTick = 0;

  constructor(
    private readonly res: AudioResources,
    private readonly output: AudioNode,
    private readonly random: () => number,
  ) {
    // Distant one-shots pass through a "wall" filter that closes when you're indoors.
    this.oneShotBus = res.gain(1);
    this.muffle = res.filter('lowpass', 8000, 0.6);
    this.oneShotBus.connect(this.muffle).connect(output);
  }

  get activeBeds(): readonly string[] {
    return [...this.beds.keys()];
  }

  setTargets(targets: AmbienceTargets): void {
    this.targets = targets;
    const now = this.res.ctx.currentTime;
    this.muffle.frequency.setTargetAtTime(targets.muffled ? 700 : 8000, now, 0.4);
    this.setBed('traffic', targets.trafficDb, now);
    this.setBed('rain', targets.rainDb, now);
    this.setBed('insects', targets.insectsDb, now);
    this.setBed('generator', targets.generatorDb, now);
    this.setBed('room', targets.roomToneDb, now);
  }

  /** Random one-shots; call frequently (it self-throttles to 4 Hz). */
  tick(): void {
    const now = this.res.ctx.currentTime;
    if (now - this.lastTick < 0.25) return;
    this.lastTick = now;
    const t = this.targets;
    this.maybe('horn', t.hornsPerMinute, now, () => {
      const tap = this.random() < 0.35;
      playSynth(this.res, tap ? 'horn-tap' : 'horn', this.oneShotBus, now + 0.05, {
        gainDb: -15 - this.random() * 12,
        pan: this.random() * 1.6 - 0.8,
        distance: 0.5 + this.random() * 0.5,
        random: this.random,
      });
      // Danfo drivers rarely honk once.
      if (tap && this.random() < 0.6) {
        playSynth(this.res, 'horn-tap', this.oneShotBus, now + 0.24, { gainDb: -18 - this.random() * 8, pan: 0, distance: 0.7, random: this.random });
      }
    });
    this.maybe('keke', t.kekesPerMinute, now, () => {
      playSynth(this.res, 'keke', this.oneShotBus, now + 0.05, { gainDb: -22, pan: this.random() * 1.4 - 0.7, random: this.random });
    });
    this.maybe('thunder', t.thunderPerMinute, now, () => {
      playSynth(this.res, 'thunder', this.oneShotBus, now + 0.05, { gainDb: t.rainIndoor ? -12 : -8, distance: this.random(), random: this.random });
    });
    this.maybe('frog', t.frogsPerMinute, now, () => {
      playSynth(this.res, 'frog', this.oneShotBus, now + 0.05, { gainDb: -24 - this.random() * 6, pan: this.random() * 1.8 - 0.9, random: this.random });
    });
  }

  dispose(): void {
    for (const id of [...this.beds.keys()]) this.destroyBed(id);
    this.res.release(this.oneShotBus, this.muffle);
  }

  // ----- events ------------------------------------------------------------------------------------------------

  /** Poisson-ish: next event after an exponential gap with mean 60/rate seconds. */
  private maybe(kind: 'horn' | 'keke' | 'thunder' | 'frog', perMinute: number, now: number, fire: () => void): void {
    if (perMinute <= 0) {
      this.nextEventAt.delete(kind);
      return;
    }
    const gap = (): number => (-Math.log(1 - this.random() * 0.999) * 60) / perMinute;
    const due = this.nextEventAt.get(kind);
    if (due === undefined) {
      this.nextEventAt.set(kind, now + gap());
      return;
    }
    if (now < due) return;
    this.nextEventAt.set(kind, now + Math.max(1.5, gap()));
    fire();
  }

  // ----- beds --------------------------------------------------------------------------------------------------

  private setBed(id: BedId, db: number, now: number): void {
    const target = dbToGain(db);
    let bed = this.beds.get(id);
    if (target <= 0) {
      if (!bed) return;
      bed.level.gain.setTargetAtTime(0, now, FADE_TAU);
      bed.disposeTimer ??= window.setTimeout(() => this.destroyBed(id), TEARDOWN_MS);
      return;
    }
    if (!bed) {
      bed = this.createBed(id);
      this.beds.set(id, bed);
    }
    if (bed.disposeTimer !== null) {
      window.clearTimeout(bed.disposeTimer);
      bed.disposeTimer = null;
    }
    bed.level.gain.setTargetAtTime(target, now, FADE_TAU);
    bed.tune?.(this.targets, now);
  }

  private destroyBed(id: BedId): void {
    const bed = this.beds.get(id);
    if (!bed) return;
    if (bed.disposeTimer !== null) window.clearTimeout(bed.disposeTimer);
    this.beds.delete(id);
    for (const source of bed.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    this.res.release(...bed.sources, ...bed.nodes, bed.level);
  }

  private createBed(id: BedId): Bed {
    const res = this.res;
    const level = res.gain(0);
    level.connect(this.output);
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [];
    const add = <T extends AudioNode>(node: T): T => {
      nodes.push(node);
      return node;
    };
    const start = <T extends AudioScheduledSourceNode>(source: T, offset = 0): T => {
      sources.push(source);
      if (source instanceof AudioBufferSourceNode) source.start(0, offset);
      else source.start();
      return source;
    };
    /** A slow LFO wobbling `param` by ±depth. */
    const lfo = (rate: number, depth: number, param: AudioParam, type: OscillatorType = 'sine'): void => {
      const osc = start(res.osc(type, rate));
      const amount = add(res.gain(depth));
      osc.connect(amount).connect(param);
    };

    let tune: Bed['tune'];
    switch (id) {
      case 'traffic': {
        // Brown-noise rumble with a slow swell; the filter opens in rush hour and closes indoors.
        const noise = start(res.source(res.brownNoise(), true), this.random() * 3);
        const lowpass = add(res.filter('lowpass', this.targets.trafficCutoffHz, 0.6));
        const swell = add(res.gain(1));
        lfo(0.045 + this.random() * 0.03, 0.28, swell.gain);
        noise.connect(lowpass).connect(swell).connect(level);
        tune = (targets, now) => lowpass.frequency.setTargetAtTime(targets.trafficCutoffHz, now, 1.2);
        break;
      }
      case 'rain': {
        const noise = start(res.source(res.whiteNoise(), true), this.random());
        const highpass = add(res.filter('highpass', 500, 0.5));
        const lowpass = add(res.filter('lowpass', this.targets.rainIndoor ? 2200 : 6500, 0.5));
        // Patter: fast irregular amplitude flutter (two detuned LFOs) — reads as drops on a roof.
        const patter = add(res.gain(0.8));
        lfo(6.3, 0.12, patter.gain);
        lfo(9.7, 0.09, patter.gain, 'triangle');
        noise.connect(highpass).connect(lowpass).connect(patter).connect(level);
        tune = (targets, now) => lowpass.frequency.setTargetAtTime(targets.rainIndoor ? 2200 : 6500, now, 0.6);
        break;
      }
      case 'insects': {
        // Two crickets: a high sine chopped at ~30 Hz, gated into chirps at ~1 Hz.
        for (const [pitch, chop, chirp] of [
          [4600, 31, 0.9],
          [5200, 37, 1.35],
        ] as const) {
          const tone = start(res.osc('sine', pitch + this.random() * 200));
          const chopper = add(res.gain(0.5));
          const gate = add(res.gain(0.5));
          lfo(chop, 0.5, chopper.gain, 'square');
          lfo(chirp, 0.5, gate.gain, 'square');
          const voice = add(res.gain(0.5));
          tone.connect(chopper).connect(gate).connect(voice).connect(level);
        }
        break;
      }
      case 'generator': {
        // Small petrol genset (~3000 rpm): 50 Hz saw + 25 Hz half-order, saturated, with a load wobble.
        const fire = start(res.osc('sawtooth', 49 + this.random() * 3));
        const half = start(res.osc('square', 24.5 + this.random() * 1.5));
        const halfGain = add(res.gain(0.45));
        const shaper = add(res.shaper(2));
        const body = add(res.filter('lowpass', this.targets.generatorIndoor ? 260 : 420, 1.2));
        const wobble = add(res.gain(0.85));
        lfo(4.3 + this.random(), 0.12, wobble.gain);
        fire.connect(shaper);
        half.connect(halfGain).connect(shaper);
        shaper.connect(body).connect(wobble).connect(level);
        tune = (targets, now) => body.frequency.setTargetAtTime(targets.generatorIndoor ? 260 : 420, now, 0.5);
        break;
      }
      case 'room': {
        const noise = start(res.source(res.brownNoise(), true), this.random() * 3);
        const lowpass = add(res.filter('lowpass', 240, 0.5));
        noise.connect(lowpass).connect(level);
        break;
      }
    }
    return { level, sources, nodes, tune, disposeTimer: null };
  }
}
