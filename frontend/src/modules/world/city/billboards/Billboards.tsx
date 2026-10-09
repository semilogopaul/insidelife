'use client';

import { CITY_MAP, cellKindAt, type BillboardWorldPlacement } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CanvasTexture, Color, Matrix4, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, TextureLoader, type BufferGeometry, type Texture } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { atmosphereFrame } from '../lib/atmosphere-frame';
import { createCityMaterial } from '../materials/city-materials';
import { WATER_Y } from '../render/ground-geometry';
import { paint } from '../render/paint';
import { currentBillboard, houseAdFor, type HouseAdContent } from './billboard-content';
import { useLiveBillboards } from './use-billboards';
import { setProps } from '../lib/mutate';

/**
 * Billboard structures at the promotions slots (poles, gantries, wall and rooftop frames — one draw call) and their
 * faces (one mesh per board, frustum-culled), showing live creatives in rotation or a Danfo-yellow house ad.
 * Faces carry `userData.billboardSlotId` for the play layer's tap raycasts; the world never handles taps itself.
 */

const STEEL = 0x3b3f44;
const PANEL = 0x26282b;
const CATWALK = 0x5b6067;

function faceMatrix(placement: BillboardWorldPlacement): Matrix4 {
  const dx = Math.cos(placement.facing);
  const dz = Math.sin(placement.facing);
  return new Matrix4().makeRotationY(Math.atan2(dx, dz)).setPosition(placement.position.x, 0, placement.position.z);
}

function frameGeometry(placements: readonly BillboardWorldPlacement[]): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number, m: Matrix4): void => {
    parts.push(paint(new BoxGeometry(w, h, d).translate(x, y + h / 2, z), hex).applyMatrix4(m));
  };
  for (const placement of placements) {
    const m = faceMatrix(placement);
    const { width: w, height: h, elevation: e } = placement;
    const ground = cellKindAt(placement.position) === 'water' ? WATER_Y - 1 : 0;
    box(w + 0.5, h + 0.5, 0.25, 0, e - 0.25, -0.2, PANEL, m);
    switch (placement.mount) {
      case 'pole':
        box(0.55, e - ground, 0.55, 0, ground, -0.6, STEEL, m);
        box(w * 0.6, 0.3, 0.3, 0, e - 0.6, -0.45, STEEL, m);
        box(w, 0.08, 0.9, 0, e - 0.35, 0.2, CATWALK, m);
        break;
      case 'gantry':
        for (const side of [-1, 1]) box(0.45, e + h + 0.3, 0.45, side * (w / 2 + 0.7), 0.2, -0.2, STEEL, m);
        box(w + 1.9, 0.4, 0.4, 0, e + h + 0.1, -0.2, STEEL, m);
        box(w + 1.9, 0.35, 0.35, 0, e - 0.6, -0.2, STEEL, m);
        break;
      case 'roof':
        for (const side of [-1, 1]) box(0.3, 3.2, 0.3, side * w * 0.33, e - 3, -0.5, STEEL, m);
        break;
      case 'wall':
        break;
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged ?? new BoxGeometry(0, 0, 0);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Canvas house ad: Danfo yellow, the double stripe, "Your ad here" and the slot's price. */
export function drawHouseAd(placement: Pick<BillboardWorldPlacement, 'width' | 'height'>, content: Omit<HouseAdContent, 'kind' | 'slotId'>): CanvasTexture {
  const ratio = placement.width / placement.height;
  const canvas = document.createElement('canvas');
  canvas.width = ratio >= 1 ? 768 : 512;
  canvas.height = Math.round(canvas.width / ratio);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const css = getComputedStyle(document.documentElement);
    const display = `${css.getPropertyValue('--font-anybody').trim() || "'Arial Narrow'"}, Arial, sans-serif`;
    const body = `${css.getPropertyValue('--font-atkinson').trim() || 'Arial'}, Arial, sans-serif`;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#f6b90b';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0e2733';
    const stripe = Math.max(6, Math.round(H * 0.035));
    ctx.fillRect(0, H - stripe * 3.4, W, stripe);
    ctx.fillRect(0, H - stripe * 1.6, W, stripe);
    const pad = Math.round(W * 0.06);
    let size = Math.round(Math.min(H * (ratio >= 1.5 ? 0.3 : 0.16), W * 0.14));
    ctx.font = `900 ${size}px ${display}`;
    while (ctx.measureText(content.headline).width > W - pad * 2 && size > 18) {
      size -= 2;
      ctx.font = `900 ${size}px ${display}`;
    }
    ctx.textBaseline = 'top';
    const top = ratio >= 1.5 ? H * 0.16 : H * 0.18;
    ctx.fillText(content.headline, pad, top);
    // Body: up to two lines, shrinking until it fits the board.
    let bodySize = Math.round(size * 0.42);
    let lines: string[] = [];
    for (; bodySize >= 12; bodySize -= 2) {
      ctx.font = `700 ${bodySize}px ${body}`;
      lines = wrapLines(ctx, content.body, W - pad * 2);
      if (lines.length <= 2) break;
    }
    lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, pad, top + size * 1.08 + i * bodySize * 1.2));
    if (content.priceLabel) {
      const label = content.priceLabel;
      ctx.font = `800 ${Math.round(size * 0.36)}px ${body}`;
      const lw = ctx.measureText(label).width + size * 0.5;
      const lh = size * 0.62;
      const lx = pad;
      const ly = H - stripe * 4.2 - lh;
      ctx.fillStyle = '#0e2733';
      ctx.beginPath();
      ctx.roundRect(lx, ly, lw, lh, lh / 2);
      ctx.fill();
      ctx.fillStyle = '#f6b90b';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + size * 0.25, ly + lh / 2 + 1);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

interface Board {
  readonly placement: BillboardWorldPlacement;
  readonly geometry: PlaneGeometry;
  readonly material: MeshStandardMaterial;
  readonly house: CanvasTexture;
  readonly position: readonly [number, number, number];
  readonly yaw: number;
}

/** The texture a board should show for its current content (starts loading creatives on first sight). */
export function boardTexture(content: ReturnType<typeof currentBillboard>, house: Texture, cache: Map<string, Texture | 'loading' | 'failed'>): Texture {
  if (content.kind !== 'creative') return house;
  const cached = cache.get(content.imageUrl);
  if (cached === undefined) {
    cache.set(content.imageUrl, 'loading');
    new TextureLoader().setCrossOrigin('anonymous').load(
      content.imageUrl,
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = 4;
        cache.set(content.imageUrl, texture);
      },
      undefined,
      () => cache.set(content.imageUrl, 'failed'),
    );
    return house;
  }
  return typeof cached === 'string' ? house : cached;
}

