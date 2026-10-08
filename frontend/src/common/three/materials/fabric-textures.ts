import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type MeshStandardMaterial } from 'three';
import { RefCountCache } from '../core/refcount-cache';
import { timed } from '../core/perf-marks';
import { FABRIC_TEXTURE_SIZE, FABRIC_TILE_METRES, fabricKey, paintFabric, type FabricSpec } from './fabric-patterns';
import { createSurfaceMaterial } from './surface-material';

export interface FabricResource {
  readonly texture: CanvasTexture;
  /** Surface material with the print as `map` (shared by every avatar wearing this print). */
  readonly material: MeshStandardMaterial;
}

const specs = new Map<string, FabricSpec>();

const cache = new RefCountCache<FabricResource>({
  create: (key) => {
    const spec = specs.get(key);
    if (!spec) throw new Error(`Unknown fabric ${key}`);
    return timed('il:fabric-paint', () => createFabric(spec));
  },
  dispose: ({ texture, material }) => {
    texture.dispose();
    material.dispose();
  },
  graceMs: 4000,
});

function createFabric(spec: FabricSpec): FabricResource {
  const size = FABRIC_TEXTURE_SIZE[spec.pattern];
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) paintFabric(ctx, spec, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 4;
  const tile = FABRIC_TILE_METRES[spec.pattern];
  texture.repeat.set(1 / tile, 1 / tile);
  texture.name = `fabric:${fabricKey(spec)}`;
  const material = createSurfaceMaterial({
    map: texture,
    metalness: spec.pattern === 'aso-oke' ? 0.22 : spec.pattern === 'lace' ? 0.05 : 0,
    roughness: spec.pattern === 'aso-oke' ? 0.7 : 1,
  });
  material.name = texture.name;
  return { texture, material };
}

/** Get (and retain) the texture + material for a print. Pair every call with `releaseFabric(key)`. */
export function acquireFabric(spec: FabricSpec): { readonly key: string; readonly resource: FabricResource } {
  const key = fabricKey(spec);
  if (!specs.has(key)) specs.set(key, spec);
  return { key, resource: cache.acquire(key) };
}

export function releaseFabric(key: string): void {
  cache.release(key);
}
