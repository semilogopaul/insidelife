import type { Color} from 'three';
import { Vector3, type BufferGeometry } from 'three';
import { createRng, type HairStyle } from '@insidelife/shared';
import { doubleSided, loft, smoothPath, superellipsoid, tube, type LoftRing } from '../../geometry/primitives';
import type { SkinWeights } from '../../geometry/part-builder';
import { mixHex, shadeHex } from '../../materials/color-utils';
import { BONE, smoothstep } from '../rig';
import { HEAD_ROUND } from './head';
import { SURFACE, lin, xf, type BuildContext } from './context';

/** What sits on top of the hair, measured from the head centre (hats and headphones size themselves from it). */
export interface HairInfo {
  /** Highest point above the head centre. */
  readonly top: number;
  /** Half-width of the hair volume. */
  readonly halfWidth: number;
  /** Whether hair hangs below the head (locs, braids, bone straight). */
  readonly long: boolean;
}

type Coverage = 'full' | 'scalp' | 'none';

/** How much hair shows under headwear: a gele covers everything; hats flatten volume but let long hair hang. */
export function hairCoverage(headwear: string | undefined): Coverage {
  if (!headwear) return 'full';
  if (headwear === 'gele' || headwear === 'hijab') return 'none';
  return 'scalp';
}

/** Weights for long hair: rides the head near the scalp, the chest further down (so it doesn't swing through it). */
function longHairWeights(ctx: BuildContext): (x: number, y: number, z: number) => SkinWeights {
  const cy = ctx.rig.headCenterY;
  return (_x, y) => {
    const t = smoothstep(cy - 0.1, cy - 0.38, y);
    return [
      [BONE.head, 1 - t],
      [BONE.chest, t],
    ];
  };
}

/** Surface point of the (inflated) head in direction `dir` from the head centre, in model space. */
function scalpPoint(ctx: BuildContext, dir: Vector3, lift: number): Vector3 {
  const [w, h, d] = ctx.rig.head;
  const p = 2 / HEAD_ROUND;
  const a = w / 2 + lift;
  const b = h / 2 + lift;
  const c = d / 2 + lift;
  const n = dir.clone().normalize();
  const s = (Math.abs(n.x / a) ** p + Math.abs(n.y / b) ** p + Math.abs(n.z / c) ** p) ** (-1 / p);
  return n.multiplyScalar(s).add(new Vector3(0, ctx.rig.headCenterY, 0));
}

interface ScalpOptions {
  readonly thickness: number;
  /** Hairline heights (head-centre space, head-scale 1): front, sides (at the ears) and nape. */
  readonly front?: number;
  readonly side?: number;
  readonly back?: number;
  readonly color?: (x: number, y: number, z: number, out: Color) => void;
  readonly surface?: readonly [number, number];
}

/** A hair cap hugging the head with a natural hairline (forehead, temples, sideburns, nape). */
function scalp(ctx: BuildContext, options: ScalpOptions): void {
  const { rig } = ctx;
  const [w, h, d] = rig.head;
  const hs = rig.headScale;
  const t = options.thickness;
  const front = (options.front ?? 0.128) * hs;
  const side = (options.side ?? 0.005) * hs;
  const back = (options.back ?? -0.15) * hs;
  const geometry = superellipsoid({
    w: w + t * 2,
    h: h + t * 2,
    d: d + t * 2,
    round: HEAD_ROUND,
    segU: ctx.seg(26, 12),
    segV: ctx.seg(18, 9),
    deform: (p) => {
      const zf = p.z / (d / 2);
      let line: number;
      if (zf >= 0) {
        line = side + (front - side) * smoothstep(0.1, 0.85, zf);
        // Rounded temples.
        line += 0.03 * hs * smoothstep(0.6, 1, Math.abs(p.x) / (w / 2)) * smoothstep(0.3, 0.9, zf);
      } else line = side + (back - side) * smoothstep(0.05, 0.75, -zf);
      if (p.y < line) {
        p.y = line;
        // Tuck the edge into the head so the cap has no visible lip.
        p.multiplyScalar(0.985);
      }
    },
  });
  const style = options.color
    ? { slot: 'base', color: options.color, surface: options.surface ?? SURFACE.hair, skin: BONE.head, shade: 0.12 }
    : ctx.hairStyle(BONE.head, 0.12, options.surface ?? SURFACE.hair);
  ctx.add(geometry, style, xf([0, rig.headCenterY, 0]));
}

