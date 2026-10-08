import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import type { EyeStyle } from '@insidelife/shared';
import { RefCountCache } from '../core/refcount-cache';
import { timed } from '../core/perf-marks';

/**
 * The face is a painted decal (eyes, brows, mouth) on the front of the head, Kenney-style. All expressions live in
 * one atlas per eye style: rows = mood, columns = (eyes open/closed) × (mouth closed/open). The avatar switches
 * cells by moving the texture offset — no re-render, no new textures.
 */

export const EXPRESSIONS = ['happy', 'neutral', 'sad', 'tired'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** Expression for a 0-100 mood. */
export function expressionForMood(mood: number | undefined): Expression {
  if (mood === undefined || Number.isNaN(mood)) return 'neutral';
  if (mood >= 65) return 'happy';
  if (mood >= 38) return 'neutral';
  if (mood >= 18) return 'sad';
  return 'tired';
}

/** Face decal placement relative to the head centre, in head-scale units (metres at scale 1). */
export const FACE_LAYOUT = {
  width: 0.4,
  height: 0.36,
  /** Decal centre, relative to the head centre. */
  centerY: -0.03,
  /** Feature positions in decal UV space (0-1, v up). */
  eyeV: 0.565,
  eyeU: 0.235,
  mouthV: 0.215,
  browV: 0.73,
} as const;

/** Head-space Y (relative to head centre) of a decal V coordinate. */
export function faceY(v: number, headScale = 1): number {
  return (FACE_LAYOUT.centerY + (v - 0.5) * FACE_LAYOUT.height) * headScale;
}

const CELL = 256;
const GRID = 4;

export interface FaceCell {
  readonly expression: Expression;
  readonly eyesClosed: boolean;
  readonly mouthOpen: boolean;
}

/** Atlas cell (column, row from the top) for a face state. */
export function faceCellIndex(cell: FaceCell): { readonly col: number; readonly row: number } {
  return { col: (cell.eyesClosed ? 2 : 0) + (cell.mouthOpen ? 1 : 0), row: EXPRESSIONS.indexOf(cell.expression) };
}

/** Texture offset (u, v) for a cell, with `repeat = 1 / GRID` (canvas textures are flipped: row 0 is at the top). */
export function faceCellOffset(cell: FaceCell): readonly [number, number] {
  const { col, row } = faceCellIndex(cell);
  return [col / GRID, 1 - (row + 1) / GRID];
}

export const FACE_GRID = GRID;

// ---------------------------------------------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------------------------------------------

const INK = '#1a110d';
const MOUTH = '#3b1512';
const MOUTH_INSIDE = '#5e1a1c';
const TONGUE = '#d4626b';
const TEETH = '#fbf6ee';

type Ctx = CanvasRenderingContext2D;

interface FaceStyle {
  readonly eyeStyle: EyeStyle;
  readonly lashes: boolean;
}

function paintCell(ctx: Ctx, style: FaceStyle, cell: FaceCell): void {
  const cx = CELL / 2;
  const eyeY = CELL * (1 - FACE_LAYOUT.eyeV);
  const eyeDX = CELL * FACE_LAYOUT.eyeU;
  const mouthY = CELL * (1 - FACE_LAYOUT.mouthV);
  const browY = CELL * (1 - FACE_LAYOUT.browV);

  // Cheeks: soft blush (subtle on deep skin, as in life).
  if (cell.expression === 'happy') {
    for (const s of [-1, 1]) {
      const g = ctx.createRadialGradient(cx + s * eyeDX * 1.15, eyeY + 34, 2, cx + s * eyeDX * 1.15, eyeY + 34, 24);
      g.addColorStop(0, 'rgba(255,110,110,0.28)');
      g.addColorStop(1, 'rgba(255,110,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx + s * eyeDX * 1.15 - 26, eyeY + 8, 52, 52);
    }
  }

  // Brows.
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  for (const s of [-1, 1]) {
    const inner = cx + s * eyeDX * 0.55;
    const outer = cx + s * eyeDX * 1.35;
    let innerY = browY;
    let outerY = browY;
    if (cell.expression === 'happy') {
      innerY -= 4;
      outerY -= 2;
    } else if (cell.expression === 'sad') {
      innerY -= 9;
      outerY += 5;
    } else if (cell.expression === 'tired') {
      innerY += 3;
      outerY += 6;
    }
    ctx.beginPath();
    ctx.moveTo(inner, innerY);
    ctx.quadraticCurveTo((inner + outer) / 2, Math.min(innerY, outerY) - 5, outer, outerY);
    ctx.stroke();
  }

  // Eyes.
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDX;
    if (cell.eyesClosed) paintClosedEye(ctx, ex, eyeY, s, style, cell.expression);
    else paintOpenEye(ctx, ex, eyeY, s, style, cell.expression);
  }

  // Tired: under-eye bags.
  if (cell.expression === 'tired') {
    ctx.strokeStyle = 'rgba(30,15,10,0.35)';
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + s * eyeDX, eyeY + 14, 13, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
  }

  paintMouth(ctx, cx, mouthY, cell);
}

function paintOpenEye(ctx: Ctx, x: number, y: number, side: number, style: FaceStyle, expression: Expression): void {
  ctx.save();
  ctx.fillStyle = INK;
  const squash = expression === 'sad' ? 0.88 : 1;
  ctx.beginPath();
  switch (style.eyeStyle) {
    case 'round':
      ctx.ellipse(x, y, 15, 18 * squash, 0, 0, Math.PI * 2);
      break;
    case 'almond':
      ctx.moveTo(x - 21, y + 2);
      ctx.bezierCurveTo(x - 12, y - 16 * squash, x + 12, y - 16 * squash, x + 21, y - 1);
      ctx.bezierCurveTo(x + 12, y + 13 * squash, x - 12, y + 13 * squash, x - 21, y + 2);
      break;
    case 'sleepy':
      ctx.moveTo(x - 18, y - 3);
      ctx.lineTo(x + 18, y - 3);
      ctx.bezierCurveTo(x + 18, y + 16 * squash, x - 18, y + 16 * squash, x - 18, y - 3);
      break;
    case 'bright':
      ctx.ellipse(x, y, 17, 22 * squash, 0, 0, Math.PI * 2);
      break;
  }
  ctx.fill();
  ctx.clip();
  if (style.eyeStyle === 'bright' || style.eyeStyle === 'almond') {
    // Warm brown iris glint.
    ctx.fillStyle = '#5a3020';
    ctx.beginPath();
    ctx.ellipse(x, y + 6, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (expression === 'tired') {
    // Heavy lids cover the top of the eye.
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(x - 30, y - 30, 60, 26);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  // Highlights (the life of a chibi face).
  if (expression !== 'tired') {
    ctx.fillStyle = '#ffffff';
    const big = style.eyeStyle === 'bright' ? 7 : 5.5;
    ctx.beginPath();
    ctx.arc(x + 5 * side - 2, y - 6, big, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 5 * side + 1, y + 7, big * 0.45, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 19, y - 3);
    ctx.lineTo(x + 19, y - 3);
    ctx.stroke();
  }
  if (style.lashes) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    const outer = x + side * 16;
    ctx.beginPath();
    ctx.moveTo(outer, y - 10);
    ctx.lineTo(outer + side * 9, y - 17);
    ctx.moveTo(outer - side * 3, y - 15);
    ctx.lineTo(outer + side * 2, y - 23);
    ctx.stroke();
  }
}

function paintClosedEye(ctx: Ctx, x: number, y: number, side: number, style: FaceStyle, expression: Expression): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (expression === 'happy') ctx.arc(x, y + 6, 15, 1.15 * Math.PI, 1.85 * Math.PI);
  else ctx.arc(x, y - 6, 15, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  if (style.lashes) {
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    const outer = x + side * 15;
    ctx.moveTo(outer, y + 2);
    ctx.lineTo(outer + side * 8, y + 7);
    ctx.stroke();
  }
}

function paintMouth(ctx: Ctx, x: number, y: number, cell: FaceCell): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = MOUTH;
  ctx.lineWidth = 6;
  const { expression, mouthOpen } = cell;
  if (!mouthOpen) {
    ctx.beginPath();
    if (expression === 'happy') ctx.arc(x, y - 16, 22, 0.22 * Math.PI, 0.78 * Math.PI);
    else if (expression === 'sad') ctx.arc(x, y + 18, 16, 1.25 * Math.PI, 1.75 * Math.PI);
    else if (expression === 'tired') {
      ctx.moveTo(x - 12, y + 2);
      ctx.quadraticCurveTo(x - 4, y - 3, x + 3, y + 1);
      ctx.quadraticCurveTo(x + 9, y + 4, x + 13, y);
    } else ctx.arc(x, y - 22, 24, 0.38 * Math.PI, 0.62 * Math.PI);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = MOUTH_INSIDE;
  ctx.beginPath();
  if (expression === 'happy') {
    ctx.moveTo(x - 26, y - 8);
    ctx.quadraticCurveTo(x, y - 2, x + 26, y - 8);
    ctx.bezierCurveTo(x + 22, y + 26, x - 22, y + 26, x - 26, y - 8);
  } else if (expression === 'sad') {
    ctx.ellipse(x, y + 4, 13, 9, 0, Math.PI, 0);
    ctx.lineTo(x + 13, y + 8);
    ctx.lineTo(x - 13, y + 8);
  } else if (expression === 'tired') {
    ctx.ellipse(x, y + 4, 14, 19, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(x, y + 2, 12, 11, 0, 0, Math.PI * 2);
  }
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (expression === 'happy') {
    ctx.fillStyle = TEETH;
    ctx.fillRect(x - 26, y - 10, 52, 9);
  }
  ctx.fillStyle = TONGUE;
  ctx.beginPath();
  ctx.ellipse(x, y + (expression === 'tired' ? 20 : 17), 15, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = MOUTH;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function paintAtlas(style: FaceStyle): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * GRID;
  canvas.height = CELL * GRID;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  EXPRESSIONS.forEach((expression, row) => {
    for (let col = 0; col < GRID; col++) {
      ctx.save();
      ctx.translate(col * CELL, row * CELL);
      ctx.beginPath();
      ctx.rect(0, 0, CELL, CELL);
      ctx.clip();
      paintCell(ctx, style, { expression, eyesClosed: col >= 2, mouthOpen: col % 2 === 1 });
      ctx.restore();
    }
  });
  return canvas;
}

const atlasCache = new RefCountCache<CanvasTexture>({
  create: (key) => {
    const [eyeStyle, lashes] = key.split('|') as [EyeStyle, string];
    const texture = new CanvasTexture(timed('il:face-atlas', () => paintAtlas({ eyeStyle, lashes: lashes === '1' })));
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = 4;
    texture.repeat.set(1 / GRID, 1 / GRID);
    texture.name = `face:${key}`;
    return texture;
  },
  dispose: (texture) => texture.dispose(),
  graceMs: 10_000,
});

export function faceAtlasKey(eyeStyle: EyeStyle, lashes: boolean): string {
  return `${eyeStyle}|${lashes ? 1 : 0}`;
}

/** Shared atlas texture (retain/release). Avatars clone it (shares the GPU upload) to animate their own offsets. */
export function acquireFaceAtlas(key: string): CanvasTexture {
  return atlasCache.acquire(key);
}

export function releaseFaceAtlas(key: string): void {
  atlasCache.release(key);
}
