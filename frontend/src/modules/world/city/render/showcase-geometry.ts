import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  LatheGeometry,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
  type BufferAttribute,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { estateSite, refinerySite, type EstateSite, type Rect, type RefinerySite } from '../layout/showcase-sites';
import { WATER_Y } from './ground-geometry';
import { paint } from './paint';

/**
 * OBO's estate (a stacked white-stone and glass villa with gold trim, the pool, the gates and AIR OBO on its pad) and
 * Dangote Refinery (visitor centre, tank farm, columns, flares, pipe racks, a tanker at the jetty), built in world
 * space from the sites' lots. Each site is a handful of merged meshes: opaque vertex colour, glass, glow (lit at
 * night), text decals (one canvas atlas) — so a site costs ≤ 5 draw calls however much detail it has.
 */

/** Text decals: one row each of the atlas the renderer paints (`SHOWCASE_DECALS`). */
export const SHOWCASE_DECALS = [
  { text: 'AIR OBO', fg: '#141414', bg: null, outline: '#c9a227' },
  { text: 'OBO', fg: '#e3bd4a', bg: null, outline: null },
  { text: 'OBO MANSION', fg: '#e3bd4a', bg: '#101010', outline: null },
  { text: 'AIR OBO', fg: '#e3bd4a', bg: '#101010', outline: null },
  { text: 'DANGOTE', fg: '#ffffff', bg: null, outline: null },
  { text: 'DANGOTE PETROLEUM REFINERY', fg: '#ffffff', bg: '#1d4f91', outline: null },
] as const;
type DecalRow = 0 | 1 | 2 | 3 | 4 | 5;

export interface SiteGeometry {
  readonly opaque: BufferGeometry;
  readonly glass: BufferGeometry | null;
  readonly glow: BufferGeometry | null;
  readonly decals: BufferGeometry | null;
}

export interface ShowcaseGeometry {
  readonly estate: SiteGeometry | null;
  readonly refinery: SiteGeometry | null;
  /** Tops of the flare stacks (the renderer flickers a flame on each). */
  readonly flares: readonly (readonly [number, number, number])[];
}

const WHITE = 0xf6f4ef;
const STONE = 0xe6dccb;
const GOLD = 0xc9a227;
const INK = 0x151515;
const STEEL = 0x7d8a96;
const PALE = 0xd7dbe0;
const BLUE = 0x1d4f91;
const YELLOW = 0xf6b90b;

const box = (w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry => new BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const boxR = (r: Rect, y0: number, y1: number, grow = 0): BufferGeometry =>
  box(r.maxX - r.minX + grow * 2, y1 - y0, r.maxZ - r.minZ + grow * 2, (r.minX + r.maxX) / 2, y0, (r.minZ + r.maxZ) / 2);
const cyl = (r: number, h: number, x: number, y: number, z: number, segments = 20, rTop = r): BufferGeometry =>
  new CylinderGeometry(rTop, r, h, segments).translate(x, y + h / 2, z);
const shrink = (r: Rect, by: number): Rect => ({ minX: r.minX + by, maxX: r.maxX - by, minZ: r.minZ + by, maxZ: r.maxZ - by });

/** A thin rod between two points. */
function rod(a: Vector3, b: Vector3, radius: number, segments = 6): BufferGeometry {
  const direction = new Vector3().subVectors(b, a);
  const length = direction.length();
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
  return new CylinderGeometry(radius, radius, length, segments).applyMatrix4(
    new Matrix4().compose(new Vector3().addVectors(a, b).multiplyScalar(0.5), quaternion, new Vector3(1, 1, 1)),
  );
}

/** A box whose 8 corners are given (x0/x1 × y0/y1 × z0/z1 order of BoxGeometry's ±0.5 signs): wings, fins, hulls. */
function prism(corner: (sx: number, sy: number, sz: number) => readonly [number, number, number]): BufferGeometry {
  const geometry = new BoxGeometry(1, 1, 1);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = corner(Math.sign(position.getX(i)), Math.sign(position.getY(i)), Math.sign(position.getZ(i)));
    position.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const tmp = new Color();

/** Vertex colours by position (a fuselage's white top, gold cheatline and black belly). */
function paintBy(geometry: BufferGeometry, pick: (x: number, y: number, z: number) => number): BufferGeometry {
  paint(geometry, 0xffffff);
  const position = geometry.getAttribute('position');
  const colors = geometry.getAttribute('color') as BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    tmp.setHex(pick(position.getX(i), position.getY(i), position.getZ(i)));
    colors.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  return geometry;
}

/** Glass and other single-material parts: position + normal + index (no uv, no colour). */
function plain(geometry: BufferGeometry): BufferGeometry {
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
  return geometry;
}

/** Map a geometry's uv (0–1) onto one atlas row. */
function toRow(geometry: BufferGeometry, row: DecalRow): BufferGeometry {
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  const rows = SHOWCASE_DECALS.length;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1 - uv.getY(i)) / rows);
  if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
  return geometry;
}

class Parts {
  readonly opaque: BufferGeometry[] = [];
  readonly glass: BufferGeometry[] = [];
  readonly glow: BufferGeometry[] = [];
  readonly decals: BufferGeometry[] = [];

  solid(geometry: BufferGeometry, hex: number, shade = 1): void {
    this.opaque.push(paint(geometry, hex, shade));
  }

  painted(geometry: BufferGeometry): void {
    this.opaque.push(geometry);
  }

  pane(geometry: BufferGeometry): void {
    this.glass.push(plain(geometry));
  }

