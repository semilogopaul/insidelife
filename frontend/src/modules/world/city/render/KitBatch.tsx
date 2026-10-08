'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { BatchedMesh, Color, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material } from 'three';
import type { Placement } from '../layout/placements';
import { disposeLater, keepAlive } from '../lib/deferred-dispose';
import { liveBatches } from './batch-registry';
import { CHUNK_COUNT, chunkOf, type ChunkGrid } from './chunks';

/**
 * One kit = one BatchedMesh = one draw call (multi-draw). Geometry is stored once per model; instances are culled
 * and LOD-switched per 64 m chunk (ChunkGrid) instead of per object, so the per-frame CPU cost is a version check.
 */

/** `all`: every chunk, LOD-switched; `near`: full-detail chunks only; `far`: simplified chunks only (LOD geometry). */
export type BatchVariant = 'all' | 'near' | 'far';

interface KitBatchProps {
  readonly name: string;
  readonly variant?: BatchVariant;
  readonly placements: readonly Placement[];
  readonly geometries: ReadonlyMap<string, BufferGeometry>;
  readonly material: Material;
  readonly grid: ChunkGrid;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

interface BatchState {
  readonly batch: BatchedMesh;
  readonly byChunk: readonly (readonly number[])[];
  readonly fullId: Int32Array;
  readonly lodId: Int32Array;
}

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();
const euler = new Euler();
const tint = new Color();

const lodName = (placement: Placement, geometries: ReadonlyMap<string, BufferGeometry>): string | null =>
  placement.lod && geometries.has(`${placement.model}__lod`) ? `${placement.model}__lod` : null;

function buildBatch(name: string, variant: BatchVariant, placements: readonly Placement[], geometries: ReadonlyMap<string, BufferGeometry>, material: Material): BatchState | null {
  const usable = placements.filter((placement) => geometries.has(placement.model));
  if (usable.length === 0) return null;
  // The model each instance shows by default in this variant.
  const primary = (placement: Placement): string => (variant === 'far' ? (lodName(placement, geometries) ?? placement.model) : placement.model);
  const models = new Set<string>();
  for (const placement of usable) {
    models.add(primary(placement));
    const lod = lodName(placement, geometries);
    if (variant === 'all' && lod) models.add(lod);
  }
  let vertexCount = 0;
  let indexCount = 0;
  for (const model of models) {
    const geometry = geometries.get(model) as BufferGeometry;
    vertexCount += geometry.getAttribute('position').count;
    indexCount += geometry.getIndex()?.count ?? 0;
  }
  const batch = new BatchedMesh(usable.length, vertexCount, indexCount, material);
  batch.name = `city-${name}`;
  batch.perObjectFrustumCulled = false;
  batch.sortObjects = false;
  const geometryIds = new Map<string, number>();
  for (const model of models) geometryIds.set(model, batch.addGeometry(geometries.get(model) as BufferGeometry));

  const byChunk: number[][] = Array.from({ length: CHUNK_COUNT }, () => []);
  const fullId = new Int32Array(usable.length);
  const lodId = new Int32Array(usable.length).fill(-1);
  for (const placement of usable) {
    const geometryId = geometryIds.get(primary(placement)) as number;
    const instance = batch.addInstance(geometryId);
    position.set(placement.x, placement.y, placement.z);
    quaternion.setFromEuler(euler.set(0, placement.yaw, 0));
    scale.set(placement.sx, placement.sy, placement.sz);
    batch.setMatrixAt(instance, matrix.compose(position, quaternion, scale));
    batch.setColorAt(instance, tint.setHex(placement.tint));
    fullId[instance] = geometryId;
    const lod = variant === 'all' ? geometryIds.get(`${placement.model}__lod`) : undefined;
    if (lod !== undefined) lodId[instance] = lod;
    (byChunk[chunkOf(placement.x, placement.z)] as number[]).push(instance);
    batch.setVisibleAt(instance, false);
  }
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
  return { batch, byChunk, fullId, lodId };
}

export function KitBatch({ name, variant = 'all', placements, geometries, material, grid, castShadow = false, receiveShadow = true }: KitBatchProps) {
  const state = useMemo(() => buildBatch(name, variant, placements, geometries, material), [name, variant, placements, geometries, material]);
  const applied = useRef(new Uint8Array(CHUNK_COUNT));
  const appliedVersion = useRef(-1);

  useEffect(() => {
    if (!state) return;
    keepAlive(state.batch);
    applied.current.fill(0);
    appliedVersion.current = -1;
    if (process.env.NODE_ENV !== 'production') liveBatches.add(state.batch);
    return () => {
      liveBatches.delete(state.batch);
      disposeLater(state.batch, () => state.batch.dispose());
    };
  }, [state]);

  useFrame(() => {
    if (!state || appliedVersion.current === grid.version) return;
    appliedVersion.current = grid.version;
    const { batch, byChunk, fullId, lodId } = state;
    for (let chunk = 0; chunk < CHUNK_COUNT; chunk++) {
      const state = grid.states[chunk] as number;
      // Per variant: near shows full-detail chunks (1), far shows simplified chunks (2), all shows both.
      const next = variant === 'near' ? (state === 1 ? 1 : 0) : variant === 'far' ? (state === 2 ? 2 : 0) : state;
      if (applied.current[chunk] === next) continue;
      applied.current[chunk] = next;
      for (const instance of byChunk[chunk] as readonly number[]) {
        batch.setVisibleAt(instance, next !== 0);
        if (next !== 0 && (lodId[instance] as number) >= 0) batch.setGeometryIdAt(instance, next === 2 ? (lodId[instance] as number) : (fullId[instance] as number));
      }
    }
  });

  if (!state) return null;
  return <primitive object={state.batch} castShadow={castShadow} receiveShadow={receiveShadow} />;
}
