import type { Bone } from 'three';
import { AVATAR_PROPS, BONE, BONE_COUNT, PROP_BONE, type RigMetrics } from '../rig';
import type { Expression } from '../face';
import { evaluateClip, resolveStance, type AvatarClip, type AvatarStance } from './clips';
import { Pose, UPPER_BODY_BONES } from './pose';

/** Face state the renderer should show (changes rarely; the avatar updates the atlas offset only on change). */
export interface FaceState {
  readonly expression: Expression;
  readonly eyesClosed: boolean;
  readonly mouthOpen: boolean;
}

interface Track {
  clip: AvatarClip;
  stance: AvatarStance;
  time: number;
}

interface MutableClipContext {
  t: number;
  beatTime: number;
  rig: RigMetrics;
  stance: AvatarStance;
  variety: number;
  props: boolean;
}

/**
 * Drives one avatar's skeleton. No React state: the component calls `update(dt)` from `useFrame`.
 * - `play(clip)` crossfades from the current clip (default 0.35 s).
 * - `gesture(clip, seconds)` overlays an upper-body one-shot (wave on creator changes, cheer at a party).
 * - Blinks on a seeded random schedule; clips can close the eyes (sleep, pray) or open the mouth (talk, eat).
 */
export class AvatarAnimator {
  private readonly bones: readonly Bone[];
  private readonly rig: RigMetrics;
  private readonly variety: number;
  private current: Track;
  private previous: Track | null = null;
  private fade = 0;
  private fadeDuration = 0.35;
  private gestureTrack: Track | null = null;
  private gestureTime = 0;
  private gestureDuration = 0;
  private readonly poseA = new Pose();
  private readonly poseB = new Pose();
  private readonly poseG = new Pose();
  private readonly out = new Pose();
  private readonly ctx: MutableClipContext;
  private blinkIn: number;
  private blinkLeft = 0;
  private random: number;
  private mood: Expression = 'neutral';
  private override: Expression | null = null;
  private readonly bindRoot: readonly [number, number, number];
  private showProps = true;
  /** Speed multiplier (e.g. walk speed matching). */
  private timeScale = 1;
  private face: FaceState = { expression: 'neutral', eyesClosed: false, mouthOpen: false };

  constructor(bones: readonly Bone[], rig: RigMetrics, seed: number) {
    this.bones = bones;
    this.rig = rig;
    this.random = (seed >>> 0) / 4294967296 || 0.37;
    this.variety = this.next();
    this.blinkIn = 1 + this.next() * 3;
    this.current = { clip: 'idle', stance: 'stand', time: this.variety * 10 };
    this.ctx = { t: 0, beatTime: 0, rig, stance: 'stand', variety: this.variety, props: true };
    const root = bones[BONE.root]!;
    this.bindRoot = [root.position.x, root.position.y, root.position.z];
  }

  private next(): number {
    // xorshift-ish LCG on the stored float seed — deterministic per avatar, cheap.
    this.random = (this.random * 9301 + 0.49297) % 1;
    return this.random;
  }

  get clip(): AvatarClip {
    return this.current.clip;
  }

  get faceState(): FaceState {
    return this.face;
  }

  setShowProps(show: boolean): void {
    this.showProps = show;
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
  }

  setMoodExpression(expression: Expression): void {
    this.mood = expression;
  }

  /** Force an expression regardless of mood (null = back to mood). */
  setExpression(expression: Expression | null): void {
    this.override = expression;
  }

  play(clip: AvatarClip, options: { readonly fade?: number; readonly stance?: AvatarStance } = {}): void {
    const stance = resolveStance(clip, options.stance);
    if (clip === this.current.clip && stance === this.current.stance) return;
    const fade = options.fade ?? 0.35;
    this.previous = fade > 0 ? this.current : null;
    this.current = { clip, stance, time: this.variety * 10 };
    this.fade = 0;
    this.fadeDuration = Math.max(0.001, fade);
  }

  gesture(clip: AvatarClip, seconds = 1.8): void {
    this.gestureTrack = { clip, stance: 'stand', time: 0 };
    this.gestureTime = 0;
    this.gestureDuration = seconds;
  }

  update(delta: number, elapsed: number): FaceState {
    const dt = Math.min(0.1, delta) * this.timeScale;
    this.current.time += dt;
    this.ctx.beatTime = elapsed;
    this.ctx.props = this.showProps;

    this.evaluate(this.poseA, this.current);
    if (this.previous) {
      this.previous.time += dt;
      this.fade += dt / this.fadeDuration;
      if (this.fade >= 1) {
        this.previous = null;
        this.out.copy(this.poseA);
      } else {
        this.evaluate(this.poseB, this.previous);
        const k = this.fade * this.fade * (3 - 2 * this.fade);
        this.out.blend(this.poseB, this.poseA, k);
      }
    } else this.out.copy(this.poseA);

    if (this.gestureTrack) {
      this.gestureTime += dt;
      this.gestureTrack.time += dt;
      const g = this.gestureTime;
      const w = Math.min(1, g / 0.25) * Math.min(1, Math.max(0, (this.gestureDuration - g) / 0.35));
      if (g >= this.gestureDuration) this.gestureTrack = null;
      else {
        this.evaluate(this.poseG, this.gestureTrack);
        this.out.overlay(this.poseG, UPPER_BODY_BONES, w * w * (3 - 2 * w));
      }
    }

    this.apply(this.out);
    return this.updateFace(dt);
  }

  private evaluate(pose: Pose, track: Track): void {
    this.ctx.t = track.time;
    this.ctx.stance = track.stance;
    evaluateClip(pose, track.clip, this.ctx);
  }

  private apply(pose: Pose): void {
    for (let i = 0; i < BONE_COUNT; i++) {
      const bone = this.bones[i];
      if (!bone) continue;
      bone.rotation.set(pose.rot[i * 3]!, pose.rot[i * 3 + 1]!, pose.rot[i * 3 + 2]!);
    }
    const root = this.bones[BONE.root]!;
    root.position.set(this.bindRoot[0] + pose.rootPos[0]!, this.bindRoot[1] + pose.rootPos[1]!, this.bindRoot[2] + pose.rootPos[2]!);
    root.rotation.set(pose.rootRot[0]!, pose.rootRot[1]!, pose.rootRot[2]!);
    AVATAR_PROPS.forEach((prop, index) => {
      const bone = this.bones[BONE[PROP_BONE[prop]]];
      if (!bone) return;
      const s = Math.max(1e-4, pose.props[index]!);
      bone.scale.setScalar(s);
    });
  }

  private updateFace(dt: number): FaceState {
    const pose = this.out;
    let eyesClosed = pose.eyes > 0.5;
    if (!eyesClosed) {
      if (this.blinkLeft > 0) {
        this.blinkLeft -= dt;
        eyesClosed = true;
      } else {
        this.blinkIn -= dt;
        if (this.blinkIn <= 0) {
          this.blinkLeft = 0.11;
          this.blinkIn = 2.2 + this.next() * 3.5;
          eyesClosed = true;
        }
      }
    }
    const expression = this.override ?? pose.expression ?? this.mood;
    const mouthOpen = pose.mouth > 0.5;
    if (expression !== this.face.expression || eyesClosed !== this.face.eyesClosed || mouthOpen !== this.face.mouthOpen) {
      this.face = { expression, eyesClosed, mouthOpen };
    }
    return this.face;
  }
}
