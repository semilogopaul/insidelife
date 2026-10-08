import { BufferAttribute, Color, type BufferGeometry } from 'three';

const color = new Color();

/** Gives a primitive the vertex-colour layout (position, normal, color; no uv) in one flat sRGB colour. */
export function paint(geometry: BufferGeometry, hex: number, shade = 1): BufferGeometry {
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  color.setHex(hex).multiplyScalar(shade);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry.index ? geometry : geometry.setIndex(Array.from({ length: count }, (_, i) => i));
}
