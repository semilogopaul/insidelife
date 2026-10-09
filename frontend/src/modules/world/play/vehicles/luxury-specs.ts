import type { LuxuryBodyModel } from '@insidelife/shared';
import type { SwatchName } from './proc-vehicles';

/**
 * Shapes of the procedural luxury bodies (pure data, shared by the mesh builder and the driving physics). Each
 * follows the silhouette people recognise but none copies a real car's signature details (no hexagon vents,
 * horseshoe grille, slatted grilles or famous badges). Metres, +z forward, side profiles as (z, y) points.
 */

export type Point = readonly [z: number, y: number];

export interface BodySpec {
  readonly width: number;
  readonly clearance: number;
  readonly wheelRadius: number;
  readonly frontAxle: number;
  readonly rearAxle: number;
  /** Rear-bottom up to where the glasshouse starts (z, y), rear to front. */
  readonly rear: readonly Point[];
  /** Glasshouse top line from the rear pillar base over the roof to the windscreen base. */
  readonly cabin: readonly Point[];
  /** From the windscreen base over the bonnet down to the front-bottom. */
  readonly front: readonly Point[];
  /** How much narrower the glass is than the body (each side). */
  readonly glassInset: number;
  readonly grille: 'chrome-block' | 'dark-block' | 'intake';
  readonly lights: 'slim' | 'square' | 'tall';
  readonly wing?: boolean;
  readonly ornament?: boolean;
  /** Fender flares over the wheels (off-roaders). */
  readonly flares?: boolean;
  readonly rims: SwatchName;
}

