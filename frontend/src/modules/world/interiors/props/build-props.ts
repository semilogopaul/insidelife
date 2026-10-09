import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { createRng } from '@insidelife/shared';
import { PartBuilder, type Surface } from '@/common/three/geometry/part-builder';
import { doubleSided, loft, superellipsoid, tube, type LoftRing } from '@/common/three/geometry/primitives';
import { shadeHex } from '@/common/three/materials/color-utils';
import type { PropSpec, SurfaceKind } from './prop-types';

const SURFACE: Readonly<Record<SurfaceKind, Surface>> = {
  wood: [0.72, 0],
  metal: [0.32, 0.75],
  plastic: [0.42, 0],
  cloth: [0.95, 0],
  stone: [0.55, 0],
  gloss: [0.18, 0],
  paint: [0.8, 0],
  rubber: [0.9, 0],
};

type V3 = readonly [number, number, number];

const tmpE = new Euler();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpP = new Vector3();

function compose(position: V3, rotation: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): Matrix4 {
  tmpE.set(rotation[0], rotation[1], rotation[2]);
  tmpQ.setFromEuler(tmpE);
  return new Matrix4().compose(tmpP.set(position[0], position[1], position[2]), tmpQ, tmpS.set(scale[0], scale[1], scale[2]));
}

/** Small modelling toolkit in a prop's local frame. */
export class PropKit {
  private frame = new Matrix4();

  constructor(private readonly builder: PartBuilder) {}

  place(at: readonly [number, number], y: number, rotDeg: number): void {
    this.frame = compose([at[0], y, at[1]], [0, (rotDeg * Math.PI) / 180, 0]);
  }

  /** A local point in room space. */
  toRoom(local: V3): Vector3 {
    return new Vector3(local[0], local[1], local[2]).applyMatrix4(this.frame);
  }

  /** Raw geometry in local space. */
  add(geometry: BufferGeometry, color: string | ((x: number, y: number, z: number, out: Color) => void), surface: SurfaceKind, local?: Matrix4, shade = 0.12): void {
    const matrix = local ? this.frame.clone().multiply(local) : this.frame.clone();
    this.builder.add(geometry, { slot: 'base', color: typeof color === 'string' ? new Color().setStyle(color) : color, surface: SURFACE[surface], shade }, matrix);
  }

  /** A box: crisp (`round` ≤ 0.2) or soft-cornered (pillows, cushions, coolers). */
  box(size: V3, position: V3, color: string, surface: SurfaceKind = 'paint', rotation: V3 = [0, 0, 0], round = 0.18): void {
    const extent = Math.max(size[0], size[1], size[2]);
    const [segU, segV] = extent < 0.2 ? [8, 6] : extent < 0.6 ? [12, 8] : [16, 10];
    const geometry = round <= 0.2 ? new BoxGeometry(size[0], size[1], size[2]) : superellipsoid({ w: size[0], h: size[1], d: size[2], round, segU, segV });
    this.add(geometry, color, surface, compose(position, rotation));
  }

  cylinder(rBottom: number, rTop: number, height: number, position: V3, color: string, surface: SurfaceKind = 'paint', rotation: V3 = [0, 0, 0], segments = 14, cap = true): void {
    const rings: LoftRing[] = [
      { y: 0, w: rBottom * 2, d: rBottom * 2 },
      { y: height, w: rTop * 2, d: rTop * 2 },
    ];
    this.add(loft(rings, { segments, exponent: 2, capStart: cap, capEnd: cap }), color, surface, compose(position, rotation));
  }

  sphere(radius: number, position: V3, color: string, surface: SurfaceKind = 'paint', squash: V3 = [1, 1, 1], segments = 10): void {
    this.add(superellipsoid({ w: radius * 2 * squash[0], h: radius * 2 * squash[1], d: radius * 2 * squash[2], round: 1, segU: segments, segV: Math.max(4, Math.round(segments * 0.7)) }), color, surface, compose(position));
  }

  /** A four-sided pyramid roof over a w×d rectangle (canopies, tents), seen from both sides. */
  pyramid(w: number, d: number, baseY: number, rise: number, color: string, surface: SurfaceKind = 'cloth'): void {
    const corners: readonly V3[] = [
      [-w / 2, baseY, -d / 2],
      [w / 2, baseY, -d / 2],
      [w / 2, baseY, d / 2],
      [-w / 2, baseY, d / 2],
    ];
    const apex: V3 = [0, baseY + rise, 0];
    const positions: number[] = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      positions.push(...a, ...apex, ...b);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
    geometry.computeVertexNormals();
    this.add(doubleSided(geometry, 0.02), color, surface, undefined, 0);
  }

  /** A soft wavy panel (curtains, drapes). */
  drape(size: V3, position: V3, color: string, waves = 55, amplitude = 0.02, rotation: V3 = [0, 0, 0]): void {
    const geometry = superellipsoid({ w: size[0], h: size[1], d: size[2], round: 0.3, segU: 12, segV: 4, deform: (p) => { p.z += Math.sin(p.x * waves) * amplitude; } });
    this.add(geometry, color, 'cloth', compose(position, rotation));
  }

