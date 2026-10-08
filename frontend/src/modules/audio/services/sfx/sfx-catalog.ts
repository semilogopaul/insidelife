import type { SfxId } from '@/common/game/game-events';
import type { CelebrationKind } from '../../types/audio';
import type { AudioAssetKey } from './audio-assets.generated';
import type { SynthVoiceId } from './synth-voices';

/**
 * What every sound id actually plays: layered samples (Kenney CC0) and synth voices, with per-id cooldowns, shared
 * groups (so `celebrate` + `sfx: celebration` emitted together play one stinger) and music ducking.
 */

export type SfxBus = 'ui' | 'sfx';

export interface SampleLayer {
  readonly kind: 'sample';
  readonly variants: readonly AudioAssetKey[];
  /** Used instead of `variants` when the player is indoors (footsteps on wood). */
  readonly indoorVariants?: readonly AudioAssetKey[];
  readonly gainDb: number;
  /** Base playback rate (1 = as recorded). */
  readonly rate?: number;
  /** ± random pitch variation as a fraction (default 0.06). */
  readonly pitchVar?: number;
  readonly delayMs?: number;
  readonly pan?: number | 'random';
  /** Repeat the layer as a cascade (spraying money). */
  readonly repeat?: { readonly count: readonly [number, number]; readonly spacingMs: readonly [number, number]; readonly decayDb: number };
  /** May start late if the file is still loading (stingers); immediate-feedback sounds are dropped instead. */
  readonly allowLate?: boolean;
}

export interface SynthLayer {
  readonly kind: 'synth';
  readonly voice: SynthVoiceId;
  readonly gainDb: number;
  readonly delayMs?: number;
  readonly pan?: number | 'random';
}

/** A spoken line through speech synthesis — only when voice guidance is on and nothing else is being said. */
export interface SpeechLayer {
  readonly kind: 'speech';
  readonly lines: readonly string[];
  readonly chance: number;
  readonly delayMs?: number;
}

export type SfxLayer = SampleLayer | SynthLayer | SpeechLayer;

export interface SfxRecipe {
  readonly bus: SfxBus;
  readonly cooldownMs: number;
  readonly group?: { readonly id: string; readonly cooldownMs: number };
  readonly duck?: { readonly depthDb: number; readonly holdMs: number };
  readonly layers: readonly SfxLayer[];
}

const STINGER_GROUP = { id: 'stinger', cooldownMs: 1200 } as const;

const sample = (variants: readonly AudioAssetKey[], gainDb: number, extra: Omit<SampleLayer, 'kind' | 'variants' | 'gainDb'> = {}): SampleLayer => ({
  kind: 'sample',
  variants,
  gainDb,
  ...extra,
});
const synth = (voice: SynthVoiceId, gainDb: number, extra: Omit<SynthLayer, 'kind' | 'voice' | 'gainDb'> = {}): SynthLayer => ({
  kind: 'synth',
  voice,
  gainDb,
  ...extra,
});

export const CONDUCTOR_LINES: readonly string[] = [
  'Oshodi! Oshodi! Enter with your change!',
  'C M S! Obalende! Enter, enter!',
  'Ojuelegba! Wole wole!',
  'Yaba straight! Shift for me!',
  'Ikeja along! Your change o!',
];

