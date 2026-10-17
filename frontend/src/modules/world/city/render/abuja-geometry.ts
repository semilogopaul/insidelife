import { CITY_MAP, CITY_SCENERY_REACH, cityBounds, venueLot } from '@insidelife/shared';
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, Matrix4, SphereGeometry } from 'three';
import { APRON, frameOf } from '../layout/placements';
import { frameMatrix } from './lot-frame';
import { paint } from './paint';

/**
 * Abuja's procedural landmarks (one vertex-coloured mesh, built only while the player is in Abuja): Aso Rock over
 * Asokoro and a ring of Zuma-style rock outcrops beyond the city, the National Mosque (gold dome, four minarets), the
 * National Christian Centre (cross tower), the National Assembly (green dome and colonnade), Eagle Square (flag mast,
 * fountains, the saluting stand), the Dunamis Glory Dome and the parish churches and mosques of the districts. Authored
 * in lot-local space (x right when facing the lot from the road, z towards the road), like `landmark-geometry.ts`.
 */

const parts: BufferGeometry[] = [];

function put(geometry: BufferGeometry, hex: number, matrix: Matrix4, shade = 1): void {
  parts.push(paint(geometry, hex, shade).applyMatrix4(matrix));
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry => new BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cylinder = (r: number, h: number, x: number, y: number, z: number, segments = 14): BufferGeometry => new CylinderGeometry(r, r, h, segments).translate(x, y + h / 2, z);
const dome = (r: number, x: number, y: number, z: number, segments = 20): BufferGeometry => new SphereGeometry(r, segments, Math.ceil(segments / 2), 0, Math.PI * 2, 0, Math.PI / 2).translate(x, y, z);
const spire = (r: number, h: number, x: number, y: number, z: number, segments = 4): BufferGeometry => new ConeGeometry(r, h, segments).rotateY(segments === 4 ? Math.PI / 4 : 0).translate(x, y + h / 2, z);

/** A gabled roof: ridge along z, `w` wide, `d` long, `h` high above its eaves at `y`. */
export function gable(w: number, d: number, h: number, x: number, y: number, z: number): BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  const v = (px: number, py: number, pz: number): readonly [number, number, number] => [x + px, y + py, z + pz];
  const a = v(-hw, 0, -hd);
  const b = v(hw, 0, -hd);
  const c = v(0, h, -hd);
  const dd = v(-hw, 0, hd);
  const e = v(hw, 0, hd);
  const f = v(0, h, hd);
  const triangles = [a, c, b, dd, e, f, a, dd, f, a, f, c, b, c, f, b, f, e];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles.flat()), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Nigeria's flag: green-white-green bands on a mast at `x, z`, flying towards +x. */
function flag(m: Matrix4, x: number, y: number, z: number, width: number, height: number): void {
  const band = width / 3;
  put(box(band, height, 0.08, x + band / 2, y, z), 0x008751, m);
  put(box(band, height, 0.09, x + band * 1.5, y, z), 0xffffff, m);
  put(box(band, height, 0.08, x + band * 2.5, y, z), 0x008751, m);
}

function lotMatrix(id: string): { readonly m: Matrix4; readonly width: number; readonly depth: number; readonly front: number } | null {
  const lot = venueLot(id);
  if (!lot) return null;
  const frame = frameOf(lot);
  return { m: frameMatrix(frame), width: frame.width, depth: frame.depth, front: frame.depth / 2 - APRON };
}

// ---------------------------------------------------------------------------------------------------------------
// Rock
// ---------------------------------------------------------------------------------------------------------------

/**
 * A faceted granite outcrop: a lumpy dome `rx × ry × rz` that flattens into the ground, bare rock above a skirt of scrub,
 * with dark streaks down its flanks. Flat-shaded (the icosphere is not indexed), seeded, never random.
 */
