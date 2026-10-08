'use client';

import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import { LinearFilter, Mesh, MeshStandardMaterial, type BufferGeometry, type Object3D, type Texture } from 'three';
import { cityPlan } from '../layout/placements';
import { PROC_MODEL_IDS, type ProcModelId } from '../layout/proc-models';
import type { KitId } from '../layout/styles';
import { buildProcGeometry } from '../render/proc-geometry';
import { extractModel, type PaletteRemap } from './geometry';
import { KIT_MANIFEST } from './kit-manifest';

/**
 * Loads the five city kit bundles (meshopt-compressed; parked vehicles included) and turns every model the city plan
 * uses into a plain geometry per kit. Geometries are CPU-side sources for the BatchedMeshes and are disposed with the
 * city.
 */

export interface KitAssets {
  readonly geometries: ReadonlyMap<string, BufferGeometry>;
  /** Kit colormap (null for vertex-coloured kits). */
  readonly map: Texture | null;
}

export type CityKits = Readonly<Record<KitId, KitAssets>>;

const ALL_URLS: string[] = [KIT_MANIFEST.commercial.file, KIT_MANIFEST.suburban.file, KIT_MANIFEST.roads.file, KIT_MANIFEST.nature.file, KIT_MANIFEST.parked.file];

/** Kenney's teal greens → tropical Lagos greens; bark warmer. */
const NATURE_PALETTE: PaletteRemap = {
  leafsGreen: 0x4f8f34,
  grass: 0x6a9b3a,
  woodBark: 0x8a5d3b,
  wood: 0x9b6b45,
  dirt: 0x8d6a46,
  leafsFall: 0xc98a3a,
};

function firstMap(root: Object3D): Texture | null {
  let found: Texture | null = null;
  root.traverse((child) => {
    if (found || !(child instanceof Mesh)) return;
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    if (material instanceof MeshStandardMaterial && material.map) found = material.map;
  });
  return found;
}

export function useCityKits(): CityKits {
  const gltfs = useGLTF(ALL_URLS, false, true);
  const kits = useMemo<CityKits>(() => {
    const plan = cityPlan();
    const [commercial, suburban, roads, nature, parked] = gltfs;
    const sources: Readonly<Record<KitId, Object3D | undefined>> = {
      commercial: commercial?.scene,
      suburban: suburban?.scene,
      roads: roads?.scene,
      nature: nature?.scene,
      vehicles: parked?.scene,
    };
    const result = {} as Record<KitId, KitAssets>;
    for (const kit of ['commercial', 'suburban', 'roads', 'nature', 'vehicles'] as const) {
      const scene = sources[kit];
      const geometries = new Map<string, BufferGeometry>();
      const names = new Set(plan.placements[kit].map((placement) => placement.model));
      if (kit === 'nature') for (const id of PROC_MODEL_IDS) names.add(`proc:${id}`);
      for (const name of names) {
        if (name.startsWith('proc:')) {
          geometries.set(name, buildProcGeometry(name.slice(5) as ProcModelId));
          continue;
        }
        if (!scene) continue;
        const layout = kit === 'nature' ? 'vertexColor' : 'textured';
        const geometry = extractModel(scene, name, layout, kit === 'nature' ? NATURE_PALETTE : undefined);
        if (geometry) geometries.set(name, geometry);
        const lod = extractModel(scene, `${name}__lod`, layout, kit === 'nature' ? NATURE_PALETTE : undefined);
        if (lod) geometries.set(`${name}__lod`, lod);
      }
      result[kit] = { geometries, map: kit === 'nature' || !scene ? null : firstMap(scene) };
    }
    // Kenney colormaps are palettes of 32 px colour columns: mip levels would blend neighbouring swatches (window
    // glass bleeding into walls), so sample the base level only.
    for (const kit of Object.values(result)) {
      if (!kit.map) continue;
      kit.map.generateMipmaps = false;
      kit.map.minFilter = LinearFilter;
      kit.map.magFilter = LinearFilter;
      kit.map.needsUpdate = true;
    }
    return result;
  }, [gltfs]);

  useEffect(
    () => () => {
      for (const kit of Object.values(kits)) for (const geometry of kit.geometries.values()) geometry.dispose();
    },
    [kits],
  );
  return kits;
}

export function preloadCityKits(): void {
  useGLTF.preload(ALL_URLS, false, true);
}
