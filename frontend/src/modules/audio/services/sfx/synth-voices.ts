import type { AudioResources } from '../engine/resources';
import { dbToGain, midiToHz } from '../engine/gain';

/**
 * Procedural one-shots. Every voice: build → schedule envelopes → `res.oneShot` (self-releasing). All take an
 * absolute audio-clock start time and an output node; levels in dB.
 */

export type SynthVoiceId = 'horn' | 'horn-tap' | 'car-start' | 'ka-ching' | 'chew' | 'goal-pluck' | 'thunder' | 'keke' | 'frog' | 'coin-chink';

export interface SynthOptions {
  readonly gainDb: number;
  /** -1 (left) … 1 (right). */
  readonly pan?: number;
  /** 0 = right here, 1 = far away (darker, softer attack). */
  readonly distance?: number;
  /** Small random generator for variation. */
  readonly random: () => number;
  /** MIDI root for musical voices (goal pluck in the current key). */
  readonly root?: number;
}

/** Returns the voice's duration in seconds. */
export function playSynth(res: AudioResources, id: SynthVoiceId, output: AudioNode, t: number, options: SynthOptions): number {
  const out = withPan(res, output, options.pan ?? 0);
  const nodes = out === output ? [] : [out];
  switch (id) {
    case 'horn':
      return horn(res, out, nodes, t, options, 0.42);
    case 'horn-tap':
      return horn(res, out, nodes, t, options, 0.12);
    case 'car-start':
      return carStart(res, out, nodes, t, options);
    case 'ka-ching':
      return kaChing(res, out, nodes, t, options);
    case 'chew':
      return chew(res, out, nodes, t, options);
    case 'goal-pluck':
      return goalPluck(res, out, nodes, t, options);
    case 'thunder':
      return thunder(res, out, nodes, t, options);
    case 'keke':
      return keke(res, out, nodes, t, options);
    case 'frog':
      return frog(res, out, nodes, t, options);
    case 'coin-chink':
      return coinChink(res, out, nodes, t, options);
  }
}

function withPan(res: AudioResources, output: AudioNode, pan: number): AudioNode {
  if (!pan || typeof res.ctx.createStereoPanner !== 'function') return output;
  const panner = res.track(res.ctx.createStereoPanner());
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(output);
  return panner;
}

/** Classic two-tone car/danfo horn: detuned square + saw a major third apart, through a resonant horn body. */
function horn(res: AudioResources, out: AudioNode, extra: AudioNode[], t: number, o: SynthOptions, hold: number): number {
  const distance = o.distance ?? 0;
  const detune = (o.random() - 0.5) * 30;
  const low = res.osc('square', 405);
  const high = res.osc('sawtooth', 507);
  low.detune.value = detune - 8;
  high.detune.value = detune + 8;
  const body = res.filter('lowpass', 2600 - distance * 1900, 1.4);
  const honk = res.filter('peaking', 1200, 1.2);
  honk.gain.value = 5;
  const shaper = res.shaper(1.8);
  const amp = res.gain(0);
  const peak = dbToGain(o.gainDb) * 0.32;
  const attack = 0.008 + distance * 0.03;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + attack);
  amp.gain.setValueAtTime(peak, t + hold);
  amp.gain.linearRampToValueAtTime(0, t + hold + 0.06);
  low.connect(shaper);
  high.connect(shaper);
  shaper.connect(body).connect(honk).connect(amp).connect(out);
  const end = t + hold + 0.08;
  res.oneShot(low, [shaper, body, honk, amp, ...extra], t, end, undefined, [high]);
  return end - t;
}

