import { CITY_MAP, DISTRICT_IDS, cellCentreX, cellCentreZ, type DistrictId } from '@insidelife/shared';
import { BufferAttribute, BufferGeometry, Color, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';
import { APRON, PAVEMENT_Y, type CityPlan } from '../layout/placements';
import { DISTRICT_STYLES } from '../layout/styles';

/**
 * Static ground of the city:
 * - `buildGroundGeometry`: one quad per land/sand cell, coloured by a smooth per-cell colour texture (lots, yards,
 *   parks, beaches) — the material adds noise so it never reads as tiles;
 * - `buildStructureGeometry`: vertex-coloured kerb aprons, quay walls, beach slopes, bridge decks and pillars,
 *   compound walls and gates. Two draw calls for all of it.
 */

export const WATER_Y = -2.4;

const S = CITY_MAP.cellSize;
const COLS = CITY_MAP.cols;
const ROWS = CITY_MAP.rows;
const K_LAND = 0;
const K_WATER = 1;
const K_SAND = 2;
const K_BRIDGE = 4;

const kindAt = (col: number, row: number): number => (col < 0 || row < 0 || col >= COLS || row >= ROWS ? -1 : (CITY_MAP.cells[row * COLS + col] as number));
const isRoadLike = (kind: number): boolean => kind === 3 || kind === 5;
const districtAtCell = (col: number, row: number): DistrictId => DISTRICT_IDS[CITY_MAP.districts[row * COLS + col] as number] as DistrictId;

function hash(n: number): number {
  let x = Math.imul(n ^ 0x27d4eb2d, 0x165667b1);
  x ^= x >>> 15;
  return ((x >>> 0) % 10000) / 10000;
}

// ---------------------------------------------------------------------------------------------------------------
// Ground colour texture (2 texels per cell)
// ---------------------------------------------------------------------------------------------------------------

export const GROUND_TEXELS_PER_CELL = 2;

export function buildGroundTexture(plan: CityPlan): DataTexture {
  const width = COLS * GROUND_TEXELS_PER_CELL;
  const height = ROWS * GROUND_TEXELS_PER_CELL;
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const index = row * COLS + col;
      const kind = CITY_MAP.cells[index] as number;
      const style = DISTRICT_STYLES[districtAtCell(col, row)];
      const lot = CITY_MAP.lotIndex[index] as number;
      let hex = style.ground;
      if (kind === K_SAND) hex = 0xe6d2a2;
      else if (kind === K_WATER) hex = 0xc9b88f;
      else if (lot >= 0) hex = plan.lotGround.get(lot) ?? style.ground;
      for (let ty = 0; ty < GROUND_TEXELS_PER_CELL; ty++) {
        for (let tx = 0; tx < GROUND_TEXELS_PER_CELL; tx++) {
          const x = col * GROUND_TEXELS_PER_CELL + tx;
          const y = row * GROUND_TEXELS_PER_CELL + ty;
          const v = 0.94 + hash(x * 7919 + y * 104729) * 0.1;
          const o = (y * width + x) * 4;
          data[o] = Math.min(255, ((hex >> 16) & 255) * v);
          data[o + 1] = Math.min(255, ((hex >> 8) & 255) * v);
          data[o + 2] = Math.min(255, (hex & 255) * v);
          data[o + 3] = 255;
        }
      }
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/** One quad per land/sand cell (uv = position in the grid). */
export function buildGroundGeometry(): BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const { minX, minZ, maxX, maxZ } = CITY_MAP.bounds;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const kind = kindAt(col, row);
      if (kind !== K_LAND && kind !== K_SAND) continue;
      const x0 = minX + col * S;
      const z0 = minZ + row * S;
      const base = positions.length / 3;
      for (const [x, z] of [
        [x0, z0],
        [x0 + S, z0],
        [x0 + S, z0 + S],
        [x0, z0 + S],
      ] as const) {
        positions.push(x, 0, z);
        normals.push(0, 1, 0);
        uvs.push((x - minX) / (maxX - minX), (z - minZ) / (maxZ - minZ));
      }
      indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

// ---------------------------------------------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------------------------------------------

class GeometryWriter {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly indices: number[] = [];
  private readonly color = new Color();

  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[], hex: number, shade = 1): void {
    this.color.setHex(hex);
    const ux = (b[0] ?? 0) - (a[0] ?? 0);
    const uy = (b[1] ?? 0) - (a[1] ?? 0);
    const uz = (b[2] ?? 0) - (a[2] ?? 0);
    const vx = (d[0] ?? 0) - (a[0] ?? 0);
    const vy = (d[1] ?? 0) - (a[1] ?? 0);
    const vz = (d[2] ?? 0) - (a[2] ?? 0);
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const base = this.positions.length / 3;
    for (const p of [a, b, c, d]) {
      this.positions.push(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
      this.normals.push(nx, ny, nz);
      this.colors.push(this.color.r * shade, this.color.g * shade, this.color.b * shade);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned box (top + 4 sides; no bottom). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, sideShade = 0.86): void {
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], hex);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex, sideShade);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], hex, sideShade);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], hex, sideShade * 0.95);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex, sideShade * 0.95);
  }

  /** Box between two points along x or z with a thickness. */
  segment(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, thickness: number, hex: number): void {
    const t = thickness / 2;
    this.box(Math.min(x0, x1) - (z0 === z1 ? 0 : t), y0, Math.min(z0, z1) - (x0 === x1 ? 0 : t), Math.max(x0, x1) + (z0 === z1 ? 0 : t), y1, Math.max(z0, z1) + (x0 === x1 ? 0 : t), hex);
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('color', new BufferAttribute(new Float32Array(this.colors), 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const KERB = 0xc9c1b2;
/** The lagoon arm keeps flowing north past the edge of the playable grid (world x range). */
export const ARM_X: readonly [number, number] = [0, 70];
const OUTER = 2400;
const ARM_REACH = -760;
const QUAY = 0x7d7468;
const DECK = 0xa29d95;
const PILLAR = 0x8f8a82;

/**
 * Mainland beyond the playable grid (north, west and east), so the city never reads as an island; the lagoon arm
 * continues north between quay walls.
 */
export function buildOuterLandGeometry(): BufferGeometry {
  const w = new GeometryWriter();
  const { minX, minZ, maxX } = CITY_MAP.bounds;
  const coastZ = minZ + (CITY_MAP.rows - 2) * S;
  const top = (x0: number, z0: number, x1: number, z1: number): void => w.quad([x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0], 0xffffff);
  top(-OUTER, -OUTER, ARM_X[0], minZ);
  top(ARM_X[1], -OUTER, OUTER, minZ);
  top(ARM_X[0], -OUTER, ARM_X[1], ARM_REACH);
  top(-OUTER, minZ, minX, coastZ);
  top(maxX, minZ, OUTER, coastZ);
  // Quay walls along the arm.
  w.quad([ARM_X[0], 0, minZ], [ARM_X[0], 0, ARM_REACH], [ARM_X[0], WATER_Y - 1.2, ARM_REACH], [ARM_X[0], WATER_Y - 1.2, minZ], QUAY, 0.9);
  w.quad([ARM_X[1], 0, ARM_REACH], [ARM_X[1], 0, minZ], [ARM_X[1], WATER_Y - 1.2, minZ], [ARM_X[1], WATER_Y - 1.2, ARM_REACH], QUAY, 0.9);
  const geometry = w.build();
  // The ground material reads colour from a map: give every vertex the uv of a single bush-green texel.
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array((geometry.getAttribute('position').count) * 2).fill(0.5), 2));
  return geometry;
}

export function buildStructureGeometry(plan: CityPlan): BufferGeometry {
  const w = new GeometryWriter();
  const { minX, minZ } = CITY_MAP.bounds;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const kind = kindAt(col, row);
      const x0 = minX + col * S;
      const z0 = minZ + row * S;
      const x1 = x0 + S;
      const z1 = z0 + S;
      if (kind === K_LAND || kind === K_SAND) {
        // Kerb aprons along road edges (N/S strips run full width; E/W strips are trimmed where N/S exist).
        const n = isRoadLike(kindAt(col, row - 1));
        const s = isRoadLike(kindAt(col, row + 1));
        const e = isRoadLike(kindAt(col + 1, row));
        const west = isRoadLike(kindAt(col - 1, row));
        if (n) w.box(x0, 0, z0, x1, PAVEMENT_Y, z0 + APRON, KERB);
        if (s) w.box(x0, 0, z1 - APRON, x1, PAVEMENT_Y, z1, KERB);
        if (e) w.box(x1 - APRON, 0, z0 + (n ? APRON : 0), x1, PAVEMENT_Y, z1 - (s ? APRON : 0), KERB);
        if (west) w.box(x0, 0, z0 + (n ? APRON : 0), x0 + APRON, PAVEMENT_Y, z1 - (s ? APRON : 0), KERB);
      }
      if (kind === K_LAND || kind === K_SAND || isRoadLike(kind)) {
        const top = isRoadLike(kind) ? PAVEMENT_Y : 0;
        // Quay walls / beach slopes where land meets water.
        const edges: [number, number, number[], number[], number[]][] = [
          [col, row - 1, [x0, top, z0], [x1, top, z0], [0, -1]],
          [col, row + 1, [x1, top, z1], [x0, top, z1], [0, 1]],
          [col + 1, row, [x1, top, z0], [x1, top, z1], [1, 0]],
          [col - 1, row, [x0, top, z1], [x0, top, z0], [-1, 0]],
        ];
        for (const [nc, nr, a, b, dir] of edges) {
          if (kindAt(nc, nr) !== K_WATER) continue;
          const dx = dir[0] ?? 0;
          const dz = dir[1] ?? 0;
          if (kind === K_SAND) {
            const reach = 8;
            w.quad([a[0] ?? 0, 0, a[2] ?? 0], [b[0] ?? 0, 0, b[2] ?? 0], [(b[0] ?? 0) + dx * reach, WATER_Y - 0.8, (b[2] ?? 0) + dz * reach], [(a[0] ?? 0) + dx * reach, WATER_Y - 0.8, (a[2] ?? 0) + dz * reach], 0xd9c08a);
          } else {
            w.quad(a, b, [b[0] ?? 0, WATER_Y - 1.2, b[2] ?? 0], [a[0] ?? 0, WATER_Y - 1.2, a[2] ?? 0], QUAY, 0.9);
          }
        }
      }
      if (kind === K_BRIDGE) {
        const alongX = (CITY_MAP.roadMask[row * COLS + col] ?? 0) & 2;
        // Deck slab under the road tile, with a darker soffit edge.
        w.box(x0, -1.1, z0, x1, 0.01, z1, DECK, 0.78);
        if ((col + row) % 2 === 0) {
          for (const side of [-2.8, 2.8]) {
            const cx = cellCentreX(col) + (alongX ? 0 : side);
            const cz = cellCentreZ(row) + (alongX ? side : 0);
            w.box(cx - 0.8, WATER_Y - 1.5, cz - 0.8, cx + 0.8, -1.1, cz + 0.8, PILLAR, 0.82);
          }
          // Pier cap.
          const cx = cellCentreX(col);
          const cz = cellCentreZ(row);
          w.box(cx - (alongX ? 0.9 : 4.2), -1.5, cz - (alongX ? 4.2 : 0.9), cx + (alongX ? 0.9 : 4.2), -1.1, cz + (alongX ? 4.2 : 0.9), PILLAR, 0.8);
        }
      }
    }
  }
  for (const wall of plan.walls) w.segment(wall.x0, wall.z0, wall.x1, wall.z1, 0, wall.height, 0.26, wall.color);
  for (const gate of plan.gates) {
    // Black steel gate leaves between two pillars.
    const half = gate.width / 2;
    w.segment(gate.x - gate.dx * half, gate.z - gate.dz * half, gate.x + gate.dx * half, gate.z + gate.dz * half, 0, 2.0, 0.12, gate.color ?? 0x2b2b2e);
    for (const end of [-1, 1]) {
      const px = gate.x + gate.dx * end * (half + 0.2);
      const pz = gate.z + gate.dz * end * (half + 0.2);
      w.box(px - 0.3, 0, pz - 0.3, px + 0.3, 2.5, pz + 0.3, 0xe9e2d2);
    }
  }
  return w.build();
}
