import {
  CARRIAGEWAY_HALF_WIDTH,
  CITY_MAP,
  DIR_E,
  DIR_N,
  DIR_S,
  DIR_W,
  LANE_WIDTH,
  ROADSIDE_PAVEMENT,
  cellBounds,
  type CityRoadTile,
  type CityRoundabout,
} from '@insidelife/shared';
import { BufferAttribute, BufferGeometry, DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace } from 'three';
import { PAVEMENT_Y, ROAD_Y } from '../layout/placements';

/**
 * The roads, procedural: four-lane carriageways (two lanes each way) with a 1 m kerbed pavement on every unconnected
 * side, painted the Lagos way — double yellow centre line, dashed white lane lines, white edge lines, stop lines and
 * zebra crossings at the big junctions — open junction boxes, a two-lane roundabout with a grassed island, and
 * parapets along the bridges. One BufferGeometry (one draw call, ~40k triangles for the whole city), coloured from a
 * tiny palette texture so the shared `roads` material (dust, patches, rain sheen) grades it like the rest of the city.
 */

// ---------------------------------------------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------------------------------------------

/** Texels of the palette (sRGB). Asphalt is dark enough for the roads material's patch noise to pick it up. */
const PALETTE = [
  0x55565a, // 0 asphalt
  0xece9e1, // 1 white paint
  0xe5b83a, // 2 yellow paint
  0xb3aea4, // 3 kerb face
  0xcdc7bb, // 4 pavement slab
  0x6f9a48, // 5 island grass
  0xa9a49a, // 6 parapet concrete
  0x2b2b2d, // 7 kerb black (Lagos black-and-yellow kerbs)
] as const;
type Paint = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
const ASPHALT: Paint = 0;
const WHITE: Paint = 1;
const YELLOW: Paint = 2;
const KERB: Paint = 3;
const SLAB: Paint = 4;
const GRASS: Paint = 5;
const PARAPET: Paint = 6;
const KERB_DARK: Paint = 7;