/** Starter motor cranking (AM'd buzz + whine), the engine catches, revs once and settles to idle. */
function carStart(res: AudioResources, out: AudioNode, extra: AudioNode[], t: number, o: SynthOptions): number {
  const level = dbToGain(o.gainDb);
  const crank = 0.75 + o.random() * 0.35;
  // Starter: a buzzing motor modulated by compression strokes (~11 Hz).
  const starter = res.osc('sawtooth', 95);
  const starterAmp = res.gain(0);
  const strokes = res.osc('square', 10 + o.random() * 2);
  const strokeDepth = res.gain(0.45 * level);
  const starterTone = res.filter('bandpass', 420, 1.1);
  starterAmp.gain.setValueAtTime(0.5 * level, t);
  starterAmp.gain.setValueAtTime(0.5 * level, t + crank);
  starterAmp.gain.linearRampToValueAtTime(0, t + crank + 0.08);
  strokes.connect(strokeDepth).connect(starterAmp.gain);
  starter.connect(starterTone).connect(starterAmp).connect(out);
  res.oneShot(starter, [strokeDepth, starterTone, starterAmp], t, t + crank + 0.1, undefined, [strokes]);

  // Engine: firing frequency follows rpm (4-cyl: rpm / 30). Catch → rev to ~2600 rpm → settle at ~850.
  const start = t + crank - 0.05;
  const fire = res.osc('sawtooth', 20);
  const sub = res.osc('square', 10);
  const subGain = res.gain(0.5);
  const tone = res.filter('lowpass', 500, 2);
  const shaper = res.shaper(2.2);
  const amp = res.gain(0);
  const rpm = (value: number): number => value / 30;
  fire.frequency.setValueAtTime(rpm(500), start);
  fire.frequency.exponentialRampToValueAtTime(rpm(2600), start + 0.35);
  fire.frequency.exponentialRampToValueAtTime(rpm(1100), start + 0.9);
  fire.frequency.exponentialRampToValueAtTime(rpm(850), start + 1.5);
  sub.frequency.setValueAtTime(rpm(250), start);
  sub.frequency.exponentialRampToValueAtTime(rpm(1300), start + 0.35);
  sub.frequency.exponentialRampToValueAtTime(rpm(425), start + 1.5);
  tone.frequency.setValueAtTime(350, start);
  tone.frequency.linearRampToValueAtTime(1400, start + 0.35);
  tone.frequency.linearRampToValueAtTime(420, start + 1.4);
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(0.6 * level, start + 0.05);
  amp.gain.setValueAtTime(0.6 * level, start + 0.4);
  amp.gain.linearRampToValueAtTime(0.32 * level, start + 1.2);
  amp.gain.linearRampToValueAtTime(0, start + 1.9);
  fire.connect(shaper);
  sub.connect(subGain).connect(shaper);
  shaper.connect(tone).connect(amp).connect(out);
  const end = start + 1.95;
  res.oneShot(fire, [subGain, shaper, tone, amp, ...extra], start, end, undefined, [sub]);
  return end - t;
}

/** The "ching": two bright plucked notes a fifth apart plus a short bell shimmer. Pairs with a coin sample. */
function kaChing(res: AudioResources, out: AudioNode, extra: AudioNode[], t: number, o: SynthOptions): number {
  const level = dbToGain(o.gainDb);
  const notes: ReadonlyArray<readonly [number, number, number]> = [
    [88, 0.03, 0.7], // E6
    [95, 0.1, 1], // B6
  ];
  const mix = res.gain(level);
  mix.connect(out);
  let end = t;
  notes.forEach(([midi, offset, velocity], index) => {
    const buffer = res.pluck(midi, 0.95);
    const source = res.source(buffer);
    const amp = res.gain(velocity * 0.8);
    source.connect(amp).connect(mix);
    const stop = t + offset + Math.min(buffer.duration, 0.8);
    end = Math.max(end, stop);
    // The last voice to finish releases the shared mix (and panner).
    res.oneShot(source, index === notes.length - 1 ? [amp, mix, ...extra] : [amp], t + offset, stop);
  });
  // Bell partials (inharmonic) for the till-drawer sparkle.
  const bellBase = midiToHz(95);
  for (const [ratio, decay, gain] of [
    [1, 0.5, 0.18],
    [2.76, 0.3, 0.09],
    [5.4, 0.16, 0.05],
  ] as const) {
    const osc = res.osc('sine', bellBase * ratio);
    const amp = res.gain(0);
    const start = t + 0.1;
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.003);
    amp.gain.exponentialRampToValueAtTime(0.001, start + decay);
    osc.connect(amp).connect(mix);
    res.oneShot(osc, [amp], start, start + decay + 0.02);
  }
  return end - t;
}

