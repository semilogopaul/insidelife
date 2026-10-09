import type { AvatarAnimation } from '@insidelife/shared';
import type { AvatarProp, RigMetrics } from '../rig';
import { Pose } from './pose';

/** Every clip the avatar can play: the shared action animations, locomotion extras (`jog`, `run`) and `hang`. */
export type AvatarClip = AvatarAnimation | 'jog' | 'run' | 'hang';

/**
 * Ground speed (m/s, avatar at scale 1, timeScale 1) each gait is animated for. To keep feet planted, drive
 * `handle.setTimeScale(actualSpeed / AVATAR_GAIT_SPEED[clip])` (multiply the speed by your avatar scale if you scale it).
 */
export const AVATAR_GAIT_SPEED = { walk: 0.7, jog: 1.1, run: 1.75 } as const;

/** Lower-body stance for upper-body clips (eat, read, type, phone, talk…). */
export type AvatarStance = 'stand' | 'sit' | 'kneel';

/**
 * Seat height (m) the `sit` stance is built for: the avatar's origin stays on the floor and the seat of the pose sits
 * this high. Interiors place chairs/benches with this seat height (Kenney chairs at ×1.5).
 */
export const AVATAR_SEAT_HEIGHT = 0.36;

export interface ClipContext {
  /** Seconds since the clip started (plus a per-avatar phase so crowds don't move in lockstep). */
  readonly t: number;
  /** Shared clock seconds (no per-avatar phase) — dancers stay on the beat together. */
  readonly beatTime: number;
  readonly rig: RigMetrics;
  readonly stance: AvatarStance;
  /** 0-1 per-avatar variation. */
  readonly variety: number;
  /** Whether the clip should show its props. */
  readonly props: boolean;
}

export interface ClipDefinition {
  /** `upper` clips combine with a stance; `full` clips own the legs too. */
  readonly kind: 'upper' | 'full';
  readonly stance: AvatarStance;
  readonly apply: (pose: Pose, ctx: ClipContext) => void;
}

const TAU = Math.PI * 2;
const ease = (x: number): number => x * x * (3 - 2 * x);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/** Smooth 0→1→0 window over [a, b] with ramps of `r`. */
const windowed = (x: number, a: number, b: number, r: number): number => ease(clamp01((x - a) / r)) * ease(clamp01((b - x) / r));
/** Cheap smooth noise in [-1, 1]. */
const noise = (t: number, seed: number): number => (Math.sin(t * 1.13 + seed * 7.1) + Math.sin(t * 1.71 + seed * 3.3) * 0.6 + Math.sin(t * 2.93 + seed * 1.7) * 0.3) / 1.9;

/** Neutral relaxed arms. */
function relaxedArms(pose: Pose, sway = 0): void {
  pose.set('upperArmL', sway * 0.5, 0, 0.12 + sway);
  pose.set('upperArmR', -sway * 0.5, 0, -0.12 - sway);
  pose.set('foreArmL', -0.14);
  pose.set('foreArmR', -0.14);
}

// ---------------------------------------------------------------------------------------------------------------
// Stances
// ---------------------------------------------------------------------------------------------------------------

export function applyStance(pose: Pose, stance: AvatarStance, rig: RigMetrics, t: number): void {
  if (stance === 'stand') return;
  if (stance === 'sit') {
    const swing = Math.sin(t * 1.4) * 0.06;
    pose.set('thighL', -1.5, 0.06, 0.04);
    pose.set('thighR', -1.5, -0.06, -0.04);
    pose.set('shinL', 1.38 + swing);
    pose.set('shinR', 1.38 - swing);
    pose.set('footL', 0.1);
    pose.set('footR', 0.1);
    pose.rootPos[1] = AVATAR_SEAT_HEIGHT - (rig.hipY - rig.thighR * 0.85);
    return;
  }
  // Kneel: thighs nearly upright, shins folded flat behind.
  pose.set('thighL', -0.18, 0, 0.05);
  pose.set('thighR', -0.18, 0, -0.05);
  pose.set('shinL', 1.62);
  pose.set('shinR', 1.62);
  pose.set('footL', 0.7);
  pose.set('footR', 0.7);
  pose.rootPos[1] = rig.kneeR * 0.7 - rig.kneeY + 0.02;
}

