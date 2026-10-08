import { pluckSampleRate, renderPluck } from '../music/karplus';

/**
 * Per-context shared resources: noise buffers, saturation curves and the Karplus-Strong pluck cache are created
 * once and reused by every voice. Also counts created/released nodes so the dev lab can prove there are no leaks.
 */
export class AudioResources {
  created = 0;
  released = 0;

  private white: AudioBuffer | null = null;
  private brown: AudioBuffer | null = null;
  private readonly curves = new Map<number, Float32Array<ArrayBuffer>>();
  /** midi → rendered pluck (LRU by insertion order). */
  private readonly plucks = new Map<number, AudioBuffer>();
  private static readonly MAX_PLUCKS = 28;
  /** Plucks are rendered near 22 kHz (content stays < 11 kHz) to halve memory; the context resamples. */
  private static readonly PLUCK_RATE = 22_050;

  constructor(readonly ctx: BaseAudioContext) {}

  get live(): number {
    return this.created - this.released;
  }

  /** Registers nodes as created (for the leak counters). */
  track<T extends AudioNode>(node: T): T {
    this.created += 1;
    return node;
  }

  /** Disconnects nodes and counts them as released. */
  release(...nodes: ReadonlyArray<AudioNode | null | undefined>): void {
    for (const node of nodes) {
      if (!node) continue;
      try {
        node.disconnect();
      } catch {
        // Already disconnected.
      }
      this.released += 1;
    }
  }

  gain(value = 1): GainNode {
    const node = this.track(this.ctx.createGain());
    node.gain.value = value;
    return node;
  }

  filter(type: BiquadFilterType, frequency: number, q = 0.707): BiquadFilterNode {
    const node = this.track(this.ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  osc(type: OscillatorType, frequency: number): OscillatorNode {
    const node = this.track(this.ctx.createOscillator());
    node.type = type;
    node.frequency.value = frequency;
    return node;
  }

  source(buffer: AudioBuffer, loop = false): AudioBufferSourceNode {
    const node = this.track(this.ctx.createBufferSource());
    node.buffer = buffer;
    node.loop = loop;
    return node;
  }

  shaper(drive: number): WaveShaperNode {
    const node = this.track(this.ctx.createWaveShaper());
    node.curve = this.saturationCurve(drive);
    node.oversample = 'none';
    return node;
  }

  /**
   * Plays a one-shot: starts `source` at `start`, stops it at `stop`, and when it ends disconnects it and `chain`
   * (every node only this voice uses). This is the only way voices are created, so nothing outlives its sound.
   */
  oneShot(
    source: AudioScheduledSourceNode,
    chain: readonly AudioNode[],
    start: number,
    stop: number,
    onEnded?: () => void,
    extraSources: readonly AudioScheduledSourceNode[] = [],
    offset?: number,
  ): void {
    source.onended = () => {
      source.onended = null;
      this.release(source, ...extraSources, ...chain);
      onEnded?.();
    };
    const begin = Math.max(start, 0);
    if (offset !== undefined && source instanceof AudioBufferSourceNode) source.start(begin, offset);
    else source.start(begin);
    source.stop(Math.max(stop, begin + 0.01));
    for (const extra of extraSources) {
      extra.start(begin);
      extra.stop(Math.max(stop, begin + 0.01));
    }
  }

  /** 2 s of white noise (looped or read at random offsets by percussion). */
  whiteNoise(): AudioBuffer {
    this.white ??= this.makeNoise(2, 'white');
    return this.white;
  }

  /** 4 s of brown (red) noise for rumbles: traffic, thunder, room tone, road noise. */
  brownNoise(): AudioBuffer {
    this.brown ??= this.makeNoise(4, 'brown');
    return this.brown;
  }

  /** tanh saturation curve (cached per drive). */
  saturationCurve(drive: number): Float32Array<ArrayBuffer> {
    const key = Math.round(drive * 100);
    let curve = this.curves.get(key);
    if (!curve) {
      const n = 1024;
      curve = new Float32Array(new ArrayBuffer(n * 4));
      const norm = Math.tanh(drive);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * drive) / norm;
      }
      this.curves.set(key, curve);
    }
    return curve;
  }

  /** A Karplus-Strong plucked-string note (highlife guitar, "ka-ching"), rendered once per pitch and cached. */
  pluck(midi: number, brightness = 0.6): AudioBuffer {
    const key = Math.round(midi) * 10 + Math.round(brightness * 9);
    const cached = this.plucks.get(key);
    if (cached) {
      // Refresh LRU position.
      this.plucks.delete(key);
      this.plucks.set(key, cached);
      return cached;
    }
    const frequency = 440 * 2 ** ((Math.round(midi) - 69) / 12);
    const rate = pluckSampleRate(frequency, AudioResources.PLUCK_RATE);
    const samples = renderPluck({ frequency, sampleRate: rate, durationSec: 0.9, brightness, seed: key });
    const buffer = this.ctx.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(samples, 0);
    this.plucks.set(key, buffer);
    if (this.plucks.size > AudioResources.MAX_PLUCKS) {
      const oldest = this.plucks.keys().next().value;
      if (oldest !== undefined) this.plucks.delete(oldest);
    }
    return buffer;
  }

  private makeNoise(seconds: number, colour: 'white' | 'brown'): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // xorshift32: deterministic, cheap and allocation-free (cosmetic noise, not gameplay randomness).
    let state = colour === 'white' ? 0x9e3779b9 : 0x7f4a7c15;
    const next = (): number => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return ((state >>> 0) / 4294967295) * 2 - 1;
    };
    if (colour === 'white') {
      for (let i = 0; i < length; i++) data[i] = next() * 0.9;
    } else {
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = (last + 0.02 * next()) / 1.02;
        data[i] = last * 3.2;
      }
      // Crossfade the tail into the head so the loop point is seamless.
      const fade = Math.min(2048, Math.floor(length / 8));
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        data[length - fade + i] = (data[length - fade + i] ?? 0) * (1 - t) + (data[i] ?? 0) * t;
      }
    }
    return buffer;
  }
}
