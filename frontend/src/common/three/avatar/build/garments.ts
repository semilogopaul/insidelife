import { Vector3 } from 'three';
import type { ClothingDefinition } from '@insidelife/shared';
import { domeRings, doubleSided, inflateRings, lerpRing, loft, sliceRings, smoothPath, superellipsoid, tube, type LoftRing } from '../../geometry/primitives';
import type { PartStyle, SkinWeights } from '../../geometry/part-builder';
import { luminance, shadeHex } from '../../materials/color-utils';
import { knownStyle } from '../outfit';
import { BONE, armBones, armWeights, legWeights, skirtWeights, smoothstep, torsoWeights, type RigMetrics, type Side } from '../rig';
import { armCore, legCore, shoulderRings, torsoCore } from './body';
import { SURFACE, xf, type BuildContext } from './context';

// ---------------------------------------------------------------------------------------------------------------
// Shared shell helpers
// ---------------------------------------------------------------------------------------------------------------

const LIP = 0.011;

/** Prepend an inner lip ring so a hem shows thickness instead of a paper edge. */
function withLip(rings: LoftRing[], lip = LIP): LoftRing[] {
  const first = rings[0]!;
  return [{ ...first, y: first.y + 0.016, w: Math.max(0.01, first.w - lip * 2), d: Math.max(0.01, first.d - lip * 2) }, ...rings];
}

/** Garment torso weights: torso bones above the hips, skirt behaviour (legs) below. */
export function garmentWeights(rig: RigMetrics): (x: number, y: number, z: number) => SkinWeights {
  const torso = torsoWeights(rig);
  const skirt = skirtWeights(rig);
  return (x, y, z) => (y >= rig.hipY + 0.04 ? torso(x, y, z) : skirt(x, y, z));
}

/** Front surface z of the torso at height `y` (for placing trims, pockets, buttons). */
function frontZ(rig: RigMetrics, y: number, inflate: number): number {
  const ring = sliceRings(torsoCore(rig), y, y + 0.001)[0]!;
  return (ring.z ?? 0) + ring.d / 2 + inflate;
}

type Neck = 'crew' | 'scoop' | 'wide' | 'collar' | 'shoulders';

interface BodiceSpec {
  readonly hemY: number;
  readonly inflate: number;
  readonly neck: Neck;
  /** Extra width at the hem (short tops) — fades out over 8 cm. */
  readonly flare?: number;
  /** Full width / depth at the hem for long garments (below the hips). */
  readonly hemW?: number;
  readonly hemD?: number;
  readonly shapeY?: (ring: number, angle: number) => number;
}

function neckOpening(rig: RigMetrics, neck: Neck): readonly [number, number] {
  const base = rig.neckR * 2;
  switch (neck) {
    case 'crew':
      return [base + 0.03, base + 0.028];
    case 'collar':
      return [base + 0.022, base + 0.02];
    case 'scoop':
      return [rig.torso.shoulderW * 0.6, rig.torso.chestD * 0.66];
    case 'wide':
      return [rig.torso.shoulderW * 0.74, rig.torso.chestD * 0.6];
    case 'shoulders':
      return [rig.torso.shoulderW * 0.86, rig.torso.chestD * 0.82];
  }
}

function bodiceRings(rig: RigMetrics, spec: BodiceSpec): LoftRing[] {
  const core = torsoCore(rig);
  const hipRingY = rig.hipY + 0.035;
  let rings: LoftRing[];
  if (spec.hemY >= hipRingY - 0.005) {
    rings = inflateRings(sliceRings(core, spec.hemY, rig.shoulderY), (ring) => spec.inflate + (spec.flare ?? 0) * smoothstep(spec.hemY + 0.08, spec.hemY, ring.y));
  } else {
    const upper = inflateRings(sliceRings(core, hipRingY, rig.shoulderY), spec.inflate);
    const hip = upper[0]!;
    const hem: LoftRing = { y: spec.hemY, w: spec.hemW ?? hip.w + 0.02, d: spec.hemD ?? hip.d + 0.02 };
    const steps = Math.max(2, Math.ceil((hipRingY - spec.hemY) / 0.06));
    const lower: LoftRing[] = [];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      // Ease so the garment falls straight from the hips before flaring.
      lower.push({ ...lerpRing(hem, hip, smoothstep(0, 1, t)), y: spec.hemY + (hipRingY - spec.hemY) * t });
    }
    rings = [...lower, ...upper];
  }
  const [nw, nd] = neckOpening(rig, spec.neck);
  if (spec.neck === 'shoulders') {
    const top = rings[rings.length - 1]!;
    rings.push({ ...top, y: rig.shoulderY + 0.012, w: nw, d: nd });
  } else rings.push(...shoulderRings(rig, spec.inflate, nw, nd));
  return withLip(rings);
}

function addBodice(ctx: BuildContext, style: PartStyle, spec: BodiceSpec): void {
  ctx.chestInflate = Math.max(ctx.chestInflate, spec.inflate);
  ctx.add(loft(bodiceRings(ctx.rig, spec), { segments: ctx.seg(26, 12), exponent: 3, shapeY: spec.shapeY ? (r, a) => spec.shapeY!(r, a) : undefined }), style);
}

interface SleeveSpec {
  /** Bottom of the sleeve. */
  readonly endY: number;
  readonly inflate: number;
  /** Extra width at the cuff (bell sleeves). */
  readonly flare?: number;
  /** Puff at the shoulder (blouses, gowns). */
  readonly puff?: number;
}

