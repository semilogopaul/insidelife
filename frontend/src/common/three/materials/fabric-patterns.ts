import { createRng, type FabricPattern, type Rng } from '@insidelife/shared';
import { accentFor, luminance, mixHex, normalizeHex, shadeHex, shiftHue } from './color-utils';

/**
 * Procedural, tileable fabric prints painted on a 2D canvas. Every print is a pure function of
 * (pattern, variant, colours, seed), so the same shop item always looks the same for every player.
 */

export type PatternVariant = 'default' | 'pinstripe';

export interface FabricSpec {
  readonly pattern: FabricPattern;
  readonly primary: string;
  readonly secondary: string;
  readonly seed: number;
  readonly variant: PatternVariant;
}

/** Physical size (metres) one texture tile covers. UVs are in metres, so `repeat = 1 / tile`. */
export const FABRIC_TILE_METRES: Readonly<Record<FabricPattern, number>> = {
  solid: 1,
  ankara: 0.3,
  adire: 0.32,
  'aso-oke': 0.14,
  lace: 0.13,
  stripes: 0.11,
  denim: 0.09,
  check: 0.17,
};

/** Canvas resolution per pattern (power of two, tileable). */
export const FABRIC_TEXTURE_SIZE: Readonly<Record<FabricPattern, number>> = {
  solid: 4,
  ankara: 512,
  adire: 512,
  'aso-oke': 256,
  lace: 256,
  stripes: 128,
  denim: 256,
  check: 256,
};

/** Canonical spec (normalised colours, defaulted seed) — the basis of the cache key. */
export function normalizeFabricSpec(input: {
  readonly pattern: FabricPattern;
  readonly primary: string;
  readonly secondary: string;
  readonly patternSeed?: number;
  readonly variant?: PatternVariant;
}): FabricSpec {
  return {
    pattern: input.pattern,
    primary: normalizeHex(input.primary),
    secondary: normalizeHex(input.secondary),
    seed: Math.trunc(input.patternSeed ?? 0),
    variant: input.variant ?? 'default',
  };
}

/** Stable cache key. Seeds only matter for seeded prints, so two plain stripes in the same colours share a texture. */
export function fabricKey(spec: FabricSpec): string {
  const seeded = spec.pattern === 'ankara' || spec.pattern === 'adire' || spec.pattern === 'aso-oke' || spec.pattern === 'lace';
  return [spec.pattern, spec.variant, spec.primary, spec.secondary, seeded ? spec.seed : 0].join('|');
}

/** Average colour of the print — used for the low-detail (untextured) avatar. */
export function fabricAverageColor(spec: FabricSpec): string {
  const coverage: Readonly<Record<FabricPattern, number>> = {
    solid: 0,
    ankara: 0.42,
    adire: 0.3,
    'aso-oke': 0.4,
    lace: 0.15,
    stripes: 0.3,
    denim: 0.1,
    check: 0.35,
  };
  return mixHex(spec.primary, spec.secondary, coverage[spec.pattern]);
}

type Ctx = CanvasRenderingContext2D;

/** Paints `spec` onto a square canvas of `size` px. */
export function paintFabric(ctx: Ctx, spec: FabricSpec, size: number): void {
  const rng = createRng(`fabric:${spec.pattern}:${spec.seed}`);
  ctx.save();
  ctx.fillStyle = spec.primary;
  ctx.fillRect(0, 0, size, size);
  switch (spec.pattern) {
    case 'ankara':
      paintAnkara(ctx, spec, size, rng);
      break;
    case 'adire':
      paintAdire(ctx, spec, size, rng);
      break;
    case 'aso-oke':
      paintAsoOke(ctx, spec, size, rng);
      break;
    case 'lace':
      paintLace(ctx, spec, size, rng);
      break;
    case 'stripes':
      paintStripes(ctx, spec, size);
      break;
    case 'check':
      paintCheck(ctx, spec, size);
      break;
    case 'denim':
      paintDenim(ctx, spec, size, rng);
      break;
    case 'solid':
      break;
  }
  ctx.restore();
}

/** Draw `draw(x, y)` at the point and at its wrapped copies so motifs tile seamlessly. */
function tiled(size: number, x: number, y: number, reach: number, draw: (x: number, y: number) => void): void {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px + reach < 0 || px - reach > size || py + reach < 0 || py - reach > size) continue;
      draw(px, py);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Ankara (Dutch wax): bold, flat, high-contrast motifs on a half-drop grid
// ---------------------------------------------------------------------------------------------------------------

