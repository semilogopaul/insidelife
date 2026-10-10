'use client';

import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import { useSnapshot } from '@/common/game/snapshot';
import { useCityKits } from './assets/use-city-kits';
import type { CityPlan } from './layout/placements';
import { useCityPlan, useOwnedLots } from './layout/use-city-plan';
import type { QualityProfile } from './lib/quality';
import { createCityMaterial } from './materials/city-materials';
import { Atmosphere } from './render/Atmosphere';
import { ChunkGrid } from './render/chunks';
import { Ground } from './render/Ground';
import { KitBatch } from './render/KitBatch';
import { OwnedProperties } from './render/OwnedProperties';
import { Roads } from './render/Roads';
import { Sky } from './render/Sky';
import { Water } from './render/Water';
import { CityDetails } from './render/CityDetails';

/**
 * The open-world city: atmosphere, sky, water, ground and the (procedural, four-lane) roads render immediately; the
 * Kenney kits stream in behind (Suspense) and appear as BatchedMeshes culled/LOD-switched per 64 m chunk. Your own
 * land and houses replace whatever stood on their lots.
 */
export function CityScene({ quality }: { readonly quality: QualityProfile }) {
  const plan = useCityPlan();
  const owned = useOwnedLots();
  const character = useSnapshot().data?.character;
  // One chunk grid culls and LOD-switches the roads and every kit batch.
  const grid = useMemo(() => new ChunkGrid(), []);
  useFrame(({ camera }) => grid.update(camera, quality), -1);
  return (
    <>
      <Atmosphere quality={quality} />
      <Sky />
      <Water />
      <Ground plan={plan} shadows={quality.shadows} />
      <Roads grid={grid} />
      <Suspense fallback={null}>
        <CityKits plan={plan} quality={quality} grid={grid} />
      </Suspense>
      <CityDetails plan={plan} quality={quality} />
      {character && owned.length > 0 && <OwnedProperties owned={owned} owner={character} shadows={quality.shadows} />}
    </>
  );
}

function CityKits({ plan, quality, grid }: { readonly plan: CityPlan; readonly quality: QualityProfile; readonly grid: ChunkGrid }) {
  const kits = useCityKits();
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

  // The road surface is procedural (<Roads />): the roads kit only supplies poles, lights and signals.
  const shadows = quality.shadows;
  const common = { grid } as const;
  return (
    <>
      <KitBatch name="street-props-near" variant="near" placements={plan.placements.roads} geometries={kits.roads.geometries} material={materials.roads} castShadow={shadows} {...common} />
      <KitBatch name="street-props-far" variant="far" placements={plan.placements.roads} geometries={kits.roads.geometries} material={materials.roads} {...common} />
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
