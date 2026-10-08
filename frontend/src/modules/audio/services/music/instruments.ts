import type { AudioResources } from '../engine/resources';
import { dbToGain, midiToHz } from '../engine/gain';
import type { NoteEvent } from './patterns';
import type { Instrument, MusicStyle } from './styles';

/**
 * The band: each instrument is a persistent channel (filter/shaper → level) that short-lived note voices plug into.
 * Per note we create only a source and a gain (2-4 nodes); every voice disconnects itself when it ends.
 */

/** Channel mix (dB) before the style's per-layer levels. */
const CHANNEL_DB: Readonly<Record<Instrument, number>> = {
  kick: -2,
  clap: -9,
  rim: -15,
  shaker: -17,
  hat: -20,
  log: -6,
  bass: -5,
  pad: -15,
  guitar: -10,
  talking: -10,
};

/** Lower = more important; under voice pressure, priority-2 events drop first. */
const PRIORITY: Readonly<Record<Instrument, 0 | 1 | 2>> = {
  kick: 0,
  bass: 0,
  log: 0,
  clap: 1,
  pad: 1,
  guitar: 1,
  talking: 1,
  rim: 2,
  shaker: 2,
  hat: 2,
};

export const MAX_MUSIC_VOICES = 40;

interface Channel {
  readonly input: AudioNode;
  readonly nodes: readonly AudioNode[];
}

export class MusicRig {
  readonly output: GainNode;
  private readonly channels = new Map<Instrument, Channel>();
  private liveVoices = 0;
  private disposed = false;

  constructor(
    private readonly res: AudioResources,
    private readonly style: MusicStyle,
    destination: AudioNode,
  ) {
    this.output = res.gain(0);
    this.output.connect(destination);
  }

  get voices(): number {
    return this.liveVoices;
  }

  play(event: NoteEvent, time: number, stepSec: number): void {
    if (this.disposed) return;
    const priority = PRIORITY[event.instrument];
    if (this.liveVoices >= MAX_MUSIC_VOICES + 8 && priority > 0) return;
    if (this.liveVoices >= MAX_MUSIC_VOICES && priority > 1) return;
    switch (event.instrument) {
      case 'kick':
        return this.kick(event, time);
      case 'clap':
        return this.clap(event, time);
      case 'rim':
        return this.rim(event, time);
      case 'shaker':
        return this.noiseHit(event, time, 'shaker', 0.004, 0.055);
      case 'hat':
        return this.noiseHit(event, time, 'hat', 0.003, 0.16);
      case 'log':
        return this.logDrum(event, time, stepSec);
      case 'bass':
        return this.bass(event, time, stepSec);
      case 'pad':
        return this.pad(event, time, stepSec);
      case 'guitar':
        return this.guitar(event, time);
      case 'talking':
        return this.talkingDrum(event, time);
    }
  }

