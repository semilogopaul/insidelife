import { CITY_MAP, DISTRICTS, ROAD_LINE_WIDTH, cellCentreZ, cityOfVenueId, rowDepth, venueLot, type CityId } from '@insidelife/shared';
import { BoxGeometry, ConeGeometry, CylinderGeometry, Matrix4, Quaternion, SphereGeometry, Vector3, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AIRPORT_TERMINAL_IDS, airportSpec, GAT_TERMINAL_IDS, gatSpec } from '../layout/aviation-landmarks';
import { APRON, frameOf, PAVEMENT_Y, type LotFrame } from '../layout/placements';
import { buildAbujaLandmarkParts } from './abuja-geometry';
import { WATER_Y } from './ground-geometry';
import { frameMatrix } from './lot-frame';
import { paint } from './paint';

/**
 * Procedural landmarks that make the city readable at a glance: the MMIA terminal and control tower, the
 * National Stadium bowl, the Lagos Central Mosque, the Lekki-Ikoyi Link Bridge pylon and cables, the Lekki toll
 * plaza and campus gates. Authored in lot-local space (x right when facing the lot from the road, z towards the
 * road) and merged into one vertex-coloured mesh.
 */

const parts: BufferGeometry[] = [];

export { frameMatrix };

function add(geometry: BufferGeometry, hex: number, matrix: Matrix4, shade = 1): void {
  parts.push(paint(geometry, hex, shade).applyMatrix4(matrix));
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry => new BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cylinder = (r: number, h: number, x: number, y: number, z: number, segments = 12): BufferGeometry => new CylinderGeometry(r, r, h, segments).translate(x, y + h / 2, z);

/** A thin rod between two world points. */
function rod(a: Vector3, b: Vector3, radius: number): BufferGeometry {
  const direction = new Vector3().subVectors(b, a);
  const length = direction.length();
  const geometry = new CylinderGeometry(radius, radius, length, 5);
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  return geometry.applyMatrix4(new Matrix4().compose(new Vector3().addVectors(a, b).multiplyScalar(0.5), quaternion, new Vector3(1, 1, 1)));
}

/** A commercial terminal and its control tower (`mmia-airport` as ever; `naia-airport` wider, with a second storey). */
function airport(venueId: string): void {
  const spec = airportSpec(venueId);
  if (!spec) return;
  const m = frameMatrix(spec.frame);
  const back = -spec.frame.depth / 2;
  const { width: w, depth: d, tower } = spec;
  const extra = d - 18;
  add(box(w, 11, d, 0, 0, back + 4 + d / 2), 0xe9e5dc, m);
  add(box(w - 2, 7, 0.4, 0, 2, back + 4 + d + 0.1), 0x5f84a0, m);
  add(box(w + 6, 0.9, 28 + extra, 0, 11, back + 15 + extra / 2), 0xdcd9d2, m);
  add(box(w + 6, 0.9, 0.5, 0, 11, back + 29 + extra), venueId === 'naia-airport' ? 0x0b6b3a : 0x1a8a4a, m);
  for (let x = -Math.floor(w / 20) * 10; x <= w / 2; x += 10) add(cylinder(0.35, 11, x, 0, back + 28 + extra), 0xf2f0ea, m);
  if (spec.twoStorey) {
    add(box(w * 0.6, 4.5, d - 6, 0, 11.9, back + 4 + d / 2), 0xf1eee6, m);
    add(box(w * 0.6 + 2, 0.7, d - 4, 0, 16.4, back + 4 + d / 2), 0xdcd9d2, m);
    add(box(w * 0.6 - 2, 2.4, 0.3, 0, 12.6, back + 4 + d - 2.9), 0x5f84a0, m);
  }
  // Control tower.
  add(cylinder(2.2, tower.height - 4, tower.x, 0, tower.z), 0xe2ddd2, m);
  add(cylinder(4.2, 4, tower.x, tower.height - 4, tower.z), 0x4b6f86, m);
  add(cylinder(4.6, 0.8, tower.x, tower.height, tower.z), 0xf2f0ea, m);
  add(new ConeGeometry(1.2, 3, 8).translate(tower.x, tower.height + 2.3, tower.z), 0xd9452f, m);
}

/** A General Aviation Terminal: a glassy lounge by the road, a barrel-roofed hangar behind it, a small control cab. */
function aviationTerminal(venueId: string): void {
  const spec = gatSpec(venueId);
  if (!spec) return;
  const m = frameMatrix(spec.frame);
  const { lounge, hangar, tower } = spec;
  add(box(lounge.halfW * 2, lounge.height, lounge.halfD * 2, lounge.x, 0, lounge.z), 0xf0ece2, m);
  add(box(lounge.halfW * 2 - 1.2, lounge.height * 0.55, 0.3, lounge.x, 1, lounge.z + lounge.halfD + 0.05), 0x4f7e94, m);
  add(box(lounge.halfW * 2 + 1.4, 0.6, lounge.halfD * 2 + 1.4, lounge.x, lounge.height, lounge.z), 0x0e4a54, m);
  add(box(lounge.halfW * 2 + 1.4, 0.35, 0.4, lounge.x, lounge.height + 0.6, lounge.z + lounge.halfD + 0.7), 0xe8c35a, m);
  // Hangar: walls, a half-cylinder roof along its width and a dark door.
  const wall = hangar.height - 3;
  add(box(hangar.halfW * 2, wall, hangar.halfD * 2, hangar.x, 0, hangar.z), 0xd8dadb, m);
  add(
    new CylinderGeometry(1, 1, hangar.halfD * 2, 20, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2).scale(hangar.halfW, 3, 1).translate(hangar.x, wall, hangar.z),
    0xc4c8ca,
    m,
  );
  add(box(hangar.halfW * 1.5, wall - 0.8, 0.3, hangar.x, 0, hangar.z + hangar.halfD + 0.05), 0x2b3a42, m);
  add(box(hangar.halfW * 2 + 0.2, 0.5, 0.35, hangar.x, wall - 0.9, hangar.z + hangar.halfD + 0.1), 0x0e4a54, m);
  // Control cab.
  add(cylinder(0.9, tower.height - 2.4, tower.x, 0, tower.z, 10), 0xe2ddd2, m);
  add(cylinder(2.1, 2.4, tower.x, tower.height - 2.4, tower.z, 10), 0x4b6f86, m);
  add(cylinder(2.4, 0.5, tower.x, tower.height, tower.z, 10), 0xf2f0ea, m);
  // Windsock mast on the lounge roof.
  add(box(0.12, 4, 0.12, lounge.x - lounge.halfW + 1.2, lounge.height, lounge.z), 0xbfc2c4, m);
  add(new ConeGeometry(0.4, 1.6, 8).rotateZ(-Math.PI / 2).translate(lounge.x - lounge.halfW + 2.1, lounge.height + 3.6, lounge.z), 0xe65a1e, m);
}

function stadium(): void {
  const lot = venueLot('national-stadium');
  if (!lot) return;
  const frame = frameOf(lot);
  const m = frameMatrix(frame);
  const SEG = 44;
  const rx = Math.min(27, frame.width / 2 - 2);
  const rz = Math.min(12.5, frame.depth / 2 - 2);
  const cz = -1.5;
  const ring = (k: number, sx: number, sz: number): Vector3 => new Vector3(Math.cos((k / SEG) * Math.PI * 2) * sx, 0, cz + Math.sin((k / SEG) * Math.PI * 2) * sz);
  for (let k = 0; k < SEG; k++) {
    const a0 = ring(k, rx, rz);
    const a1 = ring(k + 1, rx, rz);
    const i0 = ring(k, rx - 7, rz - 5.5);
    const i1 = ring(k + 1, rx - 7, rz - 5.5);
    const mid0 = a0.clone().add(i0).multiplyScalar(0.5);
    const mid1 = a1.clone().add(i1).multiplyScalar(0.5);
    // Outer wall: a thin box along the segment.
    const angle = Math.atan2(a1.z - a0.z, a1.x - a0.x);
    const wall = new BoxGeometry(a0.distanceTo(a1) + 0.3, 11, 0.6).applyMatrix4(new Matrix4().makeRotationY(-angle).setPosition((a0.x + a1.x) / 2, 5.5, (a0.z + a1.z) / 2));
    add(wall, 0xd8d2c4, m);
    // Stands: two tiers, green and white like the national colours.
    parts.push(paint(slope(a0, a1, mid0, mid1, 10.2, 6.2), k % 2 ? 0x1a8a4a : 0x23964f).applyMatrix4(m));
    parts.push(paint(slope(mid0, mid1, i0, i1, 6.2, 1.8), 0xeeeee6, k % 2 ? 1 : 0.94).applyMatrix4(m));
  }
  // Pitch.
  add(new CylinderGeometry(1, 1, 0.3, 32).scale(rx - 7, 1, rz - 5.5).translate(0, 0.05, cz), 0x4f9a3c, m);
  add(new CylinderGeometry(1, 1, 0.32, 32).scale(rx - 11, 1, rz - 8).translate(0, 0.05, cz), 0x5aa647, m);
  // Floodlight masts.
  for (const [x, z] of [
    [-rx - 1.5, cz - rz],
    [rx + 1.5, cz - rz],
    [-rx - 1.5, cz + rz],
    [rx + 1.5, cz + rz],
  ] as const) {
    add(box(0.8, 22, 0.8, x, 0, z), 0xbfc2c4, m);
    add(box(4, 2.2, 0.6, x, 21, z), 0xf4f4ee, m);
  }
}

/** Quad strip from an outer edge (height h0) down to an inner edge (height h1). */
function slope(a0: Vector3, a1: Vector3, b0: Vector3, b1: Vector3, h0: number, h1: number): BufferGeometry {
  const geometry = new BoxGeometry(1, 1, 1);
  const position = geometry.getAttribute('position');
  // Map the unit box corners onto the sloped panel (thin underside).
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + 0.5;
    const y = position.getY(i) + 0.5;
    const z = position.getZ(i) + 0.5;
    const outer = new Vector3().lerpVectors(a0, a1, x);
    const inner = new Vector3().lerpVectors(b0, b1, x);
    const p = new Vector3().lerpVectors(outer, inner, z);
    const top = h0 + (h1 - h0) * z;
    position.setXYZ(i, p.x, top - (1 - y) * 0.6, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function mosque(): void {
  const lot = venueLot('central-mosque');
  if (!lot) return;
  const frame = frameOf(lot);
  const m = frameMatrix(frame);
  const front = frame.depth / 2 - APRON;
  add(box(14, 7, 12, 0, 0, front - 7), 0xefe6d2, m);
  add(box(6, 5.5, 1.2, 0, 0, front - 0.6), 0xe6dac0, m);
  add(cylinder(4.6, 1.4, 0, 7, front - 7, 20), 0xefe6d2, m);
  add(new SphereGeometry(4.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 8.4, front - 7), 0x2c8a57, m);
  add(new ConeGeometry(0.35, 2.4, 8).translate(0, 14.1, front - 7), 0xd9b23c, m);
  for (const [x, z] of [
    [-8.2, front - 12.6],
    [8.2, front - 12.6],
    [-8.2, front - 1],
    [8.2, front - 1],
  ] as const) {
    add(cylinder(0.75, 21, x, 0, z, 10), 0xf4f0e6, m);
    add(cylinder(1.2, 0.5, x, 16, z, 10), 0xe6dac0, m);
    add(new ConeGeometry(0.85, 2.6, 10).translate(x, 22.3, z), 0x2c8a57, m);
  }
}

function linkBridge(): void {
  const bridge = CITY_MAP.bridges.find((entry) => entry.name === 'Lekki-Ikoyi Link Bridge');
  if (!bridge) return;
  const cx = (bridge.from.x + bridge.to.x) / 2;
  const cz = (bridge.from.z + bridge.to.z) / 2;
  const alongX = Math.abs(bridge.to.x - bridge.from.x) > Math.abs(bridge.to.z - bridge.from.z);
  const m = new Matrix4().makeRotationY(alongX ? 0 : Math.PI / 2).setPosition(cx, 0, cz);
  const top = 34;
  // The pylon legs stand just outside the four-lane deck.
  const leg = ROAD_LINE_WIDTH / 2 + 1.4;
  for (const side of [-1, 1]) {
    add(box(1.4, top - WATER_Y, 1.4, 0, WATER_Y, side * leg), 0xf3f3f0, m);
    for (const offset of [-14, -10, -6, 6, 10, 14]) {
      parts.push(paint(rod(new Vector3(0, top - 3 - Math.abs(offset) * 0.25, side * leg), new Vector3(offset, 0.9, side * (leg - 1.3)), 0.08), 0xe8e8e2).applyMatrix4(m));
    }
  }
  add(box(1.2, 1.6, leg * 2 + 1.4, 0, top - 2, 0), 0xf3f3f0, m);
  add(box(1.2, 1.2, leg * 2 + 1.4, 0, 9, 0), 0xf3f3f0, m);
}

function tollPlaza(): void {
  const plaza = CITY_MAP.lots.find((entry) => entry.id === 'landmark:lekki-toll-plaza');
  if (!plaza) return;
  const x = (plaza.footprint.minX + plaza.footprint.maxX) / 2;
  // The canopy spans the four-lane expressway in front of the plaza; pillars and booths stand beyond its pavements.
  const roadRow = plaza.cells[1] - 1;
  const roadZ = cellCentreZ(roadRow);
  const half = rowDepth(roadRow) / 2;
  const m = new Matrix4().setPosition(x, 0, roadZ);
  add(box(12, 1, half * 2 + 5.5, 0, 6.2, 0), 0xf1f0ea, m);
  add(box(12.2, 0.5, 0.3, 0, 6.4, half + 2.8), 0xf6b90b, m);
  add(box(12.2, 0.5, 0.3, 0, 6.4, -half - 2.8), 0xf6b90b, m);
  for (const z of [-half - 2.2, half + 2.2]) for (const dx of [-5, 5]) add(box(0.7, 6.2, 0.7, dx, z < 0 ? WATER_Y : 0, z), 0xd9d6cf, m);
  add(box(2.4, 2.8, 1.8, -2.5, PAVEMENT_Y, half + 1.6), 0xe9e4d8, m);
  add(box(2.4, 2.8, 1.8, 2.5, PAVEMENT_Y, half + 1.6), 0xe9e4d8, m);
}

function campusGates(cityId: CityId): void {
  for (const lot of CITY_MAP.lots) {
    if (lot.archetype !== 'campus' || !lot.entrance || DISTRICTS[lot.districtId].cityId !== cityId) continue;
    const frame = frameOf(lot);
    const m = frameMatrix(frame);
    // Door position in local x (right of centre when facing the lot from the road is +x).
    const dx = lot.entrance.position.x - frame.cx;
    const dz = lot.entrance.position.z - frame.cz;
    const localX = dx * frame.fz - dz * frame.fx;
    const z = frame.depth / 2 - 0.6;
    for (const side of [-1, 1]) add(box(1.1, 4.8, 1.1, localX + side * 4.6, 0, z), 0xdcd0b8, m);
    add(box(10.4, 1.3, 0.9, localX, 4.4, z), 0x0f5132, m);
  }
}

const cache = new Map<CityId, BufferGeometry>();

/**
 * One city's landmarks as one geometry (built once per page; the caller owns disposal of clones). A city's mesh holds
 * only its own landmarks, so the other city's triangles are never drawn or kept in memory.
 */
export function buildLandmarkGeometry(cityId: CityId = 'lagos'): BufferGeometry {
  const cached = cache.get(cityId);
  if (cached) return cached.clone();
  parts.length = 0;
  // Each city builds only its own landmarks (its airport terminals and General Aviation Terminals included).
  for (const id of AIRPORT_TERMINAL_IDS) if (cityOfVenueId(id) === cityId) airport(id);
  for (const id of GAT_TERMINAL_IDS) if (cityOfVenueId(id) === cityId) aviationTerminal(id);
  if (cityId === 'lagos') {
    stadium();
    mosque();
    linkBridge();
    tollPlaza();
  } else {
    parts.push(...buildAbujaLandmarkParts());
  }
  campusGates(cityId);
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  parts.length = 0;
  if (!merged) throw new Error('landmark merge failed');
  merged.computeBoundingSphere();
  cache.set(cityId, merged);
  return merged.clone();
}
