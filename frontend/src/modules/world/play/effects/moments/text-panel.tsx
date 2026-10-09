'use client';

import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { CanvasTexture, DoubleSide, SRGBColorSpace, type Mesh, type MeshBasicMaterial } from 'three';
import type { Vec3 } from './anchors';

export interface TextPanelStyle {
  readonly bg: string;
  readonly fg: string;
  /** Small line above the big one. */
  readonly kicker?: string;
  readonly kickerColor?: string;
  /** Pixels across the canvas (aspect follows the panel size). */
  readonly resolution?: number;
}

/** Fit the biggest bold font that keeps `text` within `maxWidth`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxSize: number): number {
  let size = maxSize;
  ctx.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
  while (size > 12 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
  }
  return size;
}

function paint(lines: readonly string[], size: readonly [number, number], style: TextPanelStyle): CanvasTexture {
  const width = style.resolution ?? 1024;
  const height = Math.max(64, Math.round((width * size[1]) / size[0]));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = style.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const kickerHeight = style.kicker ? height * 0.24 : 0;
    if (style.kicker) {
      ctx.fillStyle = style.kickerColor ?? style.fg;
      fitFont(ctx, style.kicker, width * 0.9, kickerHeight * 0.75);
      ctx.fillText(style.kicker, width / 2, kickerHeight * 0.6);
    }
    const rows = lines.length || 1;
    const rowHeight = (height - kickerHeight) / rows;
    lines.forEach((line, index) => {
      ctx.fillStyle = style.fg;
      fitFont(ctx, line, width * 0.92, rowHeight * (index === 0 ? 0.78 : 0.5));
      ctx.fillText(line, width / 2, kickerHeight + rowHeight * (index + 0.5));
    });
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export interface TextPanelProps {
  readonly lines: readonly string[];
  readonly size: readonly [number, number];
  readonly position: Vec3;
  readonly rotY?: number;
  readonly style: TextPanelStyle;
  /** Hue-shift flash (LED wall); off for reduced motion. */
  readonly flash?: boolean;
  /** Always face the camera (name tags floating in the room). */
  readonly billboard?: boolean;
  /** Fade in over this many seconds from mount. */
  readonly fadeIn?: number;
}

/** A glowing text panel (LED wall, VIP sign, floating tag): one canvas texture, one draw call. */
export function TextPanel({ lines, size, position, rotY = 0, style, flash = false, billboard = false, fadeIn = 0.35 }: TextPanelProps) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const key = `${lines.join('\n')}|${style.bg}|${style.fg}|${style.kicker ?? ''}|${size.join('x')}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures every input that changes the painting
  const texture = useMemo(() => paint(lines, size, style), [key]);
  useLayoutEffect(() => () => texture.dispose(), [texture]);
  const age = useRef(0);

  useFrame(({ camera, clock }, delta) => {
    const node = mesh.current;
    const surface = material.current;
    if (!node || !surface) return;
    age.current += delta;
    surface.opacity = fadeIn > 0 ? Math.min(1, age.current / fadeIn) : 1;
    if (flash) surface.color.setHSL((clock.elapsedTime * 0.25) % 1, 0.6, 0.75);
    if (billboard) node.quaternion.copy(camera.quaternion);
  });

  return (
    <mesh ref={mesh} position={[position[0], position[1], position[2]]} rotation={billboard ? undefined : [0, rotY, 0]} renderOrder={10}>
      <planeGeometry args={[size[0], size[1]]} />
      <meshBasicMaterial ref={material} map={texture} transparent side={DoubleSide} toneMapped={false} opacity={0} />
    </mesh>
  );
}