  light(geometry: BufferGeometry, hex: number): void {
    this.glow.push(paint(geometry, hex));
  }

  /** A flat text decal `w` × `h`, facing `yaw` (0 = +z), centred at (x, y, z). */
  decal(row: DecalRow, w: number, h: number, x: number, y: number, z: number, yaw: number): void {
    this.decals.push(toRow(new PlaneGeometry(w, h).rotateY(yaw).translate(x, y, z), row));
  }

  /**
   * A decal bent round a fuselage running along x (axis at height `axisY`, radius `r`), on the +z (`side` 1) or -z
   * side, `w` long and `h` tall centred `y` above the axis; it reads left to right from that side.
   */
  hull(row: DecalRow, w: number, h: number, x: number, y: number, axisY: number, z: number, r: number, side: 1 | -1): void {
    const geometry = new PlaneGeometry(w, h, 1, 8);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const yl = y + position.getY(i);
      const zl = Math.sqrt(Math.max(0, r * r - yl * yl));
      position.setXYZ(i, x + side * position.getX(i), axisY + yl, z + side * zl);
    }
    geometry.computeVertexNormals();
    this.decals.push(toRow(geometry, row));
  }

  /** A decal wrapped round a cylinder (tank bands), centred on the bearing `theta` (0 = +z, π/2 = +x). */
  wrapped(row: DecalRow, r: number, h: number, arc: number, x: number, y: number, z: number, theta: number): void {
    const geometry = new CylinderGeometry(r, r, h, 12, 1, true, theta - arc / r / 2, arc / r).translate(x, y, z);
    this.decals.push(toRow(geometry, row));
  }

  build(): SiteGeometry | null {
    const merge = (list: BufferGeometry[]): BufferGeometry | null => {
      if (list.length === 0) return null;
      const merged = mergeGeometries(list, false);
      for (const part of list) part.dispose();
      merged?.computeBoundingSphere();
      return merged;
    };
    const opaque = merge(this.opaque);
    if (!opaque) return null;
    return { opaque, glass: merge(this.glass), glow: merge(this.glow), decals: merge(this.decals) };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// OBO's estate
// ---------------------------------------------------------------------------------------------------------------

/** Gold trim round a slab edge: four thin bars just proud of the faces. */
function trimRing(parts: Parts, r: Rect, y: number, height = 0.1, out = 0.04): void {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  parts.solid(box(w + out * 2, height, 0.06, cx, y, r.minZ - out), GOLD);
  parts.solid(box(w + out * 2, height, 0.06, cx, y, r.maxZ + out), GOLD);
  parts.solid(box(0.06, height, d + out * 2, r.minX - out, y, cz), GOLD);
  parts.solid(box(0.06, height, d + out * 2, r.maxX + out, y, cz), GOLD);
}

/** LED cove lighting under a slab edge (glows at night). */
function coveRing(parts: Parts, r: Rect, y: number): void {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  parts.light(box(w, 0.06, 0.08, cx, y, r.minZ + 0.05), 0xffd9a0);
  parts.light(box(w, 0.06, 0.08, cx, y, r.maxZ - 0.05), 0xffd9a0);
  parts.light(box(0.08, 0.06, d, r.minX + 0.05, y, cz), 0xffd9a0);
  parts.light(box(0.08, 0.06, d, r.maxX - 0.05, y, cz), 0xffd9a0);
}

/** A glass storey framed in white: glazing, corner piers, slim mullions (gold on the ground floor). */
function storey(parts: Parts, r: Rect, y0: number, y1: number, mullion: number, step: number): void {
  parts.pane(boxR(shrink(r, 0.25), y0, y1));
  const h = y1 - y0;
  for (const [x, z] of [
    [r.minX + 0.3, r.minZ + 0.3],
    [r.maxX - 0.3, r.minZ + 0.3],
    [r.minX + 0.3, r.maxZ - 0.3],
    [r.maxX - 0.3, r.maxZ - 0.3],
  ] as const)
    parts.solid(box(0.6, h, 0.6, x, y0, z), WHITE);
  for (let x = r.minX + step; x < r.maxX - step / 2; x += step) {
    parts.solid(box(0.14, h, 0.22, x, y0, r.minZ + 0.2), mullion);
    parts.solid(box(0.14, h, 0.22, x, y0, r.maxZ - 0.2), mullion);
  }
  for (let z = r.minZ + step; z < r.maxZ - step / 2; z += step) {
    parts.solid(box(0.22, h, 0.14, r.minX + 0.2, y0, z), mullion);
    parts.solid(box(0.22, h, 0.14, r.maxX - 0.2, y0, z), mullion);
  }
}

/** Warm teak under a slab (the soffit you see from below a cantilever). */
function soffit(parts: Parts, r: Rect, y: number): void {
  parts.solid(boxR(shrink(r, 0.1), y - 0.04, y), 0x9a6a3c);
}

function mansion(parts: Parts, site: EstateSite): void {
  const { ground, first, top, roof } = site.house;
  const G0 = 0.5;
  const G1 = 5.0;
  const F0 = 5.5;
  const F1 = 9.4;
  const T0 = 9.9;
  const T1 = 13.2;
  // Travertine plinth; a double-height glass ground floor between gold fins.
  parts.solid(boxR(ground, 0, G0, 0.9), STONE);
  storey(parts, ground, G0, G1, GOLD, 2.2);
  // The cantilevered first floor: white slab with a gold edge and warm cove, teak soffit, a glass band framed by
  // stone end walls, and a stone parapet.
  parts.solid(boxR(first, G1, F0, 0.4), WHITE);
  trimRing(parts, { minX: first.minX - 0.4, maxX: first.maxX + 0.4, minZ: first.minZ - 0.4, maxZ: first.maxZ + 0.4 }, G1 + 0.2, 0.14);
  soffit(parts, { minX: first.minX - 0.4, maxX: first.maxX + 0.4, minZ: first.minZ - 0.4, maxZ: first.maxZ + 0.4 }, G1);
  coveRing(parts, first, G1 - 0.1);
  storey(parts, first, F0, F1, WHITE, 3.4);
  parts.solid(box(1.6, F1 - F0, first.maxZ - first.minZ, first.minX + 0.8, F0, (first.minZ + first.maxZ) / 2), STONE);
  parts.solid(box(1.6, F1 - F0, first.maxZ - first.minZ, first.maxX - 0.8, F0, (first.minZ + first.maxZ) / 2), STONE);
  parts.solid(boxR(first, F1, T0, 0.15), WHITE);
  trimRing(parts, { minX: first.minX - 0.15, maxX: first.maxX + 0.15, minZ: first.minZ - 0.15, maxZ: first.maxZ + 0.15 }, F1 + 0.18, 0.14);
  // The penthouse: all glass under a floating roof slab with a teak soffit and a gold fascia.
  storey(parts, top, T0, T1, GOLD, 3.0);
  parts.solid(boxR(roof, T1, T1 + 0.55), WHITE);
  soffit(parts, roof, T1);
  trimRing(parts, roof, T1 + 0.2, 0.16);
  coveRing(parts, roof, T1 - 0.1);
  // Roof terrace on the first floor: glass balustrade with a gold handrail on its open edges.
  const rail = 1.05;
  const yRail = T0;
  parts.pane(box(first.maxX - first.minX - 0.4, rail, 0.06, (first.minX + first.maxX) / 2, yRail, first.minZ + 0.25));
  parts.pane(box(0.06, rail, first.maxZ - first.minZ - 0.4, first.minX + 0.25, yRail, (first.minZ + first.maxZ) / 2));
  parts.solid(box(first.maxX - first.minX - 0.4, 0.07, 0.1, (first.minX + first.maxX) / 2, yRail + rail, first.minZ + 0.25), GOLD);
  parts.solid(box(0.1, 0.07, first.maxZ - first.minZ - 0.4, first.minX + 0.25, yRail + rail, (first.minZ + first.maxZ) / 2), GOLD);
  // Gold OBO on the stone end walls, facing the drive and the jet.
  parts.decal(1, 3.0, 1.5, first.minX - 0.02, F0 + 2.1, (first.minZ + first.maxZ) / 2, -Math.PI / 2);
  parts.decal(1, 3.0, 1.5, first.maxX + 0.02, F0 + 2.1, (first.minZ + first.maxZ) / 2, Math.PI / 2);
  // Entrance: a tall gold portal, dark double doors, wide steps, downlights.
  const cx = (ground.minX + ground.maxX) / 2;
  const fz = ground.minZ;
  parts.solid(box(3.8, 4.3, 0.34, cx, G0, fz - 0.05), GOLD);
  parts.solid(box(3.0, 3.9, 0.36, cx, G0, fz - 0.06), 0x2b1d16);
  for (let k = 0; k < 3; k++) parts.solid(box(6 - k * 0.7, 0.17, 0.7, cx, k * 0.17, fz - 2.1 + k * 0.7), STONE);
  for (const dx of [-2.4, 2.4]) parts.light(box(0.5, 0.05, 0.5, cx + dx, G1 - 0.12, fz - 1.2), 0xfff1d0);
  for (const dx of [-3.2, 3.2]) parts.solid(new SphereGeometry(0.55, 12, 8).translate(cx + dx, 0.95, fz - 1.6), 0x2f5d2a);
}

function grounds(parts: Parts, site: EstateSite): void {
  const { grounds: g, driveway, forecourt, deck, pool } = site;
  // Paving: the drive from the gate and the forecourt, a stone path round the house.
  parts.solid(boxR(driveway, 0, 0.06), 0xe9e4da);
  parts.solid(boxR(forecourt, 0, 0.06), 0xe9e4da);
  parts.solid(boxR({ ...site.house.ground, minX: site.house.ground.minX - 2, maxX: site.house.ground.maxX + 2 }, 0, 0.05, 1.2), 0xdcd5c7);
  for (let x = driveway.minX + 0.5; x <= forecourt.maxX; x += 3) {
    parts.solid(box(0.16, 0.5, 0.16, x, 0, forecourt.minZ - 0.4), 0x2b2b2b);
    parts.light(box(0.2, 0.1, 0.2, x, 0.5, forecourt.minZ - 0.4), 0xffe2a8);
  }
  // Pool deck, the pool (turquoise water, a lit rim), loungers under the overhang and two parasols.
  parts.solid(boxR(deck, 0, 0.2), 0xf1ece2);
  parts.solid(boxR(pool, 0.2, 0.24), 0x2b6f7a);
  parts.solid(boxR(shrink(pool, 0.15), 0.22, 0.27), 0x3cc8d8);
  trimRing(parts, pool, 0.22, 0.05, 0.02);
  parts.light(box(pool.maxX - pool.minX, 0.03, 0.06, (pool.minX + pool.maxX) / 2, 0.24, pool.minZ + 0.1), 0x7ff6ff);
  parts.light(box(pool.maxX - pool.minX, 0.03, 0.06, (pool.minX + pool.maxX) / 2, 0.24, pool.maxZ - 0.1), 0x7ff6ff);
  const loungerX = pool.maxX + 1.0;
  for (let z = pool.minZ + 1.5; z < pool.maxZ - 1; z += 2.6) {
    parts.solid(box(0.75, 0.32, 1.9, loungerX, 0.2, z), 0xffffff);
    parts.solid(prism((sx, sy, sz) => [loungerX + sx * 0.375, 0.52 + (sy > 0 ? (sz < 0 ? 0.55 : 0.05) : 0), z - 0.95 + (sz > 0 ? 0.6 : 0)]), 0xffffff);
    parts.solid(box(0.8, 0.05, 1.95, loungerX, 0.18, z), GOLD);
  }
  for (const z of [pool.minZ + 2, pool.maxZ - 2]) {
    parts.solid(cyl(0.05, 2.4, deck.minX + 0.5, 0.2, z, 6), GOLD);
    parts.solid(new ConeGeometry(1.6, 0.5, 10).translate(deck.minX + 0.5, 2.6, z), 0xf4f0e8);
  }
  // Hedges inside the south wall.
  parts.solid(box(g.maxX - g.minX - 14, 0.9, 0.7, (g.minX + g.maxX) / 2 + 6, 0, g.maxZ - 0.8), 0x3f6e2a);
  // Waterfront glass on the low wall (east edge of the grounds, pad and apron).
  const eastTop = site.apron?.minZ ?? site.pad.minZ;
  parts.pane(box(0.06, 0.9, g.maxZ - eastTop, g.maxX - 0.3, 0.6, (g.maxZ + eastTop) / 2));
  parts.solid(box(0.12, 0.06, g.maxZ - eastTop, g.maxX - 0.3, 1.5, (g.maxZ + eastTop) / 2), GOLD);
}

/** Gate pillars with gold caps, gold leaves swung open, and a black beam carrying the sign on both faces. */
function gateway(parts: Parts, x: number, z: number, alongX: boolean, row: DecalRow, label: number): void {
  const half = 2.85;
  for (const side of [-1, 1]) {
    const px = alongX ? x + side * half : x;
    const pz = alongX ? z : z + side * half;
    parts.solid(box(0.9, 3.4, 0.9, px, 0, pz), WHITE);
    parts.solid(box(1.05, 0.22, 1.05, px, 3.4, pz), GOLD);
    parts.light(box(0.3, 0.3, 0.3, px, 3.62, pz), 0xfff1d0);
    // An open leaf: 2.3 m of gold bars hinged at the pillar, swung 70° inwards.
    const hinge = new Vector3(alongX ? x + side * (half - 0.45) : x, 0, alongX ? z : z + side * (half - 0.45));
    const inward = alongX ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
    const across = alongX ? new Vector3(-side, 0, 0) : new Vector3(0, 0, -side);
    const dir = across.multiplyScalar(Math.cos(1.22)).add(inward.multiplyScalar(Math.sin(1.22)));
    const end = hinge.clone().addScaledVector(dir, 2.3);
    for (const y of [0.15, 1.1, 2.1]) parts.solid(rod(new Vector3(hinge.x, y, hinge.z), new Vector3(end.x, y, end.z), 0.05), GOLD);
    for (let t = 0; t <= 1.001; t += 0.25) {
      const p = hinge.clone().lerp(end, t);
      parts.solid(rod(new Vector3(p.x, 0.1, p.z), new Vector3(p.x, 2.15, p.z), 0.035), GOLD);
    }
  }
  const beamW = half * 2 + 0.9;
  parts.solid(alongX ? box(beamW, 0.85, 0.5, x, 3.65, z) : box(0.5, 0.85, beamW, x, 3.65, z), INK);
  const y = 4.07;
  if (alongX) {
    parts.decal(row, label, label * 0.16, x, y, z - 0.27, Math.PI);
    parts.decal(row, label, label * 0.16, x, y, z + 0.27, 0);
  } else {
    parts.decal(row, label, label * 0.16, x - 0.27, y, z, -Math.PI / 2);
    parts.decal(row, label, label * 0.16, x + 0.27, y, z, Math.PI / 2);
  }
}

/** AIR OBO: a long-range business jet, nose west at the apron gate, airstair down on the mansion side. */
function jet(parts: Parts, site: EstateSite): void {
  const { nose, tail, z } = site.jet;
  const L = tail - nose;
  const R = 1.2;
  const axisY = 2.25;
  const upsweep = (x: number): number => {
    const s = (x - nose) / L;
    return s > 0.7 ? ((s - 0.7) / 0.3) ** 1.6 * 0.75 : 0;
  };
  // Fuselage: lathe profile along the axis — ogive nose, parallel cabin, tapering tail cone.
  const profile: Vector2[] = [];
  for (let k = 0; k <= 26; k++) {
    const s = k / 26;
    const r = s < 0.15 ? R * Math.sqrt(1 - (1 - s / 0.15) ** 2) : s < 0.68 ? R : R * (1 - 0.78 * ((s - 0.68) / 0.32) ** 1.2);
    profile.push(new Vector2(Math.max(0.02, r), s * L));
  }
  const body = new LatheGeometry(profile, 24).rotateZ(-Math.PI / 2);
  // Livery by height on the cabin: white top, a gold cheatline under the windows, a black belly.
  paintBy(body, (_x, y) => (y < -0.42 * R ? INK : y < -0.18 * R ? 0xf7f7f5 : y < -0.04 * R ? GOLD : 0xf7f7f5));
  const position = body.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + nose;
    position.setXYZ(i, x, position.getY(i) + axisY + upsweep(x), position.getZ(i) + z);
  }
  body.computeVertexNormals();
  parts.painted(body);
  // Cabin windows and the airstair door outline on both sides; the windscreen.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 7; k++) parts.solid(box(0.34, 0.3, 0.05, nose + 4.6 + k * 1.05, axisY + 0.1, z + side * (R - 0.01)), 0x1b2630);
  }
  parts.solid(box(0.95, 1.65, 0.06, nose + 3.6, axisY - 0.95, z + R - 0.02), 0x2b2b2b);
  const screen = new BoxGeometry(1.5, 0.5, 1.75).rotateZ(0.55).translate(nose + 2.25, axisY + 0.6, z);
  parts.pane(screen);
  // Wings with dihedral and sweep, gold winglets.
  for (const side of [-1, 1]) {
    const rootLE = nose + 7.6;
    const rootTE = nose + 11.8;
    const tipLE = nose + 11.6;
    const tipTE = nose + 13.2;
    const span = 8.2;
    const wing = prism((sx, sy, sz) => {
      const tip = sz * side > 0;
      const x = tip ? (sx < 0 ? tipLE : tipTE) : sx < 0 ? rootLE : rootTE;
      const y = (tip ? axisY - 0.15 : axisY - 0.75) + (sy > 0 ? (tip ? 0.12 : 0.36) : 0);
      return [x, y, z + side * (tip ? span : 0.9)];
    });
    parts.solid(wing, 0xf4f4f2);
    parts.solid(prism((sx, sy, sz) => [sx < 0 ? tipLE + 0.2 + (sy > 0 ? 0.7 : 0) : tipTE + (sy > 0 ? 0.2 : 0), axisY - 0.05 + (sy > 0 ? 1.4 : 0), z + side * (span + (sz > 0 ? 0.08 : -0.08) * side)]), GOLD);
    // Rear-mounted engine on a pylon.
    const ex = nose + 14.2;
    const ez = z + side * 2.05;
    parts.solid(new CylinderGeometry(0.62, 0.68, 3.4, 18).rotateZ(Math.PI / 2).translate(ex + 1.7, axisY + 0.55, ez), 0xf4f4f2);
    parts.solid(new CylinderGeometry(0.5, 0.5, 0.06, 18).rotateZ(Math.PI / 2).translate(ex - 0.01, axisY + 0.55, ez), 0x1c1c1c);
    parts.solid(new CylinderGeometry(0.7, 0.7, 0.18, 18).rotateZ(Math.PI / 2).translate(ex + 0.5, axisY + 0.55, ez), GOLD);
    parts.solid(box(1.6, 0.25, Math.abs(ez - z) - R + 0.2, ex + 1.8, axisY + 0.42, (ez + z + side * (R - 0.2)) / 2), 0xe9e9e6);
    // Main gear.
    parts.solid(cyl(0.09, axisY - 1.0, nose + 10.6, 0.35, z + side * 1.6, 8), 0x9e9e9e);
    parts.solid(new CylinderGeometry(0.36, 0.36, 0.28, 14).rotateX(Math.PI / 2).translate(nose + 10.6, 0.36, z + side * 1.6), 0x1c1c1c);
  }
  parts.solid(cyl(0.08, axisY - 1.1, nose + 2.6, 0.3, z, 8), 0x9e9e9e);
  parts.solid(new CylinderGeometry(0.3, 0.3, 0.24, 14).rotateX(Math.PI / 2).translate(nose + 2.6, 0.3, z), 0x1c1c1c);
  // T-tail: black fin with the gold OBO, stabiliser on top.
  const finY = axisY + 0.9;
  const fin = prism((sx, sy, sz) => {
    const up = sy > 0;
    const x = up ? (sx < 0 ? nose + 17.4 : nose + 19.4) : sx < 0 ? nose + 14.6 : nose + 18.9;
    return [x, up ? finY + 3.6 : finY - 0.3, z + sz * (up ? 0.1 : 0.2)];
  });
  parts.solid(fin, INK);
  for (const side of [-1, 1]) {
    const stabiliser = prism((sx, sy, sz) => {
      const tip = sz * side > 0;
      const x = sx < 0 ? (tip ? nose + 18.9 : nose + 17.5) : tip ? nose + 20.0 : nose + 19.6;
      return [x, finY + 3.55 + (sy > 0 ? (tip ? 0.1 : 0.2) : 0), z + (tip ? side * 3.6 : 0)];
    });
    parts.solid(stabiliser, 0xf4f4f2);
  }
  parts.decal(1, 1.7, 0.85, nose + 17.9, finY + 1.9, z + 0.17, 0);
  parts.decal(1, 1.7, 0.85, nose + 17.9, finY + 1.9, z - 0.17, Math.PI);
  // "AIR OBO" on both sides of the fuselage, forward of the wing.
  parts.hull(0, 5.4, 0.78, nose + 6.8, 0.52, axisY, z, R + 0.03, 1);
  parts.hull(0, 5.4, 0.78, nose + 6.8, 0.52, axisY, z, R + 0.03, -1);
  // Airstair down to the apron on the mansion side, gold rails, a red carpet to the pad's edge.
  const sx = nose + 3.6;
  const top = axisY - 0.95;
  const run = 2.6;
  for (let k = 0; k < 6; k++) {
    const t = (k + 0.5) / 6;
    parts.solid(box(0.9, 0.06, run / 6 + 0.02, sx, top * (1 - t), z + R + run * t), 0xe9e4da);
  }
  for (const dx of [-0.48, 0.48]) parts.solid(rod(new Vector3(sx + dx, top + 0.9, z + R), new Vector3(sx + dx, 0.9, z + R + run), 0.03), GOLD);
  parts.solid(box(1.2, 0.02, site.pad.maxZ - (z + R + run), sx, 0, (site.pad.maxZ + z + R + run) / 2), 0xa31621);
  // Pad markings: a yellow lead-in line and a stop bar under the nose.
  const pad = site.pad;
  parts.solid(box(pad.maxX - pad.minX - 2, 0.02, 0.2, (pad.minX + pad.maxX) / 2, 0.02, z), YELLOW);
  parts.solid(box(0.25, 0.02, 4, nose - 0.8, 0.02, z), YELLOW);
}

