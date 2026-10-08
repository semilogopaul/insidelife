import { AVATAR_PROPS, BONE, BONE_COUNT, type AvatarProp, type BoneName } from '../rig';
import type { Expression } from '../face';

/**
 * A full-body pose as flat typed arrays: per-bone Euler rotations, root offset/rotation, prop visibility and face
 * hints. Poses are blended linearly, which is plenty for procedural, mostly single-axis motion.
 */
export class Pose {
  readonly rot = new Float32Array(BONE_COUNT * 3);
  readonly rootPos = new Float32Array(3);
  readonly rootRot = new Float32Array(3);
  readonly props = new Float32Array(AVATAR_PROPS.length);
  /** 0 = closed, 1 = open. */
  mouth = 0;
  /** 0 = open, 1 = closed (overrides blinking when > 0.5). */
  eyes = 0;
  /** Clip-requested expression (otherwise mood decides). */
  expression: Expression | null = null;

  reset(): this {
    this.rot.fill(0);
    this.rootPos.fill(0);
    this.rootRot.fill(0);
    this.props.fill(0);
    this.mouth = 0;
    this.eyes = 0;
    this.expression = null;
    return this;
  }

  copy(other: Pose): this {
    this.rot.set(other.rot);
    this.rootPos.set(other.rootPos);
    this.rootRot.set(other.rootRot);
    this.props.set(other.props);
    this.mouth = other.mouth;
    this.eyes = other.eyes;
    this.expression = other.expression;
    return this;
  }

  /** this = a·(1-t) + b·t. Face hints come from whichever side dominates. */
  blend(a: Pose, b: Pose, t: number): this {
    const s = 1 - t;
    for (let i = 0; i < this.rot.length; i++) this.rot[i] = a.rot[i]! * s + b.rot[i]! * t;
    for (let i = 0; i < 3; i++) {
      this.rootPos[i] = a.rootPos[i]! * s + b.rootPos[i]! * t;
      this.rootRot[i] = a.rootRot[i]! * s + b.rootRot[i]! * t;
    }
    for (let i = 0; i < this.props.length; i++) this.props[i] = a.props[i]! * s + b.props[i]! * t;
    const dominant = t < 0.5 ? a : b;
    this.mouth = dominant.mouth;
    this.eyes = dominant.eyes;
    this.expression = dominant.expression;
    return this;
  }

  /** Blend only the listed bones from `other` (gesture overlays). */
  overlay(other: Pose, bones: readonly number[], t: number): this {
    const s = 1 - t;
    for (const bone of bones) {
      for (let k = 0; k < 3; k++) {
        const i = bone * 3 + k;
        this.rot[i] = this.rot[i]! * s + other.rot[i]! * t;
      }
    }
    if (t > 0.5) {
      this.mouth = other.mouth;
      if (other.expression) this.expression = other.expression;
    }
    return this;
  }

  set(bone: BoneName, x: number, y = 0, z = 0): this {
    const i = BONE[bone] * 3;
    this.rot[i] = x;
    this.rot[i + 1] = y;
    this.rot[i + 2] = z;
    return this;
  }

  add(bone: BoneName, x: number, y = 0, z = 0): this {
    const i = BONE[bone] * 3;
    this.rot[i] = this.rot[i]! + x;
    this.rot[i + 1] = this.rot[i + 1]! + y;
    this.rot[i + 2] = this.rot[i + 2]! + z;
    return this;
  }

  get(bone: BoneName, axis: 0 | 1 | 2): number {
    return this.rot[BONE[bone] * 3 + axis]!;
  }

  prop(prop: AvatarProp, weight = 1): this {
    this.props[AVATAR_PROPS.indexOf(prop)] = weight;
    return this;
  }
}

/** Bones a gesture overlay (wave, cheer) may take over: everything above the hips. */
export const UPPER_BODY_BONES: readonly number[] = (['spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR'] as const).map((name) => BONE[name]);