/** Three crunchy bites. */
function chew(res: AudioResources, out: AudioNode, extra: AudioNode[], t: number, o: SynthOptions): number {
  const level = dbToGain(o.gainDb);
  const band = res.filter('bandpass', 1700 + o.random() * 500, 1.6);
  const mix = res.gain(level);
  band.connect(mix).connect(out);
  const bites = 3;
  for (let i = 0; i < bites; i++) {
    const start = t + 0.12 + i * (0.15 + o.random() * 0.04);
    const noise = res.source(res.whiteNoise());
    const amp = res.gain(0);
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(0.9 - i * 0.15, start + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
    noise.connect(amp).connect(band);
    res.oneShot(noise, i === bites - 1 ? [amp, band, mix, ...extra] : [amp], start, start + 0.32, undefined, [], o.random() * 1.5);
  }
  return 0.12 + bites * 0.19 + 0.3;
}

/** Goal completed: a rising highlife triad on the pluck, in the music's key when known. */
function goalPluck(res: AudioResources, out: AudioNode, extra: AudioNode[], t: number, o: SynthOptions): number {
  const root = o.root ?? 72;
  const notes = [root, root + 4, root + 7, root + 12];
  const mix = res.gain(dbToGain(o.gainDb));
  mix.connect(out);
  let end = t;
  notes.forEach((midi, index) => {
    const buffer = res.pluck(midi, 0.8);
    const source = res.source(buffer);
    const amp = res.gain(0.55 + index * 0.12);
    source.connect(amp).connect(mix);
    const start = t + index * 0.075;
    const stop = start + buffer.duration;
    end = Math.max(end, stop);
    res.oneShot(source, index === notes.length - 1 ? [amp, mix, ...extra] : [amp], start, stop);
  });
  return end - t;
}

function thunder(res: AudioResources, out: AudioNode, extra: AudioNode[], t: number, o: SynthOptions): number {
  const length = 3 + o.random() * 2.5;
  const noise = res.source(res.brownNoise(), true);
  const low = res.filter('lowpass', 160 - (o.distance ?? 0) * 70, 0.9);
  const amp = res.gain(0);
  const peak = dbToGain(o.gainDb);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + 0.25 + o.random() * 0.4);
  amp.gain.setTargetAtTime(peak * 0.4, t + 0.8, 0.4);
  amp.gain.setTargetAtTime(0, t + 1.6, length / 4);
  noise.connect(low).connect(amp).connect(out);
  res.oneShot(noise, [low, amp, ...extra], t, t + length, undefined, [], o.random() * 3);
  return length;
}

/** A keke (tricycle) two-stroke putter passing by, with a small Doppler drop. */
function keke(res: AudioResources, out: AudioNode, extra: AudioNode[], t: number, o: SynthOptions): number {
  const length = 4.2 + o.random() * 1.5;
  const base = 24 + o.random() * 6;
  const putter = res.osc('square', base);
  const tone = res.filter('lowpass', 380, 3);
  const amp = res.gain(0);
  const peak = dbToGain(o.gainDb);
  putter.frequency.setValueAtTime(base * 1.06, t);
  putter.frequency.linearRampToValueAtTime(base * 0.94, t + length);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(peak, t + length * 0.45);
  amp.gain.linearRampToValueAtTime(0, t + length);
  putter.connect(tone).connect(amp).connect(out);
  res.oneShot(putter, [tone, amp, ...extra], t, t + length + 0.02);
  return length;
}

/** A lagoon frog: a short buzzy croak (saw through a nasal band, gated at ~25 Hz). */
function frog(res: AudioResources, out: AudioNode, extra: AudioNode[], t: number, o: SynthOptions): number {
  const croaks = 2 + Math.floor(o.random() * 2);
  const pitch = 140 + o.random() * 60;
  const voice = res.osc('sawtooth', pitch);
  const gate = res.osc('square', 22 + o.random() * 6);
  const gateDepth = res.gain(0.5);
  const throat = res.filter('bandpass', 650, 4);
  const amp = res.gain(0);
  const env = res.gain(0);
  const peak = dbToGain(o.gainDb);
  gate.connect(gateDepth).connect(amp.gain);
  amp.gain.value = 0.5;
  let end = t;
  for (let i = 0; i < croaks; i++) {
    const start = t + i * 0.32;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.02);
    env.gain.linearRampToValueAtTime(0, start + 0.17);
    end = start + 0.2;
  }
  voice.connect(throat).connect(amp).connect(env).connect(out);
  res.oneShot(voice, [gateDepth, throat, amp, env, ...extra], t, end, undefined, [gate]);
  return end - t;
}

/** A tiny metallic chink (conductor's coins) when no sample is loaded yet. */
function coinChink(res: AudioResources, out: AudioNode, extra: AudioNode[], t: number, o: SynthOptions): number {
  const amp = res.gain(0);
  amp.connect(out);
  const peak = dbToGain(o.gainDb);
  const freqs = [3100 + o.random() * 400, 4700 + o.random() * 500];
  freqs.forEach((frequency, index) => {
    const osc = res.osc('sine', frequency);
    const g = res.gain(0);
    const start = t + index * 0.06;
    g.gain.setValueAtTime(peak * 0.5, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
    osc.connect(g).connect(amp);
    res.oneShot(osc, index === freqs.length - 1 ? [g, amp, ...extra] : [g], start, start + 0.2);
  });
  amp.gain.value = 1;
  return 0.3;
}
