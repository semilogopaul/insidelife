import type { AvatarClip, AvatarStance, OutfitTheme } from '@/common/three/avatar';
import type { Palette } from '../kit/furniture-kit';
import type { KitModel } from '../kit/kit-manifest';
import type { At, Deg, FurniturePlacement, HomeSlot, NpcSpot, Spot } from './types';

/** Mattress top of the kit beds (×1.5): where a sleeping avatar lies. */
export const BED_TOP = 0.4;
/** Kit bar stools (×1.5) are 0.65 m tall: someone on one sits this much higher than on a chair. */
export const BAR_STOOL_LIFT = 0.29;
/** Kit sofas sit a touch lower than chairs. */
export const SOFA_SEAT_DROP = -0.02;

export function place(model: KitModel, at: At, rot: Deg = 0, extra: { readonly y?: number; readonly scale?: number; readonly palette?: Palette; readonly slot?: HomeSlot } = {}): FurniturePlacement {
  return { model, at, rot, ...extra };
}

/** `count` copies from `start`, stepping by `step`. */
export function row(model: KitModel, count: number, start: At, step: At, rot: Deg = 0, extra: { readonly y?: number; readonly palette?: Palette; readonly slot?: HomeSlot } = {}): FurniturePlacement[] {
  return Array.from({ length: count }, (_, i) => place(model, [start[0] + step[0] * i, start[1] + step[1] * i], rot, extra));
}

/** Points on a grid (rows × cols) centred on `centre`. */
export function gridPoints(cols: number, rows: number, centre: At, spacing: At): At[] {
  const points: At[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) points.push([centre[0] + (c - (cols - 1) / 2) * spacing[0], centre[1] + (r - (rows - 1) / 2) * spacing[1]]);
  }
  return points;
}

/** Offset `distance` along the facing of `rot` (0 = +Z). */
export function forward(at: At, rot: Deg, distance: number): At {
  const a = (rot * Math.PI) / 180;
  return [at[0] + Math.sin(a) * distance, at[1] + Math.cos(a) * distance];
}

export function stand(at: At, rot: Deg, animation: AvatarClip = 'idle'): Spot {
  return { at, rot, animation };
}

/** Sitting on a seat centred at `at` facing `rot` (kit chairs, benches, sofas). */
export function seat(at: At, rot: Deg, animation: AvatarClip = 'sit', options: { readonly stance?: AvatarStance; readonly props?: boolean; readonly y?: number } = {}): Spot {
  const [x, z] = forward(at, rot, 0.05);
  return { at: options.y !== undefined ? [x, options.y, z] : [x, z], rot, animation, stance: options.stance ?? 'sit', props: options.props };
}

/** Lying on a kit bed centred at `at` (headboard towards -Z when rot = 0). */
export function bed(at: At, rot: Deg = 0, top = BED_TOP): Spot {
  return { at: [at[0], top, at[1]], rot, animation: 'sleep' };
}

export function npc(spot: Spot, theme: OutfitTheme, extra: Partial<Pick<NpcSpot, 'gender' | 'lod'>> = {}): NpcSpot {
  return { ...spot, theme, ...extra };
}
