import type { BatchedMesh } from 'three';

/** Live city batches (development diagnostics only). */
export const liveBatches = new Set<BatchedMesh>();

/** Triangles each batch would draw right now (visible instances × their geometry). */
export function batchTriangles(): Record<string, number> {
  const result: Record<string, number> = {};
  const range = { start: 0, count: 0, vertexStart: 0, vertexCount: 0, reservedVertexCount: 0, indexStart: 0, indexCount: 0, reservedIndexCount: 0 };
  for (const batch of liveBatches) {
    let triangles = 0;
    for (let i = 0; i < batch.instanceCount; i++) {
      if (!batch.getVisibleAt(i)) continue;
      batch.getGeometryRangeAt(batch.getGeometryIdAt(i), range);
      triangles += range.count / 3;
    }
    result[batch.name] = Math.round(triangles);
  }
  return result;
}