  /** Disconnect the channels (voices already scheduled release themselves). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const channel of this.channels.values()) this.res.release(...channel.nodes);
    this.channels.clear();
    this.res.release(this.output);
  }

  // ----- channels -----------------------------------------------------------------------------------------------

  private channel(instrument: Instrument): AudioNode {
    const existing = this.channels.get(instrument);
    if (existing) return existing.input;
    const res = this.res;
    const level = res.gain(dbToGain(CHANNEL_DB[instrument]));
    level.connect(this.output);
    let nodes: AudioNode[] = [level];
    let input: AudioNode = level;
    const chain = (first: AudioNode, ...rest: AudioNode[]): void => {
      let tail = first;
      for (const stage of rest) tail = tail.connect(stage);
      tail.connect(level);
      nodes = [first, ...rest, level];
      input = first;
    };
    switch (instrument) {
      case 'clap':
        chain(res.filter('bandpass', 1150, 0.9));
        break;
      case 'rim':
        chain(res.filter('bandpass', 1750, 2.5));
        break;
      case 'shaker':
        chain(res.filter('highpass', 6500, 0.8));
        break;
      case 'hat':
        chain(res.filter('highpass', 8500, 0.7));
        break;
      case 'log':
        // The amapiano log drum: woody, saturated, rolled-off highs.
        chain(res.shaper(2.6), res.filter('lowpass', 1500, 0.9));
        break;
      case 'bass':
        chain(res.filter('lowpass', 480, 0.8));
        break;
      case 'pad':
        chain(res.filter('lowpass', this.style.padCutoffHz, 0.5));
        break;
      case 'guitar':
        chain(res.filter('highpass', 160, 0.7), res.filter('peaking', 2400, 1));
        break;
      case 'talking':
        chain(res.filter('lowpass', 2200, 0.7));
        break;
      default:
        break;
    }
    if (instrument === 'guitar') {
      const peaking = nodes[1] as BiquadFilterNode;
      peaking.gain.value = 3;
    }
    this.channels.set(instrument, { input, nodes });
    return input;
  }

  private voiceStarted(): () => void {
    this.liveVoices += 1;
    return () => {
      this.liveVoices -= 1;
    };
  }

  // ----- instruments --------------------------------------------------------------------------------------------

  private kick(event: NoteEvent, t: number): void {
    const res = this.res;
    const decay = this.style.kickDecaySec;
    const osc = res.osc('sine', 150);
    const amp = res.gain(0);
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(this.style.kickLowHz, t + 0.085);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(event.velocity, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.001, t + decay);
    osc.connect(amp).connect(this.channel('kick'));
    res.oneShot(osc, [amp], t, t + decay + 0.02, this.voiceStarted());
  }

  private clap(event: NoteEvent, t: number): void {
    const res = this.res;
    const noise = res.source(res.whiteNoise());
    const amp = res.gain(0);
    const v = event.velocity;
    // Three hand-claps a few ms apart, then the room tail.
    amp.gain.setValueAtTime(0, t);
    for (const offset of [0, 0.011, 0.023]) {
      amp.gain.setValueAtTime(v, t + offset);
      amp.gain.exponentialRampToValueAtTime(v * 0.2, t + offset + 0.009);
    }
    amp.gain.setValueAtTime(v * 0.75, t + 0.034);
    amp.gain.exponentialRampToValueAtTime(0.001, t + 0.034 + 0.17);
    noise.connect(amp).connect(this.channel('clap'));
    res.oneShot(noise, [amp], t, t + 0.24, this.voiceStarted(), [], (event.step * 0.07) % 1.5);
  }

  private rim(event: NoteEvent, t: number): void {
    const res = this.res;
    const osc = res.osc('triangle', 1650);
    const amp = res.gain(0);
    amp.gain.setValueAtTime(event.velocity, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(amp).connect(this.channel('rim'));
    res.oneShot(osc, [amp], t, t + 0.06, this.voiceStarted());
  }

  private noiseHit(event: NoteEvent, t: number, instrument: 'shaker' | 'hat', attack: number, decay: number): void {
    const res = this.res;
    const noise = res.source(res.whiteNoise());
    const amp = res.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(event.velocity, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.001, t + attack + decay);
    noise.connect(amp).connect(this.channel(instrument));
    res.oneShot(noise, [amp], t, t + attack + decay + 0.01, this.voiceStarted(), [], (event.step * 0.113) % 1.8);
  }

  private logDrum(event: NoteEvent, t: number, stepSec: number): void {
    const res = this.res;
    const f = midiToHz(event.midi);
    const length = Math.min(0.6, Math.max(0.14, event.lengthSteps * stepSec));
    const osc = res.osc('triangle', f);
    const amp = res.gain(0);
    // The "knock": start high and drop into pitch; optional slide from below for movement.
    osc.frequency.setValueAtTime(f * (event.bend ? 0.84 : 1.6), t);
    osc.frequency.exponentialRampToValueAtTime(f, t + (event.bend ? 0.06 : 0.028));
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(event.velocity, t + 0.003);
    amp.gain.setTargetAtTime(event.velocity * 0.55, t + 0.01, 0.05);
    amp.gain.setTargetAtTime(0, t + length * 0.7, length * 0.18);
    osc.connect(amp).connect(this.channel('log'));
    res.oneShot(osc, [amp], t, t + length + 0.12, this.voiceStarted());
  }

  private bass(event: NoteEvent, t: number, stepSec: number): void {
    const res = this.res;
    const length = Math.max(0.12, event.lengthSteps * stepSec * 0.92);
    const f = midiToHz(event.midi);
    const osc = res.osc('sine', f);
    const body = res.osc('triangle', f);
    const bodyGain = res.gain(0.25);
    const amp = res.gain(0);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(event.velocity, t + 0.012);
    amp.gain.setValueAtTime(event.velocity * 0.85, t + length - 0.04);
    amp.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(amp);
    body.connect(bodyGain).connect(amp);
    amp.connect(this.channel('bass'));
    res.oneShot(osc, [bodyGain, amp], t, t + length + 0.02, this.voiceStarted(), [body]);
  }

  private pad(event: NoteEvent, t: number, stepSec: number): void {
    const res = this.res;
    const length = event.lengthSteps * stepSec;
    const f = midiToHz(event.midi);
    const a = res.osc(this.style.padWave, f);
    const b = res.osc(this.style.padWave, f);
    a.detune.value = -7;
    b.detune.value = 7;
    const amp = res.gain(0);
    const peak = event.velocity * 0.5;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + Math.min(0.45, length * 0.3));
    amp.gain.setValueAtTime(peak, t + length - 0.05);
    amp.gain.setTargetAtTime(0, t + length - 0.05, 0.25);
    a.connect(amp);
    b.connect(amp);
    amp.connect(this.channel('pad'));
    res.oneShot(a, [amp], t, t + length + 1.2, this.voiceStarted(), [b]);
  }

  private guitar(event: NoteEvent, t: number): void {
    const res = this.res;
    const buffer = res.pluck(event.midi, this.style.id === 'home-chill' || this.style.id === 'study' ? 0.35 : 0.7);
    const source = res.source(buffer);
    const amp = res.gain(event.velocity);
    source.connect(amp).connect(this.channel('guitar'));
    res.oneShot(source, [amp], t, t + buffer.duration, this.voiceStarted());
  }

  private talkingDrum(event: NoteEvent, t: number): void {
    const res = this.res;
    const f = midiToHz(event.midi);
    const osc = res.osc('sine', f);
    const amp = res.gain(0);
    // Gangan speech contour: squeeze up (or down), then relax.
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 2 ** (event.bend / 12), t + 0.07);
    osc.frequency.exponentialRampToValueAtTime(f * 0.92, t + 0.3);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(event.velocity, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    const slap = res.source(res.whiteNoise());
    const slapAmp = res.gain(0);
    slapAmp.gain.setValueAtTime(event.velocity * 0.35, t);
    slapAmp.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    const input = this.channel('talking');
    osc.connect(amp).connect(input);
    slap.connect(slapAmp).connect(input);
    res.oneShot(osc, [amp, slapAmp], t, t + 0.36, this.voiceStarted(), [slap]);
  }
}
