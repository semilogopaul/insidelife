'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  SphereGeometry,
  type Group,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityUniforms, createCityMaterial } from '../materials/city-materials';
import { SHOWCASE_DECALS, buildShowcaseGeometry, type SiteGeometry } from './showcase-geometry';

/**
 * OBO's estate with AIR OBO on its pad, and Dangote Refinery with its flares. Per site: one vertex-colour mesh (casts
 * shadows), glass (reflective by day, warm-lit at night), a glow mesh (coves, lamps, aviation lights; dim by day) and
 * one text-decal mesh from a canvas atlas. Flames flicker on the flare stacks. ≈ 4–5 draw calls per site.
 */

const ROW_H = 128;

/** The decal atlas: one row per `SHOWCASE_DECALS` entry, text fitted to the row. */
function decalAtlas(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = ROW_H * SHOWCASE_DECALS.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  SHOWCASE_DECALS.forEach((decal, row) => {
    const y = row * ROW_H;
    if (decal.bg) {
      ctx.fillStyle = decal.bg;
      ctx.fillRect(0, y, canvas.width, ROW_H);
    }
    let size = 96;
    const font = (px: number): string => `900 ${px}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    ctx.font = font(size);
    while (ctx.measureText(decal.text).width > canvas.width * 0.92 && size > 20) ctx.font = font((size -= 4));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (decal.outline) {
      ctx.lineWidth = 8;
      ctx.strokeStyle = decal.outline;
      ctx.strokeText(decal.text, canvas.width / 2, y + ROW_H / 2 + 4);
    }
    ctx.fillStyle = decal.fg;
    ctx.fillText(decal.text, canvas.width / 2, y + ROW_H / 2 + 4);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function flameGeometry() {
  const parts = [new ConeGeometry(0.9, 3.4, 10).translate(0, 1.7, 0), new SphereGeometry(0.95, 10, 8).translate(0, 0.3, 0)];
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return merged;
}

export function ShowcaseLandmarks({ shadows }: { readonly shadows: boolean }) {
  const built = useMemo(() => buildShowcaseGeometry(), []);
  const resources = useMemo(() => {
    const map = decalAtlas();
    return {
      opaque: createCityMaterial('props', null),
      glass: new MeshStandardMaterial({ name: 'showcase-glass', color: '#6f93a6', metalness: 0.55, roughness: 0.1, envMapIntensity: 1.6, emissive: new Color('#ffc37a'), emissiveIntensity: 0 }),
      glow: new MeshBasicMaterial({ name: 'showcase-glow', vertexColors: true, toneMapped: false }),
      decal: new MeshStandardMaterial({ name: 'showcase-decals', map, transparent: true, alphaTest: 0.05, roughness: 0.55, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, emissive: new Color('#ffffff'), emissiveMap: map, emissiveIntensity: 0 }),
      flame: new MeshBasicMaterial({ name: 'showcase-flame', color: '#ffb347', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      flameGeometry: flameGeometry(),
      map,
    };
  }, []);
  useEffect(
    () => () => {
      for (const resource of [resources.opaque, resources.glass, resources.glow, resources.decal, resources.flame, resources.flameGeometry, resources.map]) resource?.dispose();
    },
    [resources],
  );

  const flames = useRef<Group>(null);
  useFrame(({ clock }) => {
    const night = cityUniforms.uIlNight.value;
    resources.glass.emissiveIntensity = night * 0.5;
    resources.glow.color.setScalar(0.38 + night * 0.62);
    resources.decal.emissiveIntensity = night * 0.35;
    const group = flames.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.children.forEach((flame, k) => {
      const flicker = 1 + 0.18 * Math.sin(t * 9.1 + k * 2.3) + 0.1 * Math.sin(t * 23.7 + k);
      flame.scale.set(1 + 0.08 * Math.sin(t * 13 + k), flicker * (1 + night * 0.25), 1 + 0.08 * Math.cos(t * 11 + k));
    });
  });

  return (
    <group name="showcase-landmarks">
      {built.estate && <Site name="obo-estate" site={built.estate} resources={resources} shadows={shadows} />}
      {built.refinery && <Site name="dangote-refinery" site={built.refinery} resources={resources} shadows={shadows} />}
      <group ref={flames} name="flares">
        {built.flares.map(([x, y, z]) => (
          <mesh key={`${x},${z}`} position={[x, y, z]} geometry={resources.flameGeometry ?? undefined} material={resources.flame} />
        ))}
      </group>
    </group>
  );
}

interface SiteResources {
  readonly opaque: MeshStandardMaterial;
  readonly glass: MeshStandardMaterial;
  readonly glow: MeshBasicMaterial;
  readonly decal: MeshStandardMaterial;
}

function Site({ name, site, resources, shadows }: { readonly name: string; readonly site: SiteGeometry; readonly resources: SiteResources; readonly shadows: boolean }) {
  return (
    <group name={name}>
      <mesh geometry={site.opaque} material={resources.opaque} castShadow={shadows} receiveShadow />
      {site.glass && <mesh geometry={site.glass} material={resources.glass} />}
      {site.glow && <mesh geometry={site.glow} material={resources.glow} />}
      {site.decals && <mesh geometry={site.decals} material={resources.decal} />}
    </group>
  );
}