export function buildRoadPalette(): DataTexture {
  const data = new Uint8Array(PALETTE.length * 4);
  PALETTE.forEach((hex, i) => {
    data[i * 4] = (hex >> 16) & 255;
    data[i * 4 + 1] = (hex >> 8) & 255;
    data[i * 4 + 2] = hex & 255;
    data[i * 4 + 3] = 255;
  });
  const texture = new DataTexture(data, PALETTE.length, 1, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------------------------------------------

/** Paint sits this far above the asphalt (no z-fighting at draw distance). */
const PAINT_Y = ROAD_Y + 0.025;
const LINE = 0.15;
const DASH = 3;
const DASH_PERIOD = 6;
const A = CARRIAGEWAY_HALF_WIDTH;

class RoadWriter {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, paint: Paint): void {
    this.positions.push(x, y, z);
    this.normals.push(nx, ny, nz);
    this.uvs.push((paint + 0.5) / PALETTE.length, 0.5);
  }

  /** Horizontal rectangle at height y (facing up). */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, paint: Paint): void {
    if (x1 - x0 < 1e-4 || z1 - z0 < 1e-4) return;
    const base = this.positions.length / 3;
    this.vertex(x0, y, z0, 0, 1, 0, paint);
    this.vertex(x0, y, z1, 0, 1, 0, paint);
    this.vertex(x1, y, z1, 0, 1, 0, paint);
    this.vertex(x1, y, z0, 0, 1, 0, paint);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Upward-facing triangle (any winding in). */
  triangle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, y: number, paint: Paint): void {
    const base = this.positions.length / 3;
    // Counter-clockwise seen from above (+y) means (b - a) × (c - a) has a positive y component.
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az) > 0;
    this.vertex(ax, y, az, 0, 1, 0, paint);
    if (up) {
      this.vertex(bx, y, bz, 0, 1, 0, paint);
      this.vertex(cx, y, cz, 0, 1, 0, paint);
    } else {
      this.vertex(cx, y, cz, 0, 1, 0, paint);
      this.vertex(bx, y, bz, 0, 1, 0, paint);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  /** Vertical quad from (x0, z0) to (x1, z1) between heights, facing (nx, nz). */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, nx: number, nz: number, paint: Paint): void {
    const base = this.positions.length / 3;
    // Order the two ends so the face points along (nx, nz).
    const flip = (x1 - x0) * nz - (z1 - z0) * nx < 0;
    const [ax, az, bx, bz] = flip ? [x1, z1, x0, z0] : [x0, z0, x1, z1];
    this.vertex(ax, y0, az, nx, 0, nz, paint);
    this.vertex(bx, y0, bz, nx, 0, nz, paint);
    this.vertex(bx, y1, bz, nx, 0, nz, paint);
    this.vertex(ax, y1, az, nx, 0, nz, paint);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned box (top and four sides). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: Paint, side: Paint): void {
    this.flat(x0, z0, x1, z1, y1, top);
    this.wall(x0, z0, x1, z0, y0, y1, 0, -1, side);
    this.wall(x0, z1, x1, z1, y0, y1, 0, 1, side);
    this.wall(x0, z0, x0, z1, y0, y1, -1, 0, side);
    this.wall(x1, z0, x1, z1, y0, y1, 1, 0, side);
  }

  /** A paint stripe along x (`alongX`) or z, from `a` to `b` on that axis, centred at `c` on the other. */
  stripe(alongX: boolean, a: number, b: number, c: number, width: number, paint: Paint): void {
    if (b - a < 0.05) return;
    if (alongX) this.flat(a, c - width / 2, b, c + width / 2, PAINT_Y, paint);
    else this.flat(c - width / 2, a, c + width / 2, b, PAINT_Y, paint);
  }

  /** Dashes along an axis, phased by world position so they run on across tiles. */
  dashes(alongX: boolean, a: number, b: number, c: number, paint: Paint): void {
    for (let t = Math.floor(a / DASH_PERIOD) * DASH_PERIOD; t < b; t += DASH_PERIOD) this.stripe(alongX, Math.max(a, t), Math.min(b, t + DASH), c, LINE, paint);
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------------------------------------------

const COLS = CITY_MAP.cols;
const ROWS = CITY_MAP.rows;

const TILE_AT: ReadonlyMap<number, CityRoadTile> = new Map(CITY_MAP.roadTiles.map((tile) => [tile.row * COLS + tile.col, tile]));
const tileAt = (col: number, row: number): CityRoadTile | undefined => (col < 0 || row < 0 || col >= COLS || row >= ROWS ? undefined : TILE_AT.get(row * COLS + col));
const degree = (mask: number): number => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
/** A junction worth a stop line: three or more roads meet, or the roundabout. */
const isJunction = (tile: CityRoadTile | undefined): boolean => !!tile && (tile.kind === 'roundabout' || degree(tile.mask) >= 3);

/**
 * One road cell: a 3 × 3 split at the carriageway edges. The middle is asphalt, the edge middles are asphalt where the
 * road continues (else pavement), the corners are pavement; kerb faces where pavement meets asphalt.
 */
function writeTile(w: RoadWriter, tile: CityRoadTile): void {
  const b = cellBounds(tile.col, tile.row);
  const ax = tile.width / 2 - ROADSIDE_PAVEMENT;
  const az = tile.depth / 2 - ROADSIDE_PAVEMENT;
  const xs = [b.minX, tile.x - ax, tile.x + ax, b.maxX] as const;
  const zs = [b.minZ, tile.z - az, tile.z + az, b.maxZ] as const;
  const asphalt = (i: number, j: number): boolean => {
    if (i === 1 && j === 1) return true;
    if (i === 1 && j === 0) return (tile.mask & DIR_N) !== 0;
    if (i === 1 && j === 2) return (tile.mask & DIR_S) !== 0;
    if (j === 1 && i === 0) return (tile.mask & DIR_W) !== 0;
    if (j === 1 && i === 2) return (tile.mask & DIR_E) !== 0;
    return false;
  };
  const big = tile.roadClass !== 'street';
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const x0 = xs[i] as number;
      const x1 = xs[i + 1] as number;
      const z0 = zs[j] as number;
      const z1 = zs[j + 1] as number;
      if (asphalt(i, j)) {
        w.flat(x0, z0, x1, z1, ROAD_Y, ASPHALT);
        continue;
      }
      w.flat(x0, z0, x1, z1, PAVEMENT_Y, SLAB);
      // Kerb faces towards neighbouring asphalt pieces; the big roads get Lagos black-and-yellow kerb tops.
      const kerb: Paint = big ? KERB_DARK : KERB;
      if (i > 0 && asphalt(i - 1, j)) w.wall(x0, z0, x0, z1, ROAD_Y, PAVEMENT_Y, -1, 0, kerb);
      if (i < 2 && asphalt(i + 1, j)) w.wall(x1, z0, x1, z1, ROAD_Y, PAVEMENT_Y, 1, 0, kerb);
      if (j > 0 && asphalt(i, j - 1)) w.wall(x0, z0, x1, z0, ROAD_Y, PAVEMENT_Y, 0, -1, kerb);
      if (j < 2 && asphalt(i, j + 1)) w.wall(x0, z1, x1, z1, ROAD_Y, PAVEMENT_Y, 0, 1, kerb);
      if (big) kerbStripes(w, x0, z0, x1, z1, i, j, asphalt);
    }
  }
  if (tile.kind === 'straight') writeMarkings(w, tile, b);
  if (tile.bridge) {
    // Parapets on the outer edge of the pavements.
    const alongX = (tile.mask & DIR_E) !== 0;
    if (alongX) {
      w.box(b.minX, PAVEMENT_Y, b.minZ, b.maxX, PAVEMENT_Y + 0.85, b.minZ + 0.3, PARAPET, PARAPET);
      w.box(b.minX, PAVEMENT_Y, b.maxZ - 0.3, b.maxX, PAVEMENT_Y + 0.85, b.maxZ, PARAPET, PARAPET);
    } else {
      w.box(b.minX, PAVEMENT_Y, b.minZ, b.minX + 0.3, PAVEMENT_Y + 0.85, b.maxZ, PARAPET, PARAPET);
      w.box(b.maxX - 0.3, PAVEMENT_Y, b.minZ, b.maxX, PAVEMENT_Y + 0.85, b.maxZ, PARAPET, PARAPET);
    }
  }
}