export function rockGeometry(rx: number, ry: number, rz: number, detail: number, seed: number, rock: number, scrub: number, shoulder = 0.72): BufferGeometry {
  const geometry = new IcosahedronGeometry(1, detail);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const low = new Color(scrub);
  const high = new Color(rock);
  const mixed = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const lump = 1 + 0.15 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + seed * 1.3) + 0.09 * Math.sin(y * 4.3 + x * 2.1 + seed * 2);
    // Above ground the profile follows y^shoulder (broad shoulders, a bald dome); below it the rock is pressed flat.
    const height = y >= 0 ? Math.pow(y, shoulder) : y * 0.08;
    const px = x * rx * lump;
    const py = height * ry * (0.94 + 0.08 * lump);
    const pz = z * rz * lump;
    position.setXYZ(i, px, py, pz);
    const t = Math.min(1, Math.max(0, py / ry));
    mixed.copy(low).lerp(high, Math.min(1, t * 7));
    const streak = 0.84 + 0.16 * Math.abs(Math.sin(px * 0.55 + pz * 0.3 + seed * 3 + t * 2));
    mixed.multiplyScalar(streak * (0.88 + 0.16 * t));
    colors[i * 3] = mixed.r;
    colors[i * 3 + 1] = mixed.g;
    colors[i * 3 + 2] = mixed.b;
  }
  geometry.deleteAttribute('uv');
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry.setIndex(Array.from({ length: position.count }, (_, i) => i));
}

function asoRock(): void {
  const lot = CITY_MAP.lots.find((entry) => entry.id === 'landmark:aso-rock');
  if (!lot) return;
  const cx = (lot.footprint.minX + lot.footprint.maxX) / 2;
  const cz = (lot.footprint.minZ + lot.footprint.maxZ) / 2;
  const at = (x: number, z: number): Matrix4 => new Matrix4().makeTranslation(cx + x, 0, cz + z);
  // The great dome, a shoulder and a lower knob in front of it, bare granite over scrub.
  parts.push(rockGeometry(15, 62, 14, 3, 1.7, 0x9a917f, 0x667044, 0.62).applyMatrix4(at(0, -2)));
  parts.push(rockGeometry(11, 34, 10, 2, 4.2, 0x8c8473, 0x667044, 0.7).applyMatrix4(at(-12, 7)));
  parts.push(rockGeometry(8, 20, 8, 2, 6.9, 0x948b79, 0x6c7648, 0.75).applyMatrix4(at(11, 9)));
}

