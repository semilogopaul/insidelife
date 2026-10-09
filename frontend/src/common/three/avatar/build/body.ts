import { domeRings, loft, superellipsoid, type LoftRing } from '../../geometry/primitives';
import { BONE, armWeights, legWeights, smoothstep, torsoWeights, type RigMetrics, type Side } from '../rig';
import { xf, type BuildContext } from './context';

/**
 * Body profiles shared by skin and garments. Garment shells slice and inflate these exact ring lists, so cloth and
 * skin get identical skin weights and never pull apart when animated.
 */

/** Torso core from crotch to shoulder line (no end caps), bottom → top. */
export function torsoCore(rig: RigMetrics): LoftRing[] {
  const t = rig.torso;
  const midLow = (rig.hipY + rig.waistY) / 2 + 0.015;
  const midHigh = (rig.waistY + rig.chestY) / 2;
  return [
    { y: rig.crotchY - 0.012, w: t.hipW * 0.82, d: t.hipD * 0.8 },
    { y: rig.crotchY + 0.012, w: t.hipW * 0.95, d: t.hipD * 0.95 },
    { y: rig.hipY + 0.035, w: t.hipW, d: t.hipD },
    { y: midLow, w: (t.hipW + t.waistW) / 2, d: (t.hipD + t.waistD) / 2 },
    { y: rig.waistY, w: t.waistW, d: t.waistD },
    { y: midHigh, w: (t.waistW + t.chestW) / 2, d: (t.waistD + t.chestD) / 2 + t.bust * 0.4, z: t.bust * 0.2 },
    { y: rig.chestY, w: t.chestW, d: t.chestD + t.bust, z: t.bust * 0.5 },
    { y: rig.shoulderY, w: t.shoulderW, d: t.chestD * 0.96, z: t.bust * 0.15 },
  ];
}

/** Shoulder rounding rings from the shoulder line up to a neck opening of `neckW`. */
export function shoulderRings(rig: RigMetrics, inflate: number, neckW: number, neckD: number): LoftRing[] {
  const t = rig.torso;
  const top = rig.shoulderTopY + inflate * 0.6;
  return [
    { y: rig.shoulderY + (top - rig.shoulderY) * 0.55, w: t.shoulderW * 0.94 + inflate * 2, d: t.chestD * 0.9 + inflate * 2 },
    { y: top - 0.006, w: t.shoulderW * 0.74 + inflate * 2, d: t.chestD * 0.74 + inflate * 2 },
    { y: top, w: Math.max(neckW, t.shoulderW * 0.5), d: Math.max(neckD, t.chestD * 0.56) },
  ];
}

export function armCore(rig: RigMetrics, side: Side): LoftRing[] {
  const x = side === 'L' ? rig.shoulderX : -rig.shoulderX;
  const ring = (y: number, r: number, depth = 1): LoftRing => ({ y, w: r * 2, d: r * 2 * depth, x });
  return [
    ring(rig.wristY - 0.012, rig.foreArmR * 0.82, 0.9),
    ring(rig.wristY + 0.02, rig.foreArmR * 0.86, 0.92),
    ring((rig.wristY + rig.elbowY) / 2, rig.foreArmR, 0.96),
    ring(rig.elbowY, (rig.foreArmR + rig.upperArmR) / 2),
    ring((rig.elbowY + rig.shoulderY) / 2, rig.upperArmR),
    ring(rig.shoulderY, rig.upperArmR * 1.06),
  ];
}

export function legCore(rig: RigMetrics, side: Side): LoftRing[] {
  const x = side === 'L' ? rig.legX : -rig.legX;
  const ring = (y: number, r: number, depth = 1, z = 0): LoftRing => ({ y, w: r * 2, d: r * 2 * depth, x, z });
  return [
    ring(rig.ankleY - 0.008, rig.ankleR, 1),
    ring(rig.ankleY + 0.03, rig.ankleR * 1.04),
    ring((rig.ankleY + rig.kneeY) / 2 + 0.015, rig.shinR, 1.02, -0.004),
    ring(rig.kneeY, rig.kneeR),
    ring((rig.kneeY + rig.hipY) / 2, (rig.kneeR + rig.thighR) / 2 * 1.04),
    ring(rig.hipY, rig.thighR),
    ring(rig.hipY + 0.05, rig.thighR * 0.96),
  ];
}

