import { createRng, type DecorItem, type DecorShape, type DecorVariant } from '@insidelife/shared';
import { mixHex, shadeHex } from '@/common/three/materials/color-utils';
import type { PropKit } from '../props/build-props';

/**
 * How each piece of decor is drawn: a recipe per `DecorShape`, built from the props toolkit (`PropKit`) in the piece's
 * own frame. Floor and tabletop pieces: origin at the middle of the footprint on whatever they stand on, +z the front.
 * Wall pieces: origin at the bottom middle on the wall, +z out into the room. Every recipe stays within its catalog
 * footprint and height (a test checks the bounding boxes), and the look follows the chosen finish (`c1`, `c2`).
 */
export interface Look {
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly c1: string;
  readonly c2: string;
  readonly style: string;
  readonly seed: string;
  /** Height of the top others sit on (beds, tables), or 0. */
  readonly surface: number;
}

type Recipe = (kit: PropKit, look: Look) => void;
type V3 = readonly [number, number, number];

const PI = Math.PI;
const NO_ROT: V3 = [0, 0, 0];
const LINEN = '#f3eee2';
const GLASS = '#b9d3df';

const polar = (radius: number, angle: number): readonly [number, number] => [Math.cos(angle) * radius, Math.sin(angle) * radius];

// ----- Rugs -------------------------------------------------------------------------------------------------------

const rugRect: Recipe = (kit, { w, d, h, c1, c2 }) => {
  kit.box([w, h, d], [0, h / 2, 0], mixHex(c1, c2, 0.5), 'cloth', NO_ROT, 0.1);
  kit.box([w * 0.92, h + 0.004, d * 0.88], [0, h / 2 + 0.002, 0], c1, 'cloth', NO_ROT, 0.1);
  kit.box([w * 0.7, h + 0.008, d * 0.66], [0, h / 2 + 0.004, 0], shadeHex(c1, 0.08), 'cloth', NO_ROT, 0.1);
};

const rugRound: Recipe = (kit, { w, h, c1, c2 }) => {
  kit.cylinder(w / 2, w / 2, h, [0, 0, 0], c1, 'cloth', NO_ROT, 32);
  kit.cylinder(w * 0.42, w * 0.42, h + 0.004, [0, 0, 0], c2, 'cloth', NO_ROT, 32);
  kit.cylinder(w * 0.36, w * 0.36, h + 0.008, [0, 0, 0], c1, 'cloth', NO_ROT, 32);
  kit.cylinder(w * 0.16, w * 0.16, h + 0.012, [0, 0, 0], c2, 'cloth', NO_ROT, 24);
};

