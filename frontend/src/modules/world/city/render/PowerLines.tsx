'use client';

import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, LineBasicMaterial } from 'three';

/** Sagging overhead cables between street poles (two conductors per span), one line draw for the city. */
export function PowerLines({ wires }: { readonly wires: readonly (readonly (readonly [number, number, number])[])[] }) {
  const resources = useMemo(() => {
    const points: number[] = [];
    const SEGMENTS = 8;
    for (const chain of wires) {
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1] as readonly [number, number, number];
        const b = chain[i] as readonly [number, number, number];
        const dx = b[0] - a[0];
        const dz = b[2] - a[2];
        const length = Math.hypot(dx, dz) || 1;
        // Conductors hang off the cross-arm ends, perpendicular to the street.
        const px = (-dz / length) * 0.75;
        const pz = (dx / length) * 0.75;
        for (const side of [-1, 1]) {
          for (let s = 0; s < SEGMENTS; s++) {
            for (const t of [s / SEGMENTS, (s + 1) / SEGMENTS]) {
              const sag = Math.sin(t * Math.PI) * 0.9;
              points.push(a[0] + dx * t + px * side, a[1] + (b[1] - a[1]) * t - sag, a[2] + dz * t + pz * side);
            }
          }
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
    geometry.computeBoundingSphere();
    const material = new LineBasicMaterial({ color: '#1b1a19', transparent: true, opacity: 0.85 });
    return { geometry, material };
  }, [wires]);

  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );

  return <lineSegments geometry={resources.geometry} material={resources.material} />;
}