function estate(site: EstateSite): SiteGeometry | null {
  const parts = new Parts();
  grounds(parts, site);
  mansion(parts, site);
  gateway(parts, site.gate.x, site.gate.z + 0.3, true, 2, 4.6);
  gateway(parts, site.jetGate.x + 0.3, site.jetGate.z, false, 3, 4.2);
  jet(parts, site);
  return parts.build();
}

// ---------------------------------------------------------------------------------------------------------------
// Dangote Refinery
// ---------------------------------------------------------------------------------------------------------------

/** A storage tank: white shell, blue band with DANGOTE, a shallow roof, a dark base ring. */
function tank(parts: Parts, x: number, z: number, r: number, h: number, faces: readonly number[]): void {
  parts.solid(cyl(r + 0.25, 0.4, x, 0, z, 32), 0x8a8f94);
  parts.solid(cyl(r, h, x, 0.4, z, 32), 0xf2f2ee);
  parts.solid(cyl(r + 0.04, 1.7, x, h - 2.6, z, 32), BLUE);
  parts.solid(new ConeGeometry(r + 0.1, 0.9, 32).translate(x, h + 0.85, z), 0xc9ccd0);
  parts.solid(cyl(0.5, 0.5, x, h + 1.1, z, 8), 0x8a8f94);
  for (const theta of faces) parts.wrapped(4, r + 0.09, 1.25, Math.min(7.5, r * 1.25), x, h - 1.75, z, theta);
  // A spiral-ish stair: a slanted rail up the side.
  parts.solid(rod(new Vector3(x + r + 0.2, 0.4, z - 1.5), new Vector3(x + r * 0.6 + 0.2, h + 0.4, z + r * 0.8), 0.06), YELLOW);
}