const rugMedallion: Recipe = (kit, { w, d, h, c1, c2 }) => {
  kit.box([w, h, d], [0, h / 2, 0], c2, 'cloth', NO_ROT, 0.1);
  kit.box([w * 0.94, h + 0.004, d * 0.92], [0, h / 2 + 0.002, 0], c1, 'cloth', NO_ROT, 0.1);
  kit.box([w * 0.86, h + 0.008, d * 0.84], [0, h / 2 + 0.004, 0], shadeHex(c1, -0.18), 'cloth', NO_ROT, 0.1);
  const m = Math.min(w, d);
  kit.box([m * 0.62, h + 0.012, m * 0.62], [0, h / 2 + 0.006, 0], c2, 'cloth', [0, PI / 4, 0], 0.1);
  kit.box([m * 0.48, h + 0.016, m * 0.48], [0, h / 2 + 0.008, 0], c1, 'cloth', [0, PI / 4, 0], 0.1);
  kit.box([m * 0.26, h + 0.02, m * 0.26], [0, h / 2 + 0.01, 0], c2, 'cloth', [0, PI / 4, 0], 0.1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box([m * 0.16, h + 0.012, m * 0.16], [sx * (w / 2 - m * 0.2), h / 2 + 0.006, sz * (d / 2 - m * 0.2)], c2, 'cloth', [0, PI / 4, 0], 0.1);
};

const rugStripe: Recipe = (kit, { w, d, h, c1, c2, seed }) => {
  kit.box([w, h, d], [0, h / 2, 0], c1, 'cloth', NO_ROT, 0.1);
  const rng = createRng(`rug:${seed}`);
  const bands = 9;
  const bw = w / bands;
  for (let i = 0; i < bands; i++) {
    if (i % 2 === 0) continue;
    kit.box([bw * 0.92, h + 0.005, d * 0.9], [-w / 2 + (i + 0.5) * bw, h / 2 + 0.0025, 0], rng.chance(0.4) ? shadeHex(c2, -0.2) : c2, 'cloth', NO_ROT, 0.1);
  }
  for (const s of [-1, 1]) kit.box([w, h + 0.008, 0.025], [0, h / 2 + 0.004, s * (d / 2 - 0.02)], shadeHex(c1, -0.3), 'cloth', NO_ROT, 0.1);
};

// ----- Beds -------------------------------------------------------------------------------------------------------

const bed: Recipe = (kit, { w, d, h, c1, c2, style, surface }) => {
  const top = surface || 0.56;
  const legs = 0.08;
  const frameColour = style === 'royal' ? '#c9a64a' : style === 'canopy' ? '#3b2a22' : '#4a3426';
  const fabric = style === 'tufted' || style === 'divan' || style === 'single' ? shadeHex(mixHex(c1, '#3b3d42', 0.55), 0) : frameColour;
  kit.box([w, top - 0.22 - legs, d], [0, legs + (top - 0.22 - legs) / 2, 0], frameColour, 'wood', NO_ROT, 0.1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box([0.07, legs, 0.07], [sx * (w / 2 - 0.06), legs / 2, sz * (d / 2 - 0.06)], frameColour, 'wood');
  kit.box([w - 0.08, 0.22, d - 0.1], [0, top - 0.11, 0.02], LINEN, 'cloth', NO_ROT, 0.4);
  const duvetD = d * 0.66;
  const duvetZ = d / 2 - 0.05 - duvetD / 2;
  kit.box([w - 0.02, 0.07, duvetD], [0, top + 0.01, duvetZ], c1, 'cloth', NO_ROT, 0.4);
  kit.box([w - 0.01, 0.075, 0.16], [0, top + 0.012, duvetZ - duvetD / 2 + 0.1], c2, 'cloth', NO_ROT, 0.4);
  const pillows = w > 1.4 ? 2 : 1;
  for (let i = 0; i < pillows; i++) {
    const x = pillows === 1 ? 0 : (i === 0 ? -1 : 1) * w * 0.23;
    kit.box([Math.min(0.62, w * 0.4), 0.13, 0.4], [x, top + 0.07, -d / 2 + 0.36], '#fbf9f4', 'cloth', [0.12, 0, 0], 0.6);
  }
  kit.box([0.4, 0.1, 0.2], [0, top + 0.1, -d / 2 + 0.55], c2, 'cloth', [0.1, 0.2, 0], 0.6);
  const headZ = -d / 2 + 0.05;
  if (style === 'single' || style === 'divan') {
    const hh = style === 'single' ? 0.9 : 1.0;
    kit.box([w + 0.06, hh - legs, 0.1], [0, legs + (hh - legs) / 2, headZ], fabric, 'cloth', NO_ROT, 0.25);
    kit.box([w - 0.2, 0.3, 0.115], [0, hh - 0.3, headZ + 0.005], shadeHex(fabric, 0.1), 'cloth', NO_ROT, 0.3);
  } else if (style === 'tufted') {
    kit.box([w + 0.08, 1.3 - legs, 0.12], [0, legs + (1.3 - legs) / 2, headZ], c1, 'cloth', NO_ROT, 0.25);
    for (let row = 0; row < 3; row++) for (let col = 0; col < Math.round(w / 0.22); col++) {
      const x = -w / 2 + 0.18 + col * ((w - 0.36) / (Math.round(w / 0.22) - 1));
      kit.sphere(0.018, [x, 0.75 + row * 0.2, headZ + 0.07], c2, 'metal', [1, 1, 0.7], 6);
    }
    kit.box([w + 0.04, 0.34, 0.1], [0, 0.34, d / 2 - 0.05], shadeHex(c1, -0.1), 'cloth', NO_ROT, 0.25);
  } else if (style === 'canopy') {
    kit.box([w + 0.06, 1.15 - legs, 0.1], [0, legs + (1.15 - legs) / 2, headZ], frameColour, 'wood', NO_ROT, 0.15);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.cylinder(0.04, 0.035, 2.2, [sx * (w / 2 - 0.02), 0, sz * (d / 2 - 0.03)], frameColour, 'wood', NO_ROT, 10);
    for (const sz of [-1, 1]) kit.box([w, 0.05, 0.05], [0, 2.17, sz * (d / 2 - 0.03)], frameColour, 'wood');
    for (const sx of [-1, 1]) kit.box([0.05, 0.05, d - 0.04], [sx * (w / 2 - 0.02), 2.17, 0], frameColour, 'wood');
    for (const sx of [-1, 1]) kit.drape([0.02, 1.7, d * 0.55], [sx * (w / 2 - 0.01), 1.25, -d * 0.18], '#f4efe6', 40, 0.03, NO_ROT);
    kit.drape([w * 0.96, 0.5, 0.02], [0, 1.95, -d / 2 + 0.04], '#f4efe6', 30, 0.02, NO_ROT);
  } else {
    // Royal: tall gilded headboard with finials, low footboard, gold rails.
    const gold = '#c9a64a';
    kit.box([w + 0.1, 1.45, 0.12], [0, 0.8, headZ], gold, 'metal', NO_ROT, 0.2);
    kit.box([w - 0.2, 1.1, 0.14], [0, 0.82, headZ + 0.02], c1, 'cloth', NO_ROT, 0.25);
    kit.box([w * 0.5, 0.18, 0.14], [0, 1.58, headZ], gold, 'metal', NO_ROT, 0.3);
    for (const sx of [-1, 1]) kit.sphere(0.07, [sx * (w / 2 + 0.03), 1.5, headZ], gold, 'metal', [1, 1, 1], 8);
    kit.box([w + 0.08, 0.5, 0.1], [0, 0.4, d / 2 - 0.05], gold, 'metal', NO_ROT, 0.2);
    kit.box([w - 0.2, 0.3, 0.115], [0, 0.4, d / 2 - 0.05], c1, 'cloth', NO_ROT, 0.25);
    for (const sx of [-1, 1]) kit.box([0.06, 0.34, d], [sx * (w / 2 + 0.01), 0.3, 0], gold, 'metal', NO_ROT, 0.2);
  }
  void h;
};

// ----- Flowers & plants -------------------------------------------------------------------------------------------

const vaseFlowers: Recipe = (kit, { c1, c2, seed }) => {
  kit.cylinder(0.07, 0.05, 0.24, [0, 0, 0], '#cfe6ec', 'gloss', NO_ROT, 14);
  kit.cylinder(0.055, 0.04, 0.12, [0, 0.01, 0], '#7cc0d0', 'gloss', NO_ROT, 12, false);
  const rng = createRng(`flowers:${seed}`);
  for (let i = 0; i < 8; i++) {
    const [dx, dz] = polar(rng.float(0.02, 0.1), (i / 8) * PI * 2 + rng.float(0, 0.5));
    const top = rng.float(0.44, 0.54);
    kit.rod([[0, 0.2, 0], [dx * 0.5, 0.32, dz * 0.5], [dx, top, dz]], 0.005, c2, 'cloth', 5);
    kit.sphere(rng.float(0.04, 0.055), [dx, top + 0.01, dz], c1, 'cloth', [1, 0.8, 1], 8);
    kit.sphere(0.014, [dx, top + 0.025, dz], shadeHex(c1, -0.35), 'cloth', [1, 0.6, 1], 6);
  }
};

const vasePampas: Recipe = (kit, { c1, c2, seed }) => {
  kit.cylinder(0.12, 0.17, 0.46, [0, 0, 0], c1, 'stone', NO_ROT, 20);
  kit.cylinder(0.17, 0.11, 0.1, [0, 0.46, 0], c1, 'stone', NO_ROT, 20);
  kit.cylinder(0.175, 0.175, 0.025, [0, 0.3, 0], c2, 'stone', NO_ROT, 20);
  const rng = createRng(`pampas:${seed}`);
  for (let i = 0; i < 14; i++) {
    const [dx, dz] = polar(rng.float(0.02, 0.15), rng.float(0, PI * 2));
    const top = rng.float(0.95, 1.36);
    kit.rod([[0, 0.5, 0], [dx * 0.6, 0.8, dz * 0.6], [dx, top - 0.2, dz]], 0.005, '#b9a77a', 'cloth', 5);
    kit.sphere(0.07, [dx, top - 0.08, dz], rng.pick(['#efe6cf', '#e6d9b8', '#f5eed9']), 'cloth', [0.7, 2.4, 0.7], 8);
  }
};

const potted: Recipe = (kit, { w, c1, c2, style, seed }) => {
  const rng = createRng(`plant:${style}:${seed}`);
  const leaf = c2;
  const wood = '#6b4a2b';
  if (style === 'snake') {
    kit.cylinder(0.14, 0.18, 0.28, [0, 0, 0], c1, 'stone', NO_ROT, 16);
    kit.cylinder(0.17, 0.17, 0.02, [0, 0.28, 0], '#3b2c20', 'cloth', NO_ROT, 14);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * PI * 2;
      const [dx, dz] = polar(0.06 + (i % 3) * 0.015, a);
      const len = rng.float(0.45, 0.62);
      kit.box([0.06, len, 0.018], [dx, 0.28 + len / 2, dz], i % 2 ? leaf : shadeHex(leaf, -0.12), 'cloth', [Math.sin(a) * 0.12, -a, Math.cos(a) * 0.12], 0.3);
      kit.box([0.012, len * 0.96, 0.02], [dx, 0.28 + len / 2, dz], '#d8d86a', 'cloth', [Math.sin(a) * 0.12, -a, Math.cos(a) * 0.12], 0.3);
    }
  } else if (style === 'orchid') {
    kit.cylinder(0.065, 0.085, 0.11, [0, 0, 0], c1, 'stone', NO_ROT, 14);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * PI * 2 + 0.4;
      const [dx, dz] = polar(0.08, a);
      kit.box([0.1, 0.012, 0.2], [dx, 0.13, dz], leaf, 'cloth', [-0.15, -a + PI / 2, 0], 0.3);
    }
    const stem: V3[] = [[0, 0.11, 0], [0.01, 0.28, 0], [0.07, 0.4, 0], [0.12, 0.44, 0]];
    kit.rod(stem, 0.005, shadeHex(leaf, -0.1), 'cloth', 5);
    stem.slice(1).forEach(([x, y, z], i) => {
      kit.sphere(0.035, [x + 0.03, y, z], '#f8f4f2', 'cloth', [1.2, 1, 0.5], 8);
      kit.sphere(0.012, [x + 0.03, y, z + 0.012], '#d6458b', 'cloth', [1, 1, 1], 6);
      void i;
    });
  } else if (style === 'palm') {
    kit.cylinder(0.22, 0.28, 0.42, [0, 0, 0], c1, 'stone', NO_ROT, 18);
    kit.cylinder(0.28, 0.28, 0.025, [0, 0.42, 0], '#3b2c20', 'cloth', NO_ROT, 14);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2 + rng.float(0, 0.4);
      const reach = rng.float(0.35, 0.58);
      const top = rng.float(1.55, 1.85);
      const [x1, z1] = polar(reach * 0.35, a);
      const [x2, z2] = polar(reach, a);
      kit.rod([[0, 0.42, 0], [x1, top * 0.62, z1], [x2, top, z2]], 0.011, '#5a7a3a', 'cloth', 5);
      for (let k = 1; k <= 5; k++) {
        const t = k / 5.4;
        const [lx, lz] = polar(reach * (0.35 + 0.65 * t * t), a);
        kit.box([0.22 - t * 0.06, 0.014, 0.06], [lx, 0.42 + (top - 0.42) * (0.62 + 0.38 * t) - 0.02 * k, lz], leaf, 'cloth', [0, -a + PI / 2, 0.15], 0.3);
      }
    }
  } else if (style === 'fiddle') {
    kit.cylinder(0.19, 0.24, 0.36, [0, 0, 0], c1, 'stone', NO_ROT, 18);
    kit.cylinder(0.24, 0.24, 0.02, [0, 0.36, 0], '#3b2c20', 'cloth', NO_ROT, 14);
    kit.cylinder(0.028, 0.02, 1.3, [0, 0.36, 0], wood, 'wood', NO_ROT, 8, false);
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4;
      const y = 0.85 + (i / 12) * 0.8;
      const [dx, dz] = polar(0.1 + (i % 3) * 0.05, a);
      kit.sphere(0.14, [dx, y, dz], i % 2 ? leaf : shadeHex(leaf, -0.14), 'cloth', [1.3, 0.14, 0.95], 8);
    }
  } else if (style === 'bonsai') {
    kit.box([0.3, 0.025, 0.2], [0, 0.0125, 0], '#2b2b2e', 'wood', NO_ROT, 0.2);
    kit.box([0.2, 0.08, 0.14], [0, 0.065, 0], c1, 'stone', NO_ROT, 0.2);
    kit.rod([[0, 0.1, 0], [0.03, 0.18, 0], [-0.03, 0.25, 0], [0.01, 0.31, 0]], 0.014, wood, 'wood', 6);
    kit.sphere(0.09, [0.02, 0.37, 0], leaf, 'cloth', [1.4, 0.7, 1.1], 8);
    kit.sphere(0.06, [-0.1, 0.27, 0.02], shadeHex(leaf, -0.1), 'cloth', [1.3, 0.6, 1], 8);
    kit.sphere(0.055, [0.12, 0.25, -0.02], shadeHex(leaf, 0.08), 'cloth', [1.3, 0.6, 1], 8);
  } else {
    // olive tree
    kit.cylinder(0.24, 0.3, 0.4, [0, 0, 0], c1, 'stone', NO_ROT, 18);
    kit.cylinder(0.3, 0.3, 0.02, [0, 0.4, 0], '#3b2c20', 'cloth', NO_ROT, 14);
    kit.rod([[0, 0.4, 0], [0.05, 0.9, 0.02], [-0.04, 1.3, -0.02], [0.02, 1.65, 0]], 0.03, wood, 'wood', 7);
    kit.rod([[0, 0.45, 0], [-0.07, 0.95, -0.03], [0.05, 1.35, 0.03]], 0.022, shadeHex(wood, 0.1), 'wood', 7);
    for (let i = 0; i < 14; i++) {
      const [dx, dz] = polar(rng.float(0.05, Math.min(0.3, w / 2)), rng.float(0, PI * 2));
      kit.sphere(rng.float(0.12, 0.17), [dx, 1.05 + (i / 14) * 0.85, dz], i % 3 ? '#7c8f5e' : '#94a66e', 'cloth', [1.2, 0.5, 1.2], 8);
    }
  }
};

