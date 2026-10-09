'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three';
import { setProps } from '../../city/lib/mutate';
import type { PortalGeometry } from '../layouts/types';

/** A soft rounded frame with two chevrons pointing "up" the texture (the way through). */
function markerTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 128);
    const glow = ctx.createLinearGradient(0, 0, 0, 128);
    glow.addColorStop(0, 'rgba(255,255,255,0.55)');
    glow.addColorStop(1, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 108, 26);
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const y of [50, 84]) {
      ctx.beginPath();
      ctx.moveTo(100, y + 14);
      ctx.lineTo(128, y - 12);
      ctx.lineTo(156, y + 14);
      ctx.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Danfo-yellow floor markers in front of the doors and stairs that lead to other rooms, chevrons pointing the way
 * through, gently pulsing. One shared geometry and material.
 */
export function PortalMarkers({ portals }: { readonly portals: readonly PortalGeometry[] }) {
  const resources = useMemo(() => {
    const texture = markerTexture();
    return {
      texture,
      geometry: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      material: new MeshBasicMaterial({
        map: texture,
        color: '#f6b90b',
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    };
  }, []);
  useEffect(
    () => () => {
      resources.texture.dispose();
      resources.geometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );
  useFrame(({ clock }) =>
    setProps(resources.material, { opacity: 0.62 + Math.sin(clock.elapsedTime * 2.4) * 0.22 }),
  );
  return (
    <group name="portal-markers">
      {portals
        .filter((portal) => portal.to !== null)
        .map((portal) => (
          <mesh
            key={portal.id}
            geometry={resources.geometry}
            material={resources.material}
            position={[portal.marker.x, 0.016, portal.marker.z]}
            rotation-y={Math.atan2(-portal.inward[0], -portal.inward[1])}
            scale={[portal.marker.across, 1, portal.marker.along]}
            renderOrder={2}
          />
        ))}
    </group>
  );
}
