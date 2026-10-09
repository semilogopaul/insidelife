import type { HomeSlot } from '../templates/types';

/** Procedural props (anything Kenney's kit doesn't have, made for Lagos). Positions in room space. */

type At = readonly [number, number];
type Vec3 = readonly [number, number, number];

interface Base {
  readonly at: At;
  /** Degrees about +Y (0 faces +Z). */
  readonly rot?: number;
  readonly y?: number;
  /** Home belongings this prop stands for (see `HomeSlot`). */
  readonly slot?: HomeSlot;
}

export type SurfaceKind = 'wood' | 'metal' | 'plastic' | 'cloth' | 'stone' | 'gloss' | 'paint' | 'rubber';

export type PropSpec =
  | (Base & { readonly kind: 'box'; readonly size: Vec3; readonly color: string; readonly surface?: SurfaceKind; readonly round?: number })
  | (Base & {
      readonly kind: 'sign';
      readonly size: readonly [number, number];
      readonly lines: readonly string[];
      readonly bg: string;
      readonly fg: string;
      readonly accent?: string;
      /** Mounted flat on a wall (no legs). Otherwise it stands on two legs. */
      readonly wall?: boolean;
      readonly frame?: string;
      readonly style?: 'painted' | 'board' | 'poster' | 'screen';
    })
  | (Base & { readonly kind: 'pot'; readonly r?: number; readonly color?: string })
  | (Base & { readonly kind: 'cooler'; readonly color: string })
  | (Base & { readonly kind: 'bucket'; readonly color: string })
  | (Base & { readonly kind: 'gas-cooker' })
  | (Base & { readonly kind: 'plastic-chair'; readonly color?: string })
  | (Base & { readonly kind: 'bench'; readonly length: number; readonly color?: string })
  | (Base & { readonly kind: 'pew'; readonly length: number; readonly color?: string })
  | (Base & { readonly kind: 'seat-row'; readonly count: number; readonly color: string; readonly frame?: string })
  | (Base & { readonly kind: 'canopy'; readonly size: readonly [number, number]; readonly color: string; readonly trim?: string; readonly height?: number })
  | (Base & { readonly kind: 'stall'; readonly goods: 'tomatoes' | 'fabric' | 'phones' | 'shoes' | 'peppers'; readonly umbrella: string })
  | (Base & { readonly kind: 'umbrella'; readonly color: string; readonly color2?: string })
  | (Base & { readonly kind: 'shelf'; readonly size: Vec3; readonly items: 'bottles' | 'boxes' | 'clothes' | 'books' | 'drugs'; readonly color?: string })
  | (Base & { readonly kind: 'iv-stand' })
  | (Base & { readonly kind: 'curtain'; readonly length: number; readonly color: string; readonly height?: number })
  | (Base & { readonly kind: 'dj-booth' })
  | (Base & { readonly kind: 'speaker-stack'; readonly height?: number })
  | (Base & { readonly kind: 'bar-counter'; readonly length: number; readonly color?: string; readonly top?: string })
  | (Base & { readonly kind: 'stage'; readonly size: readonly [number, number]; readonly height?: number; readonly color: string; readonly trim?: string })
  | (Base & { readonly kind: 'rope'; readonly length: number; readonly color?: string })
  | (Base & { readonly kind: 'arch'; readonly width: number; readonly height: number; readonly color: string; readonly trim?: string })
  | (Base & { readonly kind: 'mat'; readonly size: readonly [number, number]; readonly color: string; readonly border?: string })
  | (Base & { readonly kind: 'cross'; readonly color?: string })
  | (Base & { readonly kind: 'lectern'; readonly color?: string })
  | (Base & { readonly kind: 'treadmill' })
  | (Base & { readonly kind: 'bench-press' })
  | (Base & { readonly kind: 'dumbbell-rack' })
  | (Base & { readonly kind: 'punching-bag' })
  | (Base & { readonly kind: 'salon-chair'; readonly color?: string })
  | (Base & { readonly kind: 'mirror'; readonly size: readonly [number, number]; readonly frame?: string })
  | (Base & { readonly kind: 'hood-dryer' })
  | (Base & { readonly kind: 'luggage'; readonly color: string })
  | (Base & { readonly kind: 'flag' })
  | (Base & { readonly kind: 'water-dispenser' })
  | (Base & { readonly kind: 'lantern' })
  | (Base & { readonly kind: 'mattress'; readonly size: readonly [number, number]; readonly color: string })
  | (Base & { readonly kind: 'danfo' })
  | (Base & { readonly kind: 'grill' })
  | (Base & { readonly kind: 'generator' })
  | (Base & { readonly kind: 'chandelier'; readonly height: number })
  | (Base & { readonly kind: 'balloons'; readonly colors: readonly string[] })
  | (Base & { readonly kind: 'cake' })
  | (Base & { readonly kind: 'car-platform'; readonly r?: number })
  | (Base & { readonly kind: 'pillar'; readonly height: number; readonly color: string })
  | (Base & { readonly kind: 'planter'; readonly size: readonly [number, number] })
  | (Base & { readonly kind: 'drink-crate'; readonly color?: string })
  | (Base & { readonly kind: 'bottles'; readonly count?: number })
  | (Base & { readonly kind: 'food-plate'; readonly food?: 'jollof' | 'amala' | 'suya' })
  | (Base & { readonly kind: 'stairs'; readonly size: Vec3; readonly color: string })
  | (Base & { readonly kind: 'table-cloth'; readonly size: Vec3; readonly color: string; readonly trim?: string })
  | (Base & { readonly kind: 'clothesline'; readonly length: number; readonly height?: number; readonly colors: readonly string[] })
  | (Base & { readonly kind: 'aircon' })
  | (Base & { readonly kind: 'aquarium'; readonly size: Vec3 })
  | (Base & { readonly kind: 'standing-fan' })
  | (Base & { readonly kind: 'wall-clock' })
  | (Base & { readonly kind: 'projector-screen'; readonly size: readonly [number, number] });

export type PropKind = PropSpec['kind'];
