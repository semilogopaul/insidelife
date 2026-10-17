import { BufferAttribute, BufferGeometry, CanvasTexture, SRGBColorSpace } from 'three';
import { AIRCRAFT_NAME_MAX, type AircraftLivery } from '../contract';
import { bodyHeight, type AircraftSpec } from './aircraft-spec';

/**
 * The painted name and the `5N-XXX` registration: canvas-texture decals on quads hugging the fuselage (name forward, above
 * the cheatline; registration aft), mirrored so both read nose-to-tail the right way round. One texture, one mesh.
 */

export const DECAL_TEXTURE_SIZE = { width: 1024, height: 256 } as const;
/** The name takes the top half of the texture, the registration the bottom half. */
const NAME_V = [0.5, 1] as const;
const REG_V = [0, 0.5] as const;

export interface DecalQuad {
  readonly kind: 'name' | 'registration';
  readonly side: 'left' | 'right';
  /** Centre along the length, height, and size in metres. */
  readonly z: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Distance out from the centreline. */
  readonly x: number;
}

/** Where the decals go (pure; exported for tests). */
export function decalQuads(spec: AircraftSpec, livery: Pick<AircraftLivery, 'name' | 'registration'>): readonly DecalQuad[] {
  const quads: DecalQuad[] = [];
  const y0 = bodyHeight(spec);
  const F = spec.fuselage;
  const aspect = DECAL_TEXTURE_SIZE.width / (DECAL_TEXTURE_SIZE.height / 2);
  const nameWidth = Math.min(spec.length * 0.36, F.h * 3.6);
  const regWidth = Math.min(spec.length * 0.2, F.h * 2.0);
  const nameZ = spec.cls === 'airliner-jet' ? spec.length * 0.12 : spec.cls === 'piston-single' || spec.cls === 'piston-twin' ? -spec.length * 0.02 : spec.length * 0.1;
  const regZ = -spec.length * 0.33;
  for (const side of ['left', 'right'] as const) {
    const x = (side === 'left' ? 1 : -1) * (F.w / 2 + 0.012);
    if (livery.name.trim()) quads.push({ kind: 'name', side, z: nameZ, y: y0 - F.h * 0.1, width: nameWidth, height: nameWidth / aspect, x });
    if (livery.registration) quads.push({ kind: 'registration', side, z: regZ, y: y0 + F.h * 0.02, width: regWidth, height: regWidth / aspect, x });
  }
  return quads;
}

/** Quads as one geometry (UVs into the decal texture). */
export function buildDecalGeometry(quads: readonly DecalQuad[]): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const quad of quads) {
    const [v0, v1] = quad.kind === 'name' ? NAME_V : REG_V;
    const sign = quad.side === 'left' ? 1 : -1;
    // Left side (+x): the nose is on the viewer's left, so u grows towards the tail (-z). Right side: towards the nose.
    const zNear = quad.z + (quad.width / 2) * sign;
    const zFar = quad.z - (quad.width / 2) * sign;
    const base = positions.length / 3;
    const corners: ReadonlyArray<readonly [number, number, number, number]> = [
      [zNear, quad.y - quad.height / 2, 0, v0],
      [zFar, quad.y - quad.height / 2, 1, v0],
      [zFar, quad.y + quad.height / 2, 1, v1],
      [zNear, quad.y + quad.height / 2, 0, v1],
    ];
    for (const [z, y, u, v] of corners) {
      positions.push(quad.x, y, z);
      normals.push(sign, 0, 0);
      uvs.push(u, v);
    }
    // Both sides wind the same way: reversing z (left) or not (right) already turns the face outward.
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Black or white, whichever reads on `hex`. */
export function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#111111';
  const [r, g, b] = [m[1], m[2], m[3]].map((part) => parseInt(part as string, 16));
  return 0.299 * (r as number) + 0.587 * (g as number) + 0.114 * (b as number) > 150 ? '#111418' : '#fbfbf7';
}

/** Paints the name (top half) and registration (bottom half) onto a 2D context. Exported so it can be tested with a stub. */
export function paintDecals(ctx: CanvasRenderingContext2D, livery: Pick<AircraftLivery, 'base' | 'accent' | 'name' | 'registration'>): void {
  const { width, height } = DECAL_TEXTURE_SIZE;
  ctx.clearRect(0, 0, width, height);
  const ink = inkFor(livery.base);
  const half = height / 2;
  const draw = (text: string, top: number, weight: number, family: string, fill: string): void => {
    if (!text) return;
    let size = half * 0.82;
    ctx.font = `${weight} ${size}px ${family}`;
    const measured = ctx.measureText(text).width;
    const max = width * 0.94;
    if (measured > max) {
      size *= max / measured;
      ctx.font = `${weight} ${size}px ${family}`;
    }
    ctx.fillStyle = fill;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, top + half / 2);
  };
  draw(livery.name.trim().toUpperCase().slice(0, AIRCRAFT_NAME_MAX), 0, 800, '"Anybody", Impact, "Arial Black", sans-serif', ink);
  draw(livery.registration, half, 700, '"Atkinson Hyperlegible Next", Arial, sans-serif', ink);
}

/** The decal texture (browser only). The caller owns and disposes it. */
export function createDecalTexture(livery: Pick<AircraftLivery, 'base' | 'accent' | 'name' | 'registration'>): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = DECAL_TEXTURE_SIZE.width;
  canvas.height = DECAL_TEXTURE_SIZE.height;
  const ctx = canvas.getContext('2d');
  if (ctx) paintDecals(ctx, livery);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