// ---------------------------------------------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------------------------------------------

const idle: ClipDefinition = {
  kind: 'upper',
  stance: 'stand',
  apply: (pose, { t, variety, stance }) => {
    const breathe = Math.sin(t * TAU * 0.27);
    pose.add('chest', 0.025 * breathe);
    pose.add('spine', 0.01 * breathe);
    relaxedArms(pose, 0.012 * breathe);
    pose.add('head', 0.04 * noise(t * 0.4, variety), 0.22 * noise(t * 0.23, variety + 2), 0.03 * noise(t * 0.3, variety + 4));
    if (stance === 'stand') {
      const shift = 0.025 * Math.sin(t * 0.45 + variety * 6);
      pose.add('hips', 0, 0, shift);
      pose.add('chest', 0, 0, -shift * 0.6);
      pose.add('thighL', 0, 0, -shift);
      pose.add('thighR', 0, 0, -shift);
      pose.rootPos[1] = (pose.rootPos[1] ?? 0) + 0.003 * breathe;
    } else if (stance === 'sit') {
      // Hands resting on the thighs.
      pose.set('upperArmL', -0.42, 0, 0.1);
      pose.set('upperArmR', -0.42, 0, -0.1);
      pose.set('foreArmL', -0.82);
      pose.set('foreArmR', -0.82);
    } else {
      pose.set('upperArmL', -0.3, 0, 0.05);
      pose.set('upperArmR', -0.3, 0, -0.05);
      pose.set('foreArmL', -0.9);
      pose.set('foreArmR', -0.9);
    }
  },
};

/** Locomotion: 0 = walk, 0.5 = jog, 1 = run (blends stride, knee lift, arm pump and lean). */
function gait(pose: Pose, t: number, effort: number): void {
  const run = effort >= 0.5;
  const period = 1.02 - 0.4 * effort;
  const phase = (t / period) * TAU;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const thigh = 0.5 + 0.35 * effort;
  for (const [side, offset] of [
    ['L', 0],
    ['R', Math.PI],
  ] as const) {
    const ps = Math.sin(phase + offset);
    const pc = Math.cos(phase + offset);
    pose.set(`thigh${side}`, -thigh * ps - (0.05 + 0.2 * effort), 0, 0);
    // Knee folds during the swing (leg travelling forward).
    pose.set(`shin${side}`, 0.06 + 0.19 * effort + (0.8 + 0.75 * effort) * Math.max(0, pc) ** 1.4);
    pose.set(`foot${side}`, -0.25 * ps);
  }
  const arm = 0.42 + 0.33 * effort;
  pose.set('upperArmL', arm * s, 0, 0.1);
  pose.set('upperArmR', -arm * s, 0, -0.1);
  pose.set('foreArmL', run ? -1.45 + 0.6 * (1 - effort) : -0.32 - 0.12 * Math.max(0, -s));
  pose.set('foreArmR', run ? -1.45 + 0.6 * (1 - effort) : -0.32 - 0.12 * Math.max(0, s));
  pose.set('hips', 0, 0.12 * s, 0.035 * c);
  pose.set('chest', 0.05 + 0.15 * effort, -0.16 * s, -0.02 * c);
  pose.set('head', -0.03 - 0.09 * effort, 0.06 * s);
  const bob = 0.022 + 0.028 * effort;
  pose.rootPos[1] = bob * (1 - Math.abs(s)) - bob * 0.4 - 0.03 * effort;
}

