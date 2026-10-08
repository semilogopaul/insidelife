/**
 * Deterministic, seedable randomness.
 *
 * Gameplay never uses `Math.random`. Every roll is derived from a stable key
 * (e.g. `characterSeed:illness:day-1234`) so that re-requesting, refreshing or
 * replaying a settlement can never re-roll an outcome — the classic exploit in
 * client-trusting life sims.
 */

/** 32-bit string hash (cyrb53 folded to 32 bits). */
export function hashString(input: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Mulberry32 PRNG: fast, small state, good enough distribution for games. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Weighted<T> {
  readonly value: T;
  readonly weight: number;
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** True with probability `p` (clamped to [0, 1]). */
  chance(p: number): boolean;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  float(min: number, max: number): number;
  /** Standard normal sample (Box-Muller). */
  normal(mean?: number, stdDev?: number): number;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly Weighted<T>[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number | string): Rng {
  const next = mulberry32(typeof seed === 'number' ? seed : hashString(seed));
  const rng: Rng = {
    next,
    chance: (p) => next() < Math.min(1, Math.max(0, p)),
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    float: (min, max) => next() * (max - min) + min,
    normal: (mean = 0, stdDev = 1) => {
      const u = Math.max(next(), Number.EPSILON);
      const v = next();
      return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (items) => {
      if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted: (items) => {
      const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
      if (total <= 0) throw new RangeError('Weighted pick needs a positive total weight');
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, item.weight);
        if (roll < 0) return item.value;
      }
      return (items[items.length - 1] as Weighted<(typeof items)[number]['value']>).value;
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
  };
  return rng;
}

/** Build an RNG from a list of key parts, e.g. `rngFor(seed, 'illness', day)`. */
export function rngFor(...parts: ReadonlyArray<string | number>): Rng {
  return createRng(parts.join(':'));
}
