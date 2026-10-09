import type { Appearance, BodyType, Gender } from '@insidelife/shared';
import type { SkinWeights } from '../geometry/part-builder';

/**
 * Skeleton definition and body metrics for the chibi avatar (~1.4 m, big head, short limbs).
 *
 * Conventions (model space, bind pose): the avatar stands on y = 0 facing +Z; its left side is +X. Every bone binds
 * with identity rotation, so poses are plain Euler rotations: `x` bends forward/back (thigh.x < 0 swings the leg
 * forward, shin.x > 0 bends the knee, chest.x > 0 leans forward), left-arm `z` > 0 raises it sideways (right arm
 * mirrored).
 */

export const AVATAR_PROPS = ['phone', 'book', 'bowl', 'spoon', 'ladle', 'laptop', 'wheel', 'dumbbell', 'cup'] as const;
export type AvatarProp = (typeof AVATAR_PROPS)[number];

export const BONE_NAMES = [
  'root',
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'upperArmL',
  'foreArmL',
  'handL',
  'upperArmR',
  'foreArmR',
  'handR',
  'thighL',
  'shinL',
  'footL',
  'thighR',
  'shinR',
  'footR',
  'propPhone',
  'propBook',
  'propBowl',
  'propSpoon',
  'propLadle',
  'propLaptop',
  'propWheel',
  'propDumbbell',
  'propCup',
] as const;
export type BoneName = (typeof BONE_NAMES)[number];

export const BONE: Readonly<Record<BoneName, number>> = Object.fromEntries(BONE_NAMES.map((name, index) => [name, index])) as Record<BoneName, number>;
export const BONE_COUNT = BONE_NAMES.length;

export const BONE_PARENT: Readonly<Record<BoneName, BoneName | null>> = {
  root: null,
  hips: 'root',
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  upperArmL: 'chest',
  foreArmL: 'upperArmL',
  handL: 'foreArmL',
  upperArmR: 'chest',
  foreArmR: 'upperArmR',
  handR: 'foreArmR',
  thighL: 'hips',
  shinL: 'thighL',
  footL: 'shinL',
  thighR: 'hips',
  shinR: 'thighR',
  footR: 'shinR',
  propPhone: 'handR',
  propBook: 'chest',
  propBowl: 'handL',
  propSpoon: 'handR',
  propLadle: 'handR',
  propLaptop: 'hips',
  propWheel: 'root',
  propDumbbell: 'handR',
  propCup: 'handR',
};

export const PROP_BONE: Readonly<Record<AvatarProp, BoneName>> = {
  phone: 'propPhone',
  book: 'propBook',
  bowl: 'propBowl',
  spoon: 'propSpoon',
  ladle: 'propLadle',
  laptop: 'propLaptop',
  wheel: 'propWheel',
  dumbbell: 'propDumbbell',
  cup: 'propCup',
};

/** Where props sit relative to their parent bone in bind pose (metres). */
export const PROP_OFFSET: Readonly<Record<AvatarProp, readonly [number, number, number]>> = {
  phone: [0, -0.06, 0.02],
  book: [0, -0.1, 0.2],
  bowl: [0, -0.05, 0.03],
  spoon: [0, -0.05, 0.02],
  ladle: [0, -0.05, 0.02],
  laptop: [0, 0.02, 0.2],
  wheel: [0, 0.62, 0.3],
  dumbbell: [0, -0.05, 0],
  cup: [0, -0.06, 0.03],
};

export type Vec3 = readonly [number, number, number];

export interface TorsoShape {
  readonly hipW: number;
  readonly hipD: number;
  readonly waistW: number;
  readonly waistD: number;
  readonly chestW: number;
  readonly chestD: number;
  readonly shoulderW: number;
  /** Extra chest depth for the bust (subtle). */
  readonly bust: number;
}

export interface RigMetrics {
  readonly heightScale: number;
  readonly headScale: number;
  readonly gender: Gender;
  readonly bodyType: BodyType;
  // Legs
  readonly ankleY: number;
  readonly kneeY: number;
  readonly hipY: number;
  readonly legX: number;
  readonly thighR: number;
  readonly kneeR: number;
  readonly shinR: number;
  readonly ankleR: number;
  // Torso
  readonly crotchY: number;
  readonly waistY: number;
  readonly chestY: number;
  readonly shoulderTopY: number;
  readonly neckR: number;
  readonly torso: TorsoShape;
  // Arms
  readonly shoulderX: number;
  readonly shoulderY: number;
  readonly elbowY: number;
  readonly wristY: number;
  readonly upperArmR: number;
  readonly foreArmR: number;
  readonly hand: Vec3;
  // Head
  readonly headBaseY: number;
  readonly headCenterY: number;
  readonly head: Vec3;
  /** Bind-pose positions (model space) for every bone. */
  readonly bones: Readonly<Record<BoneName, Vec3>>;
}