const walk: ClipDefinition = { kind: 'full', stance: 'stand', apply: (pose, { t }) => gait(pose, t, 0) };
const jog: ClipDefinition = { kind: 'full', stance: 'stand', apply: (pose, { t }) => gait(pose, t, 0.55) };
const run: ClipDefinition = {
  kind: 'full',
  stance: 'stand',
  apply: (pose, ctx) => {
    gait(pose, ctx.t, 1);
    pose.mouth = 1;
  },
};

const sit: ClipDefinition = {
  kind: 'upper',
  stance: 'sit',
  apply: (pose, ctx) => {
    idle.apply(pose, ctx);
    if (ctx.stance === 'sit') pose.add('chest', -0.04);
  },
};

const sleep: ClipDefinition = {
  kind: 'full',
  stance: 'stand',
  apply: (pose, { t, rig, variety }) => {
    const breathe = Math.sin(t * TAU * 0.2);
    pose.rootRot[0] = -Math.PI / 2;
    pose.rootPos[1] = rig.torso.chestD / 2 + 0.05;
    pose.rootPos[2] = (rig.headBaseY + rig.head[1]) * 0.5;
    pose.set('chest', 0.03 * breathe);
    pose.set('neck', 0.15);
    pose.set('head', 0.22, 0.35 * (variety > 0.5 ? 1 : -1), 0);
    pose.set('upperArmL', -0.45, 0, 0.18);
    pose.set('upperArmR', -0.3, 0, -0.22);
    pose.set('foreArmL', -1.25 - 0.03 * breathe);
    pose.set('foreArmR', -0.4);
    pose.set('thighL', -0.12, 0, 0.04);
    pose.set('thighR', 0.02, 0, -0.05);
    pose.set('shinL', 0.3);
    pose.set('shinR', 0.08);
    pose.set('footL', 0.6);
    pose.set('footR', 0.55);
    pose.eyes = 1;
    pose.mouth = Math.sin(t * 0.7) > 0.85 ? 1 : 0;
    pose.expression = 'neutral';
  },
};

const eat: ClipDefinition = {
  kind: 'upper',
  stance: 'sit',
  apply: (pose, { t, props }) => {
    const period = 2.6;
    const p = (t % period) / period;
    // Spoon: scoop (bowl) → lift → hold at mouth → lower.
    const lift = ease(clamp01((p - 0.18) / 0.22)) * (1 - ease(clamp01((p - 0.7) / 0.22)));
    pose.set('upperArmL', -0.55, 0.1, 0.16);
    pose.set('foreArmL', -1.12, 0, 0.12);
    pose.set('handL', 0, 0, 0.1);
    pose.set('upperArmR', -0.42 - 0.55 * lift, 0, -0.32 + 0.1 * lift);
    pose.set('foreArmR', -1.0 - 1.15 * lift, 0, -0.1);
    pose.set('handR', -0.2 * lift, 0, 0);
    pose.set('chest', 0.08 + 0.04 * lift);
    pose.set('head', 0.18 - 0.16 * lift, 0, 0);
    const chewing = p > 0.62 || p < 0.1;
    pose.mouth = (p > 0.42 && p < 0.58) || (chewing && Math.sin(t * 16) > 0.2) ? 1 : 0;
    pose.expression = 'happy';
    if (props) pose.prop('bowl').prop('spoon');
  },
};

const cook: ClipDefinition = {
  kind: 'upper',
  stance: 'stand',
  apply: (pose, { t, props }) => {
    const w = (t / 1.5) * TAU;
    pose.set('upperArmR', -0.62 + 0.08 * Math.sin(w), 0, -0.18 + 0.12 * Math.cos(w));
    pose.set('foreArmR', -0.85 + 0.14 * Math.sin(w + 1));
    pose.set('upperArmL', -0.45, 0, 0.24);
    pose.set('foreArmL', -0.85);
    pose.set('chest', 0.14, 0.08 * Math.sin(w * 0.5));
    pose.set('head', 0.3, 0.05 * Math.sin(t * 0.7));
    pose.set('hips', 0, 0, 0.03 * Math.sin(t * 2.2));
    pose.mouth = Math.sin(t * 0.9) > 0.6 && Math.sin(t * 9) > 0 ? 1 : 0;
    if (props) pose.prop('ladle');
  },
};