function paintAnkara(ctx: Ctx, spec: FabricSpec, size: number, rng: Rng): void {
  const bg = spec.primary;
  const fg = spec.secondary;
  const accent = accentFor(bg, fg);
  const ink = luminance(bg) > 0.35 ? shadeHex(bg, -0.7) : shadeHex(fg, -0.75);
  const cream = luminance(bg) > 0.7 ? shadeHex(fg, 0.55) : '#f6ead0';
  const family = rng.int(0, 4);
  const cells = family === 3 ? 4 : 2;
  const cell = size / cells;

  // Ground texture: faint crackle veins (the wax "crackle" of real Dutch wax).
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = ink;
  ctx.lineWidth = size / 400;
  for (let i = 0; i < 26; i++) {
    let x = rng.float(0, size);
    let y = rng.float(0, size);
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += rng.float(-size / 14, size / 14);
      y += rng.float(-size / 14, size / 14);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (let row = 0; row < cells; row++) {
    for (let col = 0; col < cells; col++) {
      const half = col % 2 === 1 ? cell / 2 : 0;
      const cx = col * cell + cell / 2;
      const cy = row * cell + cell / 2 + half;
      const r = cell * 0.46;
      tiled(size, cx, cy, r * 1.3, (x, y) => {
        switch (family) {
          case 0:
            waxCircles(ctx, x, y, r, fg, accent, cream, ink);
            break;
          case 1:
            waxDiamond(ctx, x, y, r, fg, accent, cream, ink);
            break;
          case 2:
            waxFlower(ctx, x, y, r, fg, accent, cream, ink);
            break;
          case 3:
            waxScale(ctx, x, y, r * 1.05, fg, accent, ink);
            break;
          default:
            waxSwirl(ctx, x, y, r, fg, accent, cream, ink, (row + col) % 2 === 0);
        }
      });
      // Secondary small motif between the big ones (classic wax rhythm).
      if (family !== 3) {
        const sx = col * cell;
        const sy = row * cell + half;
        tiled(size, sx, sy, cell * 0.16, (x, y) => {
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.arc(x, y, cell * 0.12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = ink;
          ctx.beginPath();
          ctx.arc(x, y, cell * 0.05, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }
}

function waxCircles(ctx: Ctx, x: number, y: number, r: number, fg: string, accent: string, cream: string, ink: string): void {
  const rings: ReadonlyArray<readonly [number, string]> = [
    [1, ink],
    [0.92, fg],
    [0.7, cream],
    [0.6, accent],
    [0.42, ink],
    [0.34, fg],
    [0.16, cream],
  ];
  for (const [k, color] of rings) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, Math.PI * 2);
    ctx.fill();
  }
  // Dotted halo.
  ctx.fillStyle = cream;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * r * 0.81, y + Math.sin(a) * r * 0.81, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
}

function waxDiamond(ctx: Ctx, x: number, y: number, r: number, fg: string, accent: string, cream: string, ink: string): void {
  const diamond = (k: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r * k);
    ctx.lineTo(x + r * k * 0.8, y);
    ctx.lineTo(x, y + r * k);
    ctx.lineTo(x - r * k * 0.8, y);
    ctx.closePath();
    ctx.fill();
  };
  diamond(1.05, ink);
  diamond(0.95, fg);
  diamond(0.7, cream);
  diamond(0.58, accent);
  diamond(0.3, ink);
  // Chevron ticks on the outline.
  ctx.strokeStyle = cream;
  ctx.lineWidth = r * 0.06;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.35, y + s * r * 0.82);
    ctx.lineTo(x, y + s * r * 0.55);
    ctx.lineTo(x + r * 0.35, y + s * r * 0.82);
    ctx.stroke();
  }
}

function waxFlower(ctx: Ctx, x: number, y: number, r: number, fg: string, accent: string, cream: string, ink: string): void {
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.27, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = i % 2 === 0 ? fg : accent;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.21, r * 0.43, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.55, r * 0.06, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
}

function waxScale(ctx: Ctx, x: number, y: number, r: number, fg: string, accent: string, ink: string): void {
  // Fish-scale / fan arcs.
  const bands: ReadonlyArray<readonly [number, string]> = [
    [1, ink],
    [0.88, fg],
    [0.66, accent],
    [0.48, ink],
    [0.38, fg],
  ];
  for (const [k, color] of bands) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.5, r * k, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }
}

function waxSwirl(ctx: Ctx, x: number, y: number, r: number, fg: string, accent: string, cream: string, ink: string, flip: boolean): void {
  // "Speed bird" / swirl: a fat spiral teardrop.
  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.bezierCurveTo(r * 1.1, -r * 0.9, r * 1.0, r * 0.9, 0, r * 0.95);
  ctx.bezierCurveTo(-r * 0.9, r * 0.9, -r * 0.6, -r * 0.1, 0, -r * 0.15);
  ctx.bezierCurveTo(r * 0.4, -r * 0.2, r * 0.3, -r * 0.7, 0, -r);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.84);
  ctx.bezierCurveTo(r * 0.9, -r * 0.75, r * 0.85, r * 0.75, 0, r * 0.8);
  ctx.bezierCurveTo(-r * 0.7, r * 0.75, -r * 0.45, 0, 0, -0);
  ctx.bezierCurveTo(r * 0.25, -r * 0.1, r * 0.2, -r * 0.6, 0, -r * 0.84);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(r * 0.18, r * 0.35, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cream;
  ctx.beginPath();
  ctx.arc(r * 0.18, r * 0.35, r * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------------------
// Adire (Yoruba indigo resist-dye): pale motifs bleeding into deep indigo
// ---------------------------------------------------------------------------------------------------------------

function paintAdire(ctx: Ctx, spec: FabricSpec, size: number, rng: Rng): void {
  const dye = spec.primary;
  const resist = spec.secondary;
  // Mottled dye bath.
  for (let i = 0; i < 90; i++) {
    const x = rng.float(0, size);
    const y = rng.float(0, size);
    const r = rng.float(size * 0.03, size * 0.12);
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = rng.chance(0.5) ? shadeHex(dye, -0.35) : shadeHex(dye, 0.18);
    tiled(size, x, y, r, (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
  ctx.filter = `blur(${Math.max(1, size / 360)}px)`;
  const family = rng.int(0, 2);
  const cells = 4;
  const cell = size / cells;
  ctx.strokeStyle = resist;
  ctx.fillStyle = resist;
  if (family === 0) {
    // Oniko (tie-dye): concentric rings with sunburst ticks.
    for (let row = 0; row < cells / 2; row++) {
      for (let col = 0; col < cells / 2; col++) {
        const cx = col * cell * 2 + cell;
        const cy = row * cell * 2 + cell + (col % 2) * cell;
        tiled(size, cx, cy, cell * 1.1, (x, y) => {
          for (let k = 1; k <= 3; k++) {
            ctx.globalAlpha = 0.85 - k * 0.15;
            ctx.lineWidth = cell * 0.07;
            ctx.beginPath();
            ctx.arc(x, y, cell * 0.28 * k, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = cell * 0.035;
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a) * cell * 0.9, y + Math.sin(a) * cell * 0.9);
            ctx.lineTo(x + Math.cos(a) * cell * 1.02, y + Math.sin(a) * cell * 1.02);
            ctx.stroke();
          }
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(x, y, cell * 0.1, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  } else if (family === 1) {
    // Eleko (starch-resist): grid of panels with alternating motifs — dots, ladders, leaves.
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = cell * 0.05;
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, size);
      ctx.moveTo(0, i * cell);
      ctx.lineTo(size, i * cell);
      ctx.stroke();
    }
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        const x = col * cell + cell / 2;
        const y = row * cell + cell / 2;
        const kind = (row + col) % 3;
        if (kind === 0) {
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            ctx.beginPath();
            ctx.arc(x + (i - 1) * cell * 0.26, y + (j - 1) * cell * 0.26, cell * 0.07, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (kind === 1) {
          ctx.lineWidth = cell * 0.04;
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(x - cell * 0.32, y - cell * 0.32 + i * cell * 0.16);
            ctx.lineTo(x + cell * 0.32, y - cell * 0.32 + i * cell * 0.16);
            ctx.stroke();
          }
        } else {
          ctx.beginPath();
          ctx.ellipse(x, y, cell * 0.16, cell * 0.36, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(x, y, cell * 0.16, cell * 0.36, -Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  } else {
    // Alabere (stitch-resist): rows of dashed stitches and diamonds.
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = size / 110;
    for (let row = 0; row < 8; row++) {
      const y = (row + 0.5) * (size / 8);
      if (row % 2 === 0) {
        for (let x = 0; x < size; x += size / 20) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + size / 34, y);
          ctx.stroke();
        }
      } else {
        for (let k = 0; k < 6; k++) {
          const x = (k + 0.5) * (size / 6);
          ctx.beginPath();
          ctx.moveTo(x, y - size / 26);
          ctx.lineTo(x + size / 22, y);
          ctx.lineTo(x, y + size / 26);
          ctx.lineTo(x - size / 22, y);
          ctx.closePath();
          ctx.stroke();
        }
      }
    }
  }
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------------------------------------------
// Aso-oke: hand-loomed narrow strips, warp stripes with metallic threads
// ---------------------------------------------------------------------------------------------------------------

function paintAsoOke(ctx: Ctx, spec: FabricSpec, size: number, rng: Rng): void {
  const base = spec.primary;
  const thread = spec.secondary;
  // Warp stripes (vertical): seeded rhythm of widths.
  let x = 0;
  let index = 0;
  while (x < size) {
    const width = rng.pick([size / 32, size / 24, size / 16, size / 10, size / 7]);
    const kind = index % 4;
    ctx.fillStyle = kind === 1 ? thread : kind === 3 ? shadeHex(base, -0.25) : base;
    ctx.fillRect(x, 0, Math.min(width, size - x), size);
    if (kind === 1) {
      ctx.fillStyle = shadeHex(thread, 0.35);
      ctx.fillRect(x + width * 0.4, 0, Math.max(1, width * 0.15), size);
    }
    x += width;
    index++;
  }
  // Weft (horizontal) weave texture.
  for (let y = 0; y < size; y += 2) {
    ctx.fillStyle = y % 4 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, y, size, 1);
  }
  // Openwork eyelets (the "eleya" holes): small dark dots along a band.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let k = 0; k < 8; k++) {
    ctx.fillRect((k + 0.5) * (size / 8), size * 0.5, size / 64, size / 64);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Lace (eyelet / cord lace): floral eyelet clusters with corded outlines
// ---------------------------------------------------------------------------------------------------------------

function paintLace(ctx: Ctx, spec: FabricSpec, size: number, rng: Rng): void {
  const base = spec.primary;
  const cord = spec.secondary;
  const hole = luminance(base) > 0.5 ? shadeHex(base, -0.38) : shadeHex(base, -0.6);
  // Fine mesh ground.
  ctx.strokeStyle = shadeHex(base, -0.08);
  ctx.lineWidth = 1;
  for (let i = -size; i < size * 2; i += size / 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.moveTo(i, size);
    ctx.lineTo(i + size, 0);
    ctx.stroke();
  }
  const flower = (x: number, y: number, r: number): void => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      ctx.fillStyle = shadeHex(base, 0.15);
      ctx.beginPath();
      ctx.ellipse(px, py, r * 0.62, r * 0.42, a, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hole;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 0.32, r * 0.18, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = cord;
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = cord;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  };
  const spots: ReadonlyArray<readonly [number, number, number]> = [
    [0.25, 0.25, 0.09],
    [0.75, 0.75, 0.09],
    [0.75, 0.22, 0.05],
    [0.22, 0.78, 0.05],
  ];
  for (const [u, v, r] of spots) tiled(size, u * size, v * size, r * size * 1.8, (x, y) => flower(x, y, r * size));
  // Beads / sequins sprinkled (owambe sparkle).
  ctx.fillStyle = shadeHex(cord, 0.4);
  for (let i = 0; i < 26; i++) {
    const px = rng.float(0, size);
    const py = rng.float(0, size);
    ctx.beginPath();
    ctx.arc(px, py, size / 160, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Stripes, check, denim
// ---------------------------------------------------------------------------------------------------------------

function paintStripes(ctx: Ctx, spec: FabricSpec, size: number): void {
  if (spec.variant === 'pinstripe') {
    ctx.fillStyle = spec.secondary;
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < 4; i++) ctx.fillRect((i + 0.5) * (size / 4), 0, Math.max(1, size / 96), size);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = spec.secondary;
  ctx.fillRect(0, size * 0.1, size, size * 0.3);
  ctx.fillStyle = shiftHue(spec.secondary, 0, 0, -0.08);
  ctx.fillRect(0, size * 0.62, size, size * 0.06);
}

function paintCheck(ctx: Ctx, spec: FabricSpec, size: number): void {
  const band = size / 4;
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = spec.secondary;
  for (let i = 0; i < 2; i++) {
    ctx.fillRect(i * band * 2, 0, band, size);
    ctx.fillRect(0, i * band * 2, size, band);
  }
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = shadeHex(spec.primary, -0.45);
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(i * band + band * 0.7, 0, Math.max(1, size / 80), size);
    ctx.fillRect(0, i * band + band * 0.7, size, Math.max(1, size / 80));
  }
  ctx.globalAlpha = 1;
}

function paintDenim(ctx: Ctx, spec: FabricSpec, size: number, rng: Rng): void {
  const light = shadeHex(spec.primary, 0.22);
  const dark = shadeHex(spec.primary, -0.25);
  ctx.lineWidth = Math.max(1, size / 128);
  for (let i = -size; i < size * 2; i += size / 32) {
    ctx.strokeStyle = (i / (size / 32)) % 2 === 0 ? light : dark;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.stroke();
  }
  // Slubs and fade.
  for (let i = 0; i < 220; i++) {
    ctx.globalAlpha = rng.float(0.05, 0.18);
    ctx.fillStyle = rng.chance(0.6) ? '#ffffff' : '#000000';
    ctx.fillRect(rng.float(0, size), rng.float(0, size), rng.float(1, size / 20), 1);
  }
  ctx.globalAlpha = 1;
}