/** Painted kerb tops on the big roads: alternating yellow and black blocks along the edge facing the carriageway. */
const KERB_BLOCK = 1.2;
function kerbStripes(w: RoadWriter, x0: number, z0: number, x1: number, z1: number, i: number, j: number, asphalt: (i: number, j: number) => boolean): void {
  const y = PAVEMENT_Y + 0.006;
  const band = 0.25;
  const blocks = (alongX: boolean, a: number, b: number, c0: number, c1: number): void => {
    for (let t = Math.floor(a / KERB_BLOCK) * KERB_BLOCK; t < b - 1e-6; t += KERB_BLOCK) {
      const s = Math.max(a, t);
      const e = Math.min(b, t + KERB_BLOCK);
      if (e - s < 0.05) continue;
      const paint: Paint = Math.round(t / KERB_BLOCK) % 2 === 0 ? YELLOW : KERB_DARK;
      if (alongX) w.flat(s, c0, e, c1, y, paint);
      else w.flat(c0, s, c1, e, y, paint);
    }
  };
  if (j > 0 && asphalt(i, j - 1)) blocks(true, x0, x1, z0, z0 + band);
  if (j < 2 && asphalt(i, j + 1)) blocks(true, x0, x1, z1 - band, z1);
  if (i > 0 && asphalt(i - 1, j)) blocks(false, z0, z1, x0, x0 + band);
  if (i < 2 && asphalt(i + 1, j)) blocks(false, z0, z1, x1 - band, x1);
}