const shower: ClipDefinition = {
  kind: 'full',
  stance: 'stand',
  apply: (pose, { t }) => {
    const scrub = Math.sin(t * 8);
    const section = Math.floor(t / 4) % 2;
    if (section === 0) {
      // Lathering the head.
      pose.set('upperArmL', -2.1 + 0.08 * scrub, 0, 0.55);
      pose.set('upperArmR', -2.1 - 0.08 * scrub, 0, -0.55);
      pose.set('foreArmL', -1.5);
      pose.set('foreArmR', -1.5);
    } else {
      // Scrubbing arms and chest.
      pose.set('upperArmL', -0.7, 0, -0.15 + 0.1 * scrub);
      pose.set('upperArmR', -0.35, 0, -0.1);
      pose.set('foreArmL', -1.6, 0, -0.2);
      pose.set('foreArmR', -1.2 + 0.1 * scrub);
    }
    pose.set('head', -0.2, 0.1 * Math.sin(t * 1.3));
    pose.set('hips', 0, 0, 0.04 * Math.sin(t * 2));
    pose.set('chest', -0.05, 0, -0.03 * Math.sin(t * 2));
    pose.eyes = 1;
    pose.mouth = Math.sin(t * 5) > 0.1 ? 1 : 0;
    pose.expression = 'happy';
  },
};

const phone: ClipDefinition = {
  kind: 'upper',
  stance: 'stand',
  apply: (pose, { t, variety, props }) => {
    const scroll = Math.max(0, Math.sin(t * 6)) * (Math.sin(t * 0.8 + variety * 5) > -0.2 ? 1 : 0);
    pose.set('upperArmR', -0.42, 0, -0.06);
    pose.set('foreArmR', -1.9 + 0.04 * scroll, 0, 0.32);
    pose.set('handR', -0.15 - 0.08 * scroll, 0, 0.1);
    pose.set('upperArmL', -0.22, 0, 0.02);
    pose.set('foreArmL', -1.35, 0, 0.5);
    pose.set('chest', 0.06);
    pose.set('head', 0.32 + 0.03 * Math.sin(t * 0.7), 0.05 * noise(t * 0.3, variety));
    // Now and then something on the phone is hilarious.
    const laugh = windowed((t + variety * 9) % 9, 6, 7.6, 0.3);
    pose.mouth = laugh > 0.5 && Math.sin(t * 14) > -0.3 ? 1 : 0;
    if (laugh > 0.5) pose.expression = 'happy';
    pose.add('chest', -0.05 * laugh * Math.abs(Math.sin(t * 12)));
    if (props) pose.prop('phone');
  },
};

const read: ClipDefinition = {
  kind: 'upper',
  stance: 'sit',
  apply: (pose, { t, props }) => {
    const turn = windowed(t % 6, 4.6, 5.6, 0.35);
    pose.set('upperArmL', -0.5, 0, 0.1);
    pose.set('upperArmR', -0.5, 0, -0.1 + 0.28 * turn);
    pose.set('foreArmL', -1.3, 0, -0.25);
    pose.set('foreArmR', -1.3 - 0.1 * turn, 0, 0.25);
    pose.set('chest', 0.05 + 0.01 * Math.sin(t * 1.7));
    pose.set('head', 0.38, 0.06 * Math.sin(t * 0.5), 0.04);
    if (props) pose.prop('book');
  },
};