// ----- Aquariums --------------------------------------------------------------------------------------------------

const aquarium: Recipe = (kit, { w, d, h, c1, c2, style, seed }) => {
  const rng = createRng(`fish:${seed}`);
  const stand = style === 'nano' ? 0 : style === 'reef' ? 0.7 : 0.62;
  const wood = style === 'reef' ? '#1f1d1c' : '#4a3426';
  if (stand > 0) {
    kit.box([w, stand, d], [0, stand / 2, 0], wood, 'wood', NO_ROT, 0.1);
    for (let i = 0; i < (style === 'reef' ? 3 : 2); i++) {
      const n = style === 'reef' ? 3 : 2;
      kit.box([w / n - 0.04, stand - 0.1, 0.01], [-w / 2 + (i + 0.5) * (w / n), stand / 2, d / 2 + 0.003], shadeHex(wood, 0.12), 'wood', NO_ROT, 0.1);
      kit.box([0.025, 0.1, 0.02], [-w / 2 + (i + 0.5) * (w / n), stand / 2, d / 2 + 0.012], '#c9a64a', 'metal');
    }
  }
  const tankH = h - stand - 0.1;
  kit.box([w + 0.02, 0.025, d + 0.02], [0, stand + 0.0125, 0], '#1a1a1c', 'gloss', NO_ROT, 0.1);
  kit.box([w - 0.02, tankH, d - 0.02], [0, stand + 0.025 + tankH / 2, 0], c1, 'gloss', NO_ROT, 0.1);
  kit.box([w - 0.03, 0.05, d - 0.03], [0, stand + 0.05, 0], style === 'cabinet' ? '#d8c9a0' : '#e8dcb8', 'stone', NO_ROT, 0.2);
  const hood = style === 'nano' ? 0.05 : 0.08;
  kit.box([w + 0.02, hood, d + 0.02], [0, h - hood / 2, 0], '#1a1a1c', 'plastic', NO_ROT, 0.15);
  kit.box([w * 0.8, 0.015, 0.03], [0, h - hood - 0.005, 0.04], '#ffe9a8', 'gloss', NO_ROT, 0.3);
  const fish = style === 'nano' ? 4 : style === 'reef' ? 14 : 8;
  for (let i = 0; i < fish; i++) {
    kit.sphere(rng.float(0.03, style === 'reef' ? 0.05 : 0.04), [rng.float(-w / 2 + 0.1, w / 2 - 0.1), stand + 0.15 + rng.float(0, tankH - 0.22), d / 2 - 0.004], rng.pick([c2, '#ffd54f', '#e53935', '#ffffff']), 'gloss', [1.6, 1, 0.4], 6);
  }
  const plants = style === 'nano' ? 3 : 6;
  for (let i = 0; i < plants; i++) {
    const x = -w / 2 + 0.1 + (i / Math.max(1, plants - 1)) * (w - 0.2);
    if (style === 'reef') kit.sphere(rng.float(0.05, 0.09), [x, stand + 0.12, rng.float(-d / 4, d / 4)], rng.pick(['#e8779b', '#f4a261', '#9b5de5', '#f6c453']), 'cloth', [1, 0.9, 1], 8);
    else kit.box([0.02, rng.float(0.1, 0.25), 0.01], [x, stand + 0.1 + 0.06, -d / 4], '#2f9a58', 'cloth', [0, 0, rng.float(-0.2, 0.2)], 0.3);
  }
  if (style === 'reef') {
    kit.sphere(0.14, [-w * 0.25, stand + 0.16, -d * 0.1], '#5b5249', 'stone', [1.5, 1, 1], 8);
    kit.sphere(0.1, [w * 0.2, stand + 0.14, -d * 0.12], '#6b6055', 'stone', [1.4, 1, 1], 8);
  }
};