/** Lane paint on a straight tile, with a stop line (and a zebra on big roads) where it meets a junction. */
function writeMarkings(w: RoadWriter, tile: CityRoadTile, b: { minX: number; minZ: number; maxX: number; maxZ: number }): void {
  const alongX = (tile.mask & DIR_E) !== 0;
  const centre = alongX ? tile.z : tile.x;
  let a = alongX ? b.minX : b.minZ;
  let e = alongX ? b.maxX : b.maxZ;
  const big = tile.roadClass !== 'street';
  // Approaching a junction at either end: stop line across your half, a zebra just before the box on big roads.
  const ends: readonly (readonly [number, number, number])[] = alongX
    ? [
        [-1, 0, a],
        [1, 0, e],
      ]
    : [
        [0, -1, a],
        [0, 1, e],
      ];
  for (const [dc, dr, edge] of ends) {
    if (!isJunction(tileAt(tile.col + dc, tile.row + dr))) continue;
    const towards = dc + dr; // +1: the junction is further along the axis
    const zebra = big ? 3 : 0;
    const gap = 0.6;
    if (zebra > 0) {
      const z0 = towards > 0 ? edge - gap - zebra : edge + gap;
      for (let s = -A + 0.5; s < A - 0.3; s += 1) {
        if (alongX) w.flat(z0, centre + s, z0 + zebra, centre + s + 0.5, PAINT_Y, WHITE);
        else w.flat(centre + s, z0, centre + s + 0.5, z0 + zebra, PAINT_Y, WHITE);
      }
    }
    // Traffic heading into the junction keeps right: the stop line spans the right-hand half.
    const stopAt = towards > 0 ? edge - gap - zebra - 0.9 : edge + gap + zebra + 0.5;
    const side = alongX ? towards : -towards;
    const [s0, s1] = side > 0 ? [centre + 0.15, centre + A - 0.2] : [centre - A + 0.2, centre - 0.15];
    if (alongX) w.flat(stopAt, s0, stopAt + 0.4, s1, PAINT_Y, WHITE);
    else w.flat(s0, stopAt, s1, stopAt + 0.4, PAINT_Y, WHITE);
    if (towards > 0) e = stopAt - 0.3;
    else a = stopAt + 0.7;
  }
  if (e - a < 0.5) return;
  // Double yellow centre line, dashed white lane lines, solid white edge lines.
  w.stripe(alongX, a, e, centre - 0.13, LINE, YELLOW);
  w.stripe(alongX, a, e, centre + 0.13, LINE, YELLOW);
  w.dashes(alongX, a, e, centre - LANE_WIDTH, WHITE);
  w.dashes(alongX, a, e, centre + LANE_WIDTH, WHITE);
  w.stripe(alongX, a, e, centre - A + 0.3, LINE, WHITE);
  w.stripe(alongX, a, e, centre + A - 0.3, LINE, WHITE);
}

// ---------------------------------------------------------------------------------------------------------------
// Roundabout
// ---------------------------------------------------------------------------------------------------------------

const RING_SEGMENTS = 56;

