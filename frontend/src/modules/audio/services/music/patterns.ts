import { createRng, type Rng } from '@insidelife/shared';
import type { Instrument, MusicStyle } from './styles';
import { chordOnDegree, intoOctave, voiceChord, type Chord } from './theory';

/**
 * Seeded bar generator. `generateBar(style, seed, bar)` is a pure function: the same inputs always give the same
 * notes, so a groove never repeats obviously (every 8-bar section re-rolls rhythms, layers and ghost notes) yet stays
 * reproducible for tests and debugging.
 */

export const BARS_PER_SECTION = 8;
const STEPS = 16;

export interface NoteEvent {
  /** 16th-note step within the bar (0-15). */
  readonly step: number;
  readonly instrument: Instrument;
  /** 0-1. */
  readonly velocity: number;
  /** MIDI pitch (pitched instruments; percussion ignores it). */
  readonly midi: number;
  readonly lengthSteps: number;
  /** Pitch bend in semitones (talking drum glide, log-drum slide). */
  readonly bend: number;
}

export interface BarPattern {
  readonly bar: number;
  readonly section: number;
  readonly chord: Chord;
  /** Sorted by step. */
  readonly events: readonly NoteEvent[];
}

// ----- Rhythm libraries (16th-note steps) ------------------------------------------------------------------------

/** A library always has at least one entry, so a lookup can fall back to it. */
type Library<T> = readonly [T, ...T[]];

function fromLibrary<T>(library: Library<T>, index: number | undefined): T {
  return library[index ?? 0] ?? library[0];
}

const KICKS: Library<readonly number[]> = [
  [0, 7, 8], // afrobeats
  [0, 7, 8, 14], // afrobeats, busier
  [0, 3, 8, 11], // tresillo-leaning
  [0, 4, 8, 12], // four-on-the-floor (amapiano)
  [0, 4, 8, 12, 15],
  [0, 8], // half-time
  [0, 10], // sparse
];
const CLAPS: Library<readonly number[]> = [[4, 12], [12], [4, 12, 15], [4, 11, 12]];
/** Stick/rim: 3-3-2 figures that give afrobeats its lilt. */
const RIMS: Library<readonly number[]> = [
  [0, 3, 6, 8, 11, 14],
  [3, 6, 10, 14],
  [2, 6, 10, 13],
  [3, 7, 11, 15],
];
/** Shaker velocity per step (0 = rest). */
const SHAKERS: Library<readonly number[]> = [
  [0.45, 0.25, 0.9, 0.3, 0.45, 0.25, 0.9, 0.3, 0.45, 0.25, 0.9, 0.3, 0.45, 0.25, 0.9, 0.35],
  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0.4],
  [0.5, 0, 0.8, 0, 0, 0, 0.8, 0, 0.5, 0, 0.8, 0, 0, 0, 0.8, 0],
];
const HATS: Library<readonly number[]> = [[2, 6, 10, 14], [6, 14]];
/** [step, semitones above chord root, length in steps]. */
type PitchedHit = readonly [step: number, semitones: number, length: number];
const LOGS: Library<readonly PitchedHit[]> = [
  [[3, 0, 2], [6, 0, 3], [10, 7, 2], [11, 0, 2], [14, 12, 2]],
  [[0, 0, 3], [3, 12, 2], [7, 0, 2], [10, 7, 3], [13, 0, 2]],
  [[2, 0, 2], [6, 0, 2], [9, 12, 2], [12, 0, 2], [14, 10, 2]],
  [[3, 0, 3], [8, 0, 2], [11, 7, 2], [14, 0, 2]],
];
const BASSES: Library<readonly PitchedHit[]> = [
  [[0, 0, 3], [3, 0, 2], [7, 7, 2], [10, 0, 3], [14, 12, 2]],
  [[0, 0, 6], [8, 7, 4], [12, 0, 3]],
  [[0, 0, 2], [3, 0, 2], [6, 7, 2], [8, 0, 2], [11, 0, 2], [14, 7, 2]],
];
/** [step, chord-tone index, octave offset]. Highlife guitar figures. */
type ArpHit = readonly [step: number, tone: number, octave: number];
const ARPS: Library<readonly ArpHit[]> = [
  [[0, 0, 0], [2, 2, 0], [4, 1, 0], [6, 2, 0], [8, 3, 0], [10, 2, 0], [12, 1, 0], [14, 2, 0]],
  [[2, 0, 1], [3, 2, 0], [6, 1, 1], [7, 2, 0], [10, 0, 1], [11, 2, 0], [14, 1, 1], [15, 3, 0]],
  [[2, 1, 0], [6, 2, 0], [10, 1, 0], [13, 3, 0]],
  // The signature motif.
  [[0, 2, 1], [3, 1, 1], [6, 0, 1], [8, 2, 0], [10, 3, 0], [12, 1, 1], [14, 0, 1]],
];
/** Talking-drum phrases: [step, bend semitones]. */
const TALKING: Library<ReadonlyArray<readonly [number, number]>> = [
  [[10, 5], [12, -3], [13, 7], [14, 0]],
  [[8, 7], [11, 3], [14, -2]],
  [[12, 5], [13, 5], [14, -4], [15, 7]],
];

