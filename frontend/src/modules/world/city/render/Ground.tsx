'use client';

import { useEffect, useMemo } from 'react';
import { DataTexture, RGBAFormat, SRGBColorSpace } from 'three';
import type { CityPlan } from '../layout/placements';
import { createCityMaterial } from '../materials/city-materials';
import { buildGroundGeometry, buildGroundTexture, buildOuterLandGeometry, buildStructureGeometry } from './ground-geometry';

/** Lots, yards, beaches (textured ground) + kerbs, quay walls, bridge decks and compound walls (vertex colours). */
export function Ground({ plan, shadows }: { readonly plan: CityPlan; readonly shadows: boolean }) {
  const ground = useMemo(() => {
    const texture = buildGroundTexture(plan);
    return { geometry: buildGroundGeometry(), texture, material: createCityMaterial('ground', texture) };
  }, [plan]);
  const structures = useMemo(() => ({ geometry: buildStructureGeometry(plan), material: createCityMaterial('props', null) }), [plan]);
  const outer = useMemo(() => {
    const texture = new DataTexture(new Uint8Array([131, 140, 88, 255]), 1, 1, RGBAFormat);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return { geometry: buildOuterLandGeometry(), texture, material: createCityMaterial('ground', texture) };
  }, []);

  useEffect(
    () => () => {
      ground.geometry.dispose();
      ground.texture.dispose();
      ground.material.dispose();
      structures.geometry.dispose();
      structures.material.dispose();
      outer.geometry.dispose();
      outer.texture.dispose();
      outer.material.dispose();
    },
    [ground, structures, outer],
  );

  return (
    <>
      <mesh geometry={ground.geometry} material={ground.material} receiveShadow />
      <mesh geometry={structures.geometry} material={structures.material} receiveShadow castShadow={shadows} />
      <mesh geometry={outer.geometry} material={outer.material} receiveShadow />
    </>
  );
}
