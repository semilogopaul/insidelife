import { BoxGeometry, BufferAttribute, CylinderGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural Lagos vehicles the car kit lacks — keke (tricycle), okada (motorbike) and the BRT bus. They are
 * authored in metres with the front along +z and textured by pointing every part's UVs at a swatch of the Kenney
 * car-kit colormap (16 × 4 colour columns), so they share the car material and batch with the kit cars.
 */

/** Colormap swatch (column 0–15, row 0–3) → UV inside it (the upper, lighter part of the gradient). */
const swatch = (column: number, row: number, shade = 0.3): readonly [number, number] => [(column + 0.5) / 16, (row + shade) / 4];

const SWATCH = {
  yellow: swatch(2, 3),
  green: swatch(6, 1),
  black: swatch(10, 0),
  tyre: swatch(4, 2),
  grey: swatch(6, 2),
  chrome: swatch(12, 2, 0.15),
  glass: swatch(1, 0, 0.5),
  brown: swatch(0, 1),
  red: swatch(4, 3),
  blue: swatch(6, 3),
  white: swatch(0, 3, 0.1),
  orange: swatch(10, 1),
} as const;

type SwatchName = keyof typeof SWATCH;

/** Give every vertex the same UV (one flat colormap colour). */
function tint(geometry: BufferGeometry, name: SwatchName): BufferGeometry {
  const [u, v] = SWATCH[name];
  const count = geometry.getAttribute('position').count;
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  return geometry;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, name: SwatchName): BufferGeometry => tint(new BoxGeometry(w, h, d).translate(x, y + h / 2, z), name);

function wheel(radius: number, width: number, x: number, z: number, name: SwatchName = 'tyre'): BufferGeometry {
  return tint(new CylinderGeometry(radius, radius, width, 12).rotateZ(Math.PI / 2).translate(x, radius, z), name);
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Could not merge vehicle parts');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** Keke NAPEP: yellow-and-green body, black canopy, one front wheel and two at the back. ≈ 3.0 × 1.6 × 2.1 m. */
export function buildKekeGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    // Floor pan and lower body.
    box(1.5, 0.35, 1.9, 0, 0.35, -0.35, 'green'),
    box(1.5, 0.55, 0.7, 0, 0.7, -1.0, 'yellow'),
    // Nose with the front wheel fork.
    box(0.75, 0.75, 0.9, 0, 0.35, 0.95, 'yellow'),
    box(1.0, 0.18, 0.5, 0, 1.05, 0.85, 'green'),
    // Windscreen frame and canopy.
    box(1.3, 0.75, 0.06, 0, 1.15, 0.65, 'glass'),
    box(0.08, 1.2, 0.08, -0.68, 0.7, 0.62, 'black'),
    box(0.08, 1.2, 0.08, 0.68, 0.7, 0.62, 'black'),
    box(0.08, 1.25, 0.08, -0.72, 0.7, -1.3, 'black'),
    box(0.08, 1.25, 0.08, 0.72, 0.7, -1.3, 'black'),
    box(1.6, 0.12, 2.25, 0, 1.92, -0.32, 'black'),
    box(1.64, 0.28, 0.12, 0, 1.68, -1.42, 'yellow'),
    // Bench seat.
    box(1.3, 0.25, 0.55, 0, 0.7, -0.75, 'brown'),
    box(1.3, 0.55, 0.12, 0, 0.95, -1.05, 'brown'),
    // Wheels.
    wheel(0.3, 0.2, 0, 1.15),
    wheel(0.3, 0.2, -0.72, -0.95),
    wheel(0.3, 0.2, 0.72, -0.95),
    // Headlamp.
    box(0.22, 0.16, 0.06, 0, 0.92, 1.42, 'white'),
  ];
  return merge(parts);
}

/** Okada: a red commuter motorbike. ≈ 2.0 × 0.7 × 1.1 m (riders are avatars). */
export function buildOkadaGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    wheel(0.32, 0.12, 0, 0.7),
    wheel(0.32, 0.12, 0, -0.7),
    box(0.16, 0.12, 1.35, 0, 0.42, 0, 'grey'),
    box(0.36, 0.34, 0.6, 0, 0.52, 0.12, 'red'),
    box(0.3, 0.12, 0.95, 0, 0.82, -0.25, 'black'),
    box(0.1, 0.62, 0.1, 0, 0.42, 0.68, 'chrome'),
    box(0.75, 0.06, 0.06, 0, 1.02, 0.62, 'chrome'),
    box(0.2, 0.16, 0.12, 0, 0.88, 0.78, 'white'),
    box(0.26, 0.08, 0.4, 0, 0.62, -0.78, 'red'),
  ];
  return merge(parts);
}

/** Lagos BRT bus: blue body, red stripe, long window band. ≈ 11 × 2.6 × 3.2 m. */
export function buildBusGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [
    box(2.6, 0.9, 11, 0, 0.45, 0, 'blue'),
    box(2.62, 0.25, 11.02, 0, 1.3, 0, 'red'),
    box(2.62, 1.05, 10.4, 0, 1.55, -0.2, 'glass'),
    box(2.6, 0.55, 11, 0, 2.6, 0, 'white'),
    box(2.4, 1.05, 0.08, 0, 1.55, 5.48, 'glass'),
    box(1.6, 0.25, 0.1, 0, 2.75, 5.51, 'black'),
    wheel(0.5, 0.35, -1.12, 3.6),
    wheel(0.5, 0.35, 1.12, 3.6),
    wheel(0.5, 0.35, -1.12, -3.4),
    wheel(0.5, 0.35, 1.12, -3.4),
  ];
  return merge(parts);
}