export function Billboards({ shadows }: { readonly shadows: boolean }) {
  const placements = CITY_MAP.billboards;
  const { data: live } = useLiveBillboards();
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  const frame = useMemo(() => ({ geometry: frameGeometry(placements), material: createCityMaterial('props', null) }), [placements]);
  const boards = useMemo<readonly Board[]>(
    () =>
      placements.map((placement) => {
        const house = drawHouseAd(placement, houseAdFor(placement.slotId));
        const material = new MeshStandardMaterial({ map: house, emissiveMap: house, emissive: new Color('#ffffff'), emissiveIntensity: 0.15, roughness: 0.6 });
        const dx = Math.cos(placement.facing);
        const dz = Math.sin(placement.facing);
        const position = [placement.position.x + dx * 0.01, placement.elevation + placement.height / 2, placement.position.z + dz * 0.01] as const;
        return { placement, geometry: new PlaneGeometry(placement.width, placement.height), material, house, position, yaw: Math.atan2(dx, dz) };
      }),
    [placements],
  );
  const creatives = useRef(new Map<string, Texture | 'loading' | 'failed'>());

  // Server-provided house-ad copy (headline/price) replaces the defaults once it arrives.
  useEffect(() => {
    if (!live) return;
    for (const board of boards) {
      const fresh = drawHouseAd(board.placement, houseAdFor(board.placement.slotId, live));
      const old = board.house.image as HTMLCanvasElement;
      const ctx = old.getContext('2d');
      ctx?.drawImage(fresh.image as HTMLCanvasElement, 0, 0, old.width, old.height);
      setProps(board.house, { needsUpdate: true });
      fresh.dispose();
    }
  }, [live, boards]);

  useEffect(() => {
    const textures = creatives.current;
    return () => {
      frame.geometry.dispose();
      frame.material.dispose();
      for (const board of boards) {
        board.geometry.dispose();
        board.material.dispose();
        board.house.dispose();
      }
      for (const texture of textures.values()) if (typeof texture !== 'string') texture.dispose();
      textures.clear();
    };
  }, [frame, boards]);

  const elapsed = useRef(1);
  useFrame((_, delta) => {
    const night = atmosphereFrame.night;
    elapsed.current += delta;
    for (const board of boards) setProps(board.material, { emissiveIntensity: 0.12 + night * 0.85 });
    if (elapsed.current < 0.5) return;
    elapsed.current = 0;
    const now = Date.now();
    for (const board of boards) {
      const content = currentBillboard(board.placement.slotId, liveRef.current, now);
      const map = boardTexture(content, board.house, creatives.current);
      if (board.material.map !== map) setProps(board.material, { map, emissiveMap: map, needsUpdate: true });
    }
  });

  return (
    <>
      <mesh geometry={frame.geometry} material={frame.material} castShadow={shadows} receiveShadow />
      {boards.map((board) => (
        <mesh
          key={board.placement.slotId}
          position={board.position}
          rotation-y={board.yaw}
          geometry={board.geometry}
          material={board.material}
          userData={{ billboardSlotId: board.placement.slotId }}
          name={`billboard:${board.placement.slotId}`}
        />
      ))}
    </>
  );
}