export function buildBody(ctx: BuildContext): void {
  const { rig } = ctx;
  const torsoSeg = ctx.seg(22, 10);
  const limbSeg = ctx.seg(14, 7);

  // Torso (skin; mostly covered by clothes but keeps crop tops, tanks and necklines honest).
  const core = torsoCore(rig);
  const torsoRings: LoftRing[] = [
    ...domeRings(core[0]!, -0.02, 2).reverse(),
    ...core,
    ...shoulderRings(rig, 0, rig.neckR * 2.1, rig.neckR * 2),
  ];
  ctx.add(loft(torsoRings, { segments: torsoSeg, exponent: 3, capStart: true, capEnd: true }), ctx.skinStyle(torsoWeights(rig), 0.1));

  // Neck.
  const neckRings: LoftRing[] = [
    { y: rig.shoulderTopY - 0.045, w: rig.neckR * 2.1, d: rig.neckR * 2 },
    { y: rig.headBaseY + 0.05, w: rig.neckR * 2, d: rig.neckR * 1.9 },
  ];
  const neckSkin = (_x: number, y: number): ReadonlyArray<readonly [number, number]> => {
    const t = smoothstep(rig.shoulderTopY - 0.02, rig.headBaseY, y);
    return [
      [BONE.chest, 1 - t],
      [BONE.neck, t],
    ];
  };
  ctx.add(loft(neckRings, { segments: limbSeg, exponent: 2 }), ctx.skinStyle(neckSkin, 0.35, -0.12));

  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1;
    // Arms.
    const arm = armCore(rig, side);
    const armRings = [...arm, ...domeRings(arm[arm.length - 1]!, 0.045, 3)];
    ctx.add(loft(armRings, { segments: limbSeg, exponent: 2.2, capStart: true, capEnd: true }), ctx.skinStyle(armWeights(rig, side), 0.12));
    buildHand(ctx, side);

    // Legs.
    const leg = legCore(rig, side);
    const legRings = [...leg, ...domeRings(leg[leg.length - 1]!, 0.04, 2)];
    ctx.add(loft(legRings, { segments: limbSeg, exponent: 2.2, capStart: true, capEnd: true }), ctx.skinStyle(legWeights(rig, side), 0.12));

    // Bare feet (shoes are built over them; they stay hidden inside closed shoes).
    if (!ctx.outfit.shoes) {
      const foot = superellipsoid({ w: 0.085, h: 0.055, d: 0.14, round: 0.55, segU: ctx.seg(12, 6), segV: ctx.seg(8, 4) });
      ctx.add(foot, ctx.skinStyle(side === 'L' ? BONE.footL : BONE.footR, 0.2), xf([sign * rig.legX, 0.028, 0.025]));
    }
  }
}

export function buildHand(ctx: BuildContext, side: Side): void {
  const { rig } = ctx;
  const sign = side === 'L' ? 1 : -1;
  const bone = side === 'L' ? BONE.handL : BONE.handR;
  const [w, h, d] = rig.hand;
  const palm = superellipsoid({ w, h, d, round: 0.55, segU: ctx.seg(12, 6), segV: ctx.seg(9, 4) });
  ctx.add(palm, ctx.skinStyle(bone, 0.15), xf([sign * rig.shoulderX, rig.wristY - h * 0.42, 0.004], [0, 0, sign * 0.06]));
  if (ctx.high) {
    const thumb = superellipsoid({ w: 0.028, h: 0.045, d: 0.03, round: 0.7, segU: 8, segV: 6 });
    ctx.add(thumb, ctx.skinStyle(bone, 0.1), xf([sign * (rig.shoulderX - w * 0.38), rig.wristY - h * 0.25, d * 0.42], [0.3, 0, -sign * 0.5]));
  }
}