const type: ClipDefinition = {
  kind: 'upper',
  stance: 'sit',
  apply: (pose, { t, stance, props }) => {
    const tapL = Math.max(0, Math.sin(t * 13.1) + 0.4 * Math.sin(t * 7.3)) * 0.12;
    const tapR = Math.max(0, Math.sin(t * 12.4 + 2.1) + 0.4 * Math.sin(t * 6.1)) * 0.12;
    pose.set('upperArmL', -0.42, 0, 0.12);
    pose.set('upperArmR', -0.42, 0, -0.12);
    pose.set('foreArmL', -1.3, 0, -0.18);
    pose.set('foreArmR', -1.3, 0, 0.18);
    pose.set('handL', tapL);
    pose.set('handR', tapR);
    pose.set('chest', 0.12);
    pose.set('head', 0.12 + 0.03 * Math.sin(t * 0.6), 0.04 * Math.sin(t * 0.37));
    if (props && stance === 'sit') pose.prop('laptop');
  },
};

const exercise: ClipDefinition = {
  kind: 'full',
  stance: 'stand',
  apply: (pose, { t }) => {
    const cycle = t % 12;
    const jacks = 1 - ease(clamp01((cycle - 6) / 0.6)) + ease(clamp01((cycle - 11.4) / 0.6));
    const squat = 1 - jacks;
    // Jumping jacks.
    const wj = t * TAU * 1.35;
    const pj = 0.5 - 0.5 * Math.cos(wj);
    // Squats.
    const ws = t * TAU * 0.55;
    const ps = 0.5 - 0.5 * Math.cos(ws);
    pose.set('upperArmL', -1.35 * ps * squat, 0, (0.15 + 2.55 * pj) * jacks + 0.1 * squat);
    pose.set('upperArmR', -1.35 * ps * squat, 0, -(0.15 + 2.55 * pj) * jacks - 0.1 * squat);
    pose.set('foreArmL', -0.15);
    pose.set('foreArmR', -0.15);
    pose.set('thighL', -1.25 * ps * squat, 0, 0.26 * pj * jacks);
    pose.set('thighR', -1.25 * ps * squat, 0, -0.26 * pj * jacks);
    pose.set('shinL', 1.55 * ps * squat + 0.1 * jacks);
    pose.set('shinR', 1.55 * ps * squat + 0.1 * jacks);
    pose.set('footL', -0.3 * ps * squat);
    pose.set('footR', -0.3 * ps * squat);
    pose.set('chest', 0.32 * ps * squat);
    pose.set('head', -0.15 * ps * squat);
    pose.rootPos[1] = 0.07 * Math.abs(Math.sin(wj)) * jacks - 0.16 * ps * squat;
    pose.mouth = (squat > 0.5 && ps > 0.7) || (jacks > 0.5 && pj > 0.8) ? 1 : 0;
  },
};

/** Afrobeats: knee bounce on every beat with three rotating moves (shaku arms, zanku kicks, shoulder whine). */
const scratchA = new Pose();
const scratchB = new Pose();