function addSleeve(ctx: BuildContext, side: Side, style: PartStyle, spec: SleeveSpec): void {
  const { rig } = ctx;
  const arm = armCore(rig, side);
  const top = arm[arm.length - 1]!;
  const sliced = sliceRings(arm, spec.endY, rig.shoulderY);
  const span = Math.max(0.02, rig.shoulderY - spec.endY);
  const rings = sliced.map((ring) => {
    const t = 1 - (ring.y - spec.endY) / span; // 1 at the cuff
    const grow = spec.inflate + (spec.flare ?? 0) * t * t + (spec.puff ?? 0) * smoothstep(0.55, 0, t);
    return { ...ring, w: ring.w + grow * 2, d: ring.d + grow * 2 };
  });
  const cap = domeRings({ ...top, w: top.w + (spec.inflate + (spec.puff ?? 0)) * 2, d: top.d + (spec.inflate + (spec.puff ?? 0)) * 2 }, 0.05 + spec.inflate, 3);
  ctx.add(loft(withLip([...rings, ...cap]), { segments: ctx.seg(14, 7), exponent: 2.3, capEnd: true }), { ...style, skin: armWeights(rig, side) });
}

function addSleeves(ctx: BuildContext, style: PartStyle, spec: SleeveSpec): void {
  addSleeve(ctx, 'L', style, spec);
  addSleeve(ctx, 'R', style, spec);
}

/** A ring band around a limb or the torso (cuffs, waistbands, collars). */
function band(ctx: BuildContext, ring: LoftRing, height: number, style: PartStyle): void {
  const rings: LoftRing[] = [
    { ...ring, y: ring.y - height / 2 },
    { ...ring, y: ring.y + height / 2 },
  ];
  ctx.add(loft(withLip(rings, 0.006), { segments: ctx.seg(16, 8), exponent: 2.6, capEnd: false }), style);
}

function cuff(ctx: BuildContext, side: Side, y: number, inflate: number, style: PartStyle): void {
  const ring = sliceRings(armCore(ctx.rig, side), y, y + 0.001)[0]!;
  band(ctx, { ...ring, w: ring.w + inflate * 2, d: ring.d + inflate * 2 }, 0.03, { ...style, skin: armWeights(ctx.rig, side) });
}

interface PantsSpec {
  readonly hemY: number;
  readonly inflate: number;
  readonly flare?: number;
  /** Narrow cuff at the hem (joggers). */
  readonly taper?: number;
}

function addPelvis(ctx: BuildContext, style: PartStyle, inflate: number, topY: number): void {
  const { rig } = ctx;
  const core = torsoCore(rig);
  const rings = inflateRings(sliceRings(core, rig.crotchY - 0.012, topY), inflate);
  const bottom = rings[0]!;
  const all = [...domeRings(bottom, -0.025, 2).reverse(), ...rings];
  ctx.add(loft(all, { segments: ctx.seg(24, 10), exponent: 3, capStart: true }), { ...style, skin: torsoWeights(rig) });
}

function addPantLeg(ctx: BuildContext, side: Side, style: PartStyle, spec: PantsSpec): void {
  const { rig } = ctx;
  const leg = legCore(rig, side);
  const sliced = sliceRings(leg, spec.hemY, rig.hipY + 0.05);
  const span = rig.hipY + 0.05 - spec.hemY;
  const rings = sliced.map((ring) => {
    const t = 1 - (ring.y - spec.hemY) / span;
    const grow = spec.inflate + (spec.flare ?? 0) * t * t - (spec.taper ?? 0) * smoothstep(0.75, 1, t);
    return { ...ring, w: ring.w + grow * 2, d: ring.d + grow * 2 };
  });
  const top = rings[rings.length - 1]!;
  ctx.add(loft(withLip([...rings, ...domeRings(top, 0.05, 2)]), { segments: ctx.seg(14, 7), exponent: 2.3, capEnd: true }), { ...style, skin: legWeights(rig, side) });
}

function addPants(ctx: BuildContext, style: PartStyle, spec: PantsSpec, waistY: number): void {
  addPelvis(ctx, style, spec.inflate + 0.002, waistY);
  addPantLeg(ctx, 'L', style, spec);
  addPantLeg(ctx, 'R', style, spec);
}

function addWaistband(ctx: BuildContext, y: number, inflate: number, style: PartStyle, buckle?: PartStyle): void {
  const { rig } = ctx;
  const ring = sliceRings(torsoCore(rig), y, y + 0.001)[0]!;
  band(ctx, { ...ring, w: ring.w + inflate * 2 + 0.006, d: ring.d + inflate * 2 + 0.006 }, 0.032, { ...style, skin: torsoWeights(rig) });
  if (buckle) {
    const plate = superellipsoid({ w: 0.045, h: 0.03, d: 0.012, round: 0.4, segU: 8, segV: 6 });
    ctx.add(plate, { ...buckle, skin: BONE.hips }, xf([0, y, frontZ(rig, y, inflate) + 0.008]));
  }
}

/** Skirt / wrapper / gown skirt from the waist down. */
function addSkirt(ctx: BuildContext, style: PartStyle, topY: number, hemY: number, topInflate: number, hemW: number, hemD: number, shapeY?: (ring: number, angle: number) => number): void {
  const { rig } = ctx;
  const core = torsoCore(rig);
  const upper = inflateRings(sliceRings(core, Math.max(rig.hipY + 0.035, hemY + 0.02), topY), topInflate);
  const hip = upper[0]!;
  const rings: LoftRing[] = [];
  if (hemY < hip.y - 0.01) {
    const steps = Math.max(2, Math.ceil((hip.y - hemY) / 0.05));
    const hem: LoftRing = { y: hemY, w: hemW, d: hemD };
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      rings.push({ ...lerpRing(hem, hip, smoothstep(0, 1, t) ** 0.8), y: hemY + (hip.y - hemY) * t });
    }
  }
  const all = withLip([...rings, ...upper]);
  ctx.add(loft(all, { segments: ctx.seg(26, 12), exponent: 2.8, shapeY }), { ...style, skin: garmentWeights(rig) });
}

