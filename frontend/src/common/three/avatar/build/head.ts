import { BufferAttribute, BufferGeometry } from 'three';
import { superellipsoid } from '../../geometry/primitives';
import { FACE_LAYOUT, faceY } from '../face';
import { BONE } from '../rig';
import { SURFACE, lin, xf, type BuildContext } from './context';
import { mixHex } from '../../materials/color-utils';

/** Head roundness (superellipsoid exponent) — shared with anything that hugs the head (face decal, hair, hats). */
export const HEAD_ROUND = 0.42;

/**
 * Point on the head surface (head-centre space) in direction (x, y) on the front: returns the z of the surface.
 * Used to conform the face decal and facial hair to the head.
 */
export function headFrontZ(ctx: BuildContext, x: number, y: number): number {
  const [w, h, d] = ctx.rig.head;
  const p = 2 / HEAD_ROUND;
  const a = w / 2;
  const b = h / 2;
  const c = d / 2;
  const rest = 1 - Math.abs(x / a) ** p - Math.abs(y / b) ** p;
  return rest <= 0 ? 0 : c * rest ** (1 / p);
}

export function buildHead(ctx: BuildContext): void {
  const { rig } = ctx;
  const [w, h, d] = rig.head;
  const cy = rig.headCenterY;
  const hs = rig.headScale;

  // Skull: soft box with fuller cheeks and a slightly narrower chin.
  const skull = superellipsoid({
    w,
    h,
    d,
    round: HEAD_ROUND,
    segU: ctx.seg(24, 12),
    segV: ctx.seg(16, 8),
    deform: (p) => {
      const t = Math.max(0, -p.y / (h / 2));
      p.x *= 1 - 0.07 * t * t;
      if (p.z > 0) p.z *= 1 - 0.04 * t * t;
    },
  });
  ctx.add(skull, ctx.skinStyle(BONE.head, 0.16), xf([0, cy, 0]));

  // Ears.
  for (const sign of [1, -1]) {
    const ear = superellipsoid({ w: 0.045, h: 0.085, d: 0.065, round: 0.6, segU: ctx.seg(10, 5), segV: ctx.seg(8, 4) });
    ctx.add(ear, ctx.skinStyle(BONE.head, 0.25, -0.06), xf([sign * (w / 2 + 0.006), cy - 0.035 * hs, -0.01], [0, 0, sign * 0.12]));
  }

  // Nose: a tiny soft button.
  const noseY = faceY(0.39, hs);
  const nose = superellipsoid({ w: 0.05 * hs, h: 0.038 * hs, d: 0.034, round: 0.65, segU: ctx.seg(10, 5), segV: ctx.seg(8, 4) });
  ctx.add(nose, ctx.skinStyle(BONE.head, 0.3, -0.1), xf([0, cy + noseY, headFrontZ(ctx, 0, noseY) + 0.004]));

  if (ctx.high) buildFaceDecal(ctx);
  else buildLowFace(ctx);

  buildFacialHair(ctx);
}

