'use client';

import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import { Color, LinearFilter, Mesh, MeshStandardMaterial, Vector4, type BufferGeometry, type Group, type Object3D, type Texture, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { extractNode } from '../../city/assets/geometry';
import { VEHICLE_SCALE } from '../../city/layout/placements';
import { createCityMaterial } from '../../city/materials/city-materials';
import { buildBusGeometry, buildKekeGeometry, buildOkadaGeometry } from './proc-vehicles';
import { useDisposeOnUnmount } from '../lib/use-dispose';

/**
 * Vehicles for the play layer: the Kenney car kit (`/assets/vehicles/*.glb`, meshopt, wheel nodes preserved) plus
 * procedural keke, okada and BRT. Every model shares the kit colormap, so traffic renders as one BatchedMesh with the
 * city's vehicle material; the player's car is a live clone with spinning/steering wheels and its own paint.
 */

export const KIT_CAR_MODELS = ['sedan', 'sedan-sports', 'hatchback-sports', 'suv', 'suv-luxury', 'taxi', 'van', 'delivery', 'truck', 'police', 'ambulance', 'danfo'] as const;
export type KitCarModel = (typeof KIT_CAR_MODELS)[number];
export type ProcVehicleModel = 'keke' | 'okada' | 'brt';
export type RenderVehicleModel = KitCarModel | ProcVehicleModel;

export const isKitCarModel = (model: string): model is KitCarModel => (KIT_CAR_MODELS as readonly string[]).includes(model);
export const vehicleUrl = (model: KitCarModel): string => `/assets/vehicles/${model}.glb`;
const URLS = KIT_CAR_MODELS.map(vehicleUrl);

/** World scale per model (kit cars match the city's parked cars; procedural ones are authored in metres). */
export const vehicleScale = (model: RenderVehicleModel): number => (isKitCarModel(model) ? VEHICLE_SCALE : 1);

export interface VehicleKit {
  /** Shared colormap (base level only — mips would bleed neighbouring swatches). */
  readonly map: Texture | null;
  /** Merged body + wheels per model (model units), for batching. */
  readonly geometries: ReadonlyMap<RenderVehicleModel, BufferGeometry>;
  /** The city's vehicle material (one per kit). */
  readonly material: MeshStandardMaterial;
  /** Source scene of a kit model (clone it to animate wheels). */
  scene(model: KitCarModel): Group;
  /** Colormap rectangle (u0, v0, u1, v1) holding the model's body paint. */
  paintRect(model: KitCarModel): Vector4;
}

function firstMap(root: Object3D): Texture | null {
  let found: Texture | null = null;
  root.traverse((child) => {
    if (found || !(child instanceof Mesh)) return;
    const material = Array.isArray(child.material) ? child.material[0] : child.material;
    if (material instanceof MeshStandardMaterial && material.map) found = material.map;
  });
  return found;
}

/**
 * The body paint swatch. Kenney car-kit colormaps are 16 columns × 4 rows of gradients; every car's paint lives in the
 * saturated second row (v ∈ [0.25, 0.5)) — the dark-grey trim, glass and lights sit elsewhere — so the paint is the
 * second-row column covering the most body area.
 */
function bodySwatch(scene: Object3D): Vector4 {
  const area = new Float64Array(16);
  scene.updateMatrixWorld(true);
  scene.traverse((child) => {
    if (!(child instanceof Mesh) || child.name.startsWith('wheel') || child.parent?.name.startsWith('wheel')) return;
    const geometry = child.geometry as BufferGeometry;
    const position = geometry.getAttribute('position');
    const uv = geometry.getAttribute('uv');
    if (!position || !uv) return;
    const index = geometry.getIndex();
    const triangles = (index ? index.count : position.count) / 3;
    for (let t = 0; t < triangles; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      const v = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
      if (v < 0.25 || v >= 0.5) continue;
      const u = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3;
      const abx = position.getX(b) - position.getX(a);
      const aby = position.getY(b) - position.getY(a);
      const abz = position.getZ(b) - position.getZ(a);
      const acx = position.getX(c) - position.getX(a);
      const acy = position.getY(c) - position.getY(a);
      const acz = position.getZ(c) - position.getZ(a);
      const column = Math.min(15, Math.max(0, Math.floor(u * 16)));
      area[column] = (area[column] as number) + Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
    }
  });
  let best = 0;
  for (let column = 1; column < 16; column++) if ((area[column] as number) > (area[best] as number)) best = column;
  return new Vector4(best / 16, 0.25, (best + 1) / 16, 0.5);
}

export function useVehicleKit(): VehicleKit {
  const gltfs = useGLTF(URLS, false, true);
  const kit = useMemo<VehicleKit>(() => {
    const scenes = new Map<KitCarModel, Group>();
    const geometries = new Map<RenderVehicleModel, BufferGeometry>();
    const rects = new Map<KitCarModel, Vector4>();
    KIT_CAR_MODELS.forEach((model, index) => {
      const scene = gltfs[index]?.scene;
      if (!scene) return;
      scenes.set(model, scene);
      scene.updateMatrixWorld(true);
      const geometry = extractNode(scene, 'textured');
      if (geometry) geometries.set(model, geometry);
      rects.set(model, bodySwatch(scene));
    });
    geometries.set('keke', buildKekeGeometry());
    geometries.set('okada', buildOkadaGeometry());
    geometries.set('brt', buildBusGeometry());
    const map = scenes.size > 0 ? firstMap(scenes.values().next().value as Group) : null;
    if (map) {
      map.generateMipmaps = false;
      map.minFilter = LinearFilter;
      map.magFilter = LinearFilter;
      map.needsUpdate = true;
    }
    const material = createCityMaterial('vehicles', map);
    material.name = 'play-vehicles';
    const fallback = scenes.get('sedan') as Group;
    return {
      map,
      geometries,
      material,
      scene: (model) => scenes.get(model) ?? fallback,
      paintRect: (model) => rects.get(model) ?? new Vector4(0, 0, 0, 0),
    };
  }, [gltfs]);

  useDisposeOnUnmount(kit, () => {
    for (const geometry of kit.geometries.values()) geometry.dispose();
    kit.material.dispose();
  });
  return kit;
}

export function preloadVehicleKit(): void {
  useGLTF.preload(URLS, false, true);
}

/**
 * The city vehicle material with a paint job: texels inside the body swatch take the paint colour (keeping the
 * swatch's top-to-bottom shading); everything else (glass, lights, trim, tyres) stays as authored.
 */
export function createPaintedMaterial(map: Texture | null, paintHex: string, rect: Vector4): MeshStandardMaterial {
  const material = createCityMaterial('vehicles', map);
  material.name = 'play-vehicle-paint';
  const base = material.onBeforeCompile;
  const uniforms = { uIlPaint: { value: new Color(paintHex) }, uIlPaintRect: { value: rect.clone() } };
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    base.call(material, shader, renderer);
    shader.uniforms.uIlPaint = uniforms.uIlPaint;
    shader.uniforms.uIlPaintRect = uniforms.uIlPaintRect;
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uIlPaint;\nuniform vec4 uIlPaintRect;').replace(
      '#include <map_fragment>',
      /* glsl */ `#include <map_fragment>
#ifdef USE_MAP
  if ( vMapUv.x > uIlPaintRect.x && vMapUv.x < uIlPaintRect.z && vMapUv.y > uIlPaintRect.y && vMapUv.y < uIlPaintRect.w ) {
    float ilShade = 1.1 - 0.32 * ( vMapUv.y - uIlPaintRect.y ) / max( uIlPaintRect.w - uIlPaintRect.y, 0.001 );
    diffuseColor.rgb = uIlPaint * ilShade;
  }
#endif`,
    );
  };
  material.customProgramCacheKey = () => 'il-city-vehicles-paint';
  return material;
}