function addButtons(ctx: BuildContext, x: number, fromY: number, toY: number, count: number, inflate: number, style: PartStyle): void {
  if (!ctx.high) return;
  for (let i = 0; i < count; i++) {
    const y = fromY + ((toY - fromY) * i) / Math.max(1, count - 1);
    const button = superellipsoid({ w: 0.016, h: 0.016, d: 0.008, round: 0.9, segU: 8, segV: 6 });
    ctx.add(button, { ...style, skin: torsoWeights(ctx.rig) }, xf([x, y, frontZ(ctx.rig, y, inflate) + 0.004]));
  }
}

/** A flat panel lying on the front of the torso (pockets, plackets, embroidery). */
function addPanel(ctx: BuildContext, x: number, y: number, size: readonly [number, number], inflate: number, style: PartStyle, tilt = 0, depth = 0.008): void {
  const panel = superellipsoid({ w: size[0], h: size[1], d: depth, round: 0.35, segU: ctx.seg(10, 4), segV: ctx.seg(8, 4) });
  const z = frontZ(ctx.rig, y, inflate) - Math.abs(x) * 0.18 + depth * 0.3;
  ctx.add(panel, { ...style, skin: style.skin ?? torsoWeights(ctx.rig) }, xf([x, y, z], [0.12, x * 1.4, tilt]));
}

/** Pointed shirt collar: two flaps folded down over the neckline. */
function addCollarFlaps(ctx: BuildContext, inflate: number, style: PartStyle, spread = 0.5): void {
  const { rig } = ctx;
  for (const sign of [1, -1]) {
    const flap = superellipsoid({ w: 0.075, h: 0.05, d: 0.012, round: 0.3, segU: 8, segV: 6 });
    const y = rig.shoulderTopY - 0.012;
    ctx.add(flap, { ...style, skin: BONE.chest }, xf([sign * 0.045, y, frontZ(rig, rig.shoulderY, inflate) - 0.035], [-0.9, sign * 0.2, sign * spread]));
  }
}

function addCollarBand(ctx: BuildContext, inflate: number, height: number, style: PartStyle): void {
  const { rig } = ctx;
  const r = rig.neckR + 0.012 + inflate * 0.3;
  const rings: LoftRing[] = [
    { y: rig.shoulderTopY - 0.012, w: r * 2.15, d: r * 2.05 },
    { y: rig.shoulderTopY + height, w: r * 2, d: r * 1.95 },
  ];
  ctx.add(loft(withLip(rings, 0.006), { segments: ctx.seg(16, 8), exponent: 2.2 }), { ...style, skin: (_x, y) => [[BONE.chest, 1 - smoothstep(rig.shoulderTopY, rig.headBaseY, y)], [BONE.neck, smoothstep(rig.shoulderTopY, rig.headBaseY, y)]] });
}

/** A skin-coloured V on the chest makes any round neckline read as a V-neck. */
function addVNeck(ctx: BuildContext, inflate: number, depth: number, trim?: PartStyle): void {
  const { rig } = ctx;
  const y = rig.shoulderTopY - depth / 2 - 0.008;
  const v = superellipsoid({ w: 0.075, h: depth, d: 0.006, round: 0.35, segU: 8, segV: 6, deform: (p) => { p.x *= 0.15 + 0.85 * smoothstep(-depth / 2, depth / 2, p.y); } });
  ctx.add(v, ctx.skinStyle(BONE.chest, 0.1), xf([0, y, frontZ(rig, y, inflate) - 0.002], [0.35, 0, 0]));
  if (trim && ctx.high) {
    for (const sign of [1, -1]) {
      const edge = superellipsoid({ w: 0.012, h: depth * 1.05, d: 0.008, round: 0.5, segU: 6, segV: 6 });
      ctx.add(edge, { ...trim, skin: BONE.chest }, xf([sign * 0.022, y + 0.004, frontZ(rig, y, inflate) + 0.001], [0.35, 0, sign * 0.42]));
    }
  }
}

function addLapels(ctx: BuildContext, inflate: number, style: PartStyle, shirt: PartStyle, tie?: PartStyle): void {
  const { rig } = ctx;
  const top = rig.shoulderTopY - 0.01;
  const bottom = rig.waistY + 0.02;
  const mid = (top + bottom) / 2;
  // Shirt V and tie.
  const vee = superellipsoid({ w: 0.1, h: top - bottom, d: 0.006, round: 0.3, segU: 8, segV: 6, deform: (p) => { p.x *= 0.1 + 0.9 * smoothstep(-(top - bottom) / 2, (top - bottom) / 2, p.y); } });
  ctx.add(vee, { ...shirt, skin: BONE.chest }, xf([0, mid, frontZ(rig, mid, inflate) + 0.001], [0.12, 0, 0]));
  if (tie) {
    const knot = superellipsoid({ w: 0.03, h: 0.028, d: 0.016, round: 0.6, segU: 8, segV: 6 });
    ctx.add(knot, { ...tie, skin: BONE.chest }, xf([0, top - 0.018, frontZ(rig, top - 0.02, inflate) + 0.004]));
    const blade = superellipsoid({ w: 0.036, h: top - bottom - 0.04, d: 0.008, round: 0.4, segU: 8, segV: 6, deform: (p) => { p.x *= 0.7 + 0.3 * smoothstep((top - bottom) / 2, -(top - bottom) / 2, p.y); } });
    ctx.add(blade, { ...tie, skin: BONE.chest }, xf([0, mid - 0.025, frontZ(rig, mid, inflate) + 0.006], [0.1, 0, 0]));
  }
  for (const sign of [1, -1]) {
    const lapel = superellipsoid({ w: 0.06, h: top - bottom + 0.02, d: 0.01, round: 0.3, segU: 8, segV: 8, deform: (p) => { p.x *= 0.35 + 0.65 * smoothstep(-(top - bottom) / 2, (top - bottom) / 2, p.y); } });
    ctx.add(lapel, { ...style, skin: BONE.chest }, xf([sign * 0.055, mid, frontZ(rig, mid, inflate) + 0.006], [0.1, sign * 0.25, sign * 0.3]));
  }
}

