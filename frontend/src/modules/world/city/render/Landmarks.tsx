'use client';

import type { CityId } from '@insidelife/shared';
import { useEffect, useMemo } from 'react';
import { createCityMaterial } from '../materials/city-materials';
import { buildLandmarkGeometry } from './landmark-geometry';

/**
 * The current city's landmarks (one vertex-coloured draw): Lagos has the airport, stadium, mosque, link-bridge pylon, toll
 * plaza and campus gates; Abuja has Aso Rock and the outcrops, the national mosque and church, the Assembly, Eagle Square
 * and the campus gates. The other city's are not built.
 */
export function Landmarks({ cityId, shadows }: { readonly cityId: CityId; readonly shadows: boolean }) {
  const resources = useMemo(() => ({ geometry: buildLandmarkGeometry(cityId), material: createCityMaterial('props', null) }), [cityId]);
  useEffect(
    () => () => {
      resources.geometry.dispose();
      resources.material.dispose();
    },
    [resources],
  );
  return <mesh geometry={resources.geometry} material={resources.material} castShadow={shadows} receiveShadow />;
}