// ----- Section planning ------------------------------------------------------------------------------------------

interface SectionPlan {
  readonly progression: readonly number[];
  readonly rhythm: Readonly<Partial<Record<Instrument, number>>>;
  readonly present: ReadonlySet<Instrument>;
  readonly breakdown: boolean;
  /** Extra ghost kick / rim steps for this section. */
  readonly ghostKick: number | null;
  readonly ghostRim: number | null;
}

function planSection(style: MusicStyle, seed: string, section: number): SectionPlan {
  const rng = createRng(`${seed}:${style.id}:section:${section}`);
  const progression = rng.pick(style.progressions);
  const rhythm: Partial<Record<Instrument, number>> = {};
  const present = new Set<Instrument>();
  for (const [instrument, spec] of Object.entries(style.layers) as Array<[Instrument, NonNullable<MusicStyle['layers'][Instrument]>]>) {
    rhythm[instrument] = rng.pick(spec.rhythms);
    // The first section always establishes the core groove.
    if (spec.presence >= 1 || (section === 0 && spec.presence >= 0.5) || rng.chance(spec.presence)) present.add(instrument);
  }
  const breakdown = section > 0 && rng.chance(style.breakdownChance);
  if (breakdown) {
    present.delete('kick');
    present.delete('bass');
  }
  const ghostKick = rng.chance(0.45) ? rng.pick([5, 6, 10, 13, 15]) : null;
  const ghostRim = rng.chance(0.5) ? rng.pick([1, 5, 9, 12]) : null;
  return { progression, rhythm, present, breakdown, ghostKick, ghostRim };
}

const planCache = new Map<string, SectionPlan>();

function sectionPlan(style: MusicStyle, seed: string, section: number): SectionPlan {
  const key = `${seed}:${style.id}:${section}`;
  let plan = planCache.get(key);
  if (!plan) {
    plan = planSection(style, seed, section);
    if (planCache.size > 64) planCache.clear();
    planCache.set(key, plan);
  }
  return plan;
}

// ----- Bars --------------------------------------------------------------------------------------------------------

const human = (rng: Rng, velocity: number): number => Math.max(0.05, Math.min(1, velocity * (1 + rng.float(-0.08, 0.08))));

