'use client';

import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { useCityKits } from './assets/use-city-kits';
import { cityPlan, type CityPlan } from './layout/placements';
import type { QualityProfile } from './lib/quality';
import { createCityMaterial } from './materials/city-materials';
import { Atmosphere } from './render/Atmosphere';
import { ChunkGrid } from './render/chunks';
import { Ground } from './render/Ground';
import { KitBatch } from './render/KitBatch';
import { Sky } from './render/Sky';
import { Water } from './render/Water';
import { CityDetails } from './render/CityDetails';

/**
 * The open-world city: atmosphere, sky, water and ground render immediately; the Kenney kits stream in behind
 * (Suspense) and appear as five BatchedMeshes culled/LOD-switched per 64 m chunk.
 */
export function CityScene({ quality }: { readonly quality: QualityProfile }) {
  const plan = useMemo(() => cityPlan(), []);
  return (
    <>
      <Atmosphere quality={quality} />
      <Sky />
      <Water />
      <Ground plan={plan} shadows={quality.shadows} />
      <Suspense fallback={null}>
        <CityKits plan={plan} quality={quality} />
      </Suspense>
      <CityDetails plan={plan} quality={quality} />
    </>
  );
}

function CityKits({ plan, quality }: { readonly plan: CityPlan; readonly quality: QualityProfile }) {
  const kits = useCityKits();
  const grid = useMemo(() => new ChunkGrid(), []);
  const materials = useMemo(
    () => ({
      commercial: createCityMaterial('buildings', kits.commercial.map),
      suburban: createCityMaterial('buildings', kits.suburban.map),
      roads: createCityMaterial('roads', kits.roads.map),
      nature: createCityMaterial('foliage', null),
      vehicles: createCityMaterial('vehicles', kits.vehicles.map),
    }),
    [kits],
  );
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);

  useFrame(({ camera }) => grid.update(camera, quality), -1);

  // Flat road tiles never cast shadows; poles, lights and signs do.
  const roads = useMemo(() => {
    const tiles = plan.placements.roads.filter((placement) => placement.model.startsWith('road-'));
    const props = plan.placements.roads.filter((placement) => !placement.model.startsWith('road-'));
    return { tiles, props };
  }, [plan]);

  const shadows = quality.shadows;
  const common = { grid } as const;
  return (
    <>
      <KitBatch name="road-tiles" placements={roads.tiles} geometries={kits.roads.geometries} material={materials.roads} {...common} />
      <KitBatch name="street-props-near" variant="near" placements={roads.props} geometries={kits.roads.geometries} material={materials.roads} castShadow={shadows} {...common} />
      <KitBatch name="street-props-far" variant="far" placements={roads.props} geometries={kits.roads.geometries} material={materials.roads} {...common} />
      {/* Buildings: full detail near the camera (casting shadows), simplified LODs further out (no shadow pass). */}
      <KitBatch name="commercial-near" variant="near" placements={plan.placements.commercial} geometries={kits.commercial.geometries} material={materials.commercial} castShadow={shadows} {...common} />
      <KitBatch name="commercial-far" variant="far" placements={plan.placements.commercial} geometries={kits.commercial.geometries} material={materials.commercial} {...common} />
      <KitBatch name="suburban-near" variant="near" placements={plan.placements.suburban} geometries={kits.suburban.geometries} material={materials.suburban} castShadow={shadows} {...common} />
      <KitBatch name="suburban-far" variant="far" placements={plan.placements.suburban} geometries={kits.suburban.geometries} material={materials.suburban} {...common} />
      <KitBatch name="nature-near" variant="near" placements={plan.placements.nature} geometries={kits.nature.geometries} material={materials.nature} castShadow={shadows} {...common} />
      <KitBatch name="nature-far" variant="far" placements={plan.placements.nature} geometries={kits.nature.geometries} material={materials.nature} {...common} />
      <KitBatch name="vehicles-near" variant="near" placements={plan.placements.vehicles} geometries={kits.vehicles.geometries} material={materials.vehicles} castShadow={shadows} {...common} />
      <KitBatch name="vehicles-far" variant="far" placements={plan.placements.vehicles} geometries={kits.vehicles.geometries} material={materials.vehicles} {...common} />
    </>
  );
}