function danceMove(pose: Pose, move: number, beat: number, bounce: number): void {
  const half = Math.sin(Math.PI * beat); // alternates sign every beat
  const two = Math.sin((Math.PI * beat) / 2);
  pose.reset();
  // Shared: groove bounce and nod.
  pose.set('thighL', -0.28 * bounce, 0, 0.06);
  pose.set('thighR', -0.28 * bounce, 0, -0.06);
  pose.set('shinL', 0.56 * bounce);
  pose.set('shinR', 0.56 * bounce);
  pose.set('footL', -0.25 * bounce);
  pose.set('footR', -0.25 * bounce);
  pose.set('head', 0.12 * bounce - 0.04, 0, -0.07 * half);
  pose.rootPos[1] = -0.04 * bounce;
  if (move === 0) {
    // Shaku-shaku: elbows up, forearms crossing and swapping, shoulders popping.
    pose.set('upperArmL', -0.5, 0, 0.55);
    pose.set('upperArmR', -0.5, 0, -0.55);
    pose.set('foreArmL', -1.35 + 0.35 * half, 0, -0.6 * Math.max(0, half));
    pose.set('foreArmR', -1.35 - 0.35 * half, 0, 0.6 * Math.max(0, -half));
    pose.set('chest', 0.06, 0.08 * half, 0.13 * half);
    pose.set('hips', 0, -0.06 * half, -0.08 * half);
    pose.add('thighL', -0.25 * Math.max(0, half), 0, 0.1 * Math.max(0, half));
    pose.add('thighR', -0.25 * Math.max(0, -half), 0, -0.1 * Math.max(0, -half));
    pose.add('shinL', 0.4 * Math.max(0, half));
    pose.add('shinR', 0.4 * Math.max(0, -half));
  } else if (move === 1) {
    // Zanku: alternating leg kicks out, arms swinging low.
    const kickL = Math.max(0, two);
    const kickR = Math.max(0, -two);
    pose.add('thighL', -0.65 * kickL, 0, 0.35 * kickL);
    pose.add('thighR', -0.65 * kickR, 0, -0.35 * kickR);
    pose.add('shinL', 0.7 * kickL * (1 - kickL));
    pose.add('shinR', 0.7 * kickR * (1 - kickR));
    pose.set('upperArmL', -0.7 * two, 0, 0.35);
    pose.set('upperArmR', 0.7 * two, 0, -0.35);
    pose.set('foreArmL', -0.9);
    pose.set('foreArmR', -0.9);
    pose.set('chest', 0.15, -0.2 * two, 0);
    pose.set('hips', 0, 0.15 * two, 0);
  } else {
    // Shoulder whine with hands up: rolling shoulders, hips circling.
    const roll = Math.sin(Math.PI * beat * 0.5);
    const roll2 = Math.cos(Math.PI * beat * 0.5);
    pose.set('upperArmL', -1.0 - 0.35 * roll, 0, 0.9 + 0.25 * roll2);
    pose.set('upperArmR', -1.0 + 0.35 * roll, 0, -0.9 + 0.25 * roll2);
    pose.set('foreArmL', -1.1 - 0.3 * roll2);
    pose.set('foreArmR', -1.1 + 0.3 * roll2);
    pose.set('chest', 0.05 * roll2, 0.12 * roll, 0.12 * roll);
    pose.set('hips', 0, -0.1 * roll, 0.12 * roll2);
  }
}

const dance: ClipDefinition = {
  kind: 'full',
  stance: 'stand',
  apply: (pose, { beatTime, variety }) => {
    const beat = beatTime * (112 / 60);
    const bounce = 0.5 - 0.5 * Math.cos(TAU * beat);
    const sectionPos = beat / 8 + variety * 3;
    const section = Math.floor(sectionPos);
    const local = sectionPos - section;
    const move = section % 3;
    const next = (section + 1) % 3;
    const mix = ease(clamp01((local - 0.88) / 0.12));
    danceMove(scratchA, move, beat, bounce);
    if (mix > 0) {
      danceMove(scratchB, next, beat, bounce);
      pose.blend(scratchA, scratchB, mix);
    } else pose.copy(scratchA);
    pose.expression = 'happy';
    pose.mouth = Math.sin(beat * Math.PI * 0.5 + variety * 4) > 0.55 ? 1 : 0;
  },
};