// ----- Art --------------------------------------------------------------------------------------------------------

const art = (kit: PropKit, w: number, h: number, frame: string, c1: string, c2: string, seed: string, mode: 'print' | 'canvas' | 'oil'): void => {
  const rng = createRng(`art:${seed}`);
  if (mode === 'print') {
    kit.box([w, h, 0.03], [0, h / 2, 0.015], frame, 'wood', NO_ROT, 0.15);
    kit.box([w - 0.07, h - 0.07, 0.01], [0, h / 2, 0.032], '#f4f1ea', 'paint', NO_ROT, 0.1);
    const pw = w - 0.16;
    const ph = h - 0.16;
    kit.box([pw, ph, 0.012], [0, h / 2, 0.04], c1, 'paint', NO_ROT, 0.1);
    kit.box([pw, ph * 0.28, 0.014], [0, h / 2 - ph * 0.36, 0.041], mixHex(c1, '#000000', 0.35), 'paint', NO_ROT, 0.1);
    kit.cylinder(pw * 0.1, pw * 0.1, 0.012, [pw * 0.22, h / 2 + ph * 0.22, 0.04], c2, 'paint', [PI / 2, 0, 0], 16);
    let x = -pw / 2 + 0.03;
    while (x < pw / 2 - 0.05) {
      const bw = rng.float(0.04, 0.09);
      const bh = rng.float(ph * 0.12, ph * 0.48);
      kit.box([bw, bh, 0.016], [x + bw / 2, h / 2 - ph * 0.22 + bh / 2 - 0.0, 0.043], shadeHex(c2, -0.15 * rng.float(0, 1)), 'paint', NO_ROT, 0.1);
      x += bw + 0.012;
    }
    return;
  }
  const deep = mode === 'oil' ? 0.07 : 0.04;
  kit.box([w, h, deep], [0, h / 2, deep / 2], mode === 'oil' ? '#c9a64a' : '#f1efe8', mode === 'oil' ? 'metal' : 'paint', NO_ROT, 0.1);
  const inset = mode === 'oil' ? 0.12 : 0.02;
  kit.box([w - inset * 2, h - inset * 2, deep + 0.008], [0, h / 2, deep / 2], mode === 'oil' ? '#2a2420' : c1, 'paint', NO_ROT, 0.1);
  if (mode === 'oil') {
    // A portrait in a gele: shoulders, face, head wrap.
    kit.box([w * 0.5, h * 0.3, 0.012], [0, h * 0.25, deep + 0.006], c1, 'cloth', NO_ROT, 0.4);
    kit.sphere(w * 0.14, [0, h * 0.5, deep + 0.03], '#7b4a2b', 'paint', [1, 1.2, 0.4], 10);
    kit.sphere(w * 0.15, [0, h * 0.63, deep + 0.04], c2, 'cloth', [1.5, 0.8, 0.6], 10);
    kit.sphere(w * 0.02, [-w * 0.05, h * 0.52, deep + 0.06], '#1a1210', 'gloss', [1, 0.6, 0.4], 6);
    kit.sphere(w * 0.02, [w * 0.05, h * 0.52, deep + 0.06], '#1a1210', 'gloss', [1, 0.6, 0.4], 6);
    return;
  }
  const pw = w - inset * 2;
  const ph = h - inset * 2;
  for (let i = 0; i < 7; i++) {
    const bw = rng.float(pw * 0.15, pw * 0.5);
    const bh = rng.float(ph * 0.15, ph * 0.55);
    kit.box([bw, bh, 0.01], [rng.float(-pw / 2 + bw / 2, pw / 2 - bw / 2), h / 2 + rng.float(-ph / 2 + bh / 2, ph / 2 - bh / 2), deep + 0.004 + i * 0.0006], rng.pick([c1, c2, mixHex(c1, c2, 0.5), '#f1efe8', '#2b2b2e', shadeHex(c2, -0.3)]), 'paint', NO_ROT, 0.1);
  }
  kit.cylinder(pw * 0.1, pw * 0.1, 0.01, [rng.float(-pw / 4, pw / 4), h / 2 + rng.float(-ph / 4, ph / 4), deep + 0.012], c2, 'paint', [PI / 2, 0, 0], 16);
};

const artPrint: Recipe = (kit, { w, h, c1, c2, seed }) => art(kit, w, h, '#2b2b2b', c1, c2, seed, 'print');
const artCanvas: Recipe = (kit, { w, h, c1, c2, seed, style }) => art(kit, w, h, '#c9a64a', c1, c2, seed, style === 'gilded' ? 'oil' : 'canvas');