/** Soft lumpy volume (afro, puff) with the face carved out. */
function volume(ctx: BuildContext, size: readonly [number, number, number], center: readonly [number, number, number], bumps: number, carveFace: boolean): BufferGeometry {
  const { rig } = ctx;
  const [w, , d] = rig.head;
  const hs = rig.headScale;
  const faceTop = 0.11 * hs;
  const rng = createRng(`hair:${size.join(',')}`);
  const phases = [rng.float(0, 6), rng.float(0, 6), rng.float(0, 6)];
  return superellipsoid({
    w: size[0],
    h: size[1],
    d: size[2],
    round: 0.88,
    segU: ctx.seg(28, 12),
    segV: ctx.seg(20, 9),
    deform: (p) => {
      const k = 1 + bumps * (Math.sin(p.x * 31 + phases[0]!) * Math.sin(p.y * 27 + phases[1]!) * Math.sin(p.z * 29 + phases[2]!));
      p.multiplyScalar(k);
      if (!carveFace) return;
      // Work in head-centre space.
      const hx = p.x + center[0];
      const hy = p.y + center[1];
      const hz = p.z + center[2];
      const sideness = smoothstep(w / 2 - 0.06, w / 2 + 0.02, Math.abs(hx));
      const maxZ = -0.02 + sideness * (d / 2 - 0.12);
      const blend = smoothstep(faceTop + 0.05, faceTop - 0.01, hy);
      if (hz > maxZ && blend > 0) p.z = hz - (hz - maxZ) * blend - center[2];
    },
  });
}