/** A column with platforms every few metres, a cap, ladders, and lights on the platforms. */
function column(parts: Parts, x: number, z: number, r: number, h: number): void {
  parts.solid(cyl(r + 0.4, 1.2, x, 0, z, 16), 0x8a8f94);
  parts.solid(cyl(r, h, x, 1.2, z, 20, r * 0.96), PALE);
  parts.solid(new SphereGeometry(r * 0.96, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, h + 1.2, z), PALE);
  for (let y = 6; y < h; y += 6) {
    parts.solid(new CylinderGeometry(r + 1.0, r + 1.0, 0.18, 20).translate(x, y + 1.2, z), 0x5f6a75);
    parts.solid(new CylinderGeometry(r + 1.02, r + 1.02, 0.7, 20, 1, true).translate(x, y + 1.6, z), YELLOW, 0.95);
    parts.light(box(0.3, 0.3, 0.3, x + r + 0.9, y + 1.9, z), 0xffe7b0);
  }
  parts.solid(box(0.5, h, 0.12, x, 1.2, z + r + 0.35), 0x5f6a75);
  parts.light(box(0.35, 0.35, 0.35, x, h + 2.3, z), 0xff2a2a);
}

/** An open steel structure: columns, decks, yellow rails and drums on the decks. */
function frame(parts: Parts, r: Rect, levels: number, storey: number): void {
  for (let x = r.minX; x <= r.maxX + 0.01; x += (r.maxX - r.minX) / 4) {
    for (const z of [r.minZ, (r.minZ + r.maxZ) / 2, r.maxZ]) parts.solid(box(0.45, levels * storey, 0.45, x, 0, z), STEEL);
  }
  for (let k = 1; k <= levels; k++) {
    const y = k * storey;
    parts.solid(boxR(r, y - 0.25, y, 0.3), 0x5f6a75);
    parts.solid(box(r.maxX - r.minX + 0.6, 0.08, 0.08, (r.minX + r.maxX) / 2, y + 1.0, r.minZ - 0.3), YELLOW);
    parts.solid(box(r.maxX - r.minX + 0.6, 0.08, 0.08, (r.minX + r.maxX) / 2, y + 1.0, r.maxZ + 0.3), YELLOW);
    if (k < levels) {
      const len = (r.maxX - r.minX) * 0.6;
      parts.solid(new CylinderGeometry(1.1, 1.1, len, 16).rotateZ(Math.PI / 2).translate((r.minX + r.maxX) / 2, y + 1.15, (r.minZ + r.maxZ) / 2), 0xe2e5e8);
    }
    for (let x = r.minX + 2; x < r.maxX; x += 4) parts.light(box(0.25, 0.25, 0.25, x, y - 0.45, r.minZ - 0.2), 0xffe7b0);
  }
}

