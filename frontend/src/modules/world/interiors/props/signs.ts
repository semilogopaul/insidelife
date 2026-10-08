import { BufferAttribute, BufferGeometry, CanvasTexture, Matrix4, SRGBColorSpace, Vector3 } from 'three';
import type { PropSpec } from './prop-types';

type SignSpec = Extract<PropSpec, { kind: 'sign' }>;

const PX_PER_METRE = 220;
const ATLAS_WIDTH = 1024;
const PAD = 6;

interface Slot {
  readonly sign: SignSpec;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Shelf-pack sign faces into an atlas (pure; exported for tests). */
export function packSigns(signs: readonly SignSpec[], width = ATLAS_WIDTH): { readonly slots: readonly Slot[]; readonly height: number } {
  const slots: Slot[] = [];
  let x = PAD;
  let y = PAD;
  let row = 0;
  for (const sign of signs) {
    let w = Math.max(32, Math.round(sign.size[0] * PX_PER_METRE));
    let h = Math.max(24, Math.round(sign.size[1] * PX_PER_METRE));
    if (w > width - PAD * 2) {
      const k = (width - PAD * 2) / w;
      w = Math.floor(w * k);
      h = Math.floor(h * k);
    }
    if (x + w + PAD > width) {
      x = PAD;
      y += row + PAD;
      row = 0;
    }
    slots.push({ sign, x, y, w, h });
    x += w + PAD;
    row = Math.max(row, h);
  }
  const used = y + row + PAD;
  let height = 64;
  while (height < used) height *= 2;
  return { slots, height };
}

function paintSign(ctx: CanvasRenderingContext2D, slot: Slot): void {
  const { sign, x, y, w, h } = slot;
  const style = sign.style ?? 'painted';
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = sign.bg;
  ctx.fillRect(x, y, w, h);
  if (style === 'board') {
    // Chalk dust.
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 40; i++) ctx.fillRect(x + ((i * 37) % w), y + ((i * 53) % h), 18, 2);
    ctx.globalAlpha = 1;
  }
  if (style === 'painted' || style === 'poster') {
    ctx.fillStyle = sign.accent ?? sign.fg;
    ctx.fillRect(x, y + h - Math.max(4, h * 0.08), w, Math.max(4, h * 0.08));
    if (style === 'poster') ctx.fillRect(x, y, w, Math.max(4, h * 0.06));
  }
  const lines = sign.lines;
  const lineH = (h * (style === 'painted' ? 0.78 : 0.82)) / Math.max(1, lines.length);
  lines.forEach((line, index) => {
    const first = index === 0;
    let size = lineH * (first ? 0.86 : 0.66);
    const family = style === 'board' ? '"Comic Sans MS", "Chalkboard SE", cursive' : 'Impact, "Arial Narrow Bold", "Arial Black", sans-serif';
    ctx.font = `${first ? 900 : 700} ${size}px ${family}`;
    const max = w * 0.9;
    const measured = ctx.measureText(line).width;
    if (measured > max) {
      size *= max / measured;
      ctx.font = `${first ? 900 : 700} ${size}px ${family}`;
    }
    ctx.fillStyle = first || style === 'board' ? sign.fg : (sign.accent ?? sign.fg);
    if (style === 'screen') {
      ctx.shadowColor = sign.fg;
      ctx.shadowBlur = size * 0.4;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const top = y + h * (style === 'painted' ? 0.08 : 0.09);
    ctx.fillText(line, x + w / 2, top + lineH * (index + 0.5));
    ctx.shadowBlur = 0;
  });
  ctx.restore();
}

export interface SignAtlas {
  readonly geometry: BufferGeometry;
  readonly texture: CanvasTexture;
}

/** Paint all signs of a room into one texture and build their face quads (UV-mapped into it). */
export function buildSignAtlas(signs: readonly SignSpec[]): SignAtlas | null {
  if (signs.length === 0) return null;
  const { slots, height } = packSigns(signs);
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) for (const slot of slots) paintSign(ctx, slot);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const surface: number[] = [];
  const indices: number[] = [];
  const matrix = new Matrix4();
  const v = new Vector3();
  const n = new Vector3();
  for (const slot of slots) {
    const { sign } = slot;
    const [w, h] = sign.size;
    const centreY = sign.wall ? 0 : 0.55 + h / 2;
    const z = sign.wall ? 0.016 : 0.012;
    matrix.makeRotationY(((sign.rot ?? 0) * Math.PI) / 180).setPosition(sign.at[0], sign.y ?? 0, sign.at[1]);
    const base = positions.length / 3;
    const corners: ReadonlyArray<readonly [number, number, number, number]> = [
      [-w / 2, -h / 2, 0, 0],
      [w / 2, -h / 2, 1, 0],
      [w / 2, h / 2, 1, 1],
      [-w / 2, h / 2, 0, 1],
    ];
    n.set(0, 0, 1).transformDirection(matrix);
    for (const [cx, cy, u, vv] of corners) {
      v.set(cx, centreY + cy, z).applyMatrix4(matrix);
      positions.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
      uvs.push((slot.x + u * slot.w) / ATLAS_WIDTH, 1 - (slot.y + (1 - vv) * slot.h) / height);
      colors.push(255, 255, 255);
      surface.push(sign.style === 'screen' ? 60 : 200, 0);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('color', new BufferAttribute(new Uint8Array(colors), 3, true));
  geometry.setAttribute('surface', new BufferAttribute(new Uint8Array(surface), 2, true));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return { geometry, texture };
}