interface BodyFactors {
  readonly torsoW: number;
  readonly torsoD: number;
  readonly hipW: number;
  readonly hipD: number;
  readonly waistW: number;
  readonly chestW: number;
  readonly chestD: number;
  readonly shoulder: number;
  readonly arm: number;
  readonly leg: number;
  readonly neck: number;
}

const BODY_FACTORS: Readonly<Record<BodyType, BodyFactors>> = {
  slim: { torsoW: 0.88, torsoD: 0.88, hipW: 1, hipD: 1, waistW: 0.96, chestW: 1, chestD: 1, shoulder: 0.93, arm: 0.86, leg: 0.86, neck: 0.9 },
  average: { torsoW: 1, torsoD: 1, hipW: 1, hipD: 1, waistW: 1, chestW: 1, chestD: 1, shoulder: 1, arm: 1, leg: 1, neck: 1 },
  curvy: { torsoW: 1, torsoD: 1, hipW: 1.2, hipD: 1.14, waistW: 0.93, chestW: 1, chestD: 1.06, shoulder: 0.97, arm: 1.04, leg: 1.16, neck: 1 },
  broad: { torsoW: 1.08, torsoD: 1.1, hipW: 1.02, hipD: 1, waistW: 1.08, chestW: 1.12, chestD: 1.06, shoulder: 1.12, arm: 1.16, leg: 1.1, neck: 1.15 },
};