const artTriptych: Recipe = (kit, { w, h, c1, c2, seed }) => {
  const pw = (w - 0.1) / 3;
  const rng = createRng(`tri:${seed}`);
  for (let i = 0; i < 3; i++) {
    const cx = -w / 2 + pw / 2 + i * (pw + 0.05);
    kit.box([pw, h, 0.04], [cx, h / 2, 0.02], i === 1 ? c1 : mixHex(c1, '#ffffff', 0.15), 'paint', NO_ROT, 0.1);
    kit.box([pw * 0.7, h * 0.26, 0.012], [cx, h * (0.3 + i * 0.18), 0.046], i === 1 ? c2 : shadeHex(c2, -0.1), 'paint', NO_ROT, 0.1);
    kit.cylinder(pw * 0.14, pw * 0.14, 0.01, [cx + rng.float(-0.05, 0.05), h * (0.75 - i * 0.1), 0.044], '#f1efe8', 'paint', [PI / 2, 0, 0], 14);
  }
};

const artAdire: Recipe = (kit, { w, h, c1, c2, seed }) => {
  const rng = createRng(`adire:${seed}`);
  kit.rod([[-w / 2 - 0.04, h - 0.015, 0.03], [w / 2 + 0.04, h - 0.015, 0.03]], 0.012, '#7a5a36', 'wood', 6);
  kit.sphere(0.022, [-w / 2 - 0.045, h - 0.015, 0.03], '#7a5a36', 'wood', [1, 1, 1], 6);
  kit.sphere(0.022, [w / 2 + 0.045, h - 0.015, 0.03], '#7a5a36', 'wood', [1, 1, 1], 6);
  kit.drape([w, h - 0.04, 0.01], [0, (h - 0.04) / 2, 0.02], c1, 40, 0.012);
  const rows = 6;
  const cols = 4;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = -w / 2 + (c + 0.5) * (w / cols);
    const y = 0.14 + r * ((h - 0.35) / (rows - 1));
    if ((r + c) % 2 === 0) kit.cylinder(0.05, 0.05, 0.006, [x, y, 0.026], c2, 'cloth', [PI / 2, 0, 0], 12);
    else kit.box([0.08, 0.08, 0.006], [x, y, 0.026], rng.chance(0.5) ? c2 : shadeHex(c1, -0.25), 'cloth', [0, 0, PI / 4], 0.2);
  }
  kit.box([w * 0.96, 0.03, 0.012], [0, 0.04, 0.026], c2, 'cloth');
};

const artMask: Recipe = (kit, { w, c1, c2 }) => {
  kit.box([0.04, 0.5, 0.03], [0, 0.35, 0.015], shadeHex(c1, -0.25), 'wood');
  kit.box([w * 0.78, 0.5, 0.09], [0, 0.34, 0.06], c1, 'wood', NO_ROT, 0.8);
  kit.box([w * 0.55, 0.12, 0.06], [0, 0.58, 0.06], shadeHex(c1, 0.1), 'wood', NO_ROT, 0.5);
  for (const s of [-1, 1]) {
    kit.box([0.075, 0.016, 0.02], [s * 0.065, 0.4, 0.105], '#1a1210', 'paint', [0, 0, -s * 0.2], 0.3);
    kit.cylinder(0.012, 0.01, 0.09, [s * 0.1, 0.58, 0.06], c2, 'wood', [0, 0, -s * 0.5], 6);
  }
  kit.box([0.05, 0.2, 0.06], [0, 0.31, 0.12], shadeHex(c1, -0.12), 'wood', NO_ROT, 0.4);
  kit.box([0.12, 0.035, 0.03], [0, 0.17, 0.11], '#5a1f18', 'paint', NO_ROT, 0.5);
  kit.box([0.1, 0.1, 0.05], [0, 0.62, 0.06], c2, 'wood', NO_ROT, 0.3);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) kit.box([0.012, 0.07, 0.01], [s * 0.1, 0.24 + i * 0.035, 0.112], c2, 'paint');
};

const artBenin: Recipe = (kit, { w, h, c1, c2 }) => {
  kit.box([w, h, 0.03], [0, h / 2, 0.015], c1, 'metal', NO_ROT, 0.1);
  for (const s of [-1, 1]) kit.box([0.025, h - 0.06, 0.012], [s * (w / 2 - 0.03), h / 2, 0.034], c2, 'metal');
  kit.box([w - 0.06, 0.025, 0.012], [0, h - 0.04, 0.034], c2, 'metal');
  kit.box([w - 0.06, 0.025, 0.012], [0, 0.04, 0.034], c2, 'metal');
  kit.box([0.16, 0.3, 0.025], [0, h * 0.4, 0.04], c2, 'metal', NO_ROT, 0.3);
  kit.sphere(0.07, [0, h * 0.4 + 0.22, 0.045], c2, 'metal', [1, 1.05, 0.5], 10);
  kit.box([0.14, 0.05, 0.03], [0, h * 0.4 + 0.3, 0.05], shadeHex(c2, -0.2), 'metal', NO_ROT, 0.3);
  for (const s of [-1, 1]) {
    kit.box([0.07, 0.2, 0.02], [s * 0.15, h * 0.35, 0.04], c2, 'metal', NO_ROT, 0.3);
    kit.sphere(0.035, [s * 0.15, h * 0.35 + 0.14, 0.042], c2, 'metal', [1, 1, 0.5], 8);
  }
};

const artBust: Recipe = (kit, { c1, c2 }) => {
  kit.box([0.2, 0.06, 0.2], [0, 0.03, 0], '#2b2420', 'wood', NO_ROT, 0.2);
  kit.cylinder(0.065, 0.075, 0.12, [0, 0.06, 0], c1, 'metal', NO_ROT, 14);
  kit.sphere(0.115, [0, 0.29, 0], c1, 'metal', [1, 1.25, 1.05], 14);
  kit.box([0.22, 0.03, 0.2], [0, 0.4, 0], c2, 'metal', NO_ROT, 0.5);
  for (let i = -3; i <= 3; i++) kit.box([0.006, 0.17, 0.01], [i * 0.028, 0.27, 0.118 - Math.abs(i) * 0.012], shadeHex(c1, -0.35), 'metal', NO_ROT, 0.2);
  kit.box([0.05, 0.07, 0.03], [0, 0.25, 0.12], shadeHex(c1, -0.1), 'metal', NO_ROT, 0.4);
};

const artSculpture: Recipe = (kit, { c1, c2 }) => {
  kit.box([0.5, 0.35, 0.5], [0, 0.175, 0], '#f1efe8', 'stone', NO_ROT, 0.12);
  kit.box([0.14, 1.0, 0.14], [0, 0.85, 0], c1, 'metal', [0, 0.5, 0.12], 0.3);
  kit.cylinder(0.26, 0.26, 0.025, [0, 1.0, 0], c1, 'metal', [PI / 2.4, 0, 0.3], 28, false);
  kit.cylinder(0.17, 0.17, 0.025, [0, 1.15, 0], c2, 'metal', [PI / 1.9, 0.4, 0], 24, false);
  kit.sphere(0.09, [0.03, 1.44, 0], c2, 'metal', [1, 1, 1], 12);
};

// ----- Lamps ------------------------------------------------------------------------------------------------------

