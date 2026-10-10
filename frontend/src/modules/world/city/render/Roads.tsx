'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BatchedMesh } from 'three';
import { disposeLater, keepAlive } from '../lib/deferred-dispose';
import { createCityMaterial } from '../materials/city-materials';
import { liveBatches } from './batch-registry';
import { chunkOf, type ChunkGrid } from './chunks';
import { buildRoadChunks, buildRoadPalette } from './road-geometry';

/**
 * The four-lane roads, junctions, roundabout and bridge parapets: one BatchedMesh (one draw call) with a geometry per
 * 64 m chunk, shown or hidden with the chunk grid like the kits, so far roads cost nothing. Receives shadows.
 */
export function Roads({ grid }: { readonly grid: ChunkGrid }) {
  const roads = useMemo(() => {
    const palette = buildRoadPalette();
    const material = createCityMaterial('roads', palette);
    const chunks = buildRoadChunks(chunkOf);
    let vertices = 0;
    let indices = 0;
    for (const { geometry } of chunks) {
      vertices += geometry.getAttribute('position').count;
      indices += geometry.getIndex()?.count ?? 0;
    }
    const batch = new BatchedMesh(chunks.length, vertices, indices, material);
    batch.name = 'city-roads';
    batch.perObjectFrustumCulled = false;
    batch.sortObjects = false;
    const instances = chunks.map(({ chunk, geometry }) => {
      const instance = batch.addInstance(batch.addGeometry(geometry));
      batch.setVisibleAt(instance, false);
      geometry.dispose();
      return { chunk, instance };
    });
    batch.computeBoundingBox();
    batch.computeBoundingSphere();
    return { palette, material, batch, instances };
  }, []);
  const appliedVersion = useRef(-1);

  useEffect(() => {
    keepAlive(roads.batch);
    appliedVersion.current = -1;
    if (process.env.NODE_ENV !== 'production') liveBatches.add(roads.batch);
    return () => {
      liveBatches.delete(roads.batch);
      disposeLater(roads.batch, () => {
        roads.batch.dispose();
        roads.material.dispose();
        roads.palette.dispose();
      });
    };
  }, [roads]);

  useFrame(() => {
    if (appliedVersion.current === grid.version) return;
    appliedVersion.current = grid.version;
    for (const { chunk, instance } of roads.instances) roads.batch.setVisibleAt(instance, (grid.states[chunk] ?? 0) !== 0);
  });

  return <primitive object={roads.batch} receiveShadow />;
}