const talk: ClipDefinition = {
  kind: 'upper',
  stance: 'stand',
  apply: (pose, { t, variety, stance }) => {
    const g1 = noise(t * 0.9, variety);
    const g2 = noise(t * 1.3, variety + 3);
    const g3 = noise(t * 1.7, variety + 6);
    const g4 = noise(t * 0.6, variety + 9);
    pose.set('upperArmR', -0.45 + 0.28 * g1, 0, -0.22 - 0.16 * g2);
    pose.set('foreArmR', -1.2 + 0.45 * g3, 0.4 * g2, 0);
    pose.set('handR', 0.2 * g2, 0.5, 0);
    pose.set('upperArmL', -0.2 + 0.25 * Math.max(0, g4), 0, 0.14 + 0.1 * Math.max(0, g4));
    pose.set('foreArmL', -0.4 - 0.7 * Math.max(0, g4));
    pose.set('chest', 0.02, 0.08 * g1, 0);
    pose.set('head', 0.05 * Math.sin(t * 2.3), 0.16 * Math.sin(t * 0.55 + variety), 0.05 * g2);
    const pausing = Math.sin(t * 0.85 + variety * 5) > 0.72;
    pose.mouth = !pausing && Math.sin(t * 17) + Math.sin(t * 11.3) > 0.15 ? 1 : 0;
    if (stance === 'sit') pose.set('upperArmL', -0.42, 0, 0.1).set('foreArmL', -0.82);
  },
};

const pray: ClipDefinition = {
  kind: 'upper',
  stance: 'stand',
  apply: (pose, { t }) => {
    const sway = Math.sin(t * 0.9) * 0.02;
    pose.set('upperArmL', -0.55, 0.15, -0.28);
    pose.set('upperArmR', -0.55, -0.15, 0.28);
    pose.set('foreArmL', -1.45, -0.3, -0.62);
    pose.set('foreArmR', -1.45, 0.3, 0.62);
    pose.set('handL', 0.2, 0, -0.2);
    pose.set('handR', 0.2, 0, 0.2);
    pose.set('chest', 0.06 + sway);
    pose.set('head', 0.38 + sway, 0, 0);
    pose.eyes = 1;
    pose.mouth = Math.sin(t * 3.1) > 0.4 && Math.sin(t * 0.6) > 0 ? 1 : 0;
    pose.expression = 'neutral';
  },
};

const drive: ClipDefinition = {
  kind: 'upper',
  stance: 'sit',
  apply: (pose, { t, variety, props }) => {
    const steer = 0.25 * noise(t * 0.5, variety);
    pose.set('upperArmL', -1.0, 0, 0.16 + steer * 0.4);
    pose.set('upperArmR', -1.0, 0, -0.16 + steer * 0.4);
    pose.set('foreArmL', -0.55 + steer * 0.3, 0, 0.1);
    pose.set('foreArmR', -0.55 - steer * 0.3, 0, -0.1);
    pose.set('chest', -0.02, steer * 0.15);
    const glance = windowed((t + variety * 7) % 7, 5, 6.2, 0.3);
    pose.set('head', -0.02, -steer * 0.3 + glance * 0.6 * (variety > 0.5 ? 1 : -1));
    if (props) pose.prop('wheel');
  },
};

const wave: ClipDefinition = {
  kind: 'upper',
  stance: 'stand',
  apply: (pose, { t }) => {
    relaxedArms(pose);
    pose.set('upperArmR', -0.25, 0, -2.45);
    pose.set('foreArmR', -0.15, 0, -0.35 + 0.48 * Math.sin(t * 9));
    pose.set('handR', 0, 0, 0.15 * Math.sin(t * 9 - 0.6));
    pose.set('chest', 0, 0.06, 0.07);
    pose.set('head', -0.04, 0.08, 0.1);
    pose.mouth = 1;
    pose.expression = 'happy';
  },
};

const cheer: ClipDefinition = {
  kind: 'full',
  stance: 'stand',
  apply: (pose, { t }) => {
    const jump = Math.max(0, Math.sin(t * 5.2));
    const pump = 0.5 - 0.5 * Math.cos(t * 10.4);
    pose.set('upperArmL', -0.3, 0, 2.55 + 0.15 * pump);
    pose.set('upperArmR', -0.3, 0, -2.55 - 0.15 * pump);
    pose.set('foreArmL', -0.25 - 0.45 * pump);
    pose.set('foreArmR', -0.25 - 0.45 * pump);
    pose.set('head', -0.18, 0, 0.05 * Math.sin(t * 2.6));
    pose.set('thighL', -0.3 * (1 - jump), 0, 0.05);
    pose.set('thighR', -0.3 * (1 - jump), 0, -0.05);
    pose.set('shinL', 0.6 * (1 - jump));
    pose.set('shinR', 0.6 * (1 - jump));
    pose.rootPos[1] = 0.08 * jump - 0.04 * (1 - jump);
    pose.mouth = 1;
    pose.expression = 'happy';
  },
};