const lampTable: Recipe = (kit, { w, h, c1, c2, style }) => {
  const crystal = style === 'crystal';
  const base = crystal ? '#dff1f5' : c2;
  const shadeH = h * 0.4;
  if (crystal) {
    kit.box([0.12, h * 0.5, 0.12], [0, h * 0.25 + 0.02, 0], base, 'gloss', [0, PI / 4, 0], 0.3);
    kit.box([0.12, h * 0.5, 0.12], [0, h * 0.25 + 0.02, 0], base, 'gloss', NO_ROT, 0.3);
    kit.cylinder(0.1, 0.1, 0.02, [0, 0, 0], '#c9a64a', 'metal', NO_ROT, 16);
  } else {
    kit.cylinder(w * 0.28, w * 0.2, h * 0.16, [0, 0, 0], base, 'gloss', NO_ROT, 16);
    kit.cylinder(0.018, 0.018, h * 0.4, [0, h * 0.14, 0], shadeHex(base, -0.1), 'metal', NO_ROT, 8, false);
  }
  kit.cylinder(w * 0.45, w * 0.3, shadeH, [0, h - shadeH - 0.02, 0], c1, 'cloth', NO_ROT, 20);
  kit.cylinder(w * 0.31, w * 0.31, 0.012, [0, h - 0.025, 0], shadeHex(c1, 0.12), 'cloth', NO_ROT, 16);
};

const lampArc: Recipe = (kit, { c1 }) => {
  kit.cylinder(0.17, 0.17, 0.045, [-0.2, 0, 0], '#ddd9d0', 'stone', NO_ROT, 22);
  kit.rod([[-0.2, 0.04, 0], [-0.2, 1.55, 0], [-0.12, 1.95, 0], [0.1, 2.05, 0], [0.2, 1.9, 0]], 0.016, c1, 'metal', 7);
  kit.cylinder(0.2, 0.1, 0.2, [0.2, 1.74, 0], '#f4efe2', 'cloth', NO_ROT, 20);
  kit.cylinder(0.11, 0.11, 0.01, [0.2, 1.74, 0], '#fff2c4', 'gloss', NO_ROT, 14);
};

const lampRattan: Recipe = (kit, { w, c1, c2 }) => {
  kit.cylinder(0.17, 0.17, 0.03, [0, 0, 0], c2, 'wood', NO_ROT, 16);
  kit.cylinder(0.014, 0.014, 1.0, [0, 0.03, 0], c2, 'wood', NO_ROT, 8, false);
  kit.cylinder(w * 0.44, w * 0.36, 0.5, [0, 1.06, 0], '#b8905a', 'cloth', NO_ROT, 22);
  for (let i = 0; i < 4; i++) kit.cylinder(w * (0.44 - i * 0.016), w * (0.44 - i * 0.016), 0.012, [0, 1.12 + i * 0.11, 0], shadeHex('#b8905a', -0.2), 'cloth', NO_ROT, 22);
  kit.cylinder(w * 0.2, w * 0.2, 0.012, [0, 1.56, 0], c1, 'cloth', NO_ROT, 14);
};

// ----- Soft furnishings -------------------------------------------------------------------------------------------

const cushions: Recipe = (kit, { c1, c2 }) => {
  kit.box([0.3, 0.12, 0.3], [-0.2, 0.07, 0.0], c1, 'cloth', [0.1, 0.3, 0.08], 0.6);
  kit.box([0.3, 0.12, 0.3], [0.2, 0.07, 0.0], c2, 'cloth', [0.1, -0.3, -0.08], 0.6);
  kit.box([0.26, 0.11, 0.26], [0, 0.17, -0.02], mixHex(c1, c2, 0.5), 'cloth', [0.2, 0.1, 0], 0.6);
};

const throwRug: Recipe = (kit, { w, d, c1, c2 }) => {
  kit.box([w * 0.9, 0.05, d * 0.8], [0, 0.025, 0], c1, 'cloth', NO_ROT, 0.5);
  for (let i = 0; i < 5; i++) kit.box([w * 0.9, 0.052, 0.025], [0, 0.026, -d * 0.32 + i * 0.16 * d], c2, 'cloth', NO_ROT, 0.4);
  kit.box([w * 0.5, 0.07, d * 0.4], [-w * 0.1, 0.07, 0.04], shadeHex(c1, -0.06), 'cloth', [0, 0.2, 0], 0.6);
};

const pouffe: Recipe = (kit, { c1, c2 }) => {
  kit.cylinder(0.27, 0.25, 0.37, [0, 0, 0], c1, 'plastic', NO_ROT, 22);
  kit.cylinder(0.245, 0.245, 0.03, [0, 0.37, 0], shadeHex(c1, 0.1), 'plastic', NO_ROT, 22);
  kit.cylinder(0.272, 0.272, 0.016, [0, 0.19, 0], c2, 'plastic', NO_ROT, 22);
};

const floorCushions: Recipe = (kit, { c1, c2, seed }) => {
  const rng = createRng(`fc:${seed}`);
  const spots: ReadonlyArray<readonly [number, number, number]> = [[-0.2, -0.2, 0.3], [0.22, -0.15, -0.4], [-0.15, 0.22, 0.6], [0.2, 0.24, -0.2]];
  spots.forEach(([x, z, r], i) => {
    kit.box([0.5, 0.13, 0.5], [x, 0.07, z], i % 2 ? c2 : c1, 'cloth', [0, r, 0], 0.6);
    kit.box([0.3, 0.015, 0.3], [x, 0.14, z], rng.chance(0.5) ? mixHex(c1, c2, 0.5) : shadeHex(i % 2 ? c2 : c1, -0.25), 'cloth', [0, r, 0], 0.3);
  });
  kit.box([0.4, 0.12, 0.4], [0, 0.2, 0], mixHex(c1, c2, 0.5), 'cloth', [0.1, 0.9, 0.05], 0.6);
};

const basket: Recipe = (kit, { c1, c2 }) => {
  kit.cylinder(0.21, 0.25, 0.4, [0, 0, 0], '#b88a55', 'cloth', NO_ROT, 20);
  for (let i = 0; i < 4; i++) kit.cylinder(0.215 + i * 0.01, 0.215 + i * 0.01, 0.014, [0, 0.07 + i * 0.09, 0], shadeHex('#b88a55', -0.2), 'cloth', NO_ROT, 20);
  kit.cylinder(0.26, 0.26, 0.025, [0, 0.4, 0], '#8a6538', 'cloth', NO_ROT, 20, false);
  kit.box([0.34, 0.2, 0.2], [-0.04, 0.46, 0.0], c1, 'cloth', [0.1, 0.4, 0.2], 0.6);
  kit.box([0.3, 0.16, 0.2], [0.06, 0.42, 0.04], c2, 'cloth', [-0.1, -0.5, -0.2], 0.6);
  kit.box([0.1, 0.22, 0.1], [0.2, 0.4, 0.14], c1, 'cloth', [0.4, 0.2, -0.4], 0.6);
};

// ----- Shelves ----------------------------------------------------------------------------------------------------

