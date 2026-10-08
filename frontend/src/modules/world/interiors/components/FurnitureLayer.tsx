'use client';

import { useGLTF } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Matrix4, Quaternion, Vector3, type InstancedMesh, type MeshStandardMaterial, type Object3D } from 'three';
import { createSurfaceMaterial } from '@/common/three/materials/surface-material';
import { FURNITURE_URL, obtainBaked, paletteKey, retainBaked, type Palette } from '../kit/furniture-kit';
import type { KitModel } from '../kit/kit-manifest';
import type { FurniturePlacement } from '../templates/types';

let sharedMaterial: MeshStandardMaterial | null = null;

/** One material for all furniture (vertex colours + per-vertex roughness/metalness). */
export function furnitureMaterial(): MeshStandardMaterial {
  if (!sharedMaterial) {
    sharedMaterial = createSurfaceMaterial();
    sharedMaterial.name = 'interior-furniture';
  }
  return sharedMaterial;
}

interface Group {
  readonly key: string;
  readonly model: KitModel;
  readonly palette: Palette | undefined;
  readonly items: readonly FurniturePlacement[];
}

function groupPlacements(placements: readonly FurniturePlacement[]): Group[] {
  const groups = new Map<string, { model: KitModel; palette: Palette | undefined; items: FurniturePlacement[] }>();
  for (const item of placements) {
    const key = `${item.model}|${paletteKey(item.palette)}`;
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { model: item.model, palette: item.palette, items: [item] });
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}

/**
 * All Kenney furniture of a room: one instanced draw call per (model, palette). Geometry is baked once per
 * model/palette and shared between rooms.
 */
export function FurnitureLayer({ placements }: { readonly placements: readonly FurniturePlacement[] }) {
  const { scene } = useGLTF(FURNITURE_URL, false, true);
  const groups = useMemo(() => groupPlacements(placements), [placements]);
  return (
    <group name="furniture">
      {groups.map((group) => (
        <FurnitureInstances key={group.key} root={scene} group={group} />
      ))}
    </group>
  );
}

const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();
const tmpPos = new Vector3();
const tmpScale = new Vector3();
const UP = new Vector3(0, 1, 0);

function FurnitureInstances({ root, group }: { readonly root: Object3D; readonly group: Group }) {
  const node = root.getObjectByName(group.model);
  const geometry = useMemo(() => (node ? obtainBaked(group.model, node, group.palette) : null), [node, group.model, group.palette]);
  const exists = node !== undefined;
  useEffect(() => (exists ? retainBaked(group.model, group.palette) : undefined), [exists, group.model, group.palette]);
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    group.items.forEach((item, index) => {
      tmpPos.set(item.at[0], item.y ?? 0, item.at[1]);
      tmpQuat.setFromAxisAngle(UP, ((item.rot ?? 0) * Math.PI) / 180);
      tmpScale.setScalar(item.scale ?? 1);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(index, tmpMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [group.items, geometry]);

  if (!geometry) return null;
  return <instancedMesh ref={ref} args={[geometry, furnitureMaterial(), group.items.length]} frustumCulled={false} />;
}

useGLTF.preload(FURNITURE_URL, false, true);