/**
 * A danfo conductor hanging out of the sliding door (on the bus's right, facing forward): left hand up on the roof
 * rail, lean out over the road, right arm beckoning passengers, mouth going "Oshodi! Oshodi!", outer leg swinging free.
 */
const hang: ClipDefinition = {
  kind: 'full',
  stance: 'stand',
  apply: (pose, { t, variety }) => {
    const sway = noise(t * 1.6, variety);
    const shout = windowed((t + variety * 5) % 3.2, 0.2, 1.5, 0.15);
    const beckon = Math.sin(t * 8) * shout;
    // Lean out from the grip; the body swings a little with the road.
    pose.rootRot[2] = 0.32 + 0.06 * sway;
    pose.set('hips', 0, 0.12, 0);
    pose.set('chest', 0.04, 0.18 + 0.1 * shout, -0.06);
    pose.set('head', -0.05 + 0.08 * shout, 0.45 + 0.15 * sway, 0.05);
    // Left (inner) hand up on the roof rail.
    pose.set('upperArmL', -0.2, 0, 2.5);
    pose.set('foreArmL', -0.35);
    pose.set('handL', 0, 0, 0.3);
    // Right arm out to the side, beckoning when he calls.
    pose.set('upperArmR', -0.55 - 0.35 * shout, 0, -1.05 - 0.2 * shout);
    pose.set('foreArmR', -0.55 - 0.45 * Math.max(0, beckon));
    pose.set('handR', 0, 0, 0.25 * beckon);
    // Inner foot on the step, outer leg hanging free.
    pose.set('thighL', -0.12, 0, 0.08);
    pose.set('shinL', 0.22);
    pose.set('thighR', -0.35 + 0.12 * sway, 0, -0.32);
    pose.set('shinR', 0.45 + 0.1 * sway);
    pose.set('footR', 0.3);
    pose.mouth = shout > 0.3 ? 1 : 0;
    pose.expression = 'happy';
  },
};

export const CLIPS: Readonly<Record<AvatarClip, ClipDefinition>> = {
  idle,
  walk,
  jog,
  run,
  sit,
  sleep,
  eat,
  cook,
  shower,
  phone,
  read,
  type,
  exercise,
  dance,
  talk,
  pray,
  drive,
  wave,
  cheer,
  hang,
};

/** Props each clip shows (for docs/tests; clips set them on the pose themselves). */
export const CLIP_PROPS: Readonly<Partial<Record<AvatarClip, readonly AvatarProp[]>>> = {
  eat: ['bowl', 'spoon'],
  cook: ['ladle'],
  phone: ['phone'],
  read: ['book'],
  type: ['laptop'],
  drive: ['wheel'],
};

/** The stance a clip actually uses: full-body clips ignore the request; upper-body clips default to their own. */
export function resolveStance(clip: AvatarClip, requested?: AvatarStance): AvatarStance {
  const definition = CLIPS[clip] ?? CLIPS.idle;
  return definition.kind === 'full' ? 'stand' : (requested ?? definition.stance);
}

/** Evaluate a clip into `pose` (`ctx.stance` should come from `resolveStance`). */
export function evaluateClip(pose: Pose, clip: AvatarClip, ctx: ClipContext): void {
  const definition = CLIPS[clip] ?? CLIPS.idle;
  pose.reset();
  if (definition.kind === 'upper') applyStance(pose, ctx.stance, ctx.rig, ctx.t);
  definition.apply(pose, ctx);
}