/** Body metrics for an appearance. Pure and deterministic. */
export function computeRig(appearance: Appearance, gender: Gender = 'male'): RigMetrics {
  const hs = Math.min(1.08, Math.max(0.92, appearance.height || 1));
  const headScale = 1 + (hs - 1) * 0.4;
  const f = BODY_FACTORS[appearance.bodyType] ?? BODY_FACTORS.average;
  const fem = gender === 'female';
  const y = (v: number): number => v * hs;

  const ankleY = y(0.08);
  const kneeY = y(0.245);
  const hipY = y(0.42);
  const crotchY = y(0.4);
  const waistY = y(0.565);
  const chestY = y(0.7);
  const shoulderTopY = y(0.845);
  const shoulderY = y(0.79);
  const elbowY = y(0.63);
  const wristY = y(0.485);
  const headBaseY = shoulderTopY + 0.025;
  const head: Vec3 = [0.54 * headScale, 0.5 * headScale, 0.48 * headScale];
  const headCenterY = headBaseY + head[1] / 2;

  const torso: TorsoShape = {
    hipW: 0.33 * f.torsoW * f.hipW * (fem ? 1.04 : 1),
    hipD: 0.215 * f.torsoD * f.hipD,
    waistW: 0.295 * f.torsoW * f.waistW * (fem ? 0.96 : 1),
    waistD: 0.2 * f.torsoD,
    chestW: 0.345 * f.torsoW * f.chestW * (fem ? 0.97 : 1),
    chestD: 0.215 * f.torsoD * f.chestD,
    shoulderW: 0.36 * f.torsoW * f.shoulder * (fem ? 0.95 : 1),
    bust: fem ? 0.022 * f.chestD : 0,
  };
  const shoulderX = 0.212 * f.shoulder * f.torsoW * (fem ? 0.96 : 1);
  const legX = Math.max(0.075, torso.hipW * 0.26);

  const bones: Record<BoneName, Vec3> = {
    root: [0, 0, 0],
    hips: [0, hipY + 0.03, 0],
    spine: [0, waistY, 0],
    chest: [0, chestY - 0.02, 0],
    neck: [0, shoulderTopY - 0.02, 0],
    head: [0, headBaseY, 0],
    upperArmL: [shoulderX, shoulderY, 0],
    foreArmL: [shoulderX, elbowY, 0],
    handL: [shoulderX, wristY, 0],
    upperArmR: [-shoulderX, shoulderY, 0],
    foreArmR: [-shoulderX, elbowY, 0],
    handR: [-shoulderX, wristY, 0],
    thighL: [legX, hipY, 0],
    shinL: [legX, kneeY, 0],
    footL: [legX, ankleY, 0],
    thighR: [-legX, hipY, 0],
    shinR: [-legX, kneeY, 0],
    footR: [-legX, ankleY, 0],
    propPhone: [0, 0, 0],
    propBook: [0, 0, 0],
    propBowl: [0, 0, 0],
    propSpoon: [0, 0, 0],
    propLadle: [0, 0, 0],
    propLaptop: [0, 0, 0],
    propWheel: [0, 0, 0],
    propDumbbell: [0, 0, 0],
    propCup: [0, 0, 0],
  };
  for (const prop of Object.keys(PROP_BONE) as AvatarProp[]) {
    const bone = PROP_BONE[prop];
    const parent = bones[BONE_PARENT[bone]!];
    const offset = PROP_OFFSET[prop];
    bones[bone] = [parent[0] + offset[0], parent[1] + offset[1], parent[2] + offset[2]];
  }

  return {
    heightScale: hs,
    headScale,
    gender,
    bodyType: appearance.bodyType,
    ankleY,
    kneeY,
    hipY,
    legX,
    thighR: 0.082 * f.leg,
    kneeR: 0.066 * f.leg,
    shinR: 0.064 * f.leg,
    ankleR: 0.05 * f.leg,
    crotchY,
    waistY,
    chestY,
    shoulderTopY,
    neckR: 0.06 * f.neck,
    torso,
    shoulderX,
    shoulderY,
    elbowY,
    wristY,
    upperArmR: 0.053 * f.arm,
    foreArmR: 0.046 * f.arm,
    hand: [0.088 * Math.sqrt(f.arm), 0.092, 0.07],
    headBaseY,
    headCenterY,
    head,
    bones,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Skin weight helpers
// ---------------------------------------------------------------------------------------------------------------

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Blend two bones across a joint at `jointY` (upper above, lower below). */
export function jointWeights(upper: number, lower: number, jointY: number, band: number): (x: number, y: number) => SkinWeights {
  return (_x, y) => {
    const t = smoothstep(jointY - band, jointY + band, y);
    return [
      [upper, t],
      [lower, 1 - t],
    ];
  };
}

/** Torso: hips → spine → chest blended at the waist and ribs. */
export function torsoWeights(rig: RigMetrics): (x: number, y: number, z: number) => SkinWeights {
  return (_x, y) => {
    const lower = smoothstep(rig.waistY - 0.07, rig.waistY + 0.02, y);
    const upper = smoothstep(rig.chestY - 0.08, rig.chestY + 0.01, y);
    return [
      [BONE.hips, 1 - lower],
      [BONE.spine, lower * (1 - upper)],
      [BONE.chest, upper],
    ];
  };
}

export type Side = 'L' | 'R';

export function sideOf(x: number): Side {
  return x >= 0 ? 'L' : 'R';
}

export function armBones(side: Side): { readonly upper: number; readonly fore: number; readonly hand: number } {
  return side === 'L'
    ? { upper: BONE.upperArmL, fore: BONE.foreArmL, hand: BONE.handL }
    : { upper: BONE.upperArmR, fore: BONE.foreArmR, hand: BONE.handR };
}

export function legBones(side: Side): { readonly thigh: number; readonly shin: number; readonly foot: number } {
  return side === 'L' ? { thigh: BONE.thighL, shin: BONE.shinL, foot: BONE.footL } : { thigh: BONE.thighR, shin: BONE.shinR, foot: BONE.footR };
}

/** Arm skinning: upper arm / forearm blended at the elbow, hand rigid. */
export function armWeights(rig: RigMetrics, side: Side): (x: number, y: number) => SkinWeights {
  const bones = armBones(side);
  const elbow = jointWeights(bones.upper, bones.fore, rig.elbowY, 0.025);
  return (x, y) => (y < rig.wristY - 0.005 ? [[bones.hand, 1]] : elbow(x, y));
}

/** Leg skinning: thigh / shin blended at the knee; the very top blends into the hips. */
export function legWeights(rig: RigMetrics, side: Side): (x: number, y: number) => SkinWeights {
  const bones = legBones(side);
  return (_x, y) => {
    if (y < rig.ankleY - 0.004) return [[bones.foot, 1]];
    const knee = smoothstep(rig.kneeY - 0.025, rig.kneeY + 0.025, y);
    const hip = smoothstep(rig.hipY + 0.01, rig.hipY + 0.07, y);
    return [
      [bones.shin, 1 - knee],
      [bones.thigh, knee * (1 - hip)],
      [BONE.hips, hip],
    ];
  };
}

/**
 * Long garments (skirts, gowns, kaftans, agbada): the back stays with the hips while the front and sides follow the
 * legs — thigh above the knee, shin below — split between left and right by x. Hems swing when walking (the thighs
 * cancel out at the centre) and drape over the lap when sitting.
 */
export function skirtWeights(rig: RigMetrics, follow = 1): (x: number, y: number, z: number) => SkinWeights {
  return (x, y, z) => {
    const lateral = smoothstep(0.015, rig.legX * 1.35, Math.abs(x));
    const front = smoothstep(-0.02, 0.05, z);
    const depth = smoothstep(rig.hipY + 0.05, rig.hipY - 0.07, y);
    const legShare = Math.max(lateral * smoothstep(-0.09, 0, z), front) * depth * follow;
    const left = smoothstep(-rig.legX, rig.legX, x);
    const belowKnee = smoothstep(rig.kneeY + 0.05, rig.kneeY - 0.06, y);
    return [
      [BONE.hips, 1 - legShare],
      [BONE.thighL, legShare * left * (1 - belowKnee)],
      [BONE.shinL, legShare * left * belowKnee],
      [BONE.thighR, legShare * (1 - left) * (1 - belowKnee)],
      [BONE.shinR, legShare * (1 - left) * belowKnee],
    ];
  };
}