const shelfFloating: Recipe = (kit, { w, d, h, c1 }) => {
  kit.box([w, h, d], [0, h / 2, d / 2], c1, 'wood', NO_ROT, 0.1);
  for (const s of [-1, 1]) kit.box([0.03, 0.05, d * 0.8], [s * (w / 2 - 0.1), -0.02, d * 0.4], '#2b2b2e', 'metal');
};

const bookcase: Recipe = (kit, { w, d, h, c1, c2, seed }) => {
  const rng = createRng(`books:${seed}`);
  for (const s of [-1, 1]) kit.box([0.03, h, d], [s * (w / 2 - 0.015), h / 2, 0], c1, 'wood', NO_ROT, 0.1);
  kit.box([w, h, 0.02], [0, h / 2, -d / 2 + 0.01], shadeHex(c1, -0.2), 'wood', NO_ROT, 0.1);
  const shelves = 5;
  for (let i = 0; i <= shelves; i++) kit.box([w, 0.03, d], [0, 0.015 + (i * (h - 0.03)) / shelves, 0], c1, 'wood', NO_ROT, 0.1);
  const gap = (h - 0.03) / shelves;
  for (let i = 0; i < shelves; i++) {
    let x = -w / 2 + 0.05;
    const y = 0.03 + i * gap;
    while (x < w / 2 - 0.1) {
      if (rng.chance(0.07)) { x += 0.12; continue; }
      const bw = rng.float(0.025, 0.06);
      const bh = rng.float(gap * 0.55, gap * 0.86);
      kit.box([bw, bh, d * 0.7], [x + bw / 2, y + bh / 2, 0.02], rng.pick(['#7a2e2e', '#2e4a7a', '#2f6b4f', '#c49a2c', '#3b3d42', '#8a5a36', c2, '#e8dfc9']), 'paint', NO_ROT, 0.1);
      x += bw + 0.004;
    }
  }
};

const shelfCube: Recipe = (kit, { w, d, h, c1, c2, seed }) => {
  const rng = createRng(`cube:${seed}`);
  const cols = Math.round(w / 0.3);
  const rows = Math.round(h / 0.3);
  const cw = w / cols;
  const ch = h / rows;
  for (let i = 0; i <= cols; i++) kit.box([0.025, h, d], [-w / 2 + i * cw, h / 2, d / 2], c1, 'wood', NO_ROT, 0.1);
  for (let j = 0; j <= rows; j++) kit.box([w, 0.025, d], [0, j * ch, d / 2], c1, 'wood', NO_ROT, 0.1);
  kit.box([w, h, 0.012], [0, h / 2, 0.006], shadeHex(c1, -0.25), 'wood', NO_ROT, 0.1);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (!rng.chance(0.65)) continue;
    const x = -w / 2 + (i + 0.5) * cw;
    const y = j * ch + 0.0125;
    if (rng.chance(0.5)) kit.box([cw * 0.5, ch * 0.5, d * 0.5], [x, y + ch * 0.25, d / 2], rng.pick([c2, '#8a5a36', '#7a2e2e', '#2e4a7a']), 'paint', NO_ROT, 0.2);
    else kit.cylinder(cw * 0.18, cw * 0.14, ch * 0.5, [x, y, d / 2], rng.pick(['#f1ede4', c2, '#b5603a']), 'stone', NO_ROT, 10);
  }
};

// ----- Mirrors ----------------------------------------------------------------------------------------------------

const mirror: Recipe = (kit, { w, d, h, c1, c2, style }) => {
  if (style === 'round') {
    kit.cylinder(w / 2, w / 2, 0.035, [0, w / 2, 0], c1, 'metal', [PI / 2, 0, 0], 36);
    kit.cylinder(w / 2 - 0.035, w / 2 - 0.035, 0.012, [0, w / 2, 0.028], GLASS, 'gloss', [PI / 2, 0, 0], 36);
  } else if (style === 'sunburst') {
    const cy = h / 2;
    kit.cylinder(w * 0.27, w * 0.27, 0.04, [0, cy, 0.0], c1, 'metal', [PI / 2, 0, 0], 28);
    kit.cylinder(w * 0.235, w * 0.235, 0.02, [0, cy, 0.035], GLASS, 'gloss', [PI / 2, 0, 0], 28);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * PI * 2;
      const r = w * (i % 2 ? 0.39 : 0.42);
      kit.box([0.022, i % 2 ? w * 0.2 : w * 0.27, 0.014], [Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, 0.012], i % 2 ? c2 : c1, 'metal', [0, 0, a - PI / 2], 0.2);
    }
  } else if (style === 'grand') {
    kit.box([w, h, 0.07], [0, h / 2, 0.035], c1, 'metal', NO_ROT, 0.12);
    kit.box([w - 0.2, h - 0.22, 0.025], [0, h / 2, 0.07], GLASS, 'gloss', NO_ROT, 0.1);
    kit.box([w - 0.14, 0.04, 0.06], [0, h - 0.1, 0.08], c2, 'metal', NO_ROT, 0.2);
    kit.box([w - 0.14, 0.04, 0.06], [0, 0.1, 0.08], c2, 'metal', NO_ROT, 0.2);
    kit.sphere(0.12, [0, h - 0.12, 0.09], c1, 'metal', [1.6, 1, 0.7], 10);
    for (const sx of [-1, 1]) for (const sy of [0.08, h - 0.08]) kit.sphere(0.06, [sx * (w / 2 - 0.06), sy, 0.08], c2, 'metal', [1, 1, 0.8], 8);
  } else {
    // Arched floor mirror on little feet.
    const r = w / 2;
    kit.box([w, h - r, d * 0.2], [0, (h - r) / 2 + 0.06, 0], c1, 'metal', NO_ROT, 0.1);
    kit.cylinder(r, r, d * 0.2, [0, h - r, 0], c1, 'metal', [PI / 2, 0, 0], 28);
    kit.box([w - 0.07, h - r - 0.06, d * 0.2 + 0.01], [0, (h - r - 0.06) / 2 + 0.09, 0.012], GLASS, 'gloss', NO_ROT, 0.1);
    kit.cylinder(r - 0.04, r - 0.04, d * 0.2 + 0.01, [0, h - r, 0.012], GLASS, 'gloss', [PI / 2, 0, 0], 28);
    for (const sx of [-1, 1]) kit.box([0.05, 0.06, d * 0.8], [sx * (w / 2 - 0.05), 0.03, d * 0.1], c1, 'metal');
  }
};

// ----- Tables -----------------------------------------------------------------------------------------------------