export const LUXURY_SPECS: Readonly<Record<LuxuryBodyModel, BodySpec>> = {
  // Low wedge, long raked windscreen, engine behind the cabin, rear wing.
  supercar: {
    width: 2.45,
    clearance: 0.18,
    wheelRadius: 0.42,
    frontAxle: 1.45,
    rearAxle: -1.35,
    rear: [[-2.3, 0.3], [-2.34, 0.8], [-1.85, 0.96], [-1.0, 1.02]],
    cabin: [[-1.0, 1.02], [-0.55, 1.42], [0.05, 1.48], [1.15, 1.0]],
    front: [[1.15, 1.0], [1.75, 0.98], [2.22, 0.62], [2.3, 0.3]],
    glassInset: 0.22,
    grille: 'intake',
    lights: 'slim',
    wing: true,
    rims: 'black',
  },
  // Rounded hypercar: short overhangs, smooth dome cabin, plain oval intake.
  hypercar: {
    width: 2.45,
    clearance: 0.18,
    wheelRadius: 0.44,
    frontAxle: 1.38,
    rearAxle: -1.3,
    rear: [[-2.17, 0.3], [-2.22, 0.9], [-1.65, 1.04], [-0.95, 1.08]],
    cabin: [[-0.95, 1.08], [-0.45, 1.46], [0.3, 1.52], [1.05, 1.04]],
    front: [[1.05, 1.04], [1.75, 1.0], [2.15, 0.66], [2.2, 0.32]],
    glassInset: 0.26,
    grille: 'intake',
    lights: 'slim',
    wing: true,
    rims: 'chrome',
  },
  // Long bonnet, fastback roof, short tail (grand tourers and sports coupes).
  'gt-coupe': {
    width: 2.35,
    clearance: 0.2,
    wheelRadius: 0.45,
    frontAxle: 1.45,
    rearAxle: -1.4,
    rear: [[-2.25, 0.35], [-2.28, 0.98], [-1.9, 1.08], [-1.55, 1.1]],
    cabin: [[-1.55, 1.1], [-0.65, 1.7], [0.2, 1.76], [0.78, 1.14]],
    front: [[0.78, 1.14], [1.9, 1.06], [2.22, 0.76], [2.25, 0.36]],
    glassInset: 0.2,
    grille: 'dark-block',
    lights: 'slim',
    rims: 'chrome',
  },
  // Long, tall and formal: upright nose, near-flat roof, separate boot, chrome grille block and bonnet ornament.
  limousine: {
    width: 2.45,
    clearance: 0.24,
    wheelRadius: 0.52,
    frontAxle: 1.85,
    rearAxle: -1.75,
    rear: [[-2.7, 0.42], [-2.73, 1.15], [-2.35, 1.27], [-1.75, 1.29]],
    cabin: [[-1.75, 1.29], [-1.32, 2.04], [0.75, 2.1], [1.28, 1.32]],
    front: [[1.28, 1.32], [2.52, 1.27], [2.7, 1.12], [2.73, 0.44]],
    glassInset: 0.2,
    grille: 'chrome-block',
    lights: 'square',
    ornament: true,
    rims: 'chrome',
  },
  // The box: flat sides, upright windscreen, flat roof, high off the ground, flared arches.
  'box-suv': {
    width: 2.45,
    clearance: 0.5,
    wheelRadius: 0.52,
    frontAxle: 1.5,
    rearAxle: -1.45,
    rear: [[-2.27, 0.52], [-2.27, 1.48], [-2.2, 1.5]],
    cabin: [[-2.2, 1.5], [-2.2, 2.42], [0.95, 2.44], [1.12, 1.5]],
    front: [[1.12, 1.5], [2.2, 1.46], [2.27, 1.32], [2.27, 0.52]],
    glassInset: 0.14,
    grille: 'dark-block',
    lights: 'square',
    flares: true,
    rims: 'black',
  },
  // Big, upright, long three-row luxury SUV with a tall chrome grille.
  'grand-suv': {
    width: 2.5,
    clearance: 0.42,
    wheelRadius: 0.53,
    frontAxle: 1.7,
    rearAxle: -1.65,
    rear: [[-2.5, 0.46], [-2.52, 1.36], [-2.42, 1.38]],
    cabin: [[-2.42, 1.38], [-2.24, 2.26], [0.8, 2.3], [1.36, 1.4]],
    front: [[1.36, 1.4], [2.4, 1.35], [2.5, 1.16], [2.52, 0.46]],
    glassInset: 0.16,
    grille: 'chrome-block',
    lights: 'tall',
    rims: 'chrome',
  },
  // Sporty SUV: sloping coupe roof, aggressive nose, big wheels.
  'coupe-suv': {
    width: 2.45,
    clearance: 0.36,
    wheelRadius: 0.5,
    frontAxle: 1.6,
    rearAxle: -1.55,
    rear: [[-2.4, 0.42], [-2.43, 1.2], [-2.1, 1.28], [-2.02, 1.29]],
    cabin: [[-2.02, 1.29], [-1.1, 1.92], [0.4, 2.0], [1.15, 1.3]],
    front: [[1.15, 1.3], [2.25, 1.16], [2.4, 0.9], [2.43, 0.42]],
    glassInset: 0.18,
    grille: 'dark-block',
    lights: 'slim',
    rims: 'black',
  },
};

/** Height of the body's top line (beltline, bonnet, boot) at `z`. */
export function topAt(spec: BodySpec, z: number): number {
  const line = [...spec.rear, ...spec.front];
  let best = 0;
  for (let i = 1; i < line.length; i++) {
    const [z0, y0] = line[i - 1] as Point;
    const [z1, y1] = line[i] as Point;
    if (z < Math.min(z0, z1) || z > Math.max(z0, z1) || z0 === z1) continue;
    best = Math.max(best, y0 + ((z - z0) / (z1 - z0)) * (y1 - y0));
  }
  return best;
}

/** Half the body length (m), for the driving physics. */
export function luxuryHalfLength(model: LuxuryBodyModel): number {
  const spec = LUXURY_SPECS[model];
  return ((spec.front[spec.front.length - 1] as Point)[0] - (spec.rear[0] as Point)[0]) / 2;
}
