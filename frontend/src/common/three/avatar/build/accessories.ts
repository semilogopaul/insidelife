import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import type { ClothingDefinition } from '@insidelife/shared';
import { domeRings, doubleSided, loft, smoothPath, superellipsoid, tube, type LoftRing } from '../../geometry/primitives';
import type { PartStyle } from '../../geometry/part-builder';
import { luminance, mixHex, shadeHex } from '../../materials/color-utils';
import { FACE_LAYOUT, faceY } from '../face';
import { knownStyle } from '../outfit';
import { BONE, PROP_BONE, armWeights, legBones, legWeights, smoothstep, type AvatarProp, type Side } from '../rig';
import { SURFACE, xf, type BuildContext } from './context';
import { HEAD_ROUND, headFrontZ } from './head';
import type { HairInfo } from './hair';

// ---------------------------------------------------------------------------------------------------------------
// Shoes
// ---------------------------------------------------------------------------------------------------------------

export function buildShoes(ctx: BuildContext, item: ClothingDefinition): void {
  const { rig } = ctx;
  const style = knownStyle('shoes', item.style);
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1;
    const foot = legBones(side).foot;
    const x = sign * rig.legX;
    const main = ctx.cloth(item, foot, { surface: style === 'oxfords' ? SURFACE.gloss : style === 'sneakers' ? SURFACE.leather : SURFACE.leather, shade: 0.1 });
    const accent = ctx.solid(item.secondary, SURFACE.leather, foot, 0.05);
    const soleHex = style === 'sneakers' ? '#f1efe8' : style === 'heels' ? item.secondary : shadeHex(item.primary, -0.55);
    const sole = ctx.solid(soleHex, SURFACE.rubber, foot, 0);
    const bareFoot = (): void => {
      const skin = superellipsoid({ w: 0.08, h: 0.045, d: 0.135, round: 0.55, segU: ctx.seg(12, 6), segV: ctx.seg(8, 4) });
      ctx.add(skin, ctx.skinStyle(foot, 0.15), xf([x, 0.038, 0.025]));
    };
    switch (style) {
      case 'sneakers': {
        ctx.add(superellipsoid({ w: 0.1, h: 0.032, d: 0.168, round: 0.38, segU: ctx.seg(14, 6), segV: ctx.seg(6, 3) }), sole, xf([x, 0.016, 0.025]));
        ctx.add(superellipsoid({ w: 0.092, h: 0.072, d: 0.15, round: 0.5, segU: ctx.seg(16, 7), segV: ctx.seg(10, 5), deform: (p) => { if (p.z > 0) p.y -= p.z * 0.18; } }), main, xf([x, 0.052, 0.018]));
        if (ctx.high) {
          // Side stripe and collar.
          ctx.add(superellipsoid({ w: 0.01, h: 0.03, d: 0.08, round: 0.4, segU: 6, segV: 4 }), accent, xf([x + sign * 0.045, 0.048, 0.01], [0.35, 0, 0]));
          ctx.add(superellipsoid({ w: 0.01, h: 0.03, d: 0.08, round: 0.4, segU: 6, segV: 4 }), accent, xf([x - sign * 0.045, 0.048, 0.01], [0.35, 0, 0]));
          ctx.add(superellipsoid({ w: 0.05, h: 0.012, d: 0.06, round: 0.5, segU: 6, segV: 4 }), ctx.solid(shadeHex(item.primary, -0.1), SURFACE.cloth, foot), xf([x, 0.085, 0.045], [0.25, 0, 0]));
        }
        break;
      }
      case 'loafers':
      case 'oxfords': {
        ctx.add(superellipsoid({ w: 0.094, h: 0.02, d: 0.162, round: 0.35, segU: ctx.seg(12, 6), segV: ctx.seg(5, 3) }), sole, xf([x, 0.01, 0.025]));
        ctx.add(superellipsoid({ w: 0.088, h: 0.058, d: 0.155, round: 0.5, segU: ctx.seg(16, 7), segV: ctx.seg(10, 5), deform: (p) => { if (p.z > 0) { p.y -= p.z * 0.25; p.x *= 1 - p.z * 1.2; } } }), main, xf([x, 0.04, 0.022]));
        if (ctx.high) {
          const bit = style === 'loafers' ? ctx.solid(item.secondary, luminance(item.secondary) > 0.3 ? SURFACE.gold : SURFACE.leather, foot) : ctx.solid(shadeHex(item.primary, 0.12), SURFACE.gloss, foot);
          ctx.add(superellipsoid({ w: 0.07, h: 0.012, d: 0.02, round: 0.5, segU: 8, segV: 4 }), bit, xf([x, 0.064, 0.055], [0.4, 0, 0]));
        }
        break;
      }
      case 'sandals':
      case 'slides': {
        bareFoot();
        ctx.add(superellipsoid({ w: 0.098, h: 0.022, d: 0.17, round: 0.4, segU: ctx.seg(12, 6), segV: ctx.seg(5, 3) }), ctx.cloth(item, foot), xf([x, 0.011, 0.025]));
        const strap = style === 'slides' ? accent : main;
        const straps = style === 'slides' ? [0.04] : [0.0, 0.065];
        for (const z of straps) {
          const ring: LoftRing[] = [
            { y: 0.02, w: 0.095, d: style === 'slides' ? 0.065 : 0.03, x, z },
            { y: 0.056, w: 0.088, d: style === 'slides' ? 0.06 : 0.026, x, z },
          ];
          ctx.add(loft(ring, { segments: ctx.seg(12, 6), exponent: 2.4, capEnd: true }), strap);
        }
        break;
      }
      case 'heels': {
        ctx.add(superellipsoid({ w: 0.08, h: 0.05, d: 0.15, round: 0.5, segU: ctx.seg(14, 6), segV: ctx.seg(8, 4), deform: (p) => { if (p.z > 0.02) p.x *= 1 - (p.z - 0.02) * 2.2; if (p.z > 0) p.y -= p.z * 0.25; } }), main, xf([x, 0.045, 0.03]));
        ctx.add(superellipsoid({ w: 0.084, h: 0.012, d: 0.155, round: 0.4, segU: 10, segV: 3 }), sole, xf([x, 0.02, 0.03], [-0.12, 0, 0]));
        ctx.add(superellipsoid({ w: 0.03, h: 0.05, d: 0.03, round: 0.4, segU: 8, segV: 4 }), main, xf([x, 0.025, -0.032]));
        break;
      }
      case 'boots': {
        ctx.add(superellipsoid({ w: 0.102, h: 0.026, d: 0.17, round: 0.38, segU: ctx.seg(14, 6), segV: ctx.seg(5, 3) }), sole, xf([x, 0.013, 0.025]));
        ctx.add(superellipsoid({ w: 0.096, h: 0.075, d: 0.158, round: 0.5, segU: ctx.seg(16, 7), segV: ctx.seg(10, 5), deform: (p) => { if (p.z > 0) p.y -= p.z * 0.15; } }), main, xf([x, 0.05, 0.02]));
        // Shaft up the shin.
        const r = rig.ankleR + 0.018;
        const shaft: LoftRing[] = [
          { y: 0.06, w: r * 2.1, d: r * 2.3, x, z: -0.008 },
          { y: rig.ankleY + 0.1, w: (rig.shinR + 0.014) * 2, d: (rig.shinR + 0.014) * 2, x },
        ];
        ctx.add(loft([...shaft], { segments: ctx.seg(14, 7), exponent: 2.3 }), { ...main, skin: legWeights(rig, side) });
        if (ctx.high) ctx.add(superellipsoid({ w: 0.04, h: 0.08, d: 0.012, round: 0.4, segU: 6, segV: 6 }), accent, xf([x, rig.ankleY + 0.03, r + 0.012], [0.2, 0, 0]));
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Headwear
// ---------------------------------------------------------------------------------------------------------------

/** A dome: the top part of a superellipsoid (y ≥ cut). */
function dome(ctx: BuildContext, w: number, h: number, d: number, round: number, cut = 0): BufferGeometry {
  // Never rounder than the head itself, or the head's corners poke through.
  return superellipsoid({
    w,
    h,
    d,
    round: Math.min(round, HEAD_ROUND + 0.1),
    segU: ctx.seg(26, 10),
    segV: ctx.seg(16, 7),
    deform: (p) => {
      if (p.y < cut) p.y = cut;
    },
  });
}

/**
 * A pleated fan (gele tiers): `span` radians wide, from radius r0 to r1, in the plane spanned by unit vectors
 * `u` (fan centre direction) and `v` (sideways). Pleats ripple along the arc and deepen towards the rim.
 */
function pleatedFan(origin: Vector3, u: Vector3, v: Vector3, r0: number, r1: number, span: number, pleats: number, depth: number, curl: number, cols: number, rows: number): BufferGeometry {
  const n = new Vector3().crossVectors(u, v).normalize();
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  const indices: number[] = [];
  const p = new Vector3();
  for (let j = 0; j <= rows; j++) {
    const s = j / rows;
    const r = r0 + (r1 - r0) * s;
    for (let i = 0; i <= cols; i++) {
      const t = i / cols;
      const theta = (t - 0.5) * span;
      const ripple = Math.sin(theta * pleats * (Math.PI / span) * 2) * depth * (0.25 + 0.75 * s);
      p.copy(origin)
        .addScaledVector(u, Math.cos(theta) * r)
        .addScaledVector(v, Math.sin(theta) * r)
        .addScaledVector(n, ripple + curl * s * s);
      const k = j * (cols + 1) + i;
      positions[k * 3] = p.x;
      positions[k * 3 + 1] = p.y;
      positions[k * 3 + 2] = p.z;
      uvs[k * 2] = theta * r;
      uvs[k * 2 + 1] = r;
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return doubleSided(geometry, 0.008);
}

export function buildHeadwear(ctx: BuildContext, item: ClothingDefinition, hair: HairInfo): void {
  const { rig } = ctx;
  const [w, h, d] = rig.head;
  const cy = rig.headCenterY;
  const style = knownStyle('headwear', item.style);
  const head = BONE.head;
  const main = ctx.cloth(item, head, { shade: 0.2 });
  const trim = ctx.trim(item, head);
  const fit = Math.max(0, hair.top - h / 2 - 0.02);
  switch (style) {
    case 'cap': {
      ctx.add(dome(ctx, w + 0.05, h * 0.86 + fit, d + 0.05, 0.6), main, xf([0, cy + 0.07 + fit * 0.3, -0.005]));
      const brim = superellipsoid({ w: 0.3, h: 0.016, d: 0.2, round: 0.45, segU: ctx.seg(16, 8), segV: 4, deform: (p) => { p.y -= p.x * p.x * 0.9; if (p.z < -0.05) p.z = -0.05; } });
      ctx.add(brim, { ...main, shade: 0 }, xf([0, cy + 0.085, d / 2 + 0.035], [-0.12, 0, 0]));
      ctx.add(superellipsoid({ w: 0.035, h: 0.018, d: 0.035, round: 0.8, segU: 8, segV: 4 }), trim, xf([0, cy + 0.07 + h * 0.43 + fit * 0.8, 0]));
      if (ctx.high) ctx.add(superellipsoid({ w: 0.09, h: 0.05, d: 0.01, round: 0.4, segU: 8, segV: 6 }), trim, xf([0, cy + 0.17, d / 2 + 0.018], [-0.32, 0, 0]));
      return;
    }
    case 'beanie': {
      ctx.add(dome(ctx, w + 0.055, h * 1.02 + fit, d + 0.055, 0.68), { ...main, surface: SURFACE.knit }, xf([0, cy + 0.03 + fit * 0.3, -0.005]));
      const cuffRings: LoftRing[] = [
        { y: cy + 0.03, w: w + 0.075, d: d + 0.075 },
        { y: cy + 0.1, w: w + 0.07, d: d + 0.07 },
      ];
      ctx.add(loft(cuffRings, { segments: ctx.seg(26, 10), exponent: 4.6 }), ctx.tone(item, -0.1, head, SURFACE.knit));
      return;
    }
    case 'bucket-hat': {
      ctx.add(dome(ctx, w + 0.06, h * 0.8 + fit, d + 0.06, 0.55), main, xf([0, cy + 0.09 + fit * 0.3, 0]));
      const brim: LoftRing[] = [
        { y: cy + 0.035, w: w + 0.22, d: d + 0.22 },
        { y: cy + 0.1, w: w + 0.065, d: d + 0.065 },
      ];
      ctx.add(doubleSided(loft(brim, { segments: ctx.seg(28, 12), exponent: 3.6 }), 0.008), main);
      return;
    }
    case 'durag': {
      ctx.add(dome(ctx, w + 0.035, h * 1.05, d + 0.035, HEAD_ROUND + 0.06, -0.02), { ...main, surface: SURFACE.hairSilky }, xf([0, cy + 0.03, -0.008]));
      for (const sign of [1, -1]) {
        const pts = [new Vector3(sign * 0.03, cy - 0.02, -d / 2 - 0.01), new Vector3(sign * 0.05, cy - 0.16, -d / 2 - 0.03), new Vector3(sign * 0.06, cy - 0.32, -d / 2 + 0.0)];
        ctx.add(tube(smoothPath(pts, 8), { radius: 0.035, radial: 8, flatten: 0.18 }), { ...main, surface: SURFACE.hairSilky, skin: (_x: number, y: number) => [[BONE.head, 1 - smoothstep(cy - 0.08, cy - 0.3, y)], [BONE.chest, smoothstep(cy - 0.08, cy - 0.3, y)]] });
      }
      return;
    }
    case 'beret': {
      const beret = superellipsoid({ w: w + 0.1, h: 0.1, d: d + 0.06, round: 0.85, segU: ctx.seg(22, 10), segV: ctx.seg(10, 5) });
      ctx.add(beret, main, xf([0.035, cy + h / 2 + 0.005 + fit, -0.01], [0.08, 0, -0.22]));
      ctx.add(superellipsoid({ w: 0.02, h: 0.03, d: 0.02, round: 0.8, segU: 6, segV: 4 }), main, xf([0.03, cy + h / 2 + 0.06 + fit, -0.01]));
      return;
    }
    case 'hard-hat': {
      ctx.add(dome(ctx, w + 0.07, h * 0.95 + fit, d + 0.07, 0.62), { ...main, surface: SURFACE.gloss }, xf([0, cy + 0.07 + fit * 0.3, 0]));
      ctx.add(superellipsoid({ w: 0.05, h: 0.03, d: d * 0.8, round: 0.5, segU: 8, segV: 4 }), { ...main, surface: SURFACE.gloss }, xf([0, cy + 0.07 + h * 0.47 + fit * 0.8, 0]));
      const brim: LoftRing[] = [
        { y: cy + 0.065, w: w + 0.14, d: d + 0.17, z: 0.025 },
        { y: cy + 0.085, w: w + 0.075, d: d + 0.075 },
      ];
      ctx.add(doubleSided(loft(brim, { segments: ctx.seg(26, 10), exponent: 3.2 }), 0.01), { ...main, surface: SURFACE.gloss });
      return;
    }
    case 'fila': {
      // Soft, tall cap folded over to one side (the classic Yoruba fila worn tilted).
      const steps = ctx.seg(8, 4);
      const rings: LoftRing[] = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        rings.push({ y: cy + 0.075 + t * (0.24 + fit), w: (w + 0.07) * (1 - 0.06 * t), d: (d + 0.07) * (1 - 0.1 * t), x: 0.11 * t * t, z: -0.008 });
      }
      const top = rings[rings.length - 1]!;
      ctx.add(
        loft([...rings, ...domeRings(top, 0.05, 3, 0.2)], {
          segments: ctx.seg(26, 10),
          exponent: 4.4,
          capEnd: true,
        }),
        main,
      );
      const band: LoftRing[] = [
        { y: cy + 0.075, w: w + 0.08, d: d + 0.08 },
        { y: cy + 0.11, w: w + 0.08, d: d + 0.08 },
      ];
      ctx.add(loft(band, { segments: ctx.seg(26, 10), exponent: 4.4 }), ctx.cloth(item, head, { tint: -0.08 }));
      return;
    }
    case 'gele': {
      buildGele(ctx, item, main);
      return;
    }
    case 'hijab': {
      buildHijab(ctx, item);
      return;
    }
  }
}

/**
 * Hijab: a soft wrap that covers the hair, ears and neck and frames the face, falling over the shoulders and chest.
 */
function buildHijab(ctx: BuildContext, item: ClothingDefinition): void {
  const { rig } = ctx;
  const [w, h, d] = rig.head;
  const hs = rig.headScale;
  const cy = rig.headCenterY;
  const cloth = ctx.cloth(item, BONE.head, { shade: 0.18, surface: SURFACE.silk });
  // Face opening (head-centre space): an oval from the brow to just under the chin.
  const openY = -0.05 * hs;
  const openA = 0.19 * hs;
  const openB = 0.215 * hs;
  const shellCentreY = -0.035 * hs;
  const wrap = superellipsoid({
    w: w + 0.1,
    h: h + 0.17,
    d: d + 0.1,
    round: HEAD_ROUND + 0.18,
    segU: ctx.seg(32, 12),
    segV: ctx.seg(22, 9),
    deform: (p) => {
      if (p.z <= 0) return;
      const y = p.y + shellCentreY;
      const e = (p.x / openA) ** 2 + ((y - openY) / openB) ** 2;
      if (e >= 1) return;
      // Pull the face area back inside the head so the wrap folds into a soft rim around the face.
      p.z *= smoothstep(0.62, 1, e) ** 1.5;
    },
  });
  ctx.add(wrap, cloth, xf([0, cy + shellCentreY, -0.006]));

  // Drape over the shoulders and chest; rides the head at the top and the chest below.
  const t = rig.torso;
  const top = rig.headBaseY + 0.11;
  const rings: LoftRing[] = [
    { y: rig.chestY - 0.05, w: t.shoulderW + 0.1, d: t.chestD + t.bust + 0.13, z: t.bust * 0.4 },
    { y: rig.shoulderY + 0.01, w: t.shoulderW + 0.08, d: t.chestD + 0.11 },
    { y: rig.shoulderTopY + 0.02, w: t.shoulderW * 0.78, d: t.chestD * 0.9 },
    { y: rig.headBaseY + 0.03, w: rig.neckR * 2 + 0.15, d: rig.neckR * 2 + 0.13 },
    { y: top, w: w * 0.86, d: d * 0.82 },
  ];
  const drapeSkin = (_x: number, y: number): ReadonlyArray<readonly [number, number]> => {
    const k = smoothstep(rig.shoulderTopY - 0.02, rig.headBaseY + 0.06, y);
    return [
      [BONE.chest, 1 - k],
      [BONE.head, k],
    ];
  };
  const lip = { ...rings[0]!, y: rings[0]!.y + 0.016, w: rings[0]!.w - 0.022, d: rings[0]!.d - 0.022 };
  ctx.add(
    loft([lip, ...rings], {
      segments: ctx.seg(28, 12),
      exponent: 2.6,
      // A gentle point at the front, like a pinned scarf.
      shapeY: (ring, angle) => (ring <= 1 ? -0.06 * Math.max(0, -Math.cos(angle)) ** 2 : 0),
    }),
    { ...cloth, skin: drapeSkin },
  );
  ctx.chestInflate = Math.max(ctx.chestInflate, 0.06);
}

/**
 * The gele: a sculpted, starched head-tie. A snug wrap with a band across the forehead, then pleated fans rising
 * from the crown — a tall halo behind, a second layer swept to one side, and a crest over the forehead.
 */
function buildGele(ctx: BuildContext, item: ClothingDefinition, main: PartStyle): void {
  const { rig } = ctx;
  const [w, h, d] = rig.head;
  const hs = rig.headScale;
  const cy = rig.headCenterY;
  const cols = ctx.seg(34, 14);
  const rows = ctx.seg(6, 3);
  const top = cy + h / 2;
  // Snug wrap over the crown.
  ctx.add(dome(ctx, w + 0.045, h * 0.62, d + 0.045, HEAD_ROUND + 0.04), main, xf([0, cy + 0.1 * hs, -0.004]));
  // Band across the forehead (sits above the brows).
  const bandRings: LoftRing[] = [
    { y: cy + 0.095 * hs, w: w + 0.058, d: d + 0.058 },
    { y: cy + 0.15 * hs, w: w + 0.06, d: d + 0.06 },
  ];
  ctx.add(loft(bandRings, { segments: ctx.seg(28, 10), exponent: 4.4 }), ctx.cloth(item, BONE.head, { tint: -0.08 }));
  const fan = (origin: Vector3, up: Vector3, side: Vector3, r0: number, r1: number, span: number, pleats: number, depth: number, curl: number, tint: number, colsK = 1): void => {
    const geometry = pleatedFan(origin, up.normalize(), side.normalize(), r0 * hs, r1 * hs, span, pleats, depth, curl, Math.round(cols * colsK), rows);
    ctx.add(geometry, { ...(tint === 0 ? main : ctx.cloth(item, BONE.head, { tint })), skin: BONE.head });
  };
  // Halo behind and above the head.
  fan(new Vector3(0, top - 0.08, -0.08), new Vector3(0, 1, -0.22), new Vector3(1, 0, 0), 0.06, 0.45, Math.PI * 1.02, 6, 0.055, -0.07, 0);
  // Second layer, swept to the wearer's left.
  fan(new Vector3(0.05, top - 0.05, -0.02), new Vector3(0.55, 0.85, -0.1), new Vector3(0.1, -0.05, 1), 0.05, 0.31, Math.PI * 0.75, 5, 0.045, 0.05, -0.06, 0.8);
  // Crest over the forehead.
  fan(new Vector3(-0.03, top - 0.03, 0.03), new Vector3(-0.15, 0.85, 0.5), new Vector3(1, 0, 0.1), 0.04, 0.22, Math.PI * 0.7, 4, 0.04, 0.06, 0.05, 0.7);
  // Knotted tail peeking out at the nape.
  ctx.add(superellipsoid({ w: 0.12, h: 0.07, d: 0.07, round: 0.6, segU: 10, segV: 6 }), ctx.cloth(item, BONE.head, { tint: -0.1 }), xf([-0.1, cy + 0.06, -d / 2 - 0.025], [0.2, 0.3, 0.4]));
}

// ---------------------------------------------------------------------------------------------------------------
// Eyewear
// ---------------------------------------------------------------------------------------------------------------

function loopPoints(cx: number, cy: number, z: number, halfW: number, halfH: number, teardrop: boolean, steps = 20): Vector3[] {
  const pts: Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const k = 0.35;
    let x = halfW * Math.sign(c) * Math.abs(c) ** k;
    let y = halfH * Math.sign(s) * Math.abs(s) ** k;
    if (teardrop) {
      x = halfW * c;
      y = halfH * s * (s < 0 ? 1.15 : 0.85);
      if (s < 0) x *= 1 - 0.25 * -s;
    }
    pts.push(new Vector3(cx + x, cy + y, z));
  }
  return pts;
}

export function buildEyewear(ctx: BuildContext, item: ClothingDefinition): void {
  const { rig } = ctx;
  const style = knownStyle('eyewear', item.style);
  const hs = rig.headScale;
  const cy = rig.headCenterY;
  const ey = faceY(FACE_LAYOUT.eyeV, hs);
  const ex = FACE_LAYOUT.eyeU * FACE_LAYOUT.width * hs;
  const z = headFrontZ(ctx, ex, ey) + 0.016;
  const metal = style === 'aviators';
  const frame = ctx.solid(item.primary, metal ? SURFACE.metal : SURFACE.plastic, BONE.head, 0);
  const lensHex = style === 'glasses' ? null : style === 'aviators' ? mixHex(item.secondary, '#0a0a0a', 0.55) : mixHex(item.secondary, '#050505', 0.7);
  const halfW = style === 'aviators' ? 0.046 : 0.044;
  const halfH = style === 'glasses' ? 0.032 : 0.036;
  const radius = metal ? 0.0035 : style === 'sunglasses' ? 0.0065 : 0.0045;
  for (const sign of [1, -1]) {
    const lx = sign * ex;
    ctx.add(tube(loopPoints(lx, cy + ey, z, halfW, halfH, metal, ctx.seg(24, 10)), { radius, radial: 6, capEnds: false }), frame);
    if (lensHex) {
      const lens = superellipsoid({ w: halfW * 2, h: halfH * 2, d: 0.006, round: metal ? 1 : 0.45, segU: 12, segV: 8, deform: metal ? (p) => { if (p.y < 0) p.x *= 1 - 0.25 * (-p.y / halfH); } : undefined });
      ctx.add(lens, ctx.solid(lensHex, SURFACE.lens, BONE.head, 0), xf([lx, cy + ey, z - 0.001]));
    }
    // Temple arm back to the ear.
    const temple = [new Vector3(sign * (ex + halfW), cy + ey + halfH * 0.5, z - 0.004), new Vector3(sign * (rig.head[0] / 2 + 0.012), cy + ey + 0.01, 0.02), new Vector3(sign * (rig.head[0] / 2 + 0.012), cy - 0.03, -0.06)];
    ctx.add(tube(smoothPath(temple, 8), { radius: radius * 0.8, radial: 5 }), frame);
  }
  ctx.add(tube([new Vector3(-ex + halfW, cy + ey + 0.008, z), new Vector3(ex - halfW, cy + ey + 0.008, z)], { radius: radius * 0.9, radial: 5 }), frame);
  if (metal) ctx.add(tube([new Vector3(-ex + halfW * 0.8, cy + ey + halfH * 0.85, z), new Vector3(ex - halfW * 0.8, cy + ey + halfH * 0.85, z)], { radius: radius * 0.8, radial: 5 }), frame);
}

// ---------------------------------------------------------------------------------------------------------------
// Accessories
// ---------------------------------------------------------------------------------------------------------------

function neckLoop(ctx: BuildContext, drop: number, forward: number, steps: number): Vector3[] {
  const { rig } = ctx;
  const r = rig.neckR + 0.03;
  const pts: Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const front = Math.max(0, Math.cos(a));
    const x = Math.sin(a) * (r + front * 0.03);
    const zBase = Math.cos(a) * r * 1.05;
    const y = rig.shoulderTopY + 0.008 - front ** 1.6 * drop;
    pts.push(new Vector3(x, y, zBase + front * forward));
  }
  return pts;
}

export function buildAccessory(ctx: BuildContext, item: ClothingDefinition, hair: HairInfo, hasHeadwear: boolean): void {
  const { rig } = ctx;
  const style = knownStyle('accessory', item.style);
  const chest = BONE.chest;
  const gold = luminance(item.primary) > 0.25 && item.primary.toLowerCase() !== '#e0e0e0';
  switch (style) {
    case 'chain': {
      const drop = rig.shoulderTopY - rig.chestY - 0.02;
      const pts = neckLoop(ctx, drop, rig.torso.chestD * 0.42 + ctx.chestInflate, ctx.seg(36, 14));
      ctx.add(tube(pts, { radius: 0.008, radial: ctx.seg(7, 4), capEnds: false }), ctx.solid(item.primary, gold ? SURFACE.gold : SURFACE.metal, chest, 0));
      const pendant = superellipsoid({ w: 0.045, h: 0.045, d: 0.012, round: 0.3, segU: 8, segV: 6 });
      const front = pts[0]!;
      ctx.add(pendant, ctx.solid(item.secondary, SURFACE.lens, chest, 0), xf([front.x, front.y - 0.03, front.z + 0.004], [0, 0, Math.PI / 4]));
      return;
    }
    case 'beads': {
      const strands = item.price > 100_000 ? 3 : 2;
      for (let s = 0; s < strands; s++) {
        const drop = 0.06 + s * 0.04;
        const pts = neckLoop(ctx, drop, rig.torso.chestD * 0.32 + ctx.chestInflate + s * 0.012, ctx.seg(72, 24));
        const beads = 30 + s * 4;
        // One bumpy tube per strand reads as a string of beads at a fraction of the cost.
        const strand = tube(pts, { radius: (t) => 0.0125 * (0.45 + 0.55 * Math.abs(Math.sin(t * beads * Math.PI))), radial: ctx.seg(7, 4), capEnds: false });
        ctx.add(strand, ctx.solid(s === 1 ? shadeHex(item.primary, -0.12) : item.primary, SURFACE.gloss, chest, 0.1));
      }
      return;
    }
    case 'watch': {
      const side: Side = 'L';
      const y = rig.wristY + 0.022;
      const r = rig.foreArmR * 0.88 + 0.01;
      const bandRings: LoftRing[] = [
        { y: y - 0.012, w: r * 2, d: r * 2, x: rig.shoulderX },
        { y: y + 0.012, w: r * 2, d: r * 2, x: rig.shoulderX },
      ];
      ctx.add(loft(bandRings, { segments: ctx.seg(14, 6), exponent: 2.2 }), ctx.solid(item.primary, gold ? SURFACE.gold : SURFACE.plastic, armWeights(rig, side), 0));
      const face = superellipsoid({ w: 0.012, h: 0.034, d: 0.034, round: 0.7, segU: 8, segV: 6 });
      ctx.add(face, ctx.solid(item.secondary, SURFACE.lens, armWeights(rig, side), 0), xf([rig.shoulderX + r + 0.004, y, 0]));
      return;
    }
    case 'headphones': {
      const top = Math.max(hair.top, hasHeadwear ? rig.head[1] / 2 + 0.08 : 0) + 0.015;
      const half = Math.max(hair.halfWidth, rig.head[0] / 2) + 0.025;
      const cy = rig.headCenterY;
      const pts: Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = Math.PI * (i / 16);
        pts.push(new Vector3(Math.cos(a) * half, cy - 0.02 + Math.sin(a) * (top + 0.02), -0.02));
      }
      ctx.add(tube(pts, { radius: 0.012, radial: 6, flatten: 0.6 }), ctx.solid(item.primary, SURFACE.plastic, BONE.head, 0));
      for (const sign of [1, -1]) {
        const cup = superellipsoid({ w: 0.04, h: 0.1, d: 0.085, round: 0.55, segU: 12, segV: 8 });
        ctx.add(cup, ctx.solid(item.primary, SURFACE.plastic, BONE.head, 0.1), xf([sign * half, cy - 0.03, -0.015]));
        const pad = superellipsoid({ w: 0.012, h: 0.07, d: 0.06, round: 0.6, segU: 8, segV: 6 });
        ctx.add(pad, ctx.solid(item.secondary, SURFACE.cloth, BONE.head, 0), xf([sign * (half + 0.022), cy - 0.03, -0.015]));
      }
      return;
    }
    case 'bag': {
      if (item.pattern === 'check') {
        // Ghana-Must-Go: the big chequered carry bag, in hand.
        const bag = superellipsoid({ w: 0.12, h: 0.22, d: 0.3, round: 0.3, segU: 12, segV: 8 });
        ctx.add(bag, ctx.cloth(item, BONE.handR), xf([-rig.shoulderX - 0.07, rig.wristY - 0.16, 0.01]));
        ctx.add(tube([new Vector3(-rig.shoulderX - 0.07, rig.wristY - 0.05, -0.05), new Vector3(-rig.shoulderX - 0.03, rig.wristY - 0.02, 0.0), new Vector3(-rig.shoulderX - 0.07, rig.wristY - 0.05, 0.06)], { radius: 0.008, radial: 5 }), ctx.solid(item.secondary, SURFACE.cloth, BONE.handR));
        return;
      }
      if (item.cut === 'fem') {
        // Handbag hooked on the left forearm.
        const x = rig.shoulderX + rig.foreArmR + 0.05;
        const bag = superellipsoid({ w: 0.075, h: 0.12, d: 0.17, round: 0.35, segU: 10, segV: 8 });
        ctx.add(bag, ctx.cloth(item, BONE.foreArmL, { surface: SURFACE.leather }), xf([x, rig.elbowY - 0.12, 0.02]));
        ctx.add(tube(smoothPath([new Vector3(x, rig.elbowY - 0.06, -0.05), new Vector3(rig.shoulderX, rig.elbowY - 0.02, 0.0), new Vector3(x, rig.elbowY - 0.06, 0.08)], 10), { radius: 0.007, radial: 5 }), ctx.solid(item.secondary, SURFACE.leather, BONE.foreArmL));
        ctx.add(superellipsoid({ w: 0.012, h: 0.03, d: 0.04, round: 0.5, segU: 6, segV: 4 }), ctx.solid('#d4af37', SURFACE.gold, BONE.foreArmL), xf([x + 0.04, rig.elbowY - 0.1, 0.02]));
        return;
      }
      // Backpack.
      const back = -rig.torso.chestD / 2 - 0.07;
      const pack = superellipsoid({ w: rig.torso.chestW * 0.86, h: 0.3, d: 0.13, round: 0.45, segU: 14, segV: 10 });
      ctx.add(pack, ctx.cloth(item, chest), xf([0, rig.chestY - 0.02, back]));
      ctx.add(superellipsoid({ w: rig.torso.chestW * 0.6, h: 0.12, d: 0.05, round: 0.45, segU: 10, segV: 6 }), ctx.cloth(item, chest, { tint: -0.08 }), xf([0, rig.chestY - 0.09, back - 0.07]));
      for (const sign of [1, -1]) {
        const fz = rig.torso.chestD / 2 + 0.025;
        const pts = [new Vector3(sign * 0.08, rig.chestY - 0.1, -fz + 0.01), new Vector3(sign * 0.1, rig.shoulderTopY + 0.02, -0.02), new Vector3(sign * 0.1, rig.chestY + 0.02, fz), new Vector3(sign * 0.11, rig.waistY, fz - 0.005)];
        ctx.add(tube(smoothPath(pts, 12), { radius: 0.016, radial: 6, flatten: 0.35 }), ctx.solid(item.secondary, SURFACE.cloth, chest));
      }
      return;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Action props (one bone each, hidden by scale when not in use)
// ---------------------------------------------------------------------------------------------------------------

export function buildProps(ctx: BuildContext): void {
  if (!ctx.high) return;
  const { rig } = ctx;
  const at = (prop: AvatarProp): Vector3 => {
    const [x, y, z] = rig.bones[PROP_BONE[prop]];
    return new Vector3(x, y, z);
  };
  const bone = (prop: AvatarProp): number => BONE[PROP_BONE[prop]];

  // Phone: screen faces the hand's +Z (towards the face once the forearm lifts).
  {
    const p = at('phone');
    ctx.add(superellipsoid({ w: 0.05, h: 0.1, d: 0.012, round: 0.3, segU: 8, segV: 8 }), ctx.solid('#1d2126', SURFACE.plastic, bone('phone')), xf([p.x, p.y, p.z]));
    ctx.add(superellipsoid({ w: 0.042, h: 0.086, d: 0.004, round: 0.25, segU: 6, segV: 6 }), ctx.solid('#79c7ff', SURFACE.lens, bone('phone'), 0), xf([p.x, p.y, p.z + 0.006]));
  }
  // Book (open, held at the chest; pages face up and back towards the eyes).
  {
    const p = at('book');
    const cover = superellipsoid({ w: 0.26, h: 0.012, d: 0.17, round: 0.25, segU: 8, segV: 4 });
    ctx.add(cover, ctx.solid('#b23a2b', SURFACE.cloth, bone('book')), xf([p.x, p.y, p.z], [0.9, 0, 0]));
    for (const sign of [1, -1]) {
      const page = superellipsoid({ w: 0.12, h: 0.012, d: 0.155, round: 0.3, segU: 6, segV: 4 });
      ctx.add(page, ctx.solid('#f6f1e4', SURFACE.cloth, bone('book'), 0), xf([p.x + sign * 0.062, p.y + 0.008, p.z - 0.004], [0.9, 0, sign * -0.08]));
    }
  }
  // Bowl (opening along local +Z — up once the forearm is level).
  {
    const p = at('bowl');
    const rings: LoftRing[] = [
      { y: -0.035, w: 0.07, d: 0.07 },
      { y: -0.005, w: 0.12, d: 0.12 },
      { y: 0.015, w: 0.15, d: 0.15 },
    ];
    const bowl = loft([...rings, { y: 0.008, w: 0.13, d: 0.13 }], { segments: 16, exponent: 2, capStart: true });
    ctx.add(bowl, ctx.solid('#f2efe8', SURFACE.gloss, bone('bowl')), xf([p.x, p.y - 0.01, p.z + 0.06], [Math.PI / 2, 0, 0]));
    const food = superellipsoid({ w: 0.12, h: 0.04, d: 0.12, round: 0.9, segU: 10, segV: 6 });
    ctx.add(food, ctx.solid('#c8462b', SURFACE.cloth, bone('bowl')), xf([p.x, p.y - 0.01, p.z + 0.068], [Math.PI / 2, 0, 0]));
  }
  // Spoon and ladle (along the hand's -Y, i.e. out of the fist).
  {
    const p = at('spoon');
    ctx.add(tube([new Vector3(p.x, p.y + 0.03, p.z), new Vector3(p.x, p.y - 0.07, p.z + 0.01)], { radius: 0.005, radial: 5 }), ctx.solid('#c9ced3', SURFACE.metal, bone('spoon')));
    ctx.add(superellipsoid({ w: 0.03, h: 0.04, d: 0.012, round: 0.8, segU: 8, segV: 6 }), ctx.solid('#c9ced3', SURFACE.metal, bone('spoon')), xf([p.x, p.y - 0.085, p.z + 0.012]));
    const l = at('ladle');
    ctx.add(tube([new Vector3(l.x, l.y + 0.03, l.z), new Vector3(l.x, l.y - 0.2, l.z + 0.03)], { radius: 0.007, radial: 5 }), ctx.solid('#8a5a35', SURFACE.cloth, bone('ladle')));
    ctx.add(superellipsoid({ w: 0.06, h: 0.03, d: 0.06, round: 0.9, segU: 8, segV: 6 }), ctx.solid('#8a5a35', SURFACE.cloth, bone('ladle')), xf([l.x, l.y - 0.215, l.z + 0.035]));
  }
  // A glass of chapman gripped through the fist. Like the bowl its axis runs along the hand's +Z (thumb side), so it
  // stands upright once the forearm is level and tips towards the mouth on a sip. Chibi-sized so it reads from the
  // room camera: red drink body, glass rim and base, a straw.
  {
    const p = at('cup');
    const up: readonly [number, number, number] = [Math.PI / 2, 0, 0];
    const centre: readonly [number, number, number] = [p.x, p.y + 0.015, p.z];
    const drink = loft(
      [
        { y: -0.062, w: 0.068, d: 0.068 },
        { y: 0.05, w: 0.076, d: 0.076 },
      ],
      { segments: 14, exponent: 2, capStart: true, capEnd: true },
    );
    ctx.add(drink, ctx.solid('#d4472c', SURFACE.gloss, bone('cup')), xf(centre, up));
    const rim = loft(
      [
        { y: 0.046, w: 0.079, d: 0.079 },
        { y: 0.078, w: 0.083, d: 0.083 },
      ],
      { segments: 14, exponent: 2 },
    );
    ctx.add(rim, ctx.solid('#e8f3f6', SURFACE.gloss, bone('cup')), xf(centre, up));
    const base = loft(
      [
        { y: -0.078, w: 0.07, d: 0.07 },
        { y: -0.06, w: 0.071, d: 0.071 },
      ],
      { segments: 14, exponent: 2, capStart: true },
    );
    ctx.add(base, ctx.solid('#e8f3f6', SURFACE.gloss, bone('cup')), xf(centre, up));
    ctx.add(tube([new Vector3(p.x + 0.012, p.y + 0.015, p.z + 0.03), new Vector3(p.x + 0.026, p.y + 0.004, p.z + 0.15)], { radius: 0.006, radial: 5 }), ctx.solid('#f6b90b', SURFACE.plastic, bone('cup')));
  }
  // Laptop on the lap (relative to hips).
  {
    const p = at('laptop');
    ctx.add(superellipsoid({ w: 0.26, h: 0.014, d: 0.18, round: 0.25, segU: 8, segV: 4 }), ctx.solid('#9aa3ad', SURFACE.metal, bone('laptop')), xf([p.x, p.y, p.z]));
    ctx.add(superellipsoid({ w: 0.26, h: 0.17, d: 0.012, round: 0.25, segU: 8, segV: 6 }), ctx.solid('#9aa3ad', SURFACE.metal, bone('laptop')), xf([p.x, p.y + 0.08, p.z + 0.1], [0.25, 0, 0]));
    ctx.add(superellipsoid({ w: 0.23, h: 0.14, d: 0.004, round: 0.2, segU: 6, segV: 6 }), ctx.solid('#7fd0ff', SURFACE.lens, bone('laptop'), 0), xf([p.x, p.y + 0.08, p.z + 0.093], [0.25, Math.PI, 0]));
  }
  // Steering wheel (in front of a seated driver).
  {
    const p = at('wheel');
    const pts: Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(new Vector3(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0));
    }
    const ring = tube(pts, { radius: 0.016, radial: 6, capEnds: false });
    ctx.add(ring, ctx.solid('#1f2326', SURFACE.rubber, bone('wheel')), xf([p.x, p.y, p.z], [-0.45, 0, 0]));
    ctx.add(superellipsoid({ w: 0.08, h: 0.06, d: 0.04, round: 0.6, segU: 8, segV: 6 }), ctx.solid('#2b3035', SURFACE.plastic, bone('wheel')), xf([p.x, p.y, p.z], [-0.45, 0, 0]));
    ctx.add(superellipsoid({ w: 0.25, h: 0.025, d: 0.02, round: 0.6, segU: 8, segV: 4 }), ctx.solid('#2b3035', SURFACE.plastic, bone('wheel')), xf([p.x, p.y, p.z], [-0.45, 0, 0]));
  }
  // Dumbbell.
  {
    const p = at('dumbbell');
    ctx.add(tube([new Vector3(p.x - 0.08, p.y, p.z), new Vector3(p.x + 0.08, p.y, p.z)], { radius: 0.01, radial: 6 }), ctx.solid('#9aa3ad', SURFACE.metal, bone('dumbbell')));
    for (const sign of [1, -1]) ctx.add(superellipsoid({ w: 0.035, h: 0.08, d: 0.08, round: 0.5, segU: 8, segV: 6 }), ctx.solid('#24282c', SURFACE.rubber, bone('dumbbell')), xf([p.x + sign * 0.085, p.y, p.z]));
  }
}