const table: Recipe = (kit, { w, d, h, c1, c2, style }) => {
  if (style === 'side') {
    kit.cylinder(w / 2, w / 2, 0.035, [0, h - 0.035, 0], c1, 'wood', NO_ROT, 24);
    for (let i = 0; i < 3; i++) {
      const [x, z] = polar(w * 0.28, (i / 3) * PI * 2 + 0.5);
      kit.cylinder(0.022, 0.016, h - 0.035, [x, 0, z], c2, 'wood', NO_ROT, 8);
    }
    kit.cylinder(w * 0.3, w * 0.3, 0.02, [0, h * 0.35, 0], c1, 'wood', NO_ROT, 20);
  } else if (style === 'console') {
    kit.box([w, 0.045, d], [0, h - 0.0225, 0], c1, 'wood', NO_ROT, 0.1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box([0.045, h - 0.045, 0.045], [sx * (w / 2 - 0.05), (h - 0.045) / 2, sz * (d / 2 - 0.04)], c1, 'wood');
    kit.box([w - 0.1, 0.14, d - 0.08], [0, h - 0.12, 0], shadeHex(c1, -0.12), 'wood', NO_ROT, 0.1);
    for (const s of [-1, 1]) kit.box([0.04, 0.02, 0.012], [s * 0.18, h - 0.12, d / 2 - 0.035], c2, 'metal');
  } else {
    // Coffee table: marble top on gold legs, a low shelf.
    kit.box([w, 0.04, d], [0, h - 0.02, 0], '#f1efe8', 'stone', NO_ROT, 0.1);
    kit.box([w - 0.02, 0.012, d - 0.02], [0, h - 0.046, 0], c2, 'metal', NO_ROT, 0.1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.box([0.035, h - 0.05, 0.035], [sx * (w / 2 - 0.07), (h - 0.05) / 2, sz * (d / 2 - 0.07)], '#c9a64a', 'metal');
    kit.box([w - 0.2, 0.025, d - 0.2], [0, 0.12, 0], c1, 'wood', NO_ROT, 0.1);
  }
};

// ----- Cabin & aviation ------------------------------------------------------------------------------------------

/** A bolted-down lounge bench: padded seat on a dark base, a piped edge. */
const bench: Recipe = (kit, { w, d, h, c1, c2 }) => {
  const seat = 0.13;
  kit.box([w - 0.04, h - seat - 0.04, d - 0.06], [0, 0.04 + (h - seat - 0.04) / 2, 0], shadeHex(c1, -0.35), 'wood', NO_ROT, 0.1);
  for (const sx of [-1, 1]) kit.box([0.06, 0.04, d - 0.1], [sx * (w / 2 - 0.1), 0.02, 0], '#2b2b2e', 'metal');
  kit.box([w, seat, d], [0, h - seat / 2, 0], c1, 'plastic', NO_ROT, 0.35);
  kit.box([w - 0.02, 0.012, d - 0.02], [0, h - seat + 0.006, 0], c2, 'plastic', NO_ROT, 0.2);
  kit.box([w - 0.2, 0.012, 0.012], [0, h - 0.002, 0], shadeHex(c1, 0.12), 'plastic', NO_ROT, 0.1);
};

/** A galley minibar: a latched cabinet with a marble top, a glass-fronted rack and a gold rail. */
const minibar: Recipe = (kit, { w, d, h, c1, c2 }) => {
  const top = 0.045;
  kit.box([w, h - top, d], [0, (h - top) / 2, 0], c1, 'wood', NO_ROT, 0.1);
  kit.box([w + 0.01, top, d + 0.01], [0, h - top / 2, 0], '#ece9e2', 'stone', NO_ROT, 0.1);
  kit.box([w * 0.46, h * 0.5, 0.012], [-w * 0.24, h * 0.5, d / 2 + 0.003], GLASS, 'gloss', NO_ROT, 0.1);
  kit.box([w * 0.4, h * 0.22, 0.012], [w * 0.26, h * 0.68, d / 2 + 0.003], shadeHex(c1, -0.12), 'wood', NO_ROT, 0.1);
  kit.box([w * 0.4, h * 0.22, 0.012], [w * 0.26, h * 0.38, d / 2 + 0.003], shadeHex(c1, -0.12), 'wood', NO_ROT, 0.1);
  for (const y of [h * 0.68, h * 0.38]) kit.box([0.14, 0.014, 0.02], [w * 0.26, y, d / 2 + 0.016], c2, 'metal');
  kit.box([w - 0.04, 0.014, 0.014], [0, h - top - 0.04, d / 2 + 0.01], c2, 'metal');
  kit.box([w, 0.05, d], [0, 0.025, 0], '#1d1b1a', 'wood', NO_ROT, 0.05);
};

/** A desk model of an aircraft on a round stand: fuselage, swept wings, tail fin. */
const aircraftModel: Recipe = (kit, { w, d, h, c1, c2 }) => {
  const baseR = Math.min(w, d) * 0.34;
  kit.cylinder(baseR, baseR * 1.05, 0.02, [0, 0, 0], '#2b2b2e', 'stone', NO_ROT, 24);
  kit.cylinder(0.012, 0.012, h * 0.55, [0, 0.02, 0], c2, 'metal', NO_ROT, 8, false);
  const y = 0.02 + h * 0.55 + 0.02;
  kit.box([w * 0.9, 0.04, 0.045], [0, y, 0], c1, 'metal', NO_ROT, 0.4);
  kit.box([0.1, 0.012, d * 0.82], [w * 0.03, y - 0.004, 0], c1, 'metal', NO_ROT, 0.1);
  kit.box([0.07, 0.01, d * 0.34], [-w * 0.4, y, 0], c1, 'metal', NO_ROT, 0.1);
  kit.box([0.08, h * 0.32, 0.01], [-w * 0.42, y + h * 0.16, 0], c2, 'metal', NO_ROT, 0.1);
  kit.sphere(0.024, [w * 0.45, y, 0], c2, 'metal', [1.4, 1, 1], 8);
};

const RECIPES: Readonly<Record<DecorShape, Recipe>> = {
  'rug-rect': rugRect,
  'rug-round': rugRound,
  'rug-medallion': rugMedallion,
  'rug-stripe': rugStripe,
  bed,
  'vase-flowers': vaseFlowers,
  'vase-pampas': vasePampas,
  potted,
  aquarium,
  'art-print': artPrint,
  'art-canvas': artCanvas,
  'art-triptych': artTriptych,
  'art-adire': artAdire,
  'art-mask': artMask,
  'art-benin': artBenin,
  'art-bust': artBust,
  'art-sculpture': artSculpture,
  'lamp-table': lampTable,
  'lamp-arc': lampArc,
  'lamp-rattan': lampRattan,
  cushions,
  throw: throwRug,
  pouffe,
  'floor-cushions': floorCushions,
  basket,
  'shelf-floating': shelfFloating,
  bookcase,
  'shelf-cube': shelfCube,
  mirror,
  table,
  minibar,
  bench,
  'aircraft-model': aircraftModel,
};

/** Draw one piece in the kit's current frame (call `kit.place(...)` first). */
export function drawDecor(kit: PropKit, item: DecorItem, variant: DecorVariant, seed: string): void {
  RECIPES[item.shape](kit, {
    w: item.footprint[0],
    d: item.footprint[1],
    h: item.height,
    c1: variant.hex,
    c2: variant.accent,
    style: item.style ?? '',
    seed: `${item.id}:${variant.id}:${seed}`,
    surface: item.surface ?? 0,
  });
}