function addStrap(ctx: BuildContext, side: Side, inflate: number, style: PartStyle): void {
  const { rig } = ctx;
  const sign = side === 'L' ? 1 : -1;
  const x = sign * rig.torso.shoulderW * 0.3;
  const fz = frontZ(rig, rig.chestY + 0.04, inflate);
  const pts = [new Vector3(x, rig.chestY + 0.04, fz - 0.01), new Vector3(x, rig.shoulderTopY + 0.004, 0.0), new Vector3(x, rig.chestY + 0.02, -fz + 0.01)];
  ctx.add(tube(smoothPath(pts, 10), { radius: 0.012, radial: 6, flatten: 0.4 }), { ...style, skin: BONE.chest });
}

function tieColor(item: ClothingDefinition): string {
  return luminance(item.primary) < 0.08 ? '#7a1f2b' : shadeHex(item.primary, -0.35);
}

function shirtColor(item: ClothingDefinition): string {
  return luminance(item.secondary) > 0.55 ? item.secondary : '#f3f2ee';
}

// ---------------------------------------------------------------------------------------------------------------
// Tops
// ---------------------------------------------------------------------------------------------------------------

export function buildTop(ctx: BuildContext, item: ClothingDefinition): void {
  const { rig } = ctx;
  const style = knownStyle('top', item.style);
  const torso = torsoWeights(rig);
  const main = ctx.cloth(item, torso);
  const trim = ctx.trim(item, torso);
  const patterned = item.pattern !== 'solid';
  switch (style) {
    case 'tee':
    case 'jersey': {
      addBodice(ctx, main, { hemY: rig.hipY + 0.05, inflate: 0.012, neck: 'crew', flare: 0.006 });
      addSleeves(ctx, main, { endY: rig.shoulderY - 0.085, inflate: 0.012, flare: 0.008 });
      if (style === 'jersey') {
        addVNeck(ctx, 0.012, 0.06, trim);
        cuff(ctx, 'L', rig.shoulderY - 0.08, 0.02, trim);
        cuff(ctx, 'R', rig.shoulderY - 0.08, 0.02, trim);
        addPanel(ctx, 0.07, rig.chestY + 0.02, [0.04, 0.045], 0.012, trim);
      } else addCollarBand(ctx, 0.012, 0.006, ctx.tone(item, -0.08, torso));
      return;
    }
    case 'polo': {
      addBodice(ctx, main, { hemY: rig.hipY + 0.05, inflate: 0.012, neck: 'collar', flare: 0.006 });
      addSleeves(ctx, main, { endY: rig.shoulderY - 0.08, inflate: 0.012, flare: 0.006 });
      cuff(ctx, 'L', rig.shoulderY - 0.075, 0.018, ctx.tone(item, -0.06, torso));
      cuff(ctx, 'R', rig.shoulderY - 0.075, 0.018, ctx.tone(item, -0.06, torso));
      addCollarBand(ctx, 0.012, 0.012, patterned ? trim : ctx.tone(item, -0.05, torso));
      addCollarFlaps(ctx, 0.012, patterned ? trim : ctx.tone(item, -0.04, torso), 0.7);
      addPanel(ctx, 0, rig.shoulderTopY - 0.06, [0.03, 0.08], 0.012, ctx.tone(item, -0.07, torso));
      addButtons(ctx, 0, rig.shoulderTopY - 0.035, rig.shoulderTopY - 0.085, 2, 0.014, ctx.solid(item.secondary, SURFACE.plastic, torso));
      return;
    }
    case 'shirt': {
      const short = item.pattern === 'ankara' || item.pattern === 'adire' || item.pattern === 'lace';
      addBodice(ctx, main, { hemY: rig.hipY + 0.03, inflate: 0.013, neck: 'collar', flare: 0.008 });
      if (short) addSleeves(ctx, main, { endY: rig.shoulderY - 0.1, inflate: 0.013, flare: 0.012 });
      else {
        addSleeves(ctx, main, { endY: rig.wristY + 0.012, inflate: 0.011 });
        cuff(ctx, 'L', rig.wristY + 0.025, 0.015, main);
        cuff(ctx, 'R', rig.wristY + 0.025, 0.015, main);
      }
      addCollarBand(ctx, 0.013, 0.01, main);
      addCollarFlaps(ctx, 0.013, main, 0.55);
      addPanel(ctx, 0, (rig.waistY + rig.shoulderTopY) / 2 - 0.02, [0.026, rig.shoulderTopY - rig.hipY - 0.06], 0.013, ctx.cloth(item, torso, { tint: -0.06 }), 0, 0.006);
      addButtons(ctx, 0, rig.shoulderTopY - 0.05, rig.waistY - 0.03, 4, 0.016, ctx.solid(patterned ? item.secondary : '#f2efe6', SURFACE.plastic, torso));
      if (!short) addPanel(ctx, 0.075, rig.chestY + 0.03, [0.06, 0.06], 0.014, ctx.cloth(item, torso, { tint: -0.04 }));
      return;
    }
    case 'hoodie': {
      addBodice(ctx, main, { hemY: rig.hipY + 0.015, inflate: 0.022, neck: 'crew', flare: -0.004 });
      addSleeves(ctx, main, { endY: rig.wristY + 0.005, inflate: 0.02 });
      const rib = ctx.tone(item, -0.12, torso, SURFACE.knit);
      cuff(ctx, 'L', rig.wristY + 0.018, 0.022, rib);
      cuff(ctx, 'R', rig.wristY + 0.018, 0.022, rib);
      addWaistband(ctx, rig.hipY + 0.03, 0.02, rib);
      // Hood bunched on the shoulders and upper back.
      const hood = superellipsoid({ w: rig.torso.shoulderW * 0.82, h: 0.12, d: 0.16, round: 0.7, segU: ctx.seg(18, 8), segV: ctx.seg(10, 5) });
      ctx.add(hood, { ...main, skin: BONE.chest }, xf([0, rig.shoulderTopY + 0.005, -rig.torso.chestD * 0.32], [-0.5, 0, 0]));
      // Kangaroo pocket + drawstrings.
      addPanel(ctx, 0, rig.waistY - 0.035, [0.17, 0.08], 0.022, ctx.tone(item, -0.05, torso), 0, 0.012);
      if (ctx.high) {
        for (const sign of [1, -1]) {
          const z = frontZ(rig, rig.chestY, 0.024);
          const pts = [new Vector3(sign * 0.035, rig.shoulderTopY - 0.02, z - 0.01), new Vector3(sign * 0.04, rig.chestY - 0.04, z + 0.004)];
          ctx.add(tube(pts, { radius: 0.006, radial: 5 }), ctx.solid(item.secondary, SURFACE.cloth, BONE.chest));
        }
      }
      return;
    }
    case 'blazer': {
      addBodice(ctx, main, { hemY: rig.crotchY + 0.01, inflate: 0.02, neck: 'scoop', flare: 0.01 });
      addSleeves(ctx, main, { endY: rig.wristY + 0.01, inflate: 0.017 });
      const shirt = ctx.solid(shirtColor(item), SURFACE.cloth, BONE.chest);
      cuff(ctx, 'L', rig.wristY + 0.006, 0.012, shirt);
      cuff(ctx, 'R', rig.wristY + 0.006, 0.012, shirt);
      addCollarBand(ctx, 0.012, 0.012, shirt);
      addLapels(ctx, 0.02, ctx.cloth(item, torso, { tint: -0.05 }), shirt);
      addButtons(ctx, 0.012, rig.waistY + 0.01, rig.waistY - 0.04, 2, 0.022, ctx.solid(shadeHex(item.primary, -0.4), SURFACE.plastic, torso));
      addPanel(ctx, 0.085, rig.chestY + 0.035, [0.05, 0.012], 0.022, ctx.solid(item.secondary, SURFACE.cloth, torso));
      return;
    }
    case 'tank': {
      addBodice(ctx, main, { hemY: rig.hipY + 0.05, inflate: 0.01, neck: 'shoulders' });
      addStrap(ctx, 'L', 0.01, main);
      addStrap(ctx, 'R', 0.01, main);
      return;
    }
    case 'blouse': {
      addBodice(ctx, main, { hemY: rig.waistY - 0.015, inflate: 0.012, neck: 'wide' });
      // Peplum flare.
      addSkirt(ctx, main, rig.waistY + 0.005, rig.hipY + 0.005, 0.016, rig.torso.hipW + 0.1, rig.torso.hipD + 0.08);
      addSleeves(ctx, main, { endY: rig.shoulderY - 0.08, inflate: 0.012, puff: 0.022, flare: 0.006 });
      addWaistband(ctx, rig.waistY - 0.005, 0.012, ctx.cloth(item, torso, { tint: -0.08 }));
      return;
    }
    case 'crop': {
      addBodice(ctx, main, { hemY: rig.waistY + 0.045, inflate: 0.01, neck: 'scoop' });
      addSleeves(ctx, main, { endY: rig.shoulderY - 0.06, inflate: 0.01 });
      return;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Bottoms
// ---------------------------------------------------------------------------------------------------------------

export function buildBottom(ctx: BuildContext, item: ClothingDefinition): void {
  const { rig } = ctx;
  const style = knownStyle('bottom', item.style);
  const main = ctx.cloth(item, BONE.hips);
  const waist = rig.waistY - 0.01;
  const belt = ctx.solid('#2b211c', SURFACE.leather, BONE.hips);
  const buckle = ctx.solid('#c9a64a', SURFACE.gold, BONE.hips);
  switch (style) {
    case 'jeans': {
      addPants(ctx, main, { hemY: rig.ankleY + 0.004, inflate: 0.013, flare: 0.004 }, waist);
      addWaistband(ctx, waist - 0.012, 0.013, belt, buckle);
      if (ctx.high) {
        for (const side of ['L', 'R'] as const) {
          const ring = sliceRings(legCore(rig, side), rig.ankleY + 0.02, rig.ankleY + 0.021)[0]!;
          band(ctx, { ...ring, w: ring.w + 0.036, d: ring.d + 0.036 }, 0.026, { ...ctx.cloth(item, BONE.hips, { tint: 0.12 }), skin: legWeights(rig, side) });
        }
      }
      return;
    }
    case 'chinos':
    case 'trousers': {
      const wide = style === 'trousers';
      addPants(ctx, main, { hemY: rig.ankleY + 0.004, inflate: wide ? 0.016 : 0.013, flare: wide ? 0.01 : 0.003 }, waist);
      addWaistband(ctx, waist - 0.012, 0.014, style === 'chinos' ? belt : ctx.tone(item, -0.15, BONE.hips), style === 'chinos' ? buckle : undefined);
      return;
    }
    case 'shorts': {
      addPants(ctx, main, { hemY: rig.kneeY + 0.035, inflate: 0.016, flare: 0.012 }, waist);
      addWaistband(ctx, waist - 0.012, 0.016, ctx.tone(item, -0.12, BONE.hips));
      if (ctx.high && item.pattern === 'solid') {
        for (const side of ['L', 'R'] as const) {
          const sign = side === 'L' ? 1 : -1;
          const pocket = superellipsoid({ w: 0.014, h: 0.06, d: 0.055, round: 0.35, segU: 6, segV: 6 });
          ctx.add(pocket, { ...ctx.tone(item, -0.08, BONE.hips), skin: legWeights(rig, side) }, xf([sign * (rig.legX + rig.thighR + 0.02), (rig.kneeY + rig.hipY) / 2 + 0.02, 0]));
        }
      }
      return;
    }
    case 'joggers': {
      addPants(ctx, main, { hemY: rig.ankleY + 0.004, inflate: 0.018, flare: 0.006, taper: 0.016 }, waist);
      const rib = ctx.solid(item.pattern === 'solid' ? shadeHex(item.primary, -0.12) : item.primary, SURFACE.knit, BONE.hips);
      for (const side of ['L', 'R'] as const) {
        const ring = sliceRings(legCore(rig, side), rig.ankleY + 0.02, rig.ankleY + 0.021)[0]!;
        band(ctx, { ...ring, w: ring.w + 0.012, d: ring.d + 0.012 }, 0.03, { ...rib, skin: legWeights(rig, side) });
      }
      addWaistband(ctx, waist - 0.01, 0.018, rib);
      return;
    }
    case 'skirt': {
      addPelvis(ctx, main, 0.012, waist);
      addSkirt(ctx, main, waist, rig.kneeY - 0.035, 0.014, rig.torso.hipW + 0.07, rig.torso.hipD + 0.05);
      addWaistband(ctx, waist - 0.01, 0.015, ctx.cloth(item, BONE.hips, { tint: -0.1 }));
      return;
    }
    case 'wrapper': {
      addWrapper(ctx, item, main, waist);
      return;
    }
  }
}

function addWrapper(ctx: BuildContext, item: ClothingDefinition, main: PartStyle, waist: number): void {
  const { rig } = ctx;
  addPelvis(ctx, main, 0.014, waist);
  addSkirt(ctx, main, waist, rig.ankleY + 0.012, 0.016, rig.torso.hipW + 0.035, rig.torso.hipD + 0.03);
  // Overlapping front flap and the tuck at the waist.
  const flap = doubleSided(
    loft(
      [
        { y: rig.ankleY + 0.015, w: rig.torso.hipW + 0.06, d: rig.torso.hipD + 0.052 },
        { y: (waist + rig.ankleY) / 2, w: rig.torso.hipW + 0.06, d: rig.torso.hipD + 0.06 },
        { y: rig.hipY + 0.03, w: rig.torso.hipW + 0.062, d: rig.torso.hipD + 0.062 },
        { y: waist, w: rig.torso.waistW + 0.05, d: rig.torso.waistD + 0.05 },
      ],
      { segments: ctx.seg(10, 5), exponent: 2.8, arc: [Math.PI * 0.62, Math.PI * 1.2] },
    ),
    0.006,
  );
  ctx.add(flap, { ...ctx.cloth(item, BONE.hips, { tint: -0.04 }), skin: garmentWeights(rig) });
  const knot = superellipsoid({ w: 0.06, h: 0.045, d: 0.035, round: 0.6, segU: 8, segV: 6 });
  ctx.add(knot, { ...main, skin: BONE.hips }, xf([-rig.torso.waistW * 0.3, waist - 0.005, frontZ(rig, waist, 0.02) - 0.005]));
}

// ---------------------------------------------------------------------------------------------------------------
// Full outfits
// ---------------------------------------------------------------------------------------------------------------

/** Agbada robe weights: the wide sides ride the arms (so sleeves fling like wings), the centre rides the body. */
function agbadaWeights(rig: RigMetrics): (x: number, y: number, z: number) => SkinWeights {
  const body = garmentWeights(rig);
  return (x, y, z) => {
    const side = x >= 0 ? 'L' : 'R';
    const arm = armBones(side);
    const share = smoothstep(rig.shoulderX * 0.62, rig.shoulderX * 1.3, Math.abs(x)) * smoothstep(rig.shoulderTopY + 0.06, rig.shoulderY - 0.02, y);
    const fore = smoothstep(rig.elbowY + 0.04, rig.elbowY - 0.06, y);
    const out: Array<readonly [number, number]> = [
      [arm.upper, share * (1 - fore)],
      [arm.fore, share * fore],
    ];
    for (const [bone, weight] of body(x, y, z)) out.push([bone, weight * (1 - share)]);
    return out;
  };
}

export function buildFull(ctx: BuildContext, item: ClothingDefinition): void {
  const { rig } = ctx;
  const style = knownStyle('full', item.style);
  const torso = torsoWeights(rig);
  const main = ctx.cloth(item, torso);
  const trim = ctx.trim(item, torso);
  const thread = ctx.solid(item.secondary, SURFACE.silk, torso);
  const waist = rig.waistY - 0.01;
  switch (style) {
    case 'agbada': {
      // Sokoto (trousers) and buba (inner tunic) in the same cloth.
      addPants(ctx, main, { hemY: rig.ankleY + 0.004, inflate: 0.014, flare: 0.004 }, waist);
      addBodice(ctx, main, { hemY: rig.kneeY + 0.04, inflate: 0.014, neck: 'crew', hemW: rig.torso.hipW + 0.06, hemD: rig.torso.hipD + 0.05 });
      addSleeves(ctx, main, { endY: rig.wristY + 0.01, inflate: 0.016, flare: 0.01 });
      // The robe: a wide, flowing trapezoid from the shoulders, sides lifted where the arms hold it.
      const robeW = rig.shoulderX * 2 + 0.2;
      const hemY = rig.ankleY + 0.07;
      const sideHemY = rig.wristY - 0.02;
      const depth = rig.torso.chestD + 0.085;
      const rings: LoftRing[] = [
        { y: hemY, w: robeW + 0.05, d: depth + 0.03 },
        { y: (hemY + rig.waistY) / 2, w: robeW + 0.04, d: depth + 0.025 },
        { y: rig.waistY, w: robeW + 0.025, d: depth + 0.02 },
        { y: rig.chestY, w: robeW, d: depth },
        { y: rig.shoulderY + 0.015, w: robeW - 0.02, d: depth - 0.01 },
        { y: rig.shoulderTopY - 0.008, w: rig.torso.shoulderW * 1.02, d: rig.torso.chestD * 0.92 },
        { y: rig.shoulderTopY + 0.016, w: rig.neckR * 2 + 0.08, d: rig.neckR * 2 + 0.06 },
      ];
      const robe = withLip(rings, 0.012);
      ctx.chestInflate = Math.max(ctx.chestInflate, 0.06);
      const lift = sideHemY - hemY;
      ctx.add(
        loft(robe, {
          segments: ctx.seg(40, 16),
          exponent: 4.2,
          shapeY: (ring, angle) => {
            if (ring > 3) return 0;
            const sideness = Math.abs(Math.sin(angle)) ** 3;
            const fade = ring === 3 ? 0.3 : ring === 2 ? 0.7 : 1;
            return lift * sideness * fade;
          },
          // Soft vertical folds.
          shapeR: (ring, angle) => (ring < 4 ? 1 + 0.025 * Math.sin(angle * 9) * (1 - ring / 4) : 1),
        }),
        { ...ctx.cloth(item, agbadaWeights(rig), { shade: 0.3 }) },
      );
      // Embroidery: neckline plate and the big left-breast pocket.
      addPanel(ctx, 0, rig.chestY + 0.03, [0.15, 0.17], 0.06, thread, 0, 0.01);
      addPanel(ctx, 0.12, rig.chestY - 0.01, [0.1, 0.12], 0.064, thread, 0, 0.008);
      return;
    }
    case 'kaftan': {
      addPants(ctx, main, { hemY: rig.ankleY + 0.004, inflate: 0.013 }, waist);
      addBodice(ctx, main, { hemY: rig.kneeY - 0.045, inflate: 0.016, neck: 'crew', hemW: rig.torso.hipW + 0.08, hemD: rig.torso.hipD + 0.06 });
      addSleeves(ctx, main, { endY: rig.wristY + 0.008, inflate: 0.014, flare: 0.006 });
      addCollarBand(ctx, 0.016, 0.006, thread);
      addPanel(ctx, 0, rig.chestY - 0.005, [0.05, 0.2], 0.016, thread, 0, 0.007);
      addPanel(ctx, 0, rig.shoulderTopY - 0.025, [0.12, 0.035], 0.016, thread, 0, 0.007);
      cuff(ctx, 'L', rig.wristY + 0.02, 0.016, thread);
      cuff(ctx, 'R', rig.wristY + 0.02, 0.016, thread);
      return;
    }
    case 'senator': {
      addPants(ctx, main, { hemY: rig.ankleY + 0.004, inflate: 0.013 }, waist);
      addBodice(ctx, main, { hemY: rig.crotchY - 0.06, inflate: 0.016, neck: 'collar', hemW: rig.torso.hipW + 0.05, hemD: rig.torso.hipD + 0.04 });
      addSleeves(ctx, main, { endY: rig.wristY + 0.008, inflate: 0.014 });
      addCollarBand(ctx, 0.016, 0.018, ctx.cloth(item, torso, { tint: -0.06 }));
      addPanel(ctx, -0.045, rig.chestY - 0.01, [0.03, 0.22], 0.016, thread, 0, 0.006);
      addButtons(ctx, -0.045, rig.shoulderTopY - 0.05, rig.waistY - 0.02, 5, 0.022, ctx.solid(item.secondary, SURFACE.gold, torso));
      addPanel(ctx, 0.08, rig.chestY + 0.02, [0.06, 0.012], 0.018, thread);
      return;
    }
    case 'buba-iro': {
      addWrapper(ctx, item, main, waist);
      addBodice(ctx, main, { hemY: rig.hipY - 0.01, inflate: 0.022, neck: 'wide', hemW: rig.torso.hipW + 0.07, hemD: rig.torso.hipD + 0.06 });
      addSleeves(ctx, main, { endY: (rig.elbowY + rig.wristY) / 2 - 0.01, inflate: 0.02, flare: 0.022 });
      // Ipele: sash over the left shoulder.
      const fz = frontZ(rig, rig.chestY, 0.03);
      const sash = [
        new Vector3(rig.torso.shoulderW * 0.36, rig.shoulderTopY + 0.012, -0.02),
        new Vector3(rig.torso.shoulderW * 0.22, rig.chestY + 0.03, fz),
        new Vector3(-rig.torso.waistW * 0.2, rig.waistY - 0.01, frontZ(rig, rig.waistY, 0.03)),
        new Vector3(-rig.torso.hipW * 0.46, rig.hipY - 0.02, 0.03),
      ];
      ctx.add(tube(smoothPath(sash, ctx.seg(14, 6)), { radius: 0.042, radial: ctx.seg(10, 6), flatten: 0.22 }), { ...ctx.cloth(item, torso, { tint: -0.03 }), skin: garmentWeights(rig) });
      return;
    }
    case 'gown': {
      addBodice(ctx, main, { hemY: rig.waistY - 0.01, inflate: 0.01, neck: 'scoop' });
      addSkirt(
        ctx,
        main,
        rig.waistY + 0.005,
        rig.ankleY - 0.01,
        0.013,
        rig.torso.hipW + 0.24,
        rig.torso.hipD + 0.2,
      );
      addSleeves(ctx, main, { endY: rig.shoulderY - 0.06, inflate: 0.01, puff: 0.02 });
      addWaistband(ctx, rig.waistY - 0.005, 0.012, trim);
      return;
    }
    case 'suit': {
      const variant = item.pattern === 'stripes' ? 'pinstripe' : 'default';
      const cloth = ctx.cloth(item, torso, { variant });
      addPants(ctx, cloth, { hemY: rig.ankleY + 0.004, inflate: 0.014, flare: 0.004 }, waist);
      addBodice(ctx, cloth, { hemY: rig.crotchY + 0.005, inflate: 0.021, neck: 'scoop', flare: 0.01 });
      addSleeves(ctx, cloth, { endY: rig.wristY + 0.01, inflate: 0.017 });
      const shirt = ctx.solid(shirtColor(item), SURFACE.cloth, BONE.chest);
      cuff(ctx, 'L', rig.wristY + 0.006, 0.012, shirt);
      cuff(ctx, 'R', rig.wristY + 0.006, 0.012, shirt);
      addCollarBand(ctx, 0.012, 0.012, shirt);
      addLapels(ctx, 0.021, ctx.cloth(item, torso, { variant, tint: -0.06 }), shirt, ctx.solid(tieColor(item), SURFACE.silk, BONE.chest));
      addButtons(ctx, 0.01, rig.waistY + 0.005, rig.waistY - 0.045, 2, 0.023, ctx.solid(shadeHex(item.primary, -0.45), SURFACE.plastic, torso));
      addPanel(ctx, 0.085, rig.chestY + 0.035, [0.045, 0.02], 0.023, ctx.solid('#f4f1ea', SURFACE.silk, torso));
      return;
    }
    case 'scrubs': {
      addPants(ctx, main, { hemY: rig.ankleY + 0.004, inflate: 0.017, flare: 0.006 }, waist);
      addBodice(ctx, main, { hemY: rig.hipY + 0.02, inflate: 0.016, neck: 'crew', flare: 0.008 });
      addSleeves(ctx, main, { endY: rig.shoulderY - 0.09, inflate: 0.015, flare: 0.008 });
      addVNeck(ctx, 0.016, 0.08, ctx.tone(item, -0.15, torso));
      addPanel(ctx, 0.08, rig.chestY - 0.005, [0.06, 0.06], 0.017, ctx.tone(item, -0.07, torso));
      if (ctx.high) {
        // Stethoscope.
        const fz = frontZ(rig, rig.chestY, 0.02);
        const pts = [
          new Vector3(0.06, rig.chestY - 0.03, fz + 0.004),
          new Vector3(0.075, rig.shoulderTopY - 0.005, 0.03),
          new Vector3(0, rig.shoulderTopY + 0.01, -0.07),
          new Vector3(-0.075, rig.shoulderTopY - 0.005, 0.03),
          new Vector3(-0.055, rig.chestY - 0.06, fz + 0.004),
        ];
        ctx.add(tube(smoothPath(pts, 18), { radius: 0.006, radial: 6 }), ctx.solid('#2b2f33', SURFACE.rubber, BONE.chest));
        const bell = superellipsoid({ w: 0.035, h: 0.035, d: 0.014, round: 0.9, segU: 10, segV: 6 });
        ctx.add(bell, ctx.solid('#c9ced3', SURFACE.metal, BONE.chest), xf([-0.055, rig.chestY - 0.075, fz + 0.008]));
      }
      return;
    }
    case 'uniform': {
      addPants(ctx, main, { hemY: rig.ankleY + 0.004, inflate: 0.015, flare: 0.004 }, waist);
      addBodice(ctx, main, { hemY: rig.crotchY + 0.01, inflate: 0.02, neck: 'collar', flare: 0.006 });
      addSleeves(ctx, main, { endY: rig.wristY + 0.008, inflate: 0.017 });
      addCollarBand(ctx, 0.02, 0.012, main);
      addCollarFlaps(ctx, 0.02, ctx.cloth(item, torso, { tint: -0.05 }), 0.75);
      addWaistband(ctx, rig.waistY - 0.015, 0.022, ctx.solid(item.secondary, SURFACE.cloth, torso), ctx.solid('#c9a64a', SURFACE.gold, torso));
      for (const sign of [1, -1]) {
        addPanel(ctx, sign * 0.085, rig.chestY + 0.01, [0.075, 0.075], 0.022, ctx.tone(item, -0.06, torso));
        addPanel(ctx, sign * 0.085, rig.chestY + 0.05, [0.08, 0.025], 0.03, ctx.tone(item, -0.12, torso));
        // Epaulettes.
        const ep = superellipsoid({ w: 0.04, h: 0.012, d: 0.1, round: 0.4, segU: 8, segV: 4 });
        ctx.add(ep, ctx.solid(item.secondary, SURFACE.cloth, BONE.chest), xf([sign * rig.torso.shoulderW * 0.4, rig.shoulderTopY + 0.004, 0], [0, 0, sign * -0.35]));
      }
      addButtons(ctx, 0, rig.shoulderTopY - 0.05, rig.waistY - 0.06, 5, 0.022, ctx.solid('#c9a64a', SURFACE.gold, torso));
      return;
    }
    case 'jumpsuit': {
      addPants(ctx, main, { hemY: rig.ankleY + 0.004, inflate: 0.017, flare: 0.006 }, rig.waistY + 0.02);
      addBodice(ctx, main, { hemY: rig.hipY + 0.035, inflate: 0.018, neck: 'collar' });
      addSleeves(ctx, main, { endY: rig.wristY + 0.006, inflate: 0.016 });
      addCollarBand(ctx, 0.018, 0.012, main);
      addCollarFlaps(ctx, 0.018, ctx.cloth(item, torso, { tint: -0.05 }), 0.7);
      addWaistband(ctx, rig.waistY - 0.01, 0.02, ctx.tone(item, -0.25, torso));
      addPanel(ctx, 0, (rig.waistY + rig.shoulderTopY) / 2, [0.014, rig.shoulderTopY - rig.waistY - 0.03], 0.019, ctx.solid(item.secondary, SURFACE.metal, torso), 0, 0.005);
      for (const sign of [1, -1]) addPanel(ctx, sign * 0.08, rig.chestY + 0.01, [0.065, 0.06], 0.02, ctx.tone(item, -0.07, torso));
      return;
    }
  }
}