export const SFX_RECIPES = {
  'ui-click': { bus: 'ui', cooldownMs: 35, layers: [sample(['ui/click-1', 'ui/click-2', 'ui/click-3'], -6, { pitchVar: 0.04 })] },
  'ui-open': { bus: 'ui', cooldownMs: 90, layers: [sample(['ui/open-1', 'ui/open-2'], -8, { pitchVar: 0.03 })] },
  'ui-close': { bus: 'ui', cooldownMs: 90, layers: [sample(['ui/close-1', 'ui/close-2'], -9, { pitchVar: 0.03 })] },
  'ui-error': { bus: 'ui', cooldownMs: 250, layers: [sample(['ui/error-1', 'ui/error-2'], -7, { pitchVar: 0.02 })] },
  'ui-success': { bus: 'ui', cooldownMs: 150, layers: [sample(['ui/success-1', 'ui/success-2'], -6, { pitchVar: 0.02 })] },
  // Salary lands: coins ("ka") + a bright rising pluck ("ching"), music dips so it reads.
  'cash-in': {
    bus: 'ui',
    cooldownMs: 250,
    duck: { depthDb: -5, holdMs: 700 },
    layers: [
      sample(['money/coins-1', 'money/coins-2'], -5),
      sample(['money/chips-stack-1', 'money/chips-stack-2', 'money/chips-stack-3'], -9, { delayMs: 40 }),
      synth('ka-ching', -7),
    ],
  },
  'cash-out': {
    bus: 'ui',
    cooldownMs: 200,
    layers: [sample(['money/chip-lay-1', 'money/chip-lay-2'], -7, { rate: 0.95 }), sample(['money/chips-handle-1'], -12, { delayMs: 60, rate: 0.92 })],
  },
  notification: { bus: 'ui', cooldownMs: 400, layers: [sample(['ui/notify-1', 'ui/notify-2'], -7, { pitchVar: 0.02 })] },
  'door-open': { bus: 'sfx', cooldownMs: 300, layers: [sample(['world/door-open-1', 'world/door-open-2'], -7)] },
  'door-close': { bus: 'sfx', cooldownMs: 300, layers: [sample(['world/door-close-1', 'world/door-close-2', 'world/door-close-3'], -7)] },
  'car-start': { bus: 'sfx', cooldownMs: 2000, layers: [sample(['world/latch'], -16, { rate: 1.3 }), synth('car-start', -5, { delayMs: 120 })] },
  'car-door': {
    bus: 'sfx',
    cooldownMs: 250,
    layers: [sample(['world/thump-1', 'world/thump-2'], -6, { rate: 0.82 }), sample(['world/latch'], -13, { delayMs: 25 })],
  },
  horn: { bus: 'sfx', cooldownMs: 140, layers: [synth('horn', -6)] },
  footstep: {
    bus: 'sfx',
    cooldownMs: 110,
    layers: [
      sample(['world/step-concrete-1', 'world/step-concrete-2', 'world/step-concrete-3', 'world/step-concrete-4', 'world/step-concrete-5'], -14, {
        indoorVariants: ['world/step-wood-1', 'world/step-wood-2', 'world/step-wood-3'],
        pitchVar: 0.07,
      }),
    ],
  },
  eat: { bus: 'sfx', cooldownMs: 600, layers: [sample(['world/plate-1', 'world/plate-2'], -11), synth('chew', -12)] },
  'level-up': {
    bus: 'ui',
    cooldownMs: 1500,
    group: STINGER_GROUP,
    duck: { depthDb: -12, holdMs: 1400 },
    layers: [sample(['jingles/pizzi-02', 'jingles/pizzi-15'], -4, { pitchVar: 0, allowLate: true })],
  },
  celebration: {
    bus: 'ui',
    cooldownMs: 1500,
    group: STINGER_GROUP,
    duck: { depthDb: -14, holdMs: 2200 },
    layers: [sample(['jingles/sax-02', 'jingles/sax-10', 'jingles/sax-15', 'jingles/steel-10', 'jingles/steel-15'], -3, { pitchVar: 0, allowLate: true })],
  },
  // Bus door slam + horn tap + coin chink, and (voice on) the conductor's call.
  'danfo-conductor': {
    bus: 'sfx',
    cooldownMs: 3000,
    layers: [
      sample(['world/bus-slam'], -7, { rate: 0.78, pitchVar: 0.03 }),
      sample(['world/metal-hit'], -15, { delayMs: 30, rate: 0.85 }),
      synth('horn-tap', -11, { delayMs: 380 }),
      synth('horn-tap', -13, { delayMs: 560 }),
      sample(['money/coins-2'], -9, { delayMs: 760 }),
      { kind: 'speech', lines: CONDUCTOR_LINES, chance: 1, delayMs: 250 },
    ],
  },
  // Spraying naira at an owambe: a cascade of notes fluttering left and right, with the odd coin.
  spray: {
    bus: 'sfx',
    cooldownMs: 180,
    layers: [
      sample(['money/notes-1', 'money/notes-2', 'money/notes-3', 'money/notes-4'], -9, {
        pan: 'random',
        pitchVar: 0.1,
        repeat: { count: [5, 9], spacingMs: [45, 110], decayDb: 0.7 },
      }),
      sample(['money/notes-fan'], -12, { pan: 'random' }),
      sample(['money/coins-2'], -16, { delayMs: 220, pan: 'random' }),
    ],
  },
} as const satisfies Readonly<Record<SfxId, SfxRecipe>>;

/** Stingers for `celebrate` events (peak-end moments). */
export const STINGERS = {
  milestone: {
    bus: 'ui',
    cooldownMs: 2000,
    group: STINGER_GROUP,
    duck: { depthDb: -15, holdMs: 2500 },
    layers: [sample(['jingles/sax-02', 'jingles/sax-10', 'jingles/sax-15', 'jingles/steel-10', 'jingles/steel-15'], -2, { pitchVar: 0, allowLate: true })],
  },
  achievement: {
    bus: 'ui',
    cooldownMs: 1200,
    group: STINGER_GROUP,
    duck: { depthDb: -10, holdMs: 1400 },
    layers: [sample(['jingles/steel-08', 'jingles/sax-13', 'jingles/steel-13', 'jingles/pizzi-10'], -4, { pitchVar: 0, allowLate: true })],
  },
  goal: {
    bus: 'ui',
    cooldownMs: 800,
    group: STINGER_GROUP,
    duck: { depthDb: -6, holdMs: 900 },
    layers: [synth('goal-pluck', -6), sample(['ui/pluck-1'], -14, { pitchVar: 0 })],
  },
} as const satisfies Readonly<Record<CelebrationKind, SfxRecipe>>;

/** Loaded right after the audio unlock: everything that answers a tap within 100 ms. */
export const CORE_SAMPLES: readonly AudioAssetKey[] = [
  'ui/click-1',
  'ui/click-2',
  'ui/click-3',
  'ui/open-1',
  'ui/open-2',
  'ui/close-1',
  'ui/close-2',
  'ui/success-1',
  'ui/success-2',
  'ui/error-1',
  'ui/error-2',
  'ui/notify-1',
  'ui/notify-2',
  'money/coins-1',
  'money/coins-2',
  'money/chips-stack-1',
  'money/chips-stack-2',
  'money/chips-stack-3',
  'money/chip-lay-1',
  'money/chip-lay-2',
  'money/chips-handle-1',
];

/** Every sample a recipe can reach (for idle preloading and asset tests). */
export function recipeSamples(recipes: ReadonlyArray<SfxRecipe>): AudioAssetKey[] {
  const keys = new Set<AudioAssetKey>();
  for (const recipe of recipes) {
    for (const layer of recipe.layers) {
      if (layer.kind !== 'sample') continue;
      for (const key of layer.variants) keys.add(key);
      for (const key of layer.indoorVariants ?? []) keys.add(key);
    }
  }
  return [...keys];
}
