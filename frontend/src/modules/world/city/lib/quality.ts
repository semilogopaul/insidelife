import type { GraphicsQuality } from '@/common/game/ui-store';

export type QualityTier = 'low' | 'medium' | 'high';

/** Everything the city scales with the graphics setting (and the performance monitor's verdict). */
export interface QualityProfile {
  readonly tier: QualityTier;
  readonly dpr: readonly [number, number];
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  /** Clear-weather fog far plane = draw distance (metres). */
  readonly fogFar: number;
  /** Chunks further than this use simplified buildings. */
  readonly lodDistance: number;
  /** Chunks further than this are not drawn at all. */
  readonly cullDistance: number;
  readonly rainDrops: number;
  /** 0–1 share of decorative props (grass tufts, flowers, cones) to keep. */
  readonly propDensity: number;
}

const PROFILES: Readonly<Record<QualityTier, Omit<QualityProfile, 'tier'>>> = {
  high: { dpr: [1, 1.75], shadows: true, shadowMapSize: 2048, fogFar: 370, lodDistance: 82, cullDistance: 385, rainDrops: 2400, propDensity: 1 },
  medium: { dpr: [1, 1.5], shadows: true, shadowMapSize: 1024, fogFar: 300, lodDistance: 64, cullDistance: 310, rainDrops: 1500, propDensity: 0.8 },
  low: { dpr: [1, 1], shadows: false, shadowMapSize: 512, fogFar: 230, lodDistance: 48, cullDistance: 240, rainDrops: 700, propDensity: 0.55 },
};

const ORDER: readonly QualityTier[] = ['low', 'medium', 'high'];

export function isCoarseDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
  } catch {
    return false;
  }
}

/** `auto` starts high on desktop and medium on phones; every performance decline drops one tier (never below low). */
export function resolveQuality(setting: GraphicsQuality, coarse: boolean, declines: number): QualityProfile {
  const base: QualityTier = setting === 'auto' ? (coarse ? 'medium' : 'high') : setting;
  const index = Math.max(0, ORDER.indexOf(base) - (setting === 'auto' ? declines : 0));
  const tier = ORDER[index] ?? 'low';
  const profile = PROFILES[tier];
  // Phones never exceed DPR 1.5.
  const dpr: readonly [number, number] = coarse ? [1, Math.min(1.5, profile.dpr[1])] : profile.dpr;
  return { tier, ...profile, dpr };
}
