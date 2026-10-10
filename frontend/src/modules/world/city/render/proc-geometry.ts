import { BoxGeometry, ConeGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ProcModelId } from '../layout/proc-models';
import { paint } from './paint';

/**
 * Small procedural Lagos props in the vertex-colour layout (position, normal, color; indexed), base at y = 0,
 * front towards +z. Colours are sRGB hex converted to linear.
 */

const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number): BufferGeometry => paint(new BoxGeometry(w, h, d).translate(x, y + h / 2, z), hex);

const cylinder = (radius: number, h: number, x: number, y: number, z: number, hex: number, segments = 8): BufferGeometry =>
  paint(new CylinderGeometry(radius, radius, h, segments).translate(x, y + h / 2, z), hex);

const wheel = (radius: number, width: number, x: number, z: number): BufferGeometry =>
  paint(new CylinderGeometry(radius, radius, width, 10).rotateZ(Math.PI / 2).translate(x, radius, z), 0x1c1c1e);

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('procedural merge failed');
  return merged;
}

const WOOD = 0x7a5232;
const STEEL = 0x8a8f94;
const WHITE = 0xf2f0ea;
const FUEL_GREEN = 0x16804a;

const BUILDERS: Readonly<Record<ProcModelId, () => BufferGeometry>> = {
  stall: () =>
    merge([
      box(2.3, 0.85, 1.3, 0, 0, 0, WOOD),
      ...[-1.1, 1.1].flatMap((x) => [-0.6, 0.6].map((z) => box(0.08, 2.3, 0.08, x, 0, z, WOOD))),
      paint(new BoxGeometry(2.6, 0.08, 1.8).rotateX(-0.12).translate(0, 2.35, 0.05), WHITE),
      box(0.5, 0.18, 0.4, -0.7, 0.85, 0.1, 0xc9302c),
      box(0.5, 0.2, 0.4, 0, 0.85, 0.15, 0xe8a33d),
      box(0.5, 0.16, 0.4, 0.7, 0.85, 0.05, 0x5c8a3a),
    ]),
  hut: () =>
    merge([
      ...[-1.3, 1.3].flatMap((x) => [-1.3, 1.3].map((z) => cylinder(0.08, 2.2, x, 0, z, WOOD, 6))),
      paint(new ConeGeometry(2.4, 1.2, 4).rotateY(Math.PI / 4).translate(0, 2.8, 0), 0xc9a45c),
      box(2.4, 1.0, 0.5, 0, 0, 1.1, WOOD),
    ]),
  shelter: () =>
    merge([
      box(20, 0.16, 2.6, 0, 3.0, 0, 0x2f6f8f),
      box(20, 0.1, 0.2, 0, 2.86, 1.25, 0xf6b90b),
      ...[-9.5, -4.75, 0, 4.75, 9.5].map((x) => box(0.14, 3.0, 0.14, x, 0, -1.0, STEEL)),
      box(19, 0.45, 0.5, 0, 0, -0.9, 0x6d6a64),
    ]),
  flagpole: () =>
    merge([
      cylinder(0.07, 8, 0, 0, 0, 0xdedede, 6),
      box(0.6, 1.0, 0.03, 0.37, 6.8, 0, 0x1a8a4a),
      box(0.6, 1.0, 0.03, 0.97, 6.8, 0, WHITE),
      box(0.6, 1.0, 0.03, 1.57, 6.8, 0, 0x1a8a4a),
    ]),
  keke: () =>
    merge([
      box(1.15, 0.85, 1.7, 0, 0.32, -0.15, 0xf2b705),
      box(1.15, 0.5, 0.5, 0, 0.32, 0.9, 0xf2b705),
      box(1.0, 0.45, 0.05, 0, 0.82, 1.12, 0x9fc4d6),
      box(1.2, 0.06, 2.0, 0, 1.7, -0.05, 0x1f6b3b),
      ...[-0.55, 0.55].flatMap((x) => [-0.9, 0.95].map((z) => box(0.05, 0.6, 0.05, x, 1.1, z, 0x222222))),
      wheel(0.26, 0.14, -0.55, -0.7),
      wheel(0.26, 0.14, 0.55, -0.7),
      wheel(0.26, 0.14, 0, 1.05),
    ]),
  kiosk: () =>
    merge([
      box(2.0, 2.1, 1.5, 0, 0, 0, 0xf2c94c),
      box(1.7, 0.9, 0.05, 0, 0.9, 0.76, 0x2b2b2b),
      paint(new BoxGeometry(2.3, 0.08, 0.9).rotateX(0.25).translate(0, 2.35, 0.9), 0xd9452f),
    ]),
  // Filling station forecourt: a white canopy with a green fascia and Danfo trim on two pillars, two pump islands
  // under it, and the price board on a pole by the road (front +z faces the road).
  'fuel-station': () =>
    merge([
      box(7, 0.32, 4.6, 0, 4.05, 0, WHITE),
      box(7.1, 0.42, 4.7, 0, 3.66, 0, FUEL_GREEN),
      box(7.12, 0.08, 4.72, 0, 3.62, 0, 0xf6b90b),
      ...[-2.6, 2.6].map((x) => box(0.32, 3.66, 0.32, x, 0, 0, STEEL)),
      ...[-1.5, 1.5].flatMap((x) => [
        box(1.0, 0.18, 2.4, x, 0, 0, 0xa7a59f),
        box(0.62, 1.55, 0.5, x, 0.18, 0, 0xd9452f),
        box(0.48, 0.32, 0.04, x, 1.2, 0.27, 0x1b1d1f),
        box(0.66, 0.16, 0.54, x, 1.73, 0, WHITE),
      ]),
      cylinder(0.09, 3.4, 3.7, 0, 2.1, STEEL, 6),
      box(1.3, 1.5, 0.16, 3.7, 3.4, 2.1, FUEL_GREEN),
      box(1.1, 0.26, 0.18, 3.7, 4.55, 2.1, 0xf6b90b),
      ...[3.85, 4.2].map((y) => box(1.0, 0.18, 0.18, 3.7, y, 2.1, WHITE)),
    ]),
  // Mechanic shed: corrugated roof on four posts against a back wall, a workbench, stacked tyres, a red board.
  workshop: () =>
    merge([
      paint(new BoxGeometry(6.2, 0.1, 4.4).rotateX(-0.08).translate(0, 3.05, 0), 0x8f969c),
      ...[-2.9, 2.9].flatMap((x) => [-1.9, 1.9].map((z) => box(0.14, z < 0 ? 3.2 : 2.85, 0.14, x, 0, z, WOOD))),
      box(6.2, 2.8, 0.18, 0, 0, -2.0, 0xb9ab8d),
      box(2.2, 0.9, 0.7, -1.6, 0, -1.4, WOOD),
      box(0.5, 0.35, 0.3, -2.1, 0.9, -1.4, 0x3d6fb3),
      ...[0, 0.26, 0.52, 0.78].map((y) => paint(new CylinderGeometry(0.36, 0.36, 0.24, 10).translate(2.3, y + 0.12, 1.2), 0x1c1c1e)),
      ...[0, 0.26, 0.52].map((y) => paint(new CylinderGeometry(0.36, 0.36, 0.24, 10).translate(1.5, y + 0.12, 1.5), 0x1c1c1e)),
      box(2.6, 0.75, 0.1, 0, 2.45, 2.0, 0xc0392b),
      box(2.3, 0.12, 0.11, 0, 2.6, 2.0, WHITE),
    ]),
};

export function buildProcGeometry(id: ProcModelId): BufferGeometry {
  const geometry = BUILDERS[id]();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