export function generateBar(style: MusicStyle, seed: string, bar: number): BarPattern {
  const effectiveSeed = style.fixedSeed ?? seed;
  const section = Math.floor(bar / BARS_PER_SECTION);
  const barInSection = ((bar % BARS_PER_SECTION) + BARS_PER_SECTION) % BARS_PER_SECTION;
  const plan = sectionPlan(style, effectiveSeed, section);
  const rng = createRng(`${effectiveSeed}:${style.id}:bar:${bar}`);
  const degree = plan.progression[barInSection % plan.progression.length] ?? 1;
  const chord = chordOnDegree(style.tonic, style.scale, degree, style.chordSize);
  const isFillBar = barInSection === BARS_PER_SECTION - 1;
  const events: NoteEvent[] = [];
  const level = (instrument: Instrument): number => style.layers[instrument]?.level ?? 0;
  const on = (instrument: Instrument): boolean => plan.present.has(instrument);
  const push = (step: number, instrument: Instrument, velocity: number, midi = 0, lengthSteps = 1, bend = 0): void => {
    events.push({ step, instrument, velocity: human(rng, velocity * level(instrument)), midi, lengthSteps, bend });
  };

  if (on('kick')) {
    const steps = new Set(fromLibrary(KICKS, plan.rhythm.kick));
    if (plan.ghostKick !== null && !isFillBar) steps.add(plan.ghostKick);
    for (const step of steps) push(step, 'kick', step % 4 === 0 ? 1 : 0.75);
  }

  if (on('clap')) {
    const pattern = fromLibrary(CLAPS, plan.rhythm.clap);
    if (isFillBar) {
      for (const step of pattern) if (step < 12) push(step, 'clap', 0.9);
      [12, 13, 14, 15].forEach((step, i) => push(step, 'clap', 0.45 + i * 0.17));
    } else {
      for (const step of pattern) push(step, 'clap', step === 15 || step === 11 ? 0.55 : 0.95);
    }
  }

  if (on('rim')) {
    const steps = new Set(fromLibrary(RIMS, plan.rhythm.rim));
    if (plan.ghostRim !== null) steps.add(plan.ghostRim);
    for (const step of steps) push(step, 'rim', step === plan.ghostRim ? 0.45 : 0.85);
  }

  if (on('shaker')) {
    const velocities = fromLibrary(SHAKERS, plan.rhythm.shaker);
    velocities.forEach((velocity, step) => {
      if (velocity > 0) push(step, 'shaker', velocity);
    });
  }

  if (on('hat')) for (const step of fromLibrary(HATS, plan.rhythm.hat)) push(step, 'hat', 0.8);

  const bassRoot = intoOctave(chord.root, 36);
  if (on('log')) {
    const hits = fromLibrary(LOGS, plan.rhythm.log);
    // Each bar may flip one hit up an octave for movement.
    const flip = rng.chance(0.35) ? rng.int(0, hits.length - 1) : -1;
    hits.forEach(([step, semitones, length], i) => {
      const midi = intoOctave(chord.root, 40) + semitones + (i === flip ? 12 : 0);
      push(step, 'log', step === 0 || step === 3 ? 1 : 0.85, midi, length, rng.chance(0.25) ? 2 : 0);
    });
  }

  if (on('bass')) {
    for (const [step, semitones, length] of fromLibrary(BASSES, plan.rhythm.bass)) push(step, 'bass', step === 0 ? 1 : 0.8, bassRoot + semitones, length);
  }

  if (on('pad')) {
    for (const midi of voiceChord(chord.tones, 55)) push(0, 'pad', 0.8, midi, STEPS);
  }

  if (on('guitar')) {
    const voiced = voiceChord(chord.tones, 64);
    const arp = fromLibrary(ARPS, plan.rhythm.guitar);
    for (const [step, tone, octave] of arp) {
      // Occasional rests keep the figure conversational rather than mechanical.
      if (!style.fixedSeed && rng.chance(0.12)) continue;
      push(step, 'guitar', step % 4 === 0 ? 0.9 : 0.7, (voiced[tone % voiced.length] ?? chord.root) + octave * 12, 2);
    }
  }

  if (style.layers.talking && (rng.chance(style.talkingChance) || (isFillBar && rng.chance(0.5)))) {
    const phrase = rng.pick(TALKING);
    const drumRoot = intoOctave(chord.root, 50);
    for (const [step, bend] of phrase) push(step, 'talking', 0.85, drumRoot, 2, bend);
  }

  events.sort((a, b) => a.step - b.step);
  return { bar, section, chord, events };
}

/** Events grouped by step for O(1) lookup in the scheduler. */
export function eventsByStep(pattern: BarPattern): ReadonlyArray<readonly NoteEvent[]> {
  const steps: NoteEvent[][] = Array.from({ length: STEPS }, () => []);
  for (const event of pattern.events) steps[event.step]?.push(event);
  return steps;
}