  rod(points: readonly V3[], radius: number, color: string, surface: SurfaceKind = 'metal', radial = 6): void {
    this.add(tube(points.map((p) => new Vector3(p[0], p[1], p[2])), { radius, radial }), color, surface);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Prop recipes
// ---------------------------------------------------------------------------------------------------------------

/** Seat height of benches, chairs and seat rows (matches the avatar sit stance). */
export const PROP_SEAT = 0.36;

function legs4(kit: PropKit, w: number, d: number, h: number, r: number, color: string, surface: SurfaceKind, splay = 0): void {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box([r, h, r], [sx * (w / 2 - r), h / 2, sz * (d / 2 - r)], color, surface, [sz * splay, 0, -sx * splay], 0.1);
}

export function buildProp(kit: PropKit, spec: PropSpec): void {
  kit.place(spec.at, spec.y ?? 0, spec.rot ?? 0);
  switch (spec.kind) {
    case 'box':
      kit.box(spec.size, [0, spec.size[1] / 2, 0], spec.color, spec.surface ?? 'paint', [0, 0, 0], spec.round ?? 0.15);
      return;
    case 'sign': {
      const [w, h] = spec.size;
      const frame = spec.frame ?? '#2b2b2b';
      if (spec.wall) {
        kit.box([w + 0.05, h + 0.05, 0.03], [0, 0, -0.005], frame, 'wood', [0, 0, 0], 0.2);
      } else {
        const bottom = 0.55;
        kit.box([w + 0.05, h + 0.05, 0.04], [0, bottom + h / 2, -0.01], frame, 'wood', [0, 0, 0], 0.2);
        for (const s of [-1, 1]) kit.box([0.05, bottom + h * 0.5, 0.05], [s * (w / 2 - 0.05), (bottom + h * 0.5) / 2, -0.03], frame, 'wood');
      }
      return;
    }
    case 'pot': {
      const r = spec.r ?? 0.22;
      const color = spec.color ?? '#b9bec4';
      kit.cylinder(r * 0.92, r, r * 1.3, [0, 0, 0], color, 'metal', [0, 0, 0], 16);
      kit.cylinder(r * 1.02, r * 0.85, 0.03, [0, r * 1.3, 0], shadeHex(color, -0.1), 'metal', [0, 0, 0], 16);
      kit.sphere(0.03, [0, r * 1.3 + 0.04, 0], '#2b2b2b', 'plastic');
      for (const s of [-1, 1]) kit.box([0.08, 0.03, 0.04], [s * (r + 0.03), r * 1.05, 0], '#2b2b2b', 'plastic');
      return;
    }
    case 'cooler': {
      kit.box([0.55, 0.42, 0.42], [0, 0.21, 0], spec.color, 'plastic', [0, 0, 0], 0.4);
      kit.box([0.57, 0.08, 0.44], [0, 0.44, 0], '#f2f2ee', 'plastic', [0, 0, 0], 0.4);
      kit.box([0.25, 0.04, 0.05], [0, 0.5, 0], '#f2f2ee', 'plastic', [0, 0, 0], 0.5);
      return;
    }
    case 'bucket': {
      kit.cylinder(0.13, 0.17, 0.32, [0, 0, 0], spec.color, 'plastic', [0, 0, 0], 14);
      kit.rod([[-0.16, 0.3, 0], [0, 0.45, 0], [0.16, 0.3, 0]], 0.008, '#3a3a3a');
      return;
    }
    case 'gas-cooker': {
      kit.box([0.6, 0.12, 0.38], [0, 0.06, 0], '#cfd3d6', 'metal', [0, 0, 0], 0.2);
      for (const s of [-1, 1]) kit.cylinder(0.08, 0.08, 0.02, [s * 0.15, 0.12, 0], '#262626', 'metal');
      kit.cylinder(0.15, 0.15, 0.55, [0.55, -0.0, 0.05], '#2e7d32', 'gloss', [0, 0, 0], 14);
      kit.sphere(0.15, [0.55, 0.55, 0.05], '#2e7d32', 'gloss', [1, 0.5, 1]);
      kit.cylinder(0.03, 0.03, 0.08, [0.55, 0.6, 0.05], '#c9a64a', 'metal');
      return;
    }
    case 'plastic-chair': {
      const c = spec.color ?? '#ecebe6';
      kit.box([0.44, 0.04, 0.42], [0, PROP_SEAT, 0], c, 'plastic', [0, 0, 0], 0.4);
      kit.add(
        superellipsoid({ w: 0.44, h: 0.4, d: 0.04, round: 0.45, segU: 8, segV: 6, deform: (p) => { p.z += (p.x * p.x) * 0.6; } }),
        c,
        'plastic',
        compose([0, PROP_SEAT + 0.22, -0.2], [-0.12, 0, 0]),
      );
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cylinder(0.022, 0.018, PROP_SEAT, [sx * 0.19, 0, sz * 0.18], c, 'plastic', [sz * 0.08, 0, -sx * 0.08], 8, false);
      for (const sx of [-1, 1]) kit.box([0.04, 0.03, 0.34], [sx * 0.22, PROP_SEAT + 0.18, -0.02], c, 'plastic', [0, 0, 0], 0.4);
      return;
    }
    case 'bench': {
      const c = spec.color ?? '#a8703f';
      kit.box([spec.length, 0.07, 0.38], [0, PROP_SEAT - 0.035, 0], c, 'wood', [0, 0, 0], 0.1);
      legs4(kit, spec.length - 0.1, 0.32, PROP_SEAT - 0.07, 0.07, shadeHex(c, -0.25), 'wood');
      return;
    }
    case 'pew': {
      const c = spec.color ?? '#6b4226';
      kit.box([spec.length, 0.06, 0.42], [0, PROP_SEAT - 0.03, 0], c, 'wood', [0, 0, 0], 0.15);
      kit.box([spec.length, 0.46, 0.05], [0, PROP_SEAT + 0.2, -0.21], c, 'wood', [-0.08, 0, 0], 0.15);
      for (const s of [-1, 1]) kit.box([0.06, PROP_SEAT + 0.42, 0.48], [s * (spec.length / 2), (PROP_SEAT + 0.42) / 2, -0.02], shadeHex(c, -0.15), 'wood', [0, 0, 0], 0.2);
      return;
    }
    case 'seat-row': {
      const frame = spec.frame ?? '#3a3f45';
      const pitch = 0.56;
      const total = spec.count * pitch;
      for (let i = 0; i < spec.count; i++) {
        const x = -total / 2 + pitch * (i + 0.5);
        kit.box([0.5, 0.1, 0.44], [x, PROP_SEAT - 0.04, 0], spec.color, 'cloth', [0, 0, 0], 0.45);
        kit.box([0.5, 0.48, 0.1], [x, PROP_SEAT + 0.24, -0.2], spec.color, 'cloth', [-0.12, 0, 0], 0.45);
      }
      for (let i = 0; i <= spec.count; i++) kit.box([0.05, 0.2, 0.46], [-total / 2 + pitch * i, PROP_SEAT + 0.12, -0.02], frame, 'metal', [0, 0, 0], 0.3);
      kit.box([total, 0.05, 0.12], [0, 0.12, -0.05], frame, 'metal');
      for (const s of [-1, 1]) kit.box([0.06, 0.26, 0.4], [s * (total / 2 - 0.1), 0.13, -0.02], frame, 'metal');
      return;
    }
    case 'canopy': {
      const [w, d] = spec.size;
      const h = spec.height ?? 2.5;
      const trim = spec.trim ?? '#f6b90b';
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cylinder(0.035, 0.035, h, [sx * w / 2, 0, sz * d / 2], '#d9d9d9', 'metal', [0, 0, 0], 8, false);
      kit.pyramid(w + 0.2, d + 0.2, h, Math.min(0.9, 0.18 * Math.max(w, d)), spec.color);
      // Scalloped valance.
      const valance: LoftRing[] = [
        { y: h - 0.24, w: w + 0.22, d: d + 0.22 },
        { y: h, w: w + 0.22, d: d + 0.22 },
      ];
      kit.add(doubleSided(loft(valance, { segments: 64, exponent: 14, shapeY: (ring, angle) => (ring === 0 ? Math.abs(Math.sin(angle * 12)) * 0.1 : 0) }), 0.01), trim, 'cloth');
      return;
    }
    case 'stall': {
      kit.box([1.3, 0.05, 0.75], [0, 0.6, 0], '#9b6a3e', 'wood');
      legs4(kit, 1.25, 0.7, 0.58, 0.05, '#7a5230', 'wood');
      const rng = createRng(`stall:${spec.at.join(',')}`);
      if (spec.goods === 'tomatoes' || spec.goods === 'peppers') {
        for (let pile = 0; pile < 4; pile++) {
          const px = -0.45 + pile * 0.3;
          for (let k = 0; k < 6; k++) {
            const color = spec.goods === 'tomatoes' ? (k % 3 === 0 ? '#d1462f' : '#e2553a') : k % 2 === 0 ? '#c62828' : '#2e7d32';
            kit.sphere(0.045, [px + rng.float(-0.06, 0.06), 0.67 + (k > 3 ? 0.06 : 0), rng.float(-0.18, 0.18)], color, 'gloss');
          }
        }
        kit.cylinder(0.12, 0.16, 0.12, [0.4, 0.62, 0.2], '#ececec', 'plastic');
      } else if (spec.goods === 'fabric') {
        const colors = ['#e35d1c', '#1d4e89', '#c2185b', '#00897b', '#fdd835', '#6a1b9a'];
        for (let i = 0; i < 6; i++) {
          kit.box([0.32, 0.05, 0.22], [-0.42 + (i % 3) * 0.42, 0.65 + Math.floor(i / 3) * 0.055, i < 3 ? -0.15 : 0.12], colors[i]!, 'cloth', [0, 0, 0], 0.3);
          kit.box([0.32, 0.05, 0.22], [-0.42 + (i % 3) * 0.42, 0.705 + Math.floor(i / 3) * 0.055, i < 3 ? -0.15 : 0.12], colors[(i + 2) % 6]!, 'cloth', [0, 0, 0], 0.3);
        }
      } else if (spec.goods === 'phones') {
        kit.box([1.2, 0.18, 0.5], [0, 0.72, -0.05], '#dfe7ea', 'gloss', [0, 0, 0], 0.1);
        for (let i = 0; i < 10; i++) kit.box([0.06, 0.012, 0.11], [-0.5 + i * 0.11, 0.82, -0.05], i % 3 === 0 ? '#2e86de' : '#1c1f22', 'gloss', [0, 0, 0], 0.3);
      } else {
        for (let i = 0; i < 6; i++) kit.box([0.12, 0.08, 0.24], [-0.45 + i * 0.18, 0.67, 0], ['#5d4037', '#212121', '#c62828', '#f5f5f5'][i % 4]!, 'gloss', [0, 0, 0], 0.5);
      }
      // Umbrella.
      kit.cylinder(0.025, 0.025, 2.1, [0.58, 0, 0.3], '#cfd3d6', 'metal', [0, 0, 0], 8, false);
      umbrellaTop(kit, [0.58, 2.1, 0.3], 1.0, spec.umbrella, '#ffffff');
      return;
    }
    case 'umbrella': {
      kit.cylinder(0.025, 0.025, 2.1, [0, 0, 0], '#cfd3d6', 'metal', [0, 0, 0], 8, false);
      umbrellaTop(kit, [0, 2.1, 0], 1.0, spec.color, spec.color2 ?? '#ffffff');
      return;
    }
    case 'shelf': {
      const [w, h, d] = spec.size;
      const c = spec.color ?? '#8a5a36';
      kit.box([w, h, 0.03], [0, h / 2, -d / 2 + 0.015], shadeHex(c, -0.15), 'wood', [0, 0, 0], 0.1);
      for (const s of [-1, 1]) kit.box([0.04, h, d], [s * (w / 2 - 0.02), h / 2, 0], c, 'wood', [0, 0, 0], 0.1);
      const rows = Math.max(2, Math.round(h / 0.38));
      const rng = createRng(`shelf:${spec.at.join(',')}:${spec.items}`);
      for (let r = 0; r <= rows; r++) {
        const y = (r / rows) * (h - 0.04) + 0.02;
        kit.box([w - 0.06, 0.03, d - 0.02], [0, y, 0], c, 'wood', [0, 0, 0], 0.1);
        if (r === rows) break;
        const count = Math.floor((w - 0.1) / 0.11);
        for (let i = 0; i < count; i++) {
          const x = -w / 2 + 0.1 + i * ((w - 0.15) / count);
          if (spec.items === 'bottles') {
            const color = rng.pick(['#2e7d32', '#6d4c41', '#c9a64a', '#b71c1c', '#1b5e20', '#f5f5f5']);
            kit.cylinder(0.03, 0.03, 0.18, [x, y + 0.015, 0], color, 'gloss', [0, 0, 0], 8);
            kit.cylinder(0.012, 0.012, 0.06, [x, y + 0.195, 0], color, 'gloss', [0, 0, 0], 6);
          } else if (spec.items === 'clothes') {
            kit.box([0.09, 0.22, d * 0.7], [x, y + 0.13, 0], rng.pick(['#e35d1c', '#1d4e89', '#c2185b', '#00897b', '#fdd835', '#263238', '#f5f5f5']), 'cloth', [0, 0, 0], 0.3);
          } else if (spec.items === 'books') {
            kit.box([0.05, rng.float(0.17, 0.25), d * 0.6], [x, y + 0.12, 0], rng.pick(['#b23a2b', '#1d4e89', '#2e7d32', '#f6b90b', '#6a1b9a', '#3e2723']), 'cloth', [0, 0, rng.float(-0.06, 0.06)], 0.15);
          } else {
            kit.box([0.08, rng.float(0.08, 0.15), d * 0.5], [x, y + 0.08, 0], rng.pick(['#ffffff', '#e3f2fd', '#ffebee', '#e8f5e9', '#fff8e1', '#1976d2']), 'paint', [0, 0, 0], 0.2);
          }
        }
      }
      return;
    }
    case 'iv-stand': {
      kit.cylinder(0.015, 0.015, 1.5, [0, 0.05, 0], '#cfd3d6', 'metal', [0, 0, 0], 6, false);
      for (let i = 0; i < 4; i++) kit.box([0.28, 0.025, 0.03], [0, 0.03, 0], '#9aa3ad', 'metal', [0, (i * Math.PI) / 2, 0]);
      kit.box([0.2, 0.02, 0.02], [0, 1.52, 0], '#9aa3ad', 'metal');
      kit.box([0.1, 0.16, 0.03], [0.08, 1.4, 0], '#d6ecf3', 'gloss', [0, 0, 0], 0.5);
      kit.rod([[0.08, 1.32, 0], [0.1, 1.0, 0.05], [0.25, 0.7, 0.2]], 0.004, '#e0f2f1', 'plastic');
      return;
    }
    case 'curtain': {
      const h = spec.height ?? 1.9;
      kit.cylinder(0.012, 0.012, spec.length, [-spec.length / 2, h + 0.05, 0], '#b0b6bb', 'metal', [0, 0, -Math.PI / 2], 6);
      const sheet = superellipsoid({ w: spec.length, h, d: 0.03, round: 0.3, segU: 40, segV: 6, deform: (p) => { p.z += Math.sin(p.x * 40) * 0.035; } });
      kit.add(sheet, spec.color, 'cloth', compose([0, h / 2 + 0.03, 0]));
      return;
    }
    case 'dj-booth': {
      kit.box([1.8, 0.85, 0.75], [0, 0.425, 0], '#15181c', 'gloss', [0, 0, 0], 0.15);
      kit.box([1.82, 0.06, 0.06], [0, 0.6, 0.38], '#ff2fb1', 'gloss', [0, 0, 0], 0.4);
      kit.box([1.82, 0.06, 0.06], [0, 0.35, 0.38], '#21d4fd', 'gloss', [0, 0, 0], 0.4);
      kit.box([1.7, 0.04, 0.7], [0, 0.87, 0], '#22262b', 'metal');
      for (const s of [-1, 1]) {
        kit.cylinder(0.17, 0.17, 0.04, [s * 0.55, 0.89, 0], '#0d0f11', 'plastic', [0, 0, 0], 20);
        kit.cylinder(0.04, 0.04, 0.045, [s * 0.55, 0.89, 0], '#c62828', 'plastic', [0, 0, 0], 10);
      }
      kit.box([0.35, 0.06, 0.45], [0, 0.9, 0], '#2b3035', 'metal');
      kit.box([0.34, 0.012, 0.24], [0, 0.95, -0.25], '#9aa3ad', 'metal');
      kit.box([0.34, 0.22, 0.012], [0, 1.06, -0.37], '#9aa3ad', 'metal', [0.25, 0, 0]);
      return;
    }
    case 'speaker-stack': {
      const h = spec.height ?? 1.4;
      const unit = h / 2;
      for (let i = 0; i < 2; i++) {
        kit.box([0.6, unit - 0.02, 0.55], [0, unit * i + unit / 2, 0], '#17191c', 'plastic', [0, 0, 0], 0.12);
        kit.cylinder(0.2, 0.2, 0.02, [0, unit * i + unit / 2, 0.28], '#2b2f33', 'plastic', [Math.PI / 2, 0, 0], 18);
        kit.cylinder(0.07, 0.07, 0.03, [0, unit * i + unit / 2, 0.29], '#3d4247', 'metal', [Math.PI / 2, 0, 0], 12);
      }
      return;
    }
    case 'bar-counter': {
      const c = spec.color ?? '#3b2a20';
      kit.box([spec.length, 0.88, 0.55], [0, 0.44, 0], c, 'wood', [0, 0, 0], 0.12);
      kit.box([spec.length + 0.08, 0.05, 0.66], [0, 0.9, -0.02], spec.top ?? '#d9d4cc', 'gloss', [0, 0, 0], 0.15);
      kit.box([spec.length, 0.04, 0.04], [0, 0.18, 0.32], '#c9a64a', 'metal', [0, 0, 0], 0.4);
      kit.box([spec.length, 0.03, 0.03], [0, 0.82, 0.29], '#f6b90b', 'gloss', [0, 0, 0], 0.4);
      return;
    }
    case 'stage': {
      const [w, d] = spec.size;
      const h = spec.height ?? 0.35;
      kit.box([w, h, d], [0, h / 2, 0], spec.color, 'wood', [0, 0, 0], 0.08);
      kit.box([w + 0.02, 0.05, 0.03], [0, h - 0.03, d / 2], spec.trim ?? '#c9a64a', 'metal', [0, 0, 0], 0.3);
      return;
    }
    case 'rope': {
      const c = spec.color ?? '#9b1b30';
      for (const s of [-1, 1]) {
        kit.cylinder(0.03, 0.03, 0.85, [(s * spec.length) / 2, 0.02, 0], '#c9a64a', 'metal', [0, 0, 0], 8, false);
        kit.cylinder(0.12, 0.12, 0.03, [(s * spec.length) / 2, 0, 0], '#c9a64a', 'metal', [0, 0, 0], 12);
        kit.sphere(0.045, [(s * spec.length) / 2, 0.88, 0], '#c9a64a', 'metal');
      }
      const pts: V3[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push([(t - 0.5) * spec.length, 0.82 - Math.sin(t * Math.PI) * 0.18, 0]);
      }
      kit.rod(pts, 0.025, c, 'cloth');
      return;
    }
    case 'arch': {
      const { width, height } = spec;
      const trim = spec.trim ?? '#c9a64a';
      for (const s of [-1, 1]) kit.box([0.16, height - width / 2, 0.16], [(s * width) / 2, (height - width / 2) / 2, 0], spec.color, 'stone', [0, 0, 0], 0.25);
      const pts: V3[] = [];
      for (let i = 0; i <= 18; i++) {
        const a = (i / 18) * Math.PI;
        pts.push([Math.cos(a) * (width / 2), height - width / 2 + Math.sin(a) * (width / 2) * 1.1, 0]);
      }
      kit.rod(pts, 0.085, spec.color, 'stone', 8);
      kit.rod(pts.map(([x, y, z]) => [x * 0.86, y - 0.02, z + 0.03] as V3), 0.025, trim, 'metal', 6);
      kit.box([width - 0.16, height - width / 2, 0.04], [0, (height - width / 2) / 2, -0.06], shadeHex(spec.color, -0.18), 'stone', [0, 0, 0], 0.1);
      return;
    }
    case 'mat': {
      const [w, d] = spec.size;
      kit.box([w, 0.012, d], [0, 0.006, 0], spec.border ?? shadeHex(spec.color, -0.25), 'cloth', [0, 0, 0], 0.1);
      kit.box([w * 0.82, 0.016, d * 0.86], [0, 0.009, 0], spec.color, 'cloth', [0, 0, 0], 0.1);
      return;
    }
    case 'cross': {
      const c = spec.color ?? '#c9a64a';
      kit.box([0.1, 0.9, 0.05], [0, 0, 0], c, 'metal', [0, 0, 0], 0.3);
      kit.box([0.56, 0.1, 0.05], [0, 0.17, 0], c, 'metal', [0, 0, 0], 0.3);
      return;
    }
    case 'lectern': {
      const c = spec.color ?? '#6b4226';
      kit.box([0.5, 0.06, 0.4], [0, 0.03, 0], c, 'wood');
      kit.box([0.36, 0.8, 0.3], [0, 0.45, 0], c, 'wood', [0, 0, 0], 0.15);
      kit.box([0.52, 0.05, 0.42], [0, 0.88, 0], shadeHex(c, 0.1), 'wood', [-0.35, 0, 0]);
      return;
    }
    case 'treadmill': {
      kit.box([0.62, 0.14, 1.5], [0, 0.07, 0], '#2b2f33', 'plastic', [0, 0, 0], 0.2);
      kit.box([0.5, 0.02, 1.38], [0, 0.15, 0.02], '#111315', 'rubber', [0, 0, 0], 0.1);
      for (const s of [-1, 1]) kit.box([0.05, 1.0, 0.06], [s * 0.3, 0.6, -0.65], '#9aa3ad', 'metal', [-0.15, 0, 0]);
      kit.box([0.62, 0.22, 0.12], [0, 1.1, -0.72], '#2b2f33', 'plastic', [0.5, 0, 0], 0.3);
      kit.box([0.3, 0.12, 0.02], [0, 1.13, -0.66], '#21d4fd', 'gloss', [0.5, 0, 0], 0.2);
      return;
    }
    case 'bench-press': {
      kit.box([0.3, 0.08, 1.1], [0, 0.42, 0], '#c62828', 'cloth', [0, 0, 0], 0.35);
      kit.box([0.08, 0.38, 0.08], [0, 0.19, 0.4], '#2b2f33', 'metal');
      kit.box([0.08, 0.38, 0.08], [0, 0.19, -0.4], '#2b2f33', 'metal');
      for (const s of [-1, 1]) kit.box([0.06, 1.0, 0.06], [s * 0.45, 0.5, -0.55], '#2b2f33', 'metal');
      kit.cylinder(0.015, 0.015, 1.6, [-0.8, 0.95, -0.55], '#c9ced3', 'metal', [0, 0, -Math.PI / 2], 8);
      for (const s of [-1, 1]) kit.cylinder(0.17, 0.17, 0.06, [s * 0.62, 0.95, -0.55], '#1c1f22', 'plastic', [0, 0, Math.PI / 2], 16);
      return;
    }
    case 'dumbbell-rack': {
      kit.box([1.4, 0.06, 0.4], [0, 0.55, 0], '#2b2f33', 'metal');
      kit.box([1.4, 0.06, 0.4], [0, 0.25, 0], '#2b2f33', 'metal');
      for (const s of [-1, 1]) kit.box([0.06, 0.6, 0.4], [s * 0.68, 0.3, 0], '#2b2f33', 'metal');
      for (let i = 0; i < 6; i++) {
        for (const y of [0.62, 0.32]) {
          const x = -0.55 + i * 0.22;
          kit.cylinder(0.012, 0.012, 0.2, [x - 0.1, y, 0], '#9aa3ad', 'metal', [0, 0, -Math.PI / 2], 6);
          for (const s of [-1, 1]) kit.cylinder(0.04 + i * 0.004, 0.04 + i * 0.004, 0.05, [x + s * 0.08, y, 0], '#1c1f22', 'plastic', [0, 0, Math.PI / 2], 10);
        }
      }
      return;
    }
    case 'punching-bag': {
      kit.box([0.06, 0.06, 0.6], [0, 2.3, -0.25], '#2b2f33', 'metal');
      kit.rod([[0, 2.28, 0], [0, 1.9, 0]], 0.01, '#9aa3ad');
      kit.cylinder(0.2, 0.2, 0.9, [0, 1.0, 0], '#c62828', 'gloss', [0, 0, 0], 16);
      return;
    }
    case 'salon-chair': {
      const c = spec.color ?? '#1c1f22';
      kit.cylinder(0.26, 0.26, 0.04, [0, 0, 0], '#c9ced3', 'metal', [0, 0, 0], 18);
      kit.cylinder(0.05, 0.05, 0.28, [0, 0.04, 0], '#c9ced3', 'metal');
      kit.box([0.5, 0.1, 0.46], [0, PROP_SEAT - 0.02, 0], c, 'gloss', [0, 0, 0], 0.4);
      kit.box([0.48, 0.6, 0.1], [0, PROP_SEAT + 0.32, -0.22], c, 'gloss', [-0.1, 0, 0], 0.4);
      for (const s of [-1, 1]) kit.box([0.07, 0.06, 0.42], [s * 0.27, PROP_SEAT + 0.16, 0], c, 'gloss', [0, 0, 0], 0.4);
      kit.box([0.3, 0.05, 0.12], [0, 0.18, 0.28], '#c9ced3', 'metal');
      return;
    }
    case 'mirror': {
      const [w, h] = spec.size;
      kit.box([w + 0.08, h + 0.08, 0.04], [0, 0, 0], spec.frame ?? '#c9a64a', 'metal', [0, 0, 0], 0.25);
      kit.box([w, h, 0.02], [0, 0, 0.02], '#b9d3df', 'gloss', [0, 0, 0], 0.15);
      return;
    }
    case 'hood-dryer': {
      kit.cylinder(0.22, 0.22, 0.03, [0, 0, 0], '#c9ced3', 'metal', [0, 0, 0], 14);
      kit.cylinder(0.025, 0.025, 1.2, [0, 0.02, 0], '#c9ced3', 'metal', [0, 0, 0], 6, false);
      kit.sphere(0.24, [0, 1.25, 0.12], '#f1c2d2', 'gloss', [1, 0.8, 1]);
      return;
    }
    case 'luggage': {
      kit.box([0.42, 0.55, 0.24], [0, 0.32, 0], spec.color, 'gloss', [0, 0, 0], 0.3);
      kit.rod([[-0.1, 0.6, -0.08], [-0.1, 0.85, -0.08], [0.1, 0.85, -0.08], [0.1, 0.6, -0.08]], 0.01, '#3a3f45');
      for (const s of [-1, 1]) kit.sphere(0.03, [s * 0.15, 0.03, -0.08], '#1c1f22', 'plastic');
      return;
    }
    case 'flag': {
      kit.cylinder(0.015, 0.015, 2.1, [0, 0, 0], '#c9ced3', 'metal', [0, 0, 0], 6, false);
      kit.cylinder(0.12, 0.14, 0.05, [0, 0, 0], '#c9ced3', 'metal');
      kit.box([0.25, 0.42, 0.01], [0.13, 1.82, 0], '#008751', 'cloth', [0, 0, 0], 0.1);
      kit.box([0.25, 0.42, 0.01], [0.38, 1.82, 0], '#ffffff', 'cloth', [0, 0, 0], 0.1);
      kit.box([0.25, 0.42, 0.01], [0.63, 1.82, 0], '#008751', 'cloth', [0, 0, 0], 0.1);
      return;
    }
    case 'water-dispenser': {
      kit.box([0.32, 0.9, 0.32], [0, 0.45, 0], '#eef1f3', 'plastic', [0, 0, 0], 0.2);
      kit.cylinder(0.14, 0.14, 0.38, [0, 0.9, 0], '#5aa9e6', 'gloss', [0, 0, 0], 14);
      kit.box([0.04, 0.04, 0.05], [-0.06, 0.6, 0.17], '#1976d2', 'plastic');
      kit.box([0.04, 0.04, 0.05], [0.06, 0.6, 0.17], '#d32f2f', 'plastic');
      return;
    }
    case 'lantern': {
      kit.box([0.16, 0.24, 0.12], [0, 0.12, 0], '#2b2f33', 'plastic', [0, 0, 0], 0.3);
      kit.box([0.13, 0.15, 0.125], [0, 0.13, 0], '#fff6d0', 'gloss', [0, 0, 0], 0.3);
      kit.rod([[-0.05, 0.24, 0], [0, 0.3, 0], [0.05, 0.24, 0]], 0.008, '#2b2f33');
      return;
    }
    case 'mattress': {
      const [w, d] = spec.size;
      kit.box([w, 0.2, d], [0, 0.1, 0], '#f1e6c8', 'cloth', [0, 0, 0], 0.4);
      kit.box([w + 0.01, 0.06, d * 0.72], [0, 0.18, d * 0.12], spec.color, 'cloth', [0, 0, 0], 0.35);
      kit.box([w * 0.7, 0.1, 0.32], [0, 0.25, -d / 2 + 0.22], '#fafafa', 'cloth', [0, 0, 0], 0.6);
      return;
    }
    case 'danfo': {
      const yellow = '#f6b90b';
      kit.box([2.0, 1.6, 4.4], [0, 1.05, 0], yellow, 'gloss', [0, 0, 0], 0.18);
      kit.box([2.02, 0.5, 3.2], [0, 1.45, -0.35], '#1f2a33', 'gloss', [0, 0, 0], 0.1);
      kit.box([1.7, 0.55, 0.05], [0, 1.4, 2.2], '#1f2a33', 'gloss', [-0.15, 0, 0], 0.1);
      for (const y of [0.85, 0.72]) kit.box([2.03, 0.07, 4.2], [0, y, 0], '#111111', 'paint', [0, 0, 0], 0.2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cylinder(0.32, 0.32, 0.25, [sx * 0.92, 0.32, sz * 1.4], '#1c1f22', 'plastic', [0, 0, Math.PI / 2], 14);
      kit.box([0.5, 0.1, 0.04], [0, 0.65, 2.22], '#f2f2ee', 'gloss');
      return;
    }
    case 'grill': {
      kit.box([1.0, 0.18, 0.4], [0, 0.72, 0], '#3a3f45', 'metal', [0, 0, 0], 0.1);
      legs4(kit, 0.95, 0.35, 0.65, 0.04, '#2b2f33', 'metal');
      kit.box([0.9, 0.04, 0.32], [0, 0.82, 0], '#ff6a2a', 'gloss', [0, 0, 0], 0.3);
      for (let i = 0; i < 8; i++) {
        kit.box([0.04, 0.035, 0.36], [-0.4 + i * 0.11, 0.86, 0], '#7a3b1d', 'cloth', [0, 0, 0], 0.5);
      }
      return;
    }
    case 'generator': {
      kit.box([0.6, 0.45, 0.42], [0, 0.26, 0], '#d32f2f', 'gloss', [0, 0, 0], 0.25);
      kit.box([0.64, 0.05, 0.46], [0, 0.03, 0], '#2b2f33', 'metal');
      kit.box([0.5, 0.18, 0.36], [0, 0.56, 0], '#f6b90b', 'gloss', [0, 0, 0], 0.4);
      return;
    }
    case 'chandelier': {
      const h = spec.height;
      kit.rod([[0, h + 0.6, 0], [0, h + 0.15, 0]], 0.01, '#c9a64a');
      for (let ring = 0; ring < 2; ring++) {
        const r = 0.45 - ring * 0.2;
        const pts: V3[] = [];
        for (let i = 0; i <= 20; i++) pts.push([Math.cos((i / 20) * Math.PI * 2) * r, h + ring * 0.18, Math.sin((i / 20) * Math.PI * 2) * r]);
        kit.rod(pts, 0.015, '#c9a64a', 'metal');
        for (let i = 0; i < 10; i++) kit.sphere(0.035, [Math.cos((i / 10) * Math.PI * 2) * r, h + ring * 0.18 - 0.07, Math.sin((i / 10) * Math.PI * 2) * r], '#fff8e1', 'gloss', [1, 1.6, 1], 6);
      }
      return;
    }
    case 'balloons': {
      const rng = createRng(`balloons:${spec.at.join(',')}`);
      for (let i = 0; i < 7; i++) {
        const x = rng.float(-0.25, 0.25);
        const z = rng.float(-0.2, 0.2);
        const y = 1.6 + rng.float(0, 0.5);
        kit.sphere(0.13, [x, y, z], spec.colors[i % spec.colors.length]!, 'gloss', [1, 1.18, 1], 10);
        kit.rod([[x, y - 0.15, z], [0, 0.9, 0]], 0.003, '#eeeeee', 'plastic', 3);
      }
      return;
    }
    case 'cake': {
      const tiers: ReadonlyArray<readonly [number, number]> = [
        [0.2, 0.14],
        [0.15, 0.12],
        [0.1, 0.1],
      ];
      let y = 0;
      for (const [r, h] of tiers) {
        kit.cylinder(r, r, h, [0, y, 0], '#fbf7ef', 'gloss', [0, 0, 0], 18);
        kit.cylinder(r + 0.005, r + 0.005, 0.02, [0, y + 0.01, 0], '#c9a64a', 'metal', [0, 0, 0], 18, false);
        y += h;
      }
      return;
    }
    case 'car-platform': {
      const r = spec.r ?? 2.2;
      kit.cylinder(r, r + 0.05, 0.12, [0, 0, 0], '#e9ecef', 'gloss', [0, 0, 0], 40);
      kit.cylinder(r + 0.06, r + 0.06, 0.03, [0, 0.1, 0], '#f6b90b', 'gloss', [0, 0, 0], 40, false);
      return;
    }
    case 'pillar':
      kit.box([0.4, spec.height, 0.4], [0, spec.height / 2, 0], spec.color, 'stone', [0, 0, 0], 0.15);
      return;
    case 'planter': {
      const [w, d] = spec.size;
      kit.box([w, 0.4, d], [0, 0.2, 0], '#8d6e63', 'stone', [0, 0, 0], 0.2);
      const rng = createRng(`planter:${spec.at.join(',')}`);
      for (let i = 0; i < Math.max(3, Math.round(w * d * 14)); i++) kit.sphere(rng.float(0.1, 0.18), [rng.float(-w / 2 + 0.1, w / 2 - 0.1), 0.45 + rng.float(0, 0.12), rng.float(-d / 2 + 0.1, d / 2 - 0.1)], rng.pick(['#2e7d32', '#388e3c', '#1b5e20', '#43a047']), 'cloth');
      return;
    }
    case 'drink-crate': {
      kit.box([0.42, 0.28, 0.3], [0, 0.14, 0], spec.color ?? '#2e7d32', 'plastic', [0, 0, 0], 0.15);
      for (let i = 0; i < 6; i++) kit.cylinder(0.03, 0.03, 0.1, [-0.13 + (i % 3) * 0.13, 0.28, i < 3 ? -0.07 : 0.07], '#4e342e', 'gloss', [0, 0, 0], 8);
      return;
    }
    case 'bottles': {
      const rng = createRng(`bottles:${spec.at.join(',')}`);
      for (let i = 0; i < (spec.count ?? 3); i++) {
        const x = rng.float(-0.18, 0.18);
        const z = rng.float(-0.12, 0.12);
        const color = rng.pick(['#2e7d32', '#6d4c41', '#c9a64a', '#b71c1c']);
        kit.cylinder(0.03, 0.03, 0.17, [x, 0, z], color, 'gloss', [0, 0, 0], 8);
        kit.cylinder(0.012, 0.012, 0.07, [x, 0.17, z], color, 'gloss', [0, 0, 0], 6);
      }
      return;
    }
    case 'food-plate': {
      kit.cylinder(0.14, 0.12, 0.025, [0, 0, 0], '#fafafa', 'gloss', [0, 0, 0], 16);
      if (spec.food === 'amala') {
        kit.sphere(0.06, [-0.03, 0.05, 0], '#5a3a22', 'cloth', [1, 0.7, 1]);
        kit.cylinder(0.07, 0.08, 0.02, [0.05, 0.025, 0.02], '#2e7d32', 'gloss', [0, 0, 0], 12);
      } else if (spec.food === 'suya') {
        for (let i = 0; i < 5; i++) kit.box([0.18, 0.025, 0.03], [0, 0.04, -0.06 + i * 0.03], '#7a3b1d', 'cloth', [0, i * 0.3, 0], 0.5);
      } else kit.sphere(0.09, [0, 0.04, 0], '#d9531e', 'cloth', [1, 0.45, 1]);
      return;
    }
    case 'stairs': {
      const [w, h, d] = spec.size;
      const steps = 8;
      for (let i = 0; i < steps; i++) kit.box([w, ((i + 1) * h) / steps, d / steps], [0, ((i + 1) * h) / steps / 2, -d / 2 + (d / steps) * (i + 0.5)], i % 2 === 0 ? spec.color : shadeHex(spec.color, -0.06), 'wood', [0, 0, 0], 0.08);
      return;
    }
    case 'stairwell': {
      // The floor can't be cut, so the opening is painted: steps fading into the dark below, a rim and a railing.
      const [w, d] = spec.size;
      const rail = spec.rail ?? '#3e2723';
      kit.box([w + 0.1, 0.012, d + 0.1], [0, 0.006, 0], shadeHex(rail, 0.1), 'wood', [0, 0, 0], 0.1);
      kit.box([w - 0.02, 0.014, d - 0.02], [0, 0.008, 0], '#14100c', 'paint', [0, 0, 0], 0.1);
      const step = 0.3;
      const count = Math.min(6, Math.floor(d / step));
      for (let i = 0; i < count; i++) {
        const shade = -0.18 - (i / count) * 0.72;
        kit.box([w - 0.14, 0.016, step * 0.78], [0, 0.01, d / 2 - step * (i + 0.5)], shadeHex(spec.color, shade), 'wood', [0, 0, 0], 0.1);
      }
      const railY = 0.92;
      const posts = Math.max(2, Math.round(d / 0.55));
      for (const sx of [-1, 1]) {
        const x = sx * (w / 2 + 0.03);
        for (let i = 0; i <= posts; i++) kit.box([0.04, railY, 0.04], [x, railY / 2, d / 2 - (d * i) / posts], rail, 'wood', [0, 0, 0], 0.1);
        kit.box([0.07, 0.05, d + 0.08], [x, railY, 0], rail, 'wood', [0, 0, 0], 0.2);
        // Newel post at the top step.
        kit.box([0.09, railY + 0.12, 0.09], [x, (railY + 0.12) / 2, d / 2], shadeHex(rail, -0.1), 'wood', [0, 0, 0], 0.15);
        kit.sphere(0.06, [x, railY + 0.16, d / 2], shadeHex(rail, 0.15), 'wood');
      }
      const across = Math.max(1, Math.round(w / 0.5));
      for (let i = 1; i < across; i++) kit.box([0.04, railY, 0.04], [-w / 2 + (w * i) / across, railY / 2, -d / 2 - 0.03], rail, 'wood', [0, 0, 0], 0.1);
      kit.box([w + 0.14, 0.05, 0.07], [0, railY, -d / 2 - 0.03], rail, 'wood', [0, 0, 0], 0.2);
      return;
    }
    case 'clothesline': {
      const h = spec.height ?? 1.75;
      const pts: V3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([(t - 0.5) * spec.length, h - Math.sin(t * Math.PI) * 0.08, 0]);
      }
      kit.rod(pts, 0.006, '#d7ccc8', 'cloth', 4);
      const count = Math.max(2, Math.floor(spec.length / 0.45));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const sag = Math.sin(t * Math.PI) * 0.08;
        const tall = i % 3 === 1 ? 0.55 : 0.38;
        kit.add(
          superellipsoid({ w: 0.34, h: tall, d: 0.02, round: 0.3, segU: 10, segV: 4, deform: (p) => { p.z += Math.sin(p.x * 18 + i) * 0.015; } }),
          spec.colors[i % spec.colors.length]!,
          'cloth',
          compose([(t - 0.5) * spec.length, h - sag - tall / 2, 0]),
        );
      }
      return;
    }
    case 'aircon': {
      kit.box([0.85, 0.27, 0.2], [0, 0, 0], '#f4f6f6', 'plastic', [0, 0, 0], 0.35);
      kit.box([0.75, 0.03, 0.02], [0, -0.09, 0.1], '#b0bec5', 'plastic', [0, 0, 0], 0.3);
      kit.box([0.05, 0.02, 0.01], [0.33, 0.07, 0.1], '#2ecc71', 'gloss', [0, 0, 0], 0.5);
      return;
    }
    case 'aquarium': {
      const [w, h, d] = spec.size;
      kit.box([w, 0.5, d], [0, 0.25, 0], '#2b2f33', 'gloss', [0, 0, 0], 0.15);
      kit.box([w, h, d], [0, 0.5 + h / 2, 0], '#2f9fd6', 'gloss', [0, 0, 0], 0.1);
      const rng = createRng(`fish:${spec.at.join(',')}`);
      for (let i = 0; i < 6; i++) kit.sphere(0.035, [rng.float(-w / 2 + 0.1, w / 2 - 0.1), 0.6 + rng.float(0, h - 0.2), d / 2 + 0.005], rng.pick(['#ff8f00', '#ffd54f', '#e53935']), 'gloss', [1.6, 1, 0.4], 6);
      return;
    }
    case 'standing-fan': {
      kit.cylinder(0.18, 0.18, 0.04, [0, 0, 0], '#eceff1', 'plastic', [0, 0, 0], 14);
      kit.cylinder(0.02, 0.02, 1.0, [0, 0.03, 0], '#cfd8dc', 'metal', [0, 0, 0], 6, false);
      kit.cylinder(0.22, 0.22, 0.12, [0, 1.12, -0.06], '#eceff1', 'plastic', [Math.PI / 2, 0, 0], 18);
      kit.cylinder(0.05, 0.05, 0.1, [0, 1.12, -0.1], '#4fc3f7', 'plastic', [Math.PI / 2, 0, 0], 10);
      return;
    }
    case 'wall-clock': {
      kit.cylinder(0.17, 0.17, 0.04, [0, 0, 0], '#3e2723', 'wood', [Math.PI / 2, 0, 0], 20);
      kit.cylinder(0.15, 0.15, 0.045, [0, 0, 0.002], '#fafafa', 'gloss', [Math.PI / 2, 0, 0], 20);
      kit.box([0.015, 0.1, 0.01], [0, 0.04, 0.03], '#212121', 'paint', [0, 0, 0.6], 0.3);
      kit.box([0.012, 0.13, 0.01], [0, 0.05, 0.032], '#212121', 'paint', [0, 0, -1.2], 0.3);
      return;
    }
    case 'projector-screen': {
      const [w, h] = spec.size;
      kit.box([w + 0.1, 0.08, 0.1], [0, h + 0.05, 0], '#3a3f45', 'metal', [0, 0, 0], 0.4);
      kit.box([w, h, 0.02], [0, h / 2 + 0.01, 0], '#f7f7f5', 'paint', [0, 0, 0], 0.08);
      return;
    }
    case 'table-cloth': {
      const [w, h, d] = spec.size;
      kit.box([w, h, d], [0, h / 2, 0], spec.color, 'cloth', [0, 0, 0], 0.12);
      if (spec.trim) kit.box([w + 0.01, 0.06, d + 0.01], [0, h - 0.05, 0], spec.trim, 'cloth', [0, 0, 0], 0.2);
      return;
    }
  }
}

function umbrellaTop(kit: PropKit, top: V3, radius: number, a: string, b: string): void {
  const rings: LoftRing[] = [
    { y: -0.32, w: radius * 2, d: radius * 2 },
    { y: -0.12, w: radius * 1.2, d: radius * 1.2 },
    { y: 0.02, w: 0.06, d: 0.06 },
  ];
  const ca = new Color().setStyle(a);
  const cb = new Color().setStyle(b);
  const centre = kit.toRoom(top);
  kit.add(
    doubleSided(loft(rings, { segments: 32, exponent: 2, capEnd: true }), 0.01),
    (x, _y, z, out) => out.copy(Math.floor(((Math.atan2(z - centre.z, x - centre.x) + Math.PI) / (Math.PI * 2)) * 8) % 2 === 0 ? ca : cb),
    'cloth',
    compose(top),
  );
}

/** Build every prop of a room into one static geometry (one draw call). */
export function buildProps(specs: readonly PropSpec[], extra?: (kit: PropKit) => void): BufferGeometry | null {
  const builder = new PartBuilder({ skinned: false });
  const kit = new PropKit(builder);
  for (const spec of specs) buildProp(kit, spec);
  extra?.(kit);
  return builder.has('base') ? builder.build().geometry : null;
}
