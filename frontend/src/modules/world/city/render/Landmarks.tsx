'use client';

import { useEffect, useMemo } from 'react';
import { createCityMaterial } from '../materials/city-materials';
import { buildLandmarkGeometry } from './landmark-geometry';

/** Airport, stadium, mosque, link-bridge pylon, toll plaza and campus gates (one vertex-coloured draw). */
export function Landmarks({ shadows }: { readonly shadows: boolean }) {
  const resources = useMemo(() => ({ geometry: buildLandmarkGeometry(), material: createCityMaterial('props', null) }), []);
  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );
  return <mesh geometry={resources.geometry} material={resources.material} castShadow={shadows} receiveShadow />;
}