function writeRoundabout(w: RoadWriter, tile: CityRoadTile, roundabout: CityRoundabout): void {
  const { x: cx, z: cz } = roundabout.centre;
  const outer = roundabout.outerRadius;
  const island = roundabout.islandRadius;
  const lo = cellBounds(tile.col - 1, tile.row - 1);
  const hi = cellBounds(tile.col + 1, tile.row + 1);
  // Asphalt ring.
  for (let s = 0; s < RING_SEGMENTS; s++) {
    const t0 = (s / RING_SEGMENTS) * Math.PI * 2;
    const t1 = ((s + 1) / RING_SEGMENTS) * Math.PI * 2;
    const p = (r: number, t: number): readonly [number, number] => [cx + Math.cos(t) * r, cz + Math.sin(t) * r];
    const [ax, az] = p(island, t0);
    const [bx, bz] = p(outer, t0);
    const [ccx, ccz] = p(outer, t1);
    const [dx, dz] = p(island, t1);
    w.triangle(ax, az, bx, bz, ccx, ccz, ROAD_Y, ASPHALT);
    w.triangle(ax, az, ccx, ccz, dx, dz, ROAD_Y, ASPHALT);
    // Island: grass top, kerb face; dashed lane line round the middle of the ring.
    w.triangle(cx, cz, dx, dz, ax, az, PAVEMENT_Y + 0.05, GRASS);
    w.wall(ax, az, dx, dz, ROAD_Y, PAVEMENT_Y + 0.05, Math.cos((t0 + t1) / 2), Math.sin((t0 + t1) / 2), s % 2 ? KERB_DARK : YELLOW);
    if (s % 2 === 0) {
      const mid = (island + outer) / 2;
      const [mx0, mz0] = p(mid - LINE / 2, t0);
      const [mx1, mz1] = p(mid + LINE / 2, t0);
      const [mx2, mz2] = p(mid + LINE / 2, t1);
      const [mx3, mz3] = p(mid - LINE / 2, t1);
      w.triangle(mx0, mz0, mx1, mz1, mx2, mz2, PAINT_Y, WHITE);
      w.triangle(mx0, mz0, mx2, mz2, mx3, mz3, PAINT_Y, WHITE);
    }
  }
  // Arms out to the block edge.
  const arm = (bit: number): number => ((tile.mask & bit) !== 0 ? A : 0);
  const reach = (half: number): number => Math.sqrt(Math.max(0, outer * outer - half * half));
  if (arm(DIR_N)) w.flat(cx - A, lo.minZ, cx + A, cz - reach(A) + 0.3, ROAD_Y, ASPHALT);
  if (arm(DIR_S)) w.flat(cx - A, cz + reach(A) - 0.3, cx + A, hi.maxZ, ROAD_Y, ASPHALT);
  if (arm(DIR_W)) w.flat(lo.minX, cz - A, cx - reach(A) + 0.3, cz + A, ROAD_Y, ASPHALT);
  if (arm(DIR_E)) w.flat(cx + reach(A) - 0.3, cz - A, hi.maxX, cz + A, ROAD_Y, ASPHALT);
  // Pavement in each quadrant between two arms: a fan from the block corner to the ring.
  const quadrants = [
    [1, -1, arm(DIR_N), arm(DIR_E)],
    [1, 1, arm(DIR_S), arm(DIR_E)],
    [-1, 1, arm(DIR_S), arm(DIR_W)],
    [-1, -1, arm(DIR_N), arm(DIR_W)],
  ] as const;
  for (const [sx, sz, armZ, armX] of quadrants) {
    const cornerX = sx > 0 ? hi.maxX : lo.minX;
    const cornerZ = sz > 0 ? hi.maxZ : lo.minZ;
    // Where the ring meets the arm edges: on the z-arm edge (x = armZ) and on the x-arm edge (z = armX).
    const t0 = Math.atan2(sz * reach(armZ), sx * armZ);
    const t1 = Math.atan2(sz * armX, sx * reach(armX));
    let sweep = t1 - t0;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    const steps = Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * RING_SEGMENTS));
    let px = cx + Math.cos(t0) * outer;
    let pz = cz + Math.sin(t0) * outer;
    // Strip along the z-arm edge, from the block edge to the ring.
    w.triangle(cornerX, cornerZ, cx + sx * armZ, cornerZ, px, pz, PAVEMENT_Y, SLAB);
    w.wall(cx + sx * armZ, cornerZ, px, pz, ROAD_Y, PAVEMENT_Y, -sx, 0, KERB);
    for (let s = 1; s <= steps; s++) {
      const t = t0 + (sweep * s) / steps;
      const qx = cx + Math.cos(t) * outer;
      const qz = cz + Math.sin(t) * outer;
      w.triangle(cornerX, cornerZ, px, pz, qx, qz, PAVEMENT_Y, SLAB);
      w.wall(px, pz, qx, qz, ROAD_Y, PAVEMENT_Y, -Math.cos(t), -Math.sin(t), KERB);
      px = qx;
      pz = qz;
    }
    w.triangle(cornerX, cornerZ, px, pz, cornerX, cz + sz * armX, PAVEMENT_Y, SLAB);
    w.wall(px, pz, cornerX, cz + sz * armX, ROAD_Y, PAVEMENT_Y, 0, -sz, KERB);
  }
}

// ---------------------------------------------------------------------------------------------------------------

/** Every road in the city as one geometry (built once per page; callers own disposal of what they're given). */
export function buildRoadGeometry(tiles: readonly CityRoadTile[] = CITY_MAP.roadTiles): BufferGeometry {
  const w = new RoadWriter();
  for (const tile of tiles) {
    if (tile.kind === 'roundabout') {
      const roundabout = CITY_MAP.roundabouts.find((entry) => Math.hypot(entry.centre.x - tile.x, entry.centre.z - tile.z) < 1);
      if (roundabout) writeRoundabout(w, tile, roundabout);
      continue;
    }
    writeTile(w, tile);
  }
  return w.build();
}

/** The roads split by 64 m chunk (by tile centre), so the batch can cull and drop far chunks like the kits do. */
export function buildRoadChunks(chunkOf: (x: number, z: number) => number): { readonly chunk: number; readonly geometry: BufferGeometry }[] {
  const byChunk = new Map<number, CityRoadTile[]>();
  for (const tile of CITY_MAP.roadTiles) {
    const chunk = chunkOf(tile.x, tile.z);
    byChunk.set(chunk, [...(byChunk.get(chunk) ?? []), tile]);
  }
  return [...byChunk.entries()].map(([chunk, tiles]) => ({ chunk, geometry: buildRoadGeometry(tiles) }));
}