export function buildHair(ctx: BuildContext, style: HairStyle, headwear: string | undefined): HairInfo {
  const { rig } = ctx;
  const [w, h, d] = rig.head;
  const hs = rig.headScale;
  const cy = rig.headCenterY;
  const coverage = hairCoverage(headwear);
  const baseTop = h / 2 + 0.02;
  if (coverage === 'none' || style === 'bald') return { top: baseTop - 0.02, halfWidth: w / 2, long: false };
  const flat = coverage === 'scalp';

  switch (style) {
    case 'lowcut':
      scalp(ctx, { thickness: 0.011 });
      return { top: baseTop, halfWidth: w / 2 + 0.011, long: false };

    case 'fade': {
      const fadeHex = mixHex(ctx.hairHex, ctx.skinHex, 0.55);
      const hair = lin(ctx.hairHex);
      const faded = lin(fadeHex);
      scalp(ctx, {
        thickness: flat ? 0.012 : 0.02,
        color: (_x, y, _z, out) => out.copy(faded).lerp(hair, smoothstep(cy + 0.06 * hs, cy + 0.16 * hs, y)),
      });
      if (!flat) {
        // A little height on top.
        const top = superellipsoid({ w: w * 0.86, h: 0.09, d: d * 0.86, round: 0.45, segU: ctx.seg(20, 8), segV: ctx.seg(10, 5) });
        ctx.add(top, ctx.hairStyle(BONE.head, 0.18), xf([0, cy + h / 2 - 0.01, -0.01]));
      }
      return { top: baseTop + (flat ? 0 : 0.035), halfWidth: w / 2 + 0.02, long: false };
    }

    case 'afro':
    case 'big-afro': {
      scalp(ctx, { thickness: 0.014 });
      if (flat) return { top: baseTop, halfWidth: w / 2 + 0.015, long: false };
      const big = style === 'big-afro';
      const size: [number, number, number] = big ? [0.92 * hs, 0.72 * hs, 0.82 * hs] : [0.7 * hs, 0.56 * hs, 0.64 * hs];
      const center: [number, number, number] = big ? [0, 0.15 * hs, -0.07] : [0, 0.115 * hs, -0.045];
      ctx.add(volume(ctx, size, center, ctx.high ? 0.035 : 0, true), ctx.hairStyle(BONE.head, 0.3, SURFACE.knit), xf([center[0], cy + center[1], center[2]]));
      return { top: center[1] + size[1] / 2, halfWidth: size[0] / 2, long: false };
    }

    case 'puff':
    case 'bun': {
      scalp(ctx, { thickness: 0.012, surface: SURFACE.hairSilky });
      if (flat) return { top: baseTop, halfWidth: w / 2 + 0.012, long: false };
      const puff = style === 'puff';
      const size: [number, number, number] = puff ? [0.4 * hs, 0.34 * hs, 0.38 * hs] : [0.21 * hs, 0.17 * hs, 0.21 * hs];
      const center: [number, number, number] = puff ? [0, 0.3 * hs, -0.1] : [0, 0.27 * hs, -0.13];
      ctx.add(volume(ctx, size, [0, 0, 0], puff && ctx.high ? 0.04 : 0, false), ctx.hairStyle(BONE.head, 0.28, puff ? SURFACE.knit : SURFACE.hairSilky), xf([center[0], cy + center[1], center[2]]));
      // Hair tie.
      const tieY = center[1] - size[1] * 0.42;
      const tie = loft(
        [
          { y: tieY - 0.012, w: size[0] * 0.5, d: size[2] * 0.5 },
          { y: tieY + 0.012, w: size[0] * 0.5, d: size[2] * 0.5 },
        ],
        { segments: ctx.seg(16, 8), exponent: 2 },
      );
      ctx.add(tie, ctx.solid(puff ? '#d4af37' : shadeHex(ctx.hairHex, -0.3), SURFACE.plastic, BONE.head), xf([0, cy, center[2]], [-0.35, 0, 0]));
      return { top: center[1] + size[1] / 2, halfWidth: w / 2 + 0.012, long: false };
    }

    case 'twists': {
      scalp(ctx, { thickness: 0.016 });
      if (flat) return { top: baseTop, halfWidth: w / 2 + 0.016, long: false };
      // A short base volume so the twists read as a rounded crown, not spikes.
      const crown = superellipsoid({ w: w * 0.96, h: 0.12, d: d * 0.96, round: 0.7, segU: ctx.seg(18, 8), segV: ctx.seg(8, 4) });
      ctx.add(crown, ctx.hairStyle(BONE.head, 0.2), xf([0, cy + h / 2 - 0.01, -0.015]));
      const rng = createRng('twists');
      const count = ctx.seg(44, 18);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        // Fibonacci-ish distribution over the upper back of the head.
        const yN = 1 - (i / (count - 1)) * 1.15;
        const radius = Math.sqrt(Math.max(0, 1 - Math.min(1, yN * yN)));
        const theta = golden * i;
        const dir = new Vector3(Math.cos(theta) * radius, yN, Math.sin(theta) * radius);
        if (dir.z > 0.55 && dir.y < 0.55) continue; // keep the forehead clear
        if (dir.y < -0.15) continue;
        const root = scalpPoint(ctx, dir, 0.005);
        const out = dir.clone().normalize().add(new Vector3(rng.float(-0.15, 0.15), 0.15, rng.float(-0.15, 0.15))).normalize();
        const len = rng.float(0.06, 0.09) * hs;
        const pts = [0, 0.5, 1].map((k) => root.clone().addScaledVector(out, len * k).add(new Vector3(0, -0.012 * k * k, 0)));
        const geom = tube(smoothPath(pts, ctx.seg(5, 3)), { radius: (t) => 0.03 * hs * (1 - 0.2 * t) * (0.85 + 0.15 * Math.sin(t * Math.PI * 4)), radial: ctx.seg(6, 4) });
        ctx.add(geom, ctx.hairStyle(BONE.head, 0.1));
      }
      return { top: baseTop + 0.1, halfWidth: w / 2 + 0.08, long: false };
    }

    case 'locs':
    case 'braids': {
      const braids = style === 'braids';
      scalp(ctx, { thickness: braids ? 0.013 : 0.016 });
      const rng = createRng(style);
      const count = ctx.seg(braids ? 30 : 24, 12);
      const weights = longHairWeights(ctx);
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI * 0.62 + (i / (count - 1)) * Math.PI * 1.24; // around the back, 0 = straight back
        const rootDir = new Vector3(Math.sin(angle), rng.float(0.15, 0.8), -Math.cos(angle));
        const root = scalpPoint(ctx, rootDir, 0.01);
        const sideness = Math.abs(Math.sin(angle));
        const length = (braids ? 0.62 : 0.46) * hs * (0.8 + 0.2 * (1 - sideness)) * rng.float(0.92, 1.06);
        const outX = Math.sin(angle) * (w / 2 + 0.03 + (braids ? 0.02 : 0.035));
        const outZ = -Math.cos(angle) * (d / 2 + 0.03);
        const bottomY = root.y - length;
        const ctrl = [
          root,
          new Vector3(outX * 1.02, cy + 0.02, outZ * 1.04 - 0.01),
          new Vector3(outX * 1.08, Math.max(bottomY + length * 0.4, cy - 0.28), outZ * 1.1 - 0.03),
          new Vector3(outX * 1.12, bottomY, outZ * 1.12 - 0.05 - (1 - sideness) * 0.05),
        ];
        const r = (braids ? 0.0165 : 0.023) * hs;
        const geom = tube(smoothPath(ctrl, ctx.seg(9, 5)), { radius: (t) => r * (1 - 0.2 * t) * (braids && ctx.high ? 0.88 + 0.12 * Math.abs(Math.sin(t * 40)) : 1), radial: ctx.seg(6, 4) });
        ctx.add(geom, { ...ctx.hairStyle(weights, 0.18), color: i % 7 === 3 && braids ? lin(shadeHex(ctx.hairHex, 0.12)) : ctx.hair });
        if (braids && ctx.high && i % 6 === 2) {
          const end = ctrl[3]!;
          const cuff = loft(
            [
              { y: end.y - 0.004, w: r * 2.6, d: r * 2.6, x: end.x, z: end.z },
              { y: end.y + 0.02, w: r * 2.6, d: r * 2.6, x: end.x, z: end.z },
            ],
            { segments: 8, exponent: 2, capStart: true, capEnd: true },
          );
          ctx.add(cuff, { slot: 'base', color: lin('#d4af37'), surface: SURFACE.gold, skin: weights });
        }
      }
      if (!flat && !braids) {
        // Locs: a little crown volume.
        const crown = superellipsoid({ w: w * 0.92, h: 0.1, d: d * 0.92, round: 0.6, segU: ctx.seg(18, 8), segV: ctx.seg(8, 4) });
        ctx.add(crown, ctx.hairStyle(BONE.head, 0.15), xf([0, cy + h / 2 - 0.005, -0.02]));
      }
      return { top: baseTop + (flat || braids ? 0 : 0.04), halfWidth: w / 2 + 0.05, long: true };
    }

    case 'cornrows': {
      scalp(ctx, { thickness: 0.007, front: 0.12 });
      const rows = ctx.seg(8, 0);
      for (let i = 0; i < rows; i++) {
        const x = ((i - (rows - 1) / 2) / ((rows - 1) / 2)) * 0.82;
        const ctrl: Vector3[] = [];
        for (let k = 0; k <= 6; k++) {
          const phi = 0.42 + (k / 6) * 2.25; // from forehead over the top to the nape
          ctrl.push(scalpPoint(ctx, new Vector3(x * (w / 2) * (0.7 + 0.3 * Math.sin(phi)), Math.cos(phi - 0.3) * 0.9, Math.cos(phi) * 1.0), 0.008));
        }
        const geom = tube(smoothPath(ctrl, 18), { radius: 0.0135 * hs, radial: 6, flatten: 0.8 });
        ctx.add(geom, ctx.hairStyle(BONE.head, 0.05));
      }
      // Little tails at the nape.
      if (ctx.high && !flat) {
        const weights = longHairWeights(ctx);
        for (const x of [-0.08, 0, 0.08]) {
          const start = scalpPoint(ctx, new Vector3(x, -0.35, -1), 0.01);
          const pts = [start, start.clone().add(new Vector3(x * 0.3, -0.08, -0.02)), start.clone().add(new Vector3(x * 0.5, -0.18, -0.03))];
          ctx.add(tube(smoothPath(pts, 6), { radius: 0.012, radial: 6 }), ctx.hairStyle(weights, 0.1));
        }
      }
      return { top: baseTop - 0.005, halfWidth: w / 2 + 0.02, long: false };
    }

    case 'bone-straight': {
      scalp(ctx, { thickness: 0.02, surface: SURFACE.hairSilky, front: 0.14 });
      const weights = longHairWeights(ctx);
      // Curtain around the back and sides, open at the face.
      const rings: LoftRing[] = [];
      const steps = ctx.seg(9, 5);
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const y = cy + 0.16 * hs - t * 0.62 * hs;
        const hug = 1 - smoothstep(0, 0.45, t);
        rings.unshift({ y, w: w + 0.05 + (1 - hug) * 0.04, d: (d + 0.05) * (0.55 + 0.45 * hug), z: -0.02 - (1 - hug) * 0.07 });
      }
      const curtain = doubleSided(loft(rings, { segments: ctx.seg(22, 10), exponent: 2.6, arc: [0.62 - Math.PI, Math.PI - 0.62] }), 0.012);
      ctx.add(curtain, ctx.hairStyle(weights, 0.22, SURFACE.hairSilky));
      // Side-swept fringe.
      if (!flat) {
        const fy = 0.135 * hs;
        const fringe = superellipsoid({ w: w * 0.7, h: 0.075, d: 0.022, round: 0.55, segU: ctx.seg(14, 6), segV: ctx.seg(8, 4), deform: (p) => { p.z -= (p.x / (w * 0.35)) ** 2 * 0.03; } });
        ctx.add(fringe, ctx.hairStyle(BONE.head, 0.12, SURFACE.hairSilky), xf([w * 0.1, cy + fy, d / 2 + 0.012], [0.1, 0, -0.28]));
      }
      return { top: baseTop + 0.005, halfWidth: w / 2 + 0.05, long: true };
    }
  }
}