/** A pipe rack along a line: portal supports every 6 m and a bundle of coloured pipes. */
function pipeRack(parts: Parts, x0: number, z0: number, x1: number, z1: number): void {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const ux = (x1 - x0) / length;
  const uz = (z1 - z0) / length;
  for (let t = 0; t <= length; t += 6) {
    const x = x0 + ux * t;
    const z = z0 + uz * t;
    for (const side of [-1, 1]) parts.solid(box(0.3, 6.2, 0.3, x - uz * side * 1.6, 0, z + ux * side * 1.6), STEEL);
    parts.solid(box(Math.abs(uz) * 3.6 + 0.3, 0.3, Math.abs(ux) * 3.6 + 0.3, x, 5.9, z), STEEL);
  }
  const colours = [0xb9bec4, YELLOW, 0x3f7f4f, 0xb9bec4, 0x8a5a3a];
  colours.forEach((hex, k) => {
    const offset = -1.2 + k * 0.6;
    const a = new Vector3(x0 - uz * offset, 6.45, z0 + ux * offset);
    const b = new Vector3(x1 - uz * offset, 6.45, z1 + ux * offset);
    parts.solid(rod(a, b, 0.22, 8), hex);
  });
}

function refinery(site: RefinerySite): SiteGeometry | null {
  const parts = new Parts();
  const w = site.works;
  const c = site.centre;
  // Tank farm on the shore end: bund walls round it, DANGOTE on every tank facing the road and the lagoon.
  for (const t of site.tanks) tank(parts, t.x, t.z, t.r, t.h, [Math.PI / 2, t.z > (w.minZ + w.maxZ) / 2 ? 0 : Math.PI, -Math.PI / 2]);
  const farm: Rect = { minX: w.minX + 1.2, maxX: w.maxX - 7, minZ: w.maxZ - 36, maxZ: w.maxZ - 1.5 };
  for (const [x0, z0, x1, z1] of [
    [farm.minX, farm.minZ, farm.maxX, farm.minZ],
    [farm.minX, farm.maxZ, farm.maxX, farm.maxZ],
    [farm.minX, farm.minZ, farm.minX, farm.maxZ],
    [farm.maxX, farm.minZ, farm.maxX, farm.maxZ],
  ] as const)
    parts.solid(box(Math.abs(x1 - x0) + 0.4, 0.8, Math.abs(z1 - z0) + 0.4, (x0 + x1) / 2, 0, (z0 + z1) / 2), 0xb5b1a8);
  // Process area: crude and vacuum columns, the reformer structure, a furnace, LPG spheres, a red-and-white stack.
  column(parts, w.minX + 34, w.minZ + 12, 2.2, 40);
  column(parts, w.minX + 41, w.minZ + 18, 1.5, 30);
  column(parts, w.minX + 27, w.minZ + 8, 2.8, 22);
  frame(parts, { minX: w.minX + 4, maxX: w.minX + 20, minZ: w.minZ + 4, maxZ: w.minZ + 16 }, 3, 6);
  frame(parts, { minX: w.minX + 24, maxX: w.minX + 33, minZ: w.minZ + 22, maxZ: w.minZ + 30 }, 2, 6);
  parts.solid(box(9, 7, 7, w.minX + 41, 0, w.minZ + 30), 0xb04a2a);
  parts.solid(cyl(0.7, 18, w.minX + 39, 7, w.minZ + 30, 10), 0x6b6f75);
  parts.solid(cyl(0.7, 18, w.minX + 43, 7, w.minZ + 30, 10), 0x6b6f75);
  for (const [dx, dz] of [
    [10, 30],
    [18, 34],
  ] as const) {
    const sx = w.minX + dx;
    const sz = w.minZ + dz;
    for (const [lx, lz] of [
      [-2.6, -2.6],
      [2.6, -2.6],
      [-2.6, 2.6],
      [2.6, 2.6],
    ] as const)
      parts.solid(box(0.35, 4.2, 0.35, sx + lx, 0, sz + lz), STEEL);
    parts.solid(new SphereGeometry(4, 20, 14).translate(sx, 7.6, sz), 0xf2f2ee);
    parts.solid(new CylinderGeometry(4.05, 4.05, 0.7, 20).translate(sx, 7.6, sz), BLUE);
  }
  const stackX = w.maxX - 5;
  const stackZ = w.minZ + 5;
  for (let k = 0; k < 8; k++) parts.solid(cyl(1.45 - k * 0.06, 6, stackX, k * 6, stackZ, 16, 1.39 - k * 0.06), k % 2 ? 0xd62f2f : 0xf4f4f0);
  parts.light(box(0.4, 0.4, 0.4, stackX, 48.2, stackZ), 0xff2a2a);
  // Pipe racks: one between the process area and the tank farm, one along the east fence.
  pipeRack(parts, w.minX + 2, farm.minZ - 4, w.maxX - 3, farm.minZ - 4);
  pipeRack(parts, w.maxX - 3, w.minZ + 2, w.maxX - 3, farm.minZ - 4);
  // Flare stacks on the shore (their flames are drawn by the renderer at `flares`).
  for (const [dx, dz, h] of [
    [2.5, 20, 52],
    [3.5, 27, 46],
  ] as const) {
    const fx = w.minX + dx;
    const fz = w.minZ + dz;
    parts.solid(cyl(0.9, h, fx, 0, fz, 10, 0.4), 0x9aa0a6);
    for (let y = 10; y < h; y += 12) parts.solid(new CylinderGeometry(1.4, 1.4, 0.15, 10).translate(fx, y, fz), 0x5f6a75);
    for (const [gx, gz] of [
      [6, 0],
      [-3, 5],
      [-3, -5],
    ] as const)
      parts.solid(rod(new Vector3(fx, h * 0.75, fz), new Vector3(fx + gx, 0, fz + gz), 0.03, 4), 0x5f6a75);
    parts.light(box(0.4, 0.4, 0.4, fx, h + 0.2, fz), 0xff2a2a);
  }
  // Jetty into the lagoon with a tanker alongside.
  const jz = w.maxZ - 22;
  parts.solid(box(16, 0.5, 3, w.minX - 8, 0.0, jz), 0x8a8f94);
  for (let x = w.minX - 15; x < w.minX; x += 4) parts.solid(cyl(0.25, 3.4, x, WATER_Y - 1, jz + 1.3, 6), 0x5f6a75);
  const hx0 = w.minX - 52;
  const hx1 = w.minX - 14;
  const hz = jz + 6.2;
  const hull = prism((sx, sy, sz) => {
    const bow = sx < 0;
    const x = bow ? hx0 + (sy < 0 ? 3 : 0) : hx1;
    const halfBeam = bow ? (sy < 0 ? 0.6 : 1.4) : 3.6;
    return [x, sy < 0 ? WATER_Y - 1.2 : 1.8, hz + sz * halfBeam];
  });
  paintBy(hull, (_x, y) => (y < WATER_Y + 0.6 ? 0x8b1e1e : 0x1c1c1c));
  parts.painted(hull);
  parts.solid(box(hx1 - hx0 - 4, 0.3, 6.6, (hx0 + hx1) / 2 + 2, 1.8, hz), 0x6f2a24);
  parts.solid(box(5, 6.5, 6.4, hx1 - 3, 2.1, hz), 0xf4f4f0);
  parts.solid(box(5.6, 0.4, 7.2, hx1 - 3, 8.6, hz), 0xf4f4f0);
  parts.pane(box(0.06, 0.9, 5.6, hx1 - 5.53, 7.2, hz));
  parts.solid(cyl(0.6, 3.2, hx1 - 2.5, 9.0, hz, 10), BLUE);
  parts.solid(pipeAlong(hx0 + 8, hx1 - 7, 2.4, hz), 0xb9bec4);
  parts.decal(4, 11, 2.2, (hx0 + hx1) / 2 + 2, 0.4, hz + 3.25, 0);
  parts.decal(4, 11, 2.2, (hx0 + hx1) / 2 + 2, 0.4, hz - 3.25, Math.PI);
  // The visitor centre: glass and white, a blue band, the canopy and the DANGOTE plates facing the road.
  const v: Rect = { minX: c.minX + 1, maxX: c.maxX - 2.6, minZ: c.minZ + 1, maxZ: c.maxZ - 1 };
  parts.solid(boxR(v, 0, 0.3, 0.4), STONE);
  parts.pane(boxR(shrink(v, 0.2), 0.3, 6.2));
  parts.solid(boxR(v, 6.2, 7.0, 0.2), WHITE);
  parts.solid(boxR(v, 5.4, 6.2, 0.05), BLUE);
  parts.solid(box(c.maxX - 0.6 - v.maxX, 0.35, v.maxZ - v.minZ + 1.6, (c.maxX - 0.6 + v.maxX) / 2, 4.2, (v.minZ + v.maxZ) / 2), WHITE);
  for (const z of [v.minZ - 0.3, v.maxZ + 0.3]) parts.solid(box(0.3, 4.2, 0.3, c.maxX - 1, 0, z), WHITE);
  parts.light(box(0.08, 0.06, v.maxZ - v.minZ, c.maxX - 0.65, 4.15, (v.minZ + v.maxZ) / 2), 0xfff1d0);
  parts.solid(box(0.4, 1.6, 7.6, v.maxX + 0.1, 7.0, (v.minZ + v.maxZ) / 2), BLUE);
  parts.decal(4, 6.6, 1.3, v.maxX + 0.32, 7.8, (v.minZ + v.maxZ) / 2, Math.PI / 2);
  parts.decal(5, 7.8, 0.5, c.maxX - 0.42, 4.37, (v.minZ + v.maxZ) / 2, Math.PI / 2);
  parts.solid(box(0.06, 0.62, 8.0, c.maxX - 0.45, 4.06, (v.minZ + v.maxZ) / 2), BLUE);
  // A monolith at the gate facing the junction.
  parts.solid(box(0.9, 5.6, 2.6, c.maxX - 1.2, 0, c.minZ + 0.9 + 1.3), BLUE);
  parts.decal(4, 2.3, 0.45, c.maxX - 0.74, 4.6, c.minZ + 2.2, Math.PI / 2);
  return parts.build();
}

/** A long pipe along x on a deck. */
function pipeAlong(x0: number, x1: number, y: number, z: number): BufferGeometry {
  return new CylinderGeometry(0.25, 0.25, x1 - x0, 8).rotateZ(Math.PI / 2).translate((x0 + x1) / 2, y, z);
}

let cached: ShowcaseGeometry | null = null;

/** Both sites (built once per page; callers clone what they keep). */
export function buildShowcaseGeometry(): ShowcaseGeometry {
  if (cached) return cached;
  const estateAt = estateSite();
  const refineryAt = refinerySite();
  const flares: [number, number, number][] = refineryAt
    ? [
        [refineryAt.works.minX + 2.5, 52.5, refineryAt.works.minZ + 20],
        [refineryAt.works.minX + 3.5, 46.5, refineryAt.works.minZ + 27],
      ]
    : [];
  cached = { estate: estateAt ? estate(estateAt) : null, refinery: refineryAt ? refinery(refineryAt) : null, flares };
  return cached;
}
