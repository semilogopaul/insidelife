'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  PointsMaterial,
  SRGBColorSpace,
  type InstancedMesh,
  type Points,
} from 'three';
import type { LampSpot } from '../layout/placements';
import { PAVEMENT_Y } from '../layout/placements';
import { atmosphereFrame } from '../lib/atmosphere-frame';
import { setProps } from '../lib/mutate';

/**
 * Night street lighting without real lights: an additive glow sprite at every lamp head (one Points draw) and a
 * soft pool of light on the road below (one instanced draw). Both fade with `night` and switch off by day.
 */

function radialTexture(inner: string, outer: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(0.35, outer);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const WARM = new Color('#ffb15a');
const COOL = new Color('#eaf2ff');

export function StreetLights({ lamps }: { readonly lamps: readonly LampSpot[] }) {
  const glowRef = useRef<Points>(null);
  const pools = useRef<InstancedMesh>(null);

  const resources = useMemo(() => {
    const positions = new Float32Array(lamps.length * 3);
    const colors = new Float32Array(lamps.length * 3);
    lamps.forEach((lamp, i) => {
      positions.set([lamp.x, lamp.y, lamp.z], i * 3);
      const color = lamp.warm ? WARM : COOL;
      colors.set([color.r, color.g, color.b], i * 3);
    });
    const glowGeometry = new BufferGeometry();
    glowGeometry.setAttribute('position', new BufferAttribute(positions, 3));
    glowGeometry.setAttribute('color', new BufferAttribute(colors, 3));
    glowGeometry.computeBoundingSphere();
    const glowTexture = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)');
    const glowMaterial = new PointsMaterial({
      size: 4.2,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
    });
    const poolTexture = radialTexture('rgba(255,200,140,0.9)', 'rgba(255,170,90,0.3)');
    const poolMaterial = new MeshBasicMaterial({
      map: poolTexture,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });
    const poolGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    return { glowGeometry, glowTexture, glowMaterial, poolTexture, poolMaterial, poolGeometry };
  }, [lamps]);

  useEffect(() => {
    const mesh = pools.current;
    if (!mesh) return;
    const matrix = new Matrix4();
    lamps.forEach((lamp, i) => {
      matrix.makeScale(13, 1, 13).setPosition(lamp.x, PAVEMENT_Y + 0.06, lamp.z);
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, lamp.warm ? WARM : COOL);
    });
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [lamps]);

  useEffect(
    () => () => {
      for (const resource of Object.values(resources)) resource.dispose();
    },
    [resources],
  );

  useFrame(() => {
    const night = atmosphereFrame.night;
    const on = night > 0.2;
    if (glowRef.current) glowRef.current.visible = on;
    if (pools.current) pools.current.visible = on;
    setProps(resources.glowMaterial, { opacity: Math.min(1, (night - 0.2) * 1.6) });
    setProps(resources.poolMaterial, { opacity: Math.min(0.55, (night - 0.2) * 0.9) * (1 + atmosphereFrame.wet * 0.4) });
  });

  return (
    <>
      <points ref={glowRef} geometry={resources.glowGeometry} material={resources.glowMaterial} renderOrder={3} />
      <instancedMesh ref={pools} args={[resources.poolGeometry, resources.poolMaterial, lamps.length]} renderOrder={3} frustumCulled />
    </>
  );
}
