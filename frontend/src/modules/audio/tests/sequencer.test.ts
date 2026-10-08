import { describe, expect, it } from 'vitest';
import { renderPluck, pluckSampleRate } from '../services/music/karplus';
import { BARS_PER_SECTION, eventsByStep, generateBar } from '../services/music/patterns';
import { MUSIC_STYLES, styleForContext, type MusicStyleId } from '../services/music/styles';
import { chordOnDegree, voiceChord } from '../services/music/theory';
import { StepClock, Ticker, secondsPerStep, type IntervalTimer } from '../services/engine/scheduler';

const STYLE_IDS = Object.keys(MUSIC_STYLES) as MusicStyleId[];

describe('generateBar (seeded patterns)', () => {
  it('is deterministic for the same style, seed and bar', () => {
    for (const id of STYLE_IDS) {
      for (const bar of [0, 3, 7, 8, 41]) {
        expect(generateBar(MUSIC_STYLES[id], 'seed-a', bar)).toEqual(generateBar(MUSIC_STYLES[id], 'seed-a', bar));
      }
    }
  });

  it('produces valid, sorted events', () => {
    for (const id of STYLE_IDS) {
      for (let bar = 0; bar < 32; bar++) {
        const pattern = generateBar(MUSIC_STYLES[id], 'seed-b', bar);
        expect(pattern.section).toBe(Math.floor(bar / BARS_PER_SECTION));
        let previous = 0;
        for (const event of pattern.events) {
          expect(event.step).toBeGreaterThanOrEqual(0);
          expect(event.step).toBeLessThan(16);
          expect(event.step).toBeGreaterThanOrEqual(previous);
          expect(event.velocity).toBeGreaterThan(0);
          expect(event.velocity).toBeLessThanOrEqual(1);
          expect(Number.isFinite(event.midi)).toBe(true);
          expect(MUSIC_STYLES[id].layers[event.instrument]).toBeDefined();
          previous = event.step;
        }
      }
    }
  });

  it('mutates between 8-bar sections and between seeds', () => {
    const style = MUSIC_STYLES['afro-day'];
    const signature = (seed: string, bar: number) => JSON.stringify(generateBar(style, seed, bar).events.map((e) => [e.step, e.instrument, e.midi]));
    const sections = new Set(Array.from({ length: 8 }, (_, section) => signature('seed-c', section * BARS_PER_SECTION + 1)));
    expect(sections.size).toBeGreaterThan(3);
    const seeds = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => signature(seed, 2)));
    expect(seeds.size).toBeGreaterThan(2);
  });

  it('adds a fill on the last bar of a section', () => {
    const style = MUSIC_STYLES['club-piano'];
    let fills = 0;
    for (let section = 0; section < 12; section++) {
      const bar = section * BARS_PER_SECTION + BARS_PER_SECTION - 1;
      const claps = generateBar(style, 'fills', bar).events.filter((e) => e.instrument === 'clap' && e.step >= 12).map((e) => e.step);
      if ([12, 13, 14, 15].every((step) => claps.includes(step))) fills += 1;
    }
    expect(fills).toBeGreaterThan(0);
  });

  it('keeps the signature theme identical for every player', () => {
    const style = MUSIC_STYLES.signature;
    expect(generateBar(style, 'player-1', 5)).toEqual(generateBar(style, 'player-2', 5));
  });

  it('indexes events by step for the scheduler', () => {
    const pattern = generateBar(MUSIC_STYLES.owambe, 'x', 0);
    const steps = eventsByStep(pattern);
    expect(steps).toHaveLength(16);
    expect(steps.flat()).toHaveLength(pattern.events.length);
  });
});

describe('styles and harmony', () => {
  it('maps contexts to styles (hospital is silent, night changes the city)', () => {
    expect(styleForContext('city', false, 0.6).styleId).toBe('afro-day');
    expect(styleForContext('city', true, 0.6).styleId).toBe('piano-night');
    expect(styleForContext('club', false, 1).styleId).toBe('club-piano');
    expect(styleForContext('hospital', false, 1).styleId).toBeNull();
    expect(styleForContext('menu', true, 1).styleId).toBe('signature');
    expect(styleForContext('club', false, 0.5).trimDb).toBeLessThan(styleForContext('club', false, 1).trimDb);
  });

  it('keeps tempos in the afrobeats/amapiano pocket', () => {
    for (const id of ['afro-day', 'piano-night', 'club-piano', 'owambe', 'signature'] as const) {
      expect(MUSIC_STYLES[id].bpm).toBeGreaterThanOrEqual(100);
      expect(MUSIC_STYLES[id].bpm).toBeLessThanOrEqual(114);
    }
  });

  it('builds diatonic chords and close voicings', () => {
    expect(chordOnDegree(60, 'major', 1, 3).tones).toEqual([60, 64, 67]);
    expect(chordOnDegree(57, 'minor', 1, 4).tones).toEqual([57, 60, 64, 67]);
    expect(chordOnDegree(60, 'major', 5, 4).tones).toEqual([67, 71, 74, 77]);
    const voiced = voiceChord([67, 71, 74, 77], 55);
    expect(Math.max(...voiced) - Math.min(...voiced)).toBeLessThan(12);
  });
});