/** Zuma-style monoliths and boulder fields on the outskirts (within the scenery band, so the other city never sees them). */
function outcrops(): void {
  const { minX, minZ, maxX, maxZ } = cityBounds('abuja');
  const reach = CITY_SCENERY_REACH.abuja;
  // The monolith: a smooth pale mass west of the city, taller than anything in it.
  const zumaX = minX - 105;
  const zumaZ = minZ + (maxZ - minZ) * 0.38;
  parts.push(rockGeometry(30, 78, 22, 3, 9.3, 0xa39a88, 0x6f7a4e, 0.56).applyMatrix4(new Matrix4().makeTranslation(zumaX, 0, zumaZ)));
  parts.push(rockGeometry(13, 26, 12, 2, 2.2, 0x9c9381, 0x6f7a4e, 0.7).applyMatrix4(new Matrix4().makeTranslation(zumaX + 36, 0, zumaZ + 20)));
  // Boulder fields: three to five granite lumps each, spread round the edge (seeded, fixed).
  let seed = 0x2a6e;
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const fields: ReadonlyArray<readonly [number, number]> = [
    [minX + (maxX - minX) * 0.18, minZ - 70],
    [minX + (maxX - minX) * 0.62, minZ - 95],
    [maxX + 60, minZ + (maxZ - minZ) * 0.2],
    [maxX + 90, minZ + (maxZ - minZ) * 0.7],
    [minX + (maxX - minX) * 0.8, maxZ + 65],
    [minX + (maxX - minX) * 0.3, maxZ + 88],
    [minX - 60, maxZ - (maxZ - minZ) * 0.1],
    [minX - 85, minZ + (maxZ - minZ) * 0.85],
  ];
  fields.forEach(([fx, fz], f) => {
    const count = 3 + Math.floor(next() * 3);
    for (let k = 0; k < count; k++) {
      const x = fx + (next() - 0.5) * 34;
      const z = fz + (next() - 0.5) * 34;
      const size = 4 + next() * 9;
      // Never in the city, never past the scenery band.
      if (x > minX - 8 && x < maxX + 8 && z > minZ - 8 && z < maxZ + 8) continue;
      if (x < minX - reach || x > maxX + reach || z < minZ - reach || z > maxZ + reach) continue;
      parts.push(rockGeometry(size * (0.9 + next() * 0.6), size * (0.55 + next() * 0.5), size * (0.9 + next() * 0.6), 1, f * 3.1 + k, 0x9b927f, 0x76804f, 0.8).applyMatrix4(new Matrix4().makeTranslation(x, 0, z)));
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Faith
// ---------------------------------------------------------------------------------------------------------------

function nationalMosque(): void {
  const lot = lotMatrix('national-mosque');
  if (!lot) return;
  const { m } = lot;
  const cz = -2;
  put(box(26, 0.8, 24, 0, 0, cz), 0xe6dfcd, m);
  put(box(18, 9, 16, 0, 0.8, cz), 0xf6f1e5, m);
  put(box(18.2, 0.9, 16.2, 0, 6.2, cz), 0x2a7f8f, m);
  // Entrance portico and its dark arch.
  put(box(9, 6.6, 2, 0, 0.8, cz + 9), 0xf0e9d8, m);
  put(box(4, 4.6, 0.3, 0, 0.8, cz + 10.1), 0x34414a, m);
  // The golden dome on its drum, the four half-domes round it.
  put(cylinder(7.6, 2.2, 0, 9.8, cz, 28), 0xece3cd, m);
  put(dome(7.6, 0, 12, cz, 30), 0xd9a62c, m);
  put(spire(0.45, 3.4, 0, 19.2, cz, 8), 0xe8c552, m);
  for (const [x, z] of [
    [-6.4, -5.6],
    [6.4, -5.6],
    [-6.4, 5.6],
    [6.4, 5.6],
  ] as const) put(dome(2.7, x, 9.8, cz + z, 14), 0xd9a62c, m);
  // Four minarets standing at the corners of the plinth.
  for (const [x, z] of [
    [-12, -9.5],
    [12, -9.5],
    [-12, 9.5],
    [12, 9.5],
  ] as const) {
    put(cylinder(1.0, 25, x, 0.8, cz + z, 12), 0xf4f0e6, m);
    put(cylinder(1.5, 0.6, x, 16, cz + z, 12), 0xe0d5b8, m);
    put(cylinder(1.5, 0.6, x, 22, cz + z, 12), 0xe0d5b8, m);
    put(spire(1.2, 3.8, x, 25.8, cz + z, 12), 0xd9a62c, m);
  }
}

function nationalChristianCentre(): void {
  const lot = lotMatrix('national-christian-centre');
  if (!lot) return;
  const { m } = lot;
  const cz = -2;
  put(box(21, 0.8, 22, 0, 0, cz), 0xdcd7c9, m);
  put(box(19, 8.5, 17, 0, 0.8, cz), 0xf9f7f1, m);
  put(gable(20.5, 18.5, 5.5, 0, 9.3, cz), 0x2b6a8a, m);
  put(box(6, 5.5, 1.2, 0, 0.8, cz + 9), 0xefece3, m);
  put(box(2.6, 3.6, 0.3, 0, 0.8, cz + 9.7), 0x34414a, m);
  // Windows in coloured glass along both sides.
  for (let i = -3; i <= 3; i++) for (const side of [-1, 1]) put(box(0.25, 3.4, 1.4, side * 9.55, 3.2, cz + i * 2.2), i % 2 ? 0x3d7fb8 : 0xb23a48, m);
  // The tower with its cross, standing at the front corner.
  put(box(5.2, 26, 5.2, -9, 0.8, cz + 8), 0xfbfaf6, m);
  put(box(5.4, 1, 5.4, -9, 20, cz + 8), 0xdfd9c8, m);
  put(spire(3.8, 7, -9, 26.8, cz + 8, 4), 0x2b6a8a, m);
  put(box(0.35, 3.6, 0.35, -9, 33.6, cz + 8), 0xe8c552, m);
  put(box(2.2, 0.35, 0.35, -9, 35.4, cz + 8), 0xe8c552, m);
}

function nationalAssembly(): void {
  const lot = lotMatrix('national-assembly');
  if (!lot) return;
  const { m } = lot;
  const cz = -3;
  put(box(28, 1, 22, 0, 0, cz), 0xe0dccf, m);
  // The chambers: a central block under the green dome, two wings.
  put(box(13, 10.5, 12, 0, 1, cz), 0xf3efe5, m);
  put(cylinder(5.2, 1.6, 0, 11.5, cz, 24), 0xe9e4d6, m);
  put(dome(5.2, 0, 13.1, cz, 26), 0x2f8a5b, m);
  put(spire(0.3, 2.6, 0, 18.3, cz, 8), 0xe8c552, m);
  for (const side of [-1, 1]) {
    put(box(9, 7.5, 11, side * 11, 1, cz), 0xf0ebdf, m);
    put(box(9.2, 0.7, 11.2, side * 11, 8.5, cz), 0xd7d1c0, m);
  }
  // The colonnade across the front.
  put(box(15, 0.7, 3.4, 0, 9, cz + 7.2), 0xe9e4d6, m);
  for (let i = -3; i <= 3; i++) put(cylinder(0.42, 8, i * 2.1, 1, cz + 8.4, 10), 0xf8f6f0, m);
  put(box(16, 0.7, 4.4, 0, 0.3, cz + 7.8), 0xd7d1c0, m);
  put(cylinder(0.14, 12, 11, 1, cz + 9.6, 6), 0xf0f0f0, m);
  flag(m, 11.1, 9.6, cz + 9.6, 3, 1.8);
}

function eagleSquare(): void {
  const lot = lotMatrix('eagle-square');
  if (!lot) return;
  const { m, front } = lot;
  // The great mast with Nigeria's flag, the two fountains, the eagle on its plinth and the saluting stand at the back.
  put(cylinder(0.28, 26, 0, 0, -2, 8), 0xf2f2f2, m);
  flag(m, 0.3, 21.4, -2, 7.5, 4.5);
  for (const side of [-1, 1]) {
    put(cylinder(4.4, 0.7, side * 9, 0, 3.5, 20), 0xcfc9b8, m);
    put(cylinder(3.9, 0.55, side * 9, 0.55, 3.5, 20), 0x58a8c8, m);
    put(spire(0.6, 4.6, side * 9, 0.6, 3.5, 8), 0xbfe6f4, m);
  }
  put(box(3, 2.4, 3, 0, 0, front - 5), 0xd8d2c2, m);
  put(box(0.8, 2.2, 0.8, 0, 2.4, front - 5), 0xc89a2e, m);
  put(box(4.2, 0.35, 1.2, 0, 4.2, front - 5), 0xc89a2e, m);
  put(box(16, 3, 3, 0, 0, -12), 0xe6e0d0, m);
  put(box(17, 0.4, 4, 0, 3, -12), 0x2f8a5b, m);
  for (let i = -5; i <= 5; i++) {
    if (Math.abs(i) < 2) continue;
    put(cylinder(0.12, 9, i * 2.4, 0, -6, 6), 0xf0f0f0, m);
    flag(m, i * 2.4 + 0.1, 7, -6, 1.5, 0.9);
  }
}

function gloryDome(): void {
  const lot = lotMatrix('dunamis-glory-dome');
  if (!lot) return;
  const { m, front } = lot;
  // The Glory Dome: a vast white auditorium under a shallow dome, a foyer and two wings.
  put(box(66, 0.7, 34, 0, 0, -1), 0xd9d4c6, m);
  put(cylinder(17.5, 8, 0, 0.7, -3, 36), 0xf4f1ea, m);
  put(dome(17.5, 0, 8.7, -3, 36), 0xe8edf2, m, 1.02);
  put(spire(0.5, 4, 0, 26.2, -3, 8), 0xc89a2e, m);
  put(box(34, 6.4, 7.5, 0, 0.7, front - 5), 0xf0ece1, m);
  put(box(34.4, 0.6, 7.9, 0, 7.1, front - 5), 0x2f5d8a, m);
  put(box(14, 4.4, 0.3, 0, 0.7, front - 1.1), 0x3d6f9a, m);
  for (const side of [-1, 1]) {
    put(box(18, 7, 14, side * 28, 0.7, -4), 0xece7da, m);
    put(box(18.4, 0.6, 14.4, side * 28, 7.7, -4), 0xcfc8b5, m);
  }
}

/** A parish church: hall, gabled roof, front tower with spire and cross. */
function parishChurch(id: string, wall: number, roof: number, accent: number): void {
  const lot = lotMatrix(id);
  if (!lot) return;
  const { m, width, depth } = lot;
  const w = Math.min(15, width - 8);
  const d = Math.min(16, depth - 8);
  const cz = -1;
  put(box(width - 4, 0.5, depth - 4, 0, 0, 0), 0xdcd6c8, m);
  put(box(w, 6, d, 0, 0.5, cz), wall, m);
  put(gable(w + 1, d + 1, 3.6, 0, 6.5, cz), roof, m);
  put(box(4, 12, 4, -w / 2 + 1, 0.5, cz + d / 2 + 0.5), wall, m);
  put(spire(3, 5, -w / 2 + 1, 12.5, cz + d / 2 + 0.5, 4), roof, m);
  put(box(0.28, 2.6, 0.28, -w / 2 + 1, 17.2, cz + d / 2 + 0.5), accent, m);
  put(box(1.5, 0.28, 0.28, -w / 2 + 1, 18.6, cz + d / 2 + 0.5), accent, m);
  put(box(3.2, 3.4, 0.3, 0, 0.5, cz + d / 2 + 0.2), 0x37474f, m);
}

/** A district mosque: prayer hall, one dome, a minaret. */
function districtMosque(id: string, dome1: number, trim: number): void {
  const lot = lotMatrix(id);
  if (!lot) return;
  const { m, width, depth } = lot;
  const w = Math.min(15, width - 8);
  const d = Math.min(13, depth - 7);
  const cz = -1;
  put(box(width - 4, 0.5, depth - 4, 0, 0, 0), 0xd8d1bf, m);
  put(box(w, 5.4, d, 0, 0.5, cz), 0xf4eedf, m);
  put(box(w + 0.2, 0.6, d + 0.2, 0, 4.3, cz), trim, m);
  put(cylinder(3.9, 1.3, 0, 5.9, cz, 20), 0xeee6d2, m);
  put(dome(3.9, 0, 7.2, cz, 20), dome1, m);
  put(spire(0.3, 2.2, 0, 11, cz, 8), 0xd9a62c, m);
  put(cylinder(0.7, 15, w / 2 + 1.4, 0.5, cz + d / 2 - 0.5, 10), 0xf4f0e6, m);
  put(spire(0.95, 2.8, w / 2 + 1.4, 15.5, cz + d / 2 - 0.5, 10), dome1, m);
}

// ---------------------------------------------------------------------------------------------------------------

/** Abuja's landmark parts (fresh geometries each call; the caller merges and disposes them). */
export function buildAbujaLandmarkParts(): BufferGeometry[] {
  parts.length = 0;
  asoRock();
  outcrops();
  nationalMosque();
  nationalChristianCentre();
  nationalAssembly();
  eagleSquare();
  gloryDome();
  parishChurch('rccg-gwarinpa', 0xf8f3e6, 0xb23a48, 0xe8c552);
  districtMosque('garki-central-mosque', 0x2c8a57, 0x2c8a57);
  districtMosque('gwarinpa-central-mosque', 0x3d7fb8, 0x3d7fb8);
  const built = [...parts];
  parts.length = 0;
  return built;
}
