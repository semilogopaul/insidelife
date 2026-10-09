import type { BufferGeometry } from 'three';
import type { Appearance, Gender } from '@insidelife/shared';
import type { FabricSpec } from '../../materials/fabric-patterns';
import { outfitKey, withBaseLayer, type ResolvedOutfit } from '../outfit';
import { computeRig, type RigMetrics } from '../rig';
import { buildAccessory, buildEyewear, buildHeadwear, buildProps, buildShoes } from './accessories';
import { buildBody } from './body';
import { BuildContext, type AvatarLod } from './context';
import { buildBottom, buildFull, buildTop } from './garments';
import { buildHair } from './hair';
import { buildHead } from './head';

export type { AvatarLod } from './context';

export interface AvatarBuild {
  readonly geometry: BufferGeometry;
  /** Material slot per geometry group: `base`, `face`, or `fabric:<key>`. */
  readonly slots: readonly string[];
  readonly fabrics: ReadonlyMap<string, FabricSpec>;
  readonly rig: RigMetrics;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface AvatarBuildInput {
  readonly appearance: Appearance;
  readonly gender: Gender;
  readonly outfit: ResolvedOutfit;
  readonly lod: AvatarLod;
}

/** Everything that changes the built mesh (cache key). */
export function avatarBuildKey(input: AvatarBuildInput): string {
  const a = input.appearance;
  return [input.lod, input.gender, a.bodyType, a.height.toFixed(2), a.skinTone, a.hairStyle, a.hairColor, a.facialHair, a.eyeStyle, outfitKey(input.outfit)].join('#');
}

const slotOrder = (slot: string): number => (slot === 'base' ? 0 : slot === 'face' ? 2 : 1);

/** Build the merged, skinned avatar geometry. Pure CPU work (~2-8 ms high, <1 ms low). */
export function buildAvatar(input: AvatarBuildInput): AvatarBuild {
  const rig = computeRig(input.appearance, input.gender);
  const outfit = withBaseLayer(input.outfit);
  const ctx = new BuildContext({ ...input, outfit }, rig);

  buildBody(ctx);
  buildHead(ctx);
  const headwear = outfit.headwear?.style;
  const hair = buildHair(ctx, input.appearance.hairStyle, headwear);

  if (outfit.full) buildFull(ctx, outfit.full);
  else {
    if (outfit.bottom) buildBottom(ctx, outfit.bottom);
    if (outfit.top) buildTop(ctx, outfit.top);
  }
  if (outfit.shoes) buildShoes(ctx, outfit.shoes);
  if (outfit.headwear) buildHeadwear(ctx, outfit.headwear, hair);
  if (outfit.eyewear) buildEyewear(ctx, outfit.eyewear);
  if (outfit.accessory) buildAccessory(ctx, outfit.accessory, hair, Boolean(outfit.headwear));
  buildProps(ctx);

  const built = ctx.builder.build(slotOrder);
  return { geometry: built.geometry, slots: built.slots, fabrics: ctx.fabrics, rig, vertexCount: built.vertexCount, triangleCount: built.triangleCount };
}