describe('lookahead scheduler', () => {
  const fakeClock = () => {
    let now = 0;
    return { clock: { now: () => now }, set: (t: number) => (now = t) };
  };

  it('emits each step exactly once, in order, within the lookahead window', () => {
    const { clock, set } = fakeClock();
    const sps = secondsPerStep(120); // 0.125 s
    const steps: number[] = [];
    const times: number[] = [];
    const seq = new StepClock({ clock, secondsPerStep: sps, startTime: 0.05, lookahead: 0.1 });
    for (let t = 0; t <= 2; t += 0.025) {
      set(t);
      seq.advance((step) => {
        steps.push(step.index);
        times.push(step.time);
        expect(step.time).toBeLessThan(t + 0.1 + 1e-9);
      });
    }
    expect(steps).toEqual(Array.from({ length: steps.length }, (_, i) => i));
    expect(steps.length).toBe(Math.ceil((2 + 0.1 - 0.05) / sps));
    times.forEach((time, i) => expect(time).toBeCloseTo(0.05 + i * sps, 9));
  });

  it('skips ahead after a stall instead of bursting, keeping the bar grid', () => {
    const { clock, set } = fakeClock();
    const sps = 0.125;
    const seq = new StepClock({ clock, secondsPerStep: sps, startTime: 0, lookahead: 0.1, maxLag: 0.2 });
    set(0);
    seq.advance(() => undefined);
    set(10); // tab was throttled for 10 s
    const burst: number[] = [];
    seq.advance((step) => burst.push(step.index));
    expect(burst.length).toBeLessThanOrEqual(2);
    expect(burst[0]).toBe(80); // 10 s / 0.125 s
  });

  it('shares one timer and only runs while someone listens and not paused', () => {
    let next = 1;
    const active = new Set<number>();
    const timer: IntervalTimer = {
      set: () => {
        const id = next++;
        active.add(id);
        return id;
      },
      clear: (id) => active.delete(id),
    };
    const ticker = new Ticker(timer, 25);
    let calls = 0;
    const offA = ticker.add(() => (calls += 1));
    const offB = ticker.add(() => (calls += 1));
    expect(active.size).toBe(1);
    ticker.tick();
    expect(calls).toBe(2);
    ticker.pause();
    expect(ticker.running).toBe(false);
    ticker.resume();
    expect(ticker.running).toBe(true);
    offA();
    offB();
    expect(ticker.running).toBe(false);
    expect(active.size).toBe(0);
  });
});

describe('Karplus-Strong pluck', () => {
  const render = (seed: number) => {
    const frequency = 440;
    const sampleRate = pluckSampleRate(frequency);
    return { samples: renderPluck({ frequency, sampleRate, durationSec: 0.6, brightness: 0.7, seed }), sampleRate, frequency };
  };

  it('is deterministic per seed', () => {
    expect(render(7).samples).toEqual(render(7).samples);
    expect(render(7).samples).not.toEqual(render(8).samples);
  });

  it('decays, stays within range and ends silent', () => {
    const { samples } = render(3);
    const energy = (from: number, to: number) => samples.slice(from, to).reduce((sum, x) => sum + x * x, 0);
    const tenth = Math.floor(samples.length / 10);
    expect(energy(0, tenth)).toBeGreaterThan(energy(samples.length - 2 * tenth, samples.length - tenth) * 4);
    expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(0.8);
    expect(Math.abs(samples[samples.length - 1] ?? 1)).toBeLessThan(1e-3);
  });

  it('is in tune (render rate gives an exact loop length)', () => {
    const { samples, sampleRate, frequency } = render(11);
    const period = sampleRate / frequency;
    // Autocorrelation peak near the expected period.
    let best = 0;
    let bestLag = 0;
    const start = 2000;
    for (let lag = Math.floor(period * 0.8); lag <= Math.ceil(period * 1.2); lag++) {
      let sum = 0;
      for (let i = start; i < start + 4000; i++) sum += (samples[i] ?? 0) * (samples[i + lag] ?? 0);
      if (sum > best) {
        best = sum;
        bestLag = lag;
      }
    }
    expect(Math.abs(bestLag - period)).toBeLessThanOrEqual(1);
  });
});
