import { BufferAttribute, BufferGeometry, Color, Mesh, type InterleavedBufferAttribute, type Material, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Turns a model node of a kit GLB into one plain float geometry (positions/normals/uvs or colours), with its node
 * transforms (including meshopt dequantisation) baked in — ready for a BatchedMesh, where every geometry must
 * share the same attribute layout.
 */

export type GeometryLayout = 'textured' | 'vertexColor';

/** Optional colour remap for vertex-coloured kits (material name → sRGB hex). */
export type PaletteRemap = Readonly<Record<string, number>>;

function floatAttribute(source: BufferAttribute | InterleavedBufferAttribute, itemSize: number): BufferAttribute {
  const count = source.count;
  const array = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i++) {
    array[i * itemSize] = source.getX(i);
    if (itemSize > 1) array[i * itemSize + 1] = source.getY(i);
    if (itemSize > 2) array[i * itemSize + 2] = source.getZ(i);
  }
  return new BufferAttribute(array, itemSize);
}

const scratchColor = new Color();

function plainGeometry(mesh: Mesh, layout: GeometryLayout, palette: PaletteRemap | undefined): BufferGeometry {
  const source = mesh.geometry;
  const geometry = new BufferGeometry();
  const position = source.getAttribute('position');
  geometry.setAttribute('position', floatAttribute(position, 3));
  const normal = source.getAttribute('normal');
  if (normal) geometry.setAttribute('normal', floatAttribute(normal, 3));
  if (layout === 'textured') {
    const uv = source.getAttribute('uv');
    geometry.setAttribute('uv', uv ? floatAttribute(uv, 2) : new BufferAttribute(new Float32Array(position.count * 2), 2));
  } else {
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material & { color?: Color };
    const remapped = palette?.[material.name];
    if (remapped !== undefined) scratchColor.setHex(remapped);
    else scratchColor.copy(material.color ?? scratchColor.set(1, 1, 1));
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      colors[i * 3] = scratchColor.r;
      colors[i * 3 + 1] = scratchColor.g;
      colors[i * 3 + 2] = scratchColor.b;
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
  }
  const index = source.getIndex();
  if (index) geometry.setIndex(Array.from({ length: index.count }, (_, i) => index.getX(i)));
  else geometry.setIndex(Array.from({ length: position.count }, (_, i) => i));
  if (!normal) geometry.computeVertexNormals();
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
}

/** Merges every mesh under the named root node (a direct child of the GLB scene). */
export function extractModel(scene: Object3D, name: string, layout: GeometryLayout, palette?: PaletteRemap): BufferGeometry | null {
  const root = scene.children.find((child) => child.name === name);
  if (!root) return null;
  scene.updateMatrixWorld(true);
  return extractNode(root, layout, palette);
}

/** Merges every mesh under `root` (world matrices must be up to date). */
export function extractNode(root: Object3D, layout: GeometryLayout, palette?: PaletteRemap): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  root.traverse((child) => {
    if (child instanceof Mesh) parts.push(plainGeometry(child, layout, palette));
  });
  if (parts.length === 0) return null;
  const merged = parts.length === 1 ? (parts[0] as BufferGeometry) : mergeGeometries(parts, false);
  if (parts.length > 1) for (const part of parts) part.dispose();
  if (!merged) return null;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
