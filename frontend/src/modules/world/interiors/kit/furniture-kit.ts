import { Color, Matrix4, type BufferGeometry, type Material, type Mesh, type Object3D } from 'three';
import { RefCountCache } from '@/common/three/core/refcount-cache';
import { timed } from '@/common/three/core/perf-marks';
import { PartBuilder, type Surface } from '@/common/three/geometry/part-builder';
import { normalizeHex } from '@/common/three/materials/color-utils';
import type { KitModel } from './kit-manifest';

/** Kenney furniture is modelled ~1.5× smaller than our chibi world. */
export const FURNITURE_SCALE = 1.5;

export const FURNITURE_URL = '/assets/interiors/furniture.glb';
export const CARS_URL = '/assets/interiors/showroom-cars.glb';

/** Recolour Kenney materials by name, e.g. `{ carpet: '#2f6f5e' }` turns red sofas green. */
export type Palette = Readonly<Partial<Record<KitMaterial, string>>>;

export type KitMaterial =
  | 'wood'
  | 'woodDark'
  | 'metal'
  | 'metalLight'
  | 'metalMedium'
  | 'metalDark'
  | 'carpet'
  | 'carpetBlue'
  | 'carpetDarker'
  | 'carpetWhite'
  | 'glass'
  | 'lamp'
  | 'plant'
  | 'fur'
  | '_defaultMat'
  | 'woodBark'
  | 'woodBarkDark'
  | 'leafsGreen'
  | 'grass'
  | 'colorRed'
  | 'colorYellow';

const SURFACES: Readonly<Record<string, Surface>> = {
  wood: [0.72, 0],
  woodDark: [0.7, 0],
  woodBark: [0.9, 0],
  woodBarkDark: [0.9, 0],
  metal: [0.38, 0.55],
  metalLight: [0.4, 0.4],
  metalMedium: [0.42, 0.5],
  metalDark: [0.45, 0.45],
  carpet: [0.95, 0],
  carpetBlue: [0.95, 0],
  carpetDarker: [0.95, 0],
  carpetWhite: [0.85, 0],
  glass: [0.08, 0.2],
  lamp: [0.5, 0],
  plant: [0.8, 0],
  leafsGreen: [0.8, 0],
  grass: [0.95, 0],
  fur: [1, 0],
  _defaultMat: [0.55, 0],
};

/** The kit's warm default palette (Kenney's reds become warmer Lagos furniture tones). */
export const DEFAULT_PALETTE: Palette = {
  carpet: '#b0473a',
  carpetDarker: '#8a3328',
  wood: '#c08552',
  woodDark: '#8a5a36',
  lamp: '#fff3c4',
  glass: '#9fc4d6',
};

export function paletteKey(palette: Palette | undefined): string {
  if (!palette) return '';
  return Object.entries(palette)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${normalizeHex(value ?? '#000')}`)
    .join(',');
}

const tmpMatrix = new Matrix4();
const inverseRoot = new Matrix4();

/**
 * Bake one kit model (all its meshes and materials) into a single vertex-coloured geometry, scaled to world size,
 * footprint centred, base at y = 0. Material colours come from the palette (by Kenney material name) or the GLB.
 */
export function bakeModel(root: Object3D, palette: Palette | undefined, scale = FURNITURE_SCALE): BufferGeometry {
  const builder = new PartBuilder({ skinned: false });
  root.updateMatrixWorld(true);
  // Bake relative to the wrapper's parent: the wrapper's own translation is the footprint-centring offset written by
  // the asset script, so it must stay in.
  if (root.parent) inverseRoot.copy(root.parent.matrixWorld).invert();
  else inverseRoot.identity();
  const scaleMatrix = new Matrix4().makeScale(scale, scale, scale);
  const merged = { ...DEFAULT_PALETTE, ...palette };
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    // GLTFLoader makes one mesh per primitive, so each mesh has exactly one material.
    const material: Material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    tmpMatrix.multiplyMatrices(inverseRoot, mesh.matrixWorld).premultiply(scaleMatrix);
    const name = material.name as KitMaterial;
    const override = merged[name];
    const color = override ? new Color().setStyle(override) : ((material as Material & { color?: Color }).color?.clone() ?? new Color(1, 1, 1));
    builder.add(mesh.geometry.clone(), { slot: 'base', color, surface: SURFACES[name] ?? [0.7, 0], shade: 0 }, tmpMatrix.clone());
  });
  return builder.build().geometry;
}

interface BakeRequest {
  readonly root: Object3D;
  readonly palette: Palette | undefined;
}

const pending = new Map<string, BakeRequest>();

const bakedCache = new RefCountCache<BufferGeometry>({
  create: (key) => {
    const request = pending.get(key);
    pending.delete(key);
    if (!request) throw new Error(`No bake request for ${key}`);
    return timed('il:furniture-bake', () => bakeModel(request.root, request.palette));
  },
  dispose: (geometry) => geometry.dispose(),
  graceMs: 8000,
});

export function bakedKey(model: KitModel, palette: Palette | undefined): string {
  return `${model}|${paletteKey(palette)}`;
}

/** Shared baked geometry for (model, palette) — render-safe; keep it alive with `retainBaked` in an effect. */
export function obtainBaked(model: KitModel, root: Object3D, palette: Palette | undefined): BufferGeometry {
  const key = bakedKey(model, palette);
  if (!bakedCache.peek(key)) pending.set(key, { root, palette });
  return bakedCache.obtain(key);
}

/** Retain the baked geometry; returns the release function (effect cleanup). */
export function retainBaked(model: KitModel, palette: Palette | undefined): () => void {
  const key = bakedKey(model, palette);
  bakedCache.acquire(key);
  return () => bakedCache.release(key);
}