/** A curved quad hugging the head front, UV-mapped to one face-atlas cell (slot `face`). */
function buildFaceDecal(ctx: BuildContext): void {
  const { rig } = ctx;
  const hs = rig.headScale;
  const fw = FACE_LAYOUT.width * hs;
  const fh = FACE_LAYOUT.height * hs;
  const cols = 14;
  const rows = 12;
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const normals = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  const indices: number[] = [];
  const centerY = FACE_LAYOUT.centerY * hs;
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const u = i / cols;
      const v = j / rows;
      const x = (u - 0.5) * fw;
      const y = centerY + (v - 0.5) * fh;
      const z = headFrontZ(ctx, x, y) + 0.0035;
      const k = j * (cols + 1) + i;
      positions[k * 3] = x;
      positions[k * 3 + 1] = rig.headCenterY + y;
      positions[k * 3 + 2] = z;
      normals[k * 3 + 2] = 1;
      uvs[k * 2] = u;
      uvs[k * 2 + 1] = v;
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const e = c + 1;
      indices.push(a, b, c, b, e, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  ctx.add(geometry, { slot: 'face', color: lin('#ffffff'), surface: SURFACE.eye, skin: BONE.head });
}

/** Crowd LOD: geometric eyes baked into the base draw call. */
function buildLowFace(ctx: BuildContext): void {
  const { rig } = ctx;
  const hs = rig.headScale;
  const ey = faceY(FACE_LAYOUT.eyeV, hs);
  const ex = (FACE_LAYOUT.eyeU * FACE_LAYOUT.width) * hs;
  for (const sign of [1, -1]) {
    const eye = superellipsoid({ w: 0.034 * hs, h: 0.044 * hs, d: 0.012, round: 0.8, segU: 6, segV: 4 });
    ctx.add(eye, ctx.solid('#1a110d', SURFACE.eye, BONE.head, 0), xf([sign * ex, rig.headCenterY + ey, headFrontZ(ctx, ex, ey) + 0.002]));
  }
}

/** Shell that hugs the lower front of the head (stubble, beards). */
function jawShell(ctx: BuildContext, thickness: number, topV: number, sideReach: number, mouthGap: boolean): BufferGeometry {
  const { rig } = ctx;
  const [w, h, d] = rig.head;
  const hs = rig.headScale;
  const top = faceY(topV, hs);
  const mouthY = faceY(FACE_LAYOUT.mouthV, hs);
  return superellipsoid({
    w: w + thickness * 2,
    h: h + thickness * 2,
    d: d + thickness * 2,
    round: HEAD_ROUND,
    segU: ctx.seg(28, 10),
    segV: ctx.seg(20, 8),
    deform: (p) => {
      // Keep the lower-front band only: collapse everything above `top` and behind the cheeks onto the boundary.
      const t = Math.max(0, -p.y / (h / 2));
      p.x *= 1 - 0.07 * t * t;
      if (p.y > top) p.y = top;
      const minZ = -d * 0.5 + d * (1 - sideReach);
      if (p.z < minZ) p.z = minZ;
      // Leave the mouth uncovered: tuck the beard behind the face around it.
      if (mouthGap && p.z > d * 0.3) {
        const gap = Math.max(0, 1 - (Math.abs(p.x) / (0.075 * hs)) ** 2 - ((p.y - mouthY) / (0.04 * hs)) ** 2);
        if (gap > 0) p.z -= (thickness + 0.012) * Math.min(1, gap * 3);
      }
    },
  });
}

function buildFacialHair(ctx: BuildContext): void {
  const style = ctx.input.appearance.facialHair;
  if (style === 'none') return;
  const { rig } = ctx;
  const hs = rig.headScale;
  const cy = rig.headCenterY;
  const beardHex = mixHex(ctx.hairHex, '#120c0a', 0.25);
  if (style === 'stubble' || style === 'full-beard') {
    const stubbleHex = style === 'stubble' ? mixHex(ctx.skinHex, beardHex, 0.38) : beardHex;
    const thickness = style === 'stubble' ? 0.0025 : 0.009;
    const shell = jawShell(ctx, thickness, style === 'stubble' ? 0.3 : 0.28, style === 'stubble' ? 0.55 : 0.6, style === 'full-beard');
    ctx.add(shell, ctx.solid(stubbleHex, SURFACE.hair, BONE.head, style === 'stubble' ? 0.05 : 0.25), xf([0, cy, 0]));
    if (style === 'full-beard') {
      // A little chin volume.
      const chinY = faceY(-0.02, hs);
      const chin = superellipsoid({ w: 0.15 * hs, h: 0.07, d: 0.06, round: 0.6, segU: ctx.seg(12, 6), segV: ctx.seg(8, 4) });
      ctx.add(chin, ctx.solid(beardHex, SURFACE.hair, BONE.head, 0.3), xf([0, cy + chinY, headFrontZ(ctx, 0, chinY) - 0.012]));
    }
  }
  if (style === 'moustache' || style === 'goatee' || style === 'full-beard') {
    const my = faceY(FACE_LAYOUT.mouthV + 0.09, hs);
    for (const sign of [1, -1]) {
      const half = superellipsoid({ w: 0.075 * hs, h: 0.026 * hs, d: 0.024, round: 0.6, segU: ctx.seg(10, 5), segV: ctx.seg(6, 3) });
      const x = sign * 0.034 * hs;
      ctx.add(half, ctx.solid(beardHex, SURFACE.hair, BONE.head, 0.25), xf([x, cy + my, headFrontZ(ctx, x, my) + 0.006], [0, 0, sign * -0.22]));
    }
  }
  if (style === 'goatee') {
    const gy = faceY(0.06, hs);
    const goatee = superellipsoid({ w: 0.075 * hs, h: 0.075 * hs, d: 0.04, round: 0.55, segU: ctx.seg(10, 5), segV: ctx.seg(8, 4) });
    ctx.add(goatee, ctx.solid(beardHex, SURFACE.hair, BONE.head, 0.3), xf([0, cy + gy, headFrontZ(ctx, 0, gy) - 0.004]));
  }
}
