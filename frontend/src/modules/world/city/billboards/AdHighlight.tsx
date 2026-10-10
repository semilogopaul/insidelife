'use client';

import { adSpotGeometry, type AdSpotGeometry } from '@insidelife/shared';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, ConeGeometry, Mesh, MeshBasicMaterial, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { activeAdHighlight } from '@/common/promotions/ad-focus';
import { setProps } from '../lib/mutate';

/**
 * "See it in Lagos": when the player arrives at a board (or asks to see it), `useAdFocus` names it for a few seconds and
 * this draws a pulsing Danfo-yellow frame round its face with a marker above it. One mesh for the whole city, rebuilt
 * for the board in focus and hidden otherwise (no draw call), so it works for every premium board and street spot,
 * including empty faces that only exist as instances. Boards with their own material also glow (`highlightGlow`).
 */

const DANFO = new Color('#f6b90b');
const BRIGHT = new Color('#ffffff');

let reducedQuery: MediaQueryList | null = null;

/** The player's OS asks for reduced motion (live; cheap to read per frame). */
export function prefersReducedMotion(): boolean {
  try {
    reducedQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
    return reducedQuery.matches;
  } catch {
    return false;
  }
}

/** Highlight strength 0–1 right now: fades in and out, pulsing about once a second unless motion is reduced. */
export function highlightStrength(progress: number, elapsedSeconds: number, reducedMotion: boolean): number {
  const fade = Math.max(0, Math.min(1, progress / 0.04, (1 - progress) / 0.2));
  const pulse = reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(elapsedSeconds * 6.3);
  return fade * pulse;
}

/** Extra emissive intensity for a highlighted board with its own material (0 when it isn't the one in focus). */
export function highlightGlow(slotId: string, elapsedSeconds: number): number {
  const active = activeAdHighlight();
  return active?.slotId === slotId ? 0.9 * highlightStrength(active.progress, elapsedSeconds, prefersReducedMotion()) : 0;
}

/**
 * Frame and marker in the face's local frame (x along the face, y up from its bottom edge, +z towards viewers). Two-sided
 * spots get a frame deep enough to wrap both faces.
 */
export function highlightGeometry(spot: Pick<AdSpotGeometry, 'width' | 'height' | 'doubleSided'>): BufferGeometry {
  const { width: w, height: h } = spot;
  const border = Math.min(0.8, Math.max(0.18, Math.min(w, h) * 0.13));
  const depth = spot.doubleSided ? 0.55 : 0.14;
  const z = spot.doubleSided ? -0.07 : 0.08;
  const marker = Math.min(1.8, Math.max(0.4, w * 0.09));
  const parts = [
    new BoxGeometry(w + border * 2, border, depth).translate(0, h + border / 2, z),
    new BoxGeometry(w + border * 2, border, depth).translate(0, -border / 2, z),
    new BoxGeometry(border, h, depth).translate(-(w + border) / 2, h / 2, z),
    new BoxGeometry(border, h, depth).translate((w + border) / 2, h / 2, z),
    // A downward marker above the board, visible from further away than the frame.
    new ConeGeometry(marker, marker * 1.5, 4).rotateX(Math.PI).translate(0, h + border + marker * 1.3, z),
  ];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged ?? new BoxGeometry(0, 0, 0);
}

export function AdHighlight() {
  const mesh = useMemo(() => {
    const material = new MeshBasicMaterial({ color: DANFO.clone(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const object = new Mesh<BufferGeometry, MeshBasicMaterial>(new BoxGeometry(0, 0, 0), material);
    object.visible = false;
    object.renderOrder = 4;
    object.name = 'ad-highlight';
    return { object, material };
  }, []);
  const shown = useRef<string | null>(null);

  useEffect(
    () => () => {
      mesh.object.geometry.dispose();
      mesh.material.dispose();
    },
    [mesh],
  );

  useFrame(({ clock }) => {
    const { object, material } = mesh;
    const active = activeAdHighlight();
    if (active?.slotId !== shown.current) {
      shown.current = active?.slotId ?? null;
      const spot = active ? adSpotGeometry(active.slotId) : null;
      object.geometry.dispose();
      setProps(object, { geometry: spot ? highlightGeometry(spot) : new BoxGeometry(0, 0, 0) });
      if (spot) {
        object.position.set(spot.position.x, spot.elevation, spot.position.z);
        object.rotation.set(0, Math.atan2(Math.cos(spot.facing), Math.sin(spot.facing)), 0);
      }
      setProps(object, { visible: spot !== null });
    }
    if (!active || !object.visible) return;
    const strength = highlightStrength(active.progress, clock.elapsedTime, prefersReducedMotion());
    material.color.lerpColors(DANFO, BRIGHT, strength);
    setProps(material, { opacity: Math.min(1, 0.15 + strength) });
  });

  return <primitive object={mesh.object} />;
}
