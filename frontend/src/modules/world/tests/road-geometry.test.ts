import { CITY_MAP, cellBounds, colAt, rowAt } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { buildRoadGeometry } from '../city/render/road-geometry';
import { groundHeightAt } from '../play/physics/surface';

/** Palette slots that are ground (paint, kerb faces and parapets are skipped). */
const ASPHALT = 0;
const SLAB = 4;
const GRASS = 5;
const PALETTE_SIZE = 8;

interface Flat {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly cx: number;
  readonly cz: number;
  readonly y: number;
}

const geometry = buildRoadGeometry();
const position = geometry.getAttribute('position');
const normal = geometry.getAttribute('normal');
const uv = geometry.getAttribute('uv');
const index = geometry.getIndex()!;
const triangles = index.count / 3;

// Upward ground triangles, bucketed by grid cell.
const buckets = new Map<number, Flat[]>();
for (let t = 0; t < triangles; t++) {
  const [i, j, k] = [index.getX(t * 3), index.getX(t * 3 + 1), index.getX(t * 3 + 2)];
  if (normal.getY(i) < 0.99) continue;
  const paint = Math.floor(uv.getX(i) * PALETTE_SIZE);
  if (paint !== ASPHALT && paint !== SLAB && paint !== GRASS) continue;
  const flat: Flat = { ax: position.getX(i), az: position.getZ(i), bx: position.getX(j), bz: position.getZ(j), cx: position.getX(k), cz: position.getZ(k), y: position.getY(i) };
  const c0 = colAt(Math.min(flat.ax, flat.bx, flat.cx));
  const c1 = colAt(Math.max(flat.ax, flat.bx, flat.cx) - 1e-6);
  const r0 = rowAt(Math.min(flat.az, flat.bz, flat.cz));
  const r1 = rowAt(Math.max(flat.az, flat.bz, flat.cz) - 1e-6);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) buckets.set(r * CITY_MAP.cols + c, [...(buckets.get(r * CITY_MAP.cols + c) ?? []), flat]);
}

const inside = (f: Flat, x: number, z: number): boolean => {
  const d1 = (x - f.bx) * (f.az - f.bz) - (f.ax - f.bx) * (z - f.bz);
  const d2 = (x - f.cx) * (f.bz - f.cz) - (f.bx - f.cx) * (z - f.cz);
  const d3 = (x - f.ax) * (f.cz - f.az) - (f.cx - f.ax) * (z - f.az);
  return !((d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9) && (d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9));
};

/** Height of the drawn road surface at a point (the highest ground triangle), or null when nothing is drawn there. */
function drawnHeight(x: number, z: number): number | null {
  let best: number | null = null;
  for (const flat of buckets.get(rowAt(z) * CITY_MAP.cols + colAt(x)) ?? []) if (inside(flat, x, z) && (best === null || flat.y > best)) best = flat.y;
  return best;
}

describe('procedural four-lane roads', () => {
  it('stays inside the road budget: one geometry, under 120k triangles (both cities)', () => {
    expect(triangles).toBeGreaterThan(CITY_MAP.roadTiles.length * 10);
    expect(triangles).toBeLessThan(120_000);
  });

  it('draws exactly what the physics drives on: asphalt where cars go, kerbed pavement where they slow down', () => {
    let samples = 0;
    for (const tile of CITY_MAP.roadTiles) {
      const span = tile.kind === 'roundabout' ? 1 : 0;
      const lo = cellBounds(tile.col - span, tile.row - span);
      const hi = cellBounds(tile.col + span, tile.row + span);
      for (let u = 0.04; u < 1; u += 0.115) {
        for (let v = 0.04; v < 1; v += 0.115) {
          const x = lo.minX + (hi.maxX - lo.minX) * u;
          const z = lo.minZ + (hi.maxZ - lo.minZ) * v;
          const drawn = drawnHeight(x, z);
          expect(drawn, `${tile.col},${tile.row} at ${x.toFixed(1)},${z.toFixed(1)}`).not.toBeNull();
          expect(Math.abs((drawn ?? 0) - groundHeightAt(x, z)), `${tile.kind} ${tile.col},${tile.row} at ${x.toFixed(1)},${z.toFixed(1)}`).toBeLessThan(0.06);
          samples++;
        }
      }
    }
    expect(samples).toBeGreaterThan(40_000);
    // Both cities' roads: about 8 s on a busy machine.
  }, 60_000);
});
