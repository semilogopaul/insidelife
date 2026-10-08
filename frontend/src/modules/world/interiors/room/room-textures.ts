import { CanvasTexture, ClampToEdgeWrapping, RepeatWrapping, SRGBColorSpace } from 'three';
import { createRng, type Rng } from '@insidelife/shared';
import { mixHex, shadeHex } from '@/common/three/materials/color-utils';
import type { FloorStyle, WallSpec } from '../templates/types';

/** One floor texture tile covers this many metres. */
export const FLOOR_TILE_METRES = 2.4;
/** One wall texture repeat covers this many metres horizontally. */
export const WALL_TILE_METRES = 2.4;

type Ctx = CanvasRenderingContext2D;

function canvas(width: number, height: number): { readonly el: HTMLCanvasElement; readonly ctx: Ctx | null } {
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  return { el, ctx: el.getContext('2d') };
}

function speckle(ctx: Ctx, rng: Rng, size: number, count: number, colors: readonly string[], alpha: number, maxR: number): void {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = rng.pick(colors);
    const r = rng.float(0.5, maxR);
    ctx.fillRect(rng.float(0, size), rng.float(0, size), r, r);
  }
  ctx.globalAlpha = 1;
}

export function paintFloor(style: FloorStyle, color: string): CanvasTexture {
  const size = 512;
  const { el, ctx } = canvas(size, size);
  const rng = createRng(`floor:${style}:${color}`);
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    switch (style) {
      case 'tiles':
      case 'marble': {
        const n = style === 'marble' ? 2 : 4;
        const t = size / n;
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            ctx.fillStyle = shadeHex(color, rng.float(-0.05, 0.04));
            ctx.fillRect(i * t, j * t, t, t);
            if (style === 'marble') {
              ctx.strokeStyle = shadeHex(color, -0.25);
              ctx.globalAlpha = 0.35;
              ctx.lineWidth = 1.5;
              for (let k = 0; k < 3; k++) {
                ctx.beginPath();
                ctx.moveTo(i * t + rng.float(0, t), j * t);
                ctx.bezierCurveTo(i * t + rng.float(0, t), j * t + t * 0.3, i * t + rng.float(0, t), j * t + t * 0.7, i * t + rng.float(0, t), j * t + t);
                ctx.stroke();
              }
              ctx.globalAlpha = 1;
            }
            // Soft sheen.
            const g = ctx.createLinearGradient(i * t, j * t, i * t + t, j * t + t);
            g.addColorStop(0, 'rgba(255,255,255,0.08)');
            g.addColorStop(1, 'rgba(0,0,0,0.04)');
            ctx.fillStyle = g;
            ctx.fillRect(i * t, j * t, t, t);
          }
        }
        ctx.strokeStyle = shadeHex(color, -0.3);
        ctx.lineWidth = 3;
        for (let i = 0; i <= n; i++) {
          ctx.beginPath();
          ctx.moveTo(i * t, 0);
          ctx.lineTo(i * t, size);
          ctx.moveTo(0, i * t);
          ctx.lineTo(size, i * t);
          ctx.stroke();
        }
        break;
      }
      case 'terrazzo':
        speckle(ctx, rng, size, 1600, [shadeHex(color, -0.35), shadeHex(color, 0.25), '#9e9e9e', '#c9a27e', '#5d6d7e'], 0.7, 5);
        break;
      case 'wood': {
        const planks = 6;
        const pw = size / planks;
        for (let i = 0; i < planks; i++) {
          let y = -rng.float(0, size);
          while (y < size) {
            const len = rng.float(size * 0.4, size * 0.9);
            ctx.fillStyle = shadeHex(color, rng.float(-0.12, 0.08));
            ctx.fillRect(i * pw + 1, y, pw - 2, len - 2);
            ctx.strokeStyle = shadeHex(color, -0.25);
            ctx.globalAlpha = 0.25;
            for (let k = 0; k < 4; k++) {
              ctx.beginPath();
              const gx = i * pw + rng.float(4, pw - 4);
              ctx.moveTo(gx, y);
              ctx.lineTo(gx + rng.float(-3, 3), y + len);
              ctx.stroke();
            }
            ctx.globalAlpha = 1;
            y += len;
          }
        }
        break;
      }
      case 'cement':
        speckle(ctx, rng, size, 2600, [shadeHex(color, -0.15), shadeHex(color, 0.1)], 0.35, 3);
        for (let i = 0; i < 7; i++) {
          const g = ctx.createRadialGradient(rng.float(0, size), rng.float(0, size), 2, rng.float(0, size), rng.float(0, size), rng.float(40, 120));
          g.addColorStop(0, 'rgba(60,45,30,0.12)');
          g.addColorStop(1, 'rgba(60,45,30,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, size, size);
        }
        break;
      case 'carpet':
        speckle(ctx, rng, size, 5000, [shadeHex(color, -0.1), shadeHex(color, 0.08)], 0.4, 2);
        break;
      case 'vinyl': {
        // The classic Nigerian linoleum: medallions on a warm ground.
        const t = size / 4;
        const ring = mixHex(color, '#f3e2b3', 0.6);
        const dark = shadeHex(color, -0.4);
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const cx = i * t + t / 2;
            const cy = j * t + t / 2;
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.arc(cx, cy, t * 0.42, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = ring;
            ctx.beginPath();
            ctx.arc(cx, cy, t * 0.36, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = color;
            for (let k = 0; k < 8; k++) {
              const a = (k / 8) * Math.PI * 2;
              ctx.beginPath();
              ctx.ellipse(cx + Math.cos(a) * t * 0.2, cy + Math.sin(a) * t * 0.2, t * 0.09, t * 0.04, a, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.arc(cx, cy, t * 0.08, 0, Math.PI * 2);
            ctx.fill();
            // Corner diamonds.
            ctx.fillStyle = ring;
            ctx.beginPath();
            ctx.moveTo(i * t, j * t - t * 0.1);
            ctx.lineTo(i * t + t * 0.1, j * t);
            ctx.lineTo(i * t, j * t + t * 0.1);
            ctx.lineTo(i * t - t * 0.1, j * t);
            ctx.fill();
          }
        }
        speckle(ctx, rng, size, 1500, ['#000000', '#ffffff'], 0.05, 2);
        break;
      }
      case 'sand':
        speckle(ctx, rng, size, 6000, [shadeHex(color, -0.1), shadeHex(color, 0.1), '#ffffff'], 0.35, 2);
        ctx.strokeStyle = shadeHex(color, -0.08);
        ctx.globalAlpha = 0.3;
        for (let i = 0; i < 18; i++) {
          ctx.beginPath();
          const y = rng.float(0, size);
          ctx.moveTo(0, y);
          ctx.bezierCurveTo(size * 0.3, y - 10, size * 0.6, y + 10, size, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        break;
      case 'grass':
        speckle(ctx, rng, size, 9000, [shadeHex(color, -0.18), shadeHex(color, 0.12), '#6fae3a'], 0.6, 3);
        break;
      case 'asphalt':
        speckle(ctx, rng, size, 7000, ['#5a5f63', '#2b2f33', '#7d8286'], 0.4, 2);
        break;
      case 'dark':
        speckle(ctx, rng, size, 2000, ['#000000', '#333333'], 0.3, 2);
        break;
    }
  }
  const texture = new CanvasTexture(el);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export function paintWall(spec: WallSpec, height: number): CanvasTexture {
  const w = 512;
  const h = 512;
  const { el, ctx } = canvas(w, h);
  const rng = createRng(`wall:${spec.style}:${spec.color}`);
  const yOf = (metres: number): number => h - (metres / height) * h;
  if (ctx) {
    ctx.fillStyle = spec.color;
    ctx.fillRect(0, 0, w, h);
    switch (spec.style) {
      case 'paint':
        speckle(ctx, rng, w, 1800, [shadeHex(spec.color, -0.05), shadeHex(spec.color, 0.05)], 0.4, 3);
        break;
      case 'plaster':
        speckle(ctx, rng, w, 4000, [shadeHex(spec.color, -0.18), shadeHex(spec.color, 0.1)], 0.45, 3);
        for (let i = 0; i < 6; i++) {
          const x = rng.float(0, w);
          const g = ctx.createLinearGradient(x, 0, x, h * 0.6);
          g.addColorStop(0, 'rgba(70,55,40,0.25)');
          g.addColorStop(1, 'rgba(70,55,40,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - 10, 0, rng.float(10, 40), h * 0.6);
        }
        break;
      case 'panel':
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = shadeHex(spec.color, i % 2 === 0 ? 0.03 : -0.04);
          ctx.fillRect((i * w) / 8, 0, w / 8 - 2, h);
        }
        break;
      case 'wallpaper': {
        const motif = shadeHex(spec.color, -0.12);
        ctx.fillStyle = motif;
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            const cx = (i + (j % 2) * 0.5) * (w / 4) + w / 8;
            const cy = j * (h / 4) + h / 8;
            ctx.beginPath();
            ctx.ellipse(cx, cy, 14, 28, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(cx, cy, 28, 10, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'brick': {
        const bh = 28;
        const bw = 64;
        for (let row = 0; row * bh < h; row++) {
          for (let col = -1; col * bw < w; col++) {
            ctx.fillStyle = shadeHex(spec.color, rng.float(-0.1, 0.08));
            ctx.fillRect(col * bw + (row % 2) * (bw / 2) + 2, row * bh + 2, bw - 4, bh - 4);
          }
        }
        break;
      }
      case 'tiles':
      case 'none':
        break;
    }
    if (spec.style === 'tiles') {
      const top = yOf(1.3);
      const tile = 26;
      ctx.fillStyle = spec.band ?? '#f2f4f3';
      ctx.fillRect(0, top, w, h - top);
      ctx.strokeStyle = shadeHex(spec.band ?? '#f2f4f3', -0.18);
      ctx.lineWidth = 2;
      for (let x = 0; x <= w; x += tile) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = h; y >= top; y -= tile) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    } else if (spec.band) {
      // Two-tone Lagos paint job: darker lower band with a rail line.
      const top = yOf(0.95);
      ctx.fillStyle = spec.band;
      ctx.fillRect(0, top, w, h - top);
      ctx.fillStyle = shadeHex(spec.band, -0.25);
      ctx.fillRect(0, top - 4, w, 6);
    }
    // Soft darkening towards the floor (bounce-light occlusion).
    const g = ctx.createLinearGradient(0, h * 0.75, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  const texture = new CanvasTexture(el);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}
