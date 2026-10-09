import { Color, Matrix4, Euler, Quaternion, Vector3, type BufferGeometry } from 'three';
import { HAIR_COLORS, SKIN_TONES, type Appearance, type ClothingDefinition, type Gender } from '@insidelife/shared';
import { PartBuilder, type PartStyle, type SkinBinding, type Surface } from '../../geometry/part-builder';
import { fabricAverageColor, fabricKey, normalizeFabricSpec, type FabricSpec, type PatternVariant } from '../../materials/fabric-patterns';
import { mixHex, shadeHex } from '../../materials/color-utils';
import type { ResolvedOutfit } from '../outfit';
import type { RigMetrics } from '../rig';

export type AvatarLod = 'high' | 'low';

/** Baked surface presets: [roughness, metalness]. */
export const SURFACE = {
  skin: [0.52, 0],
  hair: [0.72, 0],
  hairSilky: [0.42, 0],
  cloth: [0.9, 0],
  knit: [1, 0],
  silk: [0.42, 0.04],
  leather: [0.42, 0],
  rubber: [0.88, 0],
  plastic: [0.38, 0],
  gloss: [0.22, 0],
  metal: [0.3, 0.85],
  gold: [0.26, 1],
  lens: [0.08, 0.35],
  eye: [0.2, 0],
} as const satisfies Record<string, Surface>;

/** Max textured prints per avatar (each is one draw call). Extra prints fall back to their average colour. */
const MAX_FABRIC_SLOTS = 3;

export interface BuildInput {
  readonly appearance: Appearance;
  readonly gender: Gender;
  readonly outfit: ResolvedOutfit;
  readonly lod: AvatarLod;
}

/** Linear colour from an sRGB hex. */
export function lin(hex: string): Color {
  return new Color().setStyle(hex);
}

export class BuildContext {
  readonly builder = new PartBuilder({ skinned: true });
  readonly high: boolean;
  readonly skinHex: string;
  readonly hairHex: string;
  readonly skin: Color;
  readonly hair: Color;
  /** Fabric specs by slot key (`fabric:<key>`). */
  readonly fabrics = new Map<string, FabricSpec>();
  /** How far the outermost garment sits off the chest (accessories go on top of it). */
  chestInflate = 0.012;

  constructor(
    readonly input: BuildInput,
    readonly rig: RigMetrics,
  ) {
    this.high = input.lod === 'high';
    this.skinHex = SKIN_TONES[input.appearance.skinTone] ?? SKIN_TONES[3];
    this.hairHex = HAIR_COLORS[input.appearance.hairColor] ?? HAIR_COLORS[0];
    this.skin = lin(this.skinHex);
    this.hair = lin(this.hairHex);
  }

  get outfit(): ResolvedOutfit {
    return this.input.outfit;
  }

  /** Segment count by LOD. */
  seg(high: number, low: number): number {
    return this.high ? high : low;
  }

  add(geometry: BufferGeometry, style: PartStyle, matrix?: Matrix4): void {
    this.builder.add(geometry, style, matrix);
  }

  skinStyle(skin: SkinBinding, shade = 0.18, tint = 0): PartStyle {
    return { slot: 'base', color: tint === 0 ? this.skin : lin(shadeHex(this.skinHex, tint)), surface: SURFACE.skin, skin, shade };
  }

  hairStyle(skin: SkinBinding, shade = 0.25, surface: Surface = SURFACE.hair): PartStyle {
    return { slot: 'base', color: this.hair, surface, skin, shade };
  }

  solid(hex: string, surface: Surface, skin: SkinBinding, shade = 0.15): PartStyle {
    return { slot: 'base', color: lin(hex), surface, skin, shade };
  }

  /**
   * Style for a garment's main fabric. Prints get their own textured slot (shared material per print); solids and
   * the low LOD bake the (average) colour into the base slot.
   */
  cloth(item: ClothingDefinition, skin: SkinBinding, options: { readonly shade?: number; readonly surface?: Surface; readonly variant?: PatternVariant; readonly tint?: number } = {}): PartStyle {
    const shade = options.shade ?? 0.22;
    const surface = options.surface ?? (item.pattern === 'aso-oke' || item.pattern === 'lace' ? SURFACE.silk : SURFACE.cloth);
    const spec = normalizeFabricSpec({ ...item, variant: options.variant });
    if (spec.pattern !== 'solid' && this.high) {
      const slot = `fabric:${fabricKey(spec)}`;
      if (this.fabrics.has(slot) || this.fabrics.size < MAX_FABRIC_SLOTS) {
        this.fabrics.set(slot, spec);
        const tint = options.tint ?? 0;
        return { slot, color: tint === 0 ? new Color(1, 1, 1) : lin(shadeHex('#ffffff', tint)), surface, skin, shade };
      }
    }
    const base = spec.pattern === 'solid' ? spec.primary : fabricAverageColor(spec);
    return { slot: 'base', color: lin(options.tint ? shadeHex(base, options.tint) : base), surface, skin, shade };
  }

  /** Trim colour (collars, cuffs, piping, embroidery): the item's secondary. */
  trim(item: ClothingDefinition, skin: SkinBinding, surface: Surface = SURFACE.cloth, shade = 0.12): PartStyle {
    return this.solid(item.secondary, surface, skin, shade);
  }

  /** A darker/lighter variant of the item's primary (seams, soles, inner linings). */
  tone(item: ClothingDefinition, amount: number, skin: SkinBinding, surface: Surface = SURFACE.cloth): PartStyle {
    return this.solid(shadeHex(item.primary, amount), surface, skin, 0.12);
  }

  /** Mix of two hexes as a style. */
  mix(a: string, b: string, t: number, surface: Surface, skin: SkinBinding): PartStyle {
    return this.solid(mixHex(a, b, t), surface, skin);
  }
}

const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpS = new Vector3();
const tmpP = new Vector3();

/** Compose a transform: translation, Euler rotation (radians), scale. */
export function xf(position: readonly [number, number, number], rotation: readonly [number, number, number] = [0, 0, 0], scale: number | readonly [number, number, number] = 1): Matrix4 {
  tmpE.set(rotation[0], rotation[1], rotation[2]);
  tmpQ.setFromEuler(tmpE);
  if (typeof scale === 'number') tmpS.setScalar(scale);
  else tmpS.set(scale[0], scale[1], scale[2]);
  tmpP.set(position[0], position[1], position[2]);
  return new Matrix4().compose(tmpP, tmpQ, tmpS);
}

