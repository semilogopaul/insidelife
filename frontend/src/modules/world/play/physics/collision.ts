/**
 * Static obstacles (building footprints, compound walls, parked cars, landmarks) in a uniform grid, with the queries
 * the play layer runs every frame: push a circle out of boxes, test overlap, and cast a camera ray. Pure; queries
 * reuse preallocated buffers (no per-frame allocations).
 */

export interface Aabb {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  /** Top of the obstacle (its bottom is the ground, y = 0). */
  readonly height: number;
}

/** Mutable 2D point (x, z) — the caller owns it and reuses it across frames. */
export interface MutablePoint {
  x: number;
  z: number;
}

/** Result of a circle resolution: the summed push vector (not normalised) and the deepest penetration. */
export interface PushResult {
  nx: number;
  nz: number;
  depth: number;
}

const MAX_CANDIDATES = 512;

export class ColliderGrid {
  private readonly boxes: readonly Aabb[];
  private readonly cell: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  private readonly seen: Uint32Array;
  private readonly found = new Int32Array(MAX_CANDIDATES);
  private stamp = 0;

  constructor(boxes: readonly Aabb[], cellSize = 8) {
    this.boxes = boxes;
    this.cell = cellSize;
    let minX = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const box of boxes) {
      minX = Math.min(minX, box.minX);
      minZ = Math.min(minZ, box.minZ);
      maxX = Math.max(maxX, box.maxX);
      maxZ = Math.max(maxZ, box.maxZ);
    }
    if (boxes.length === 0) {
      minX = minZ = 0;
      maxX = maxZ = cellSize;
    }
    this.originX = minX;
    this.originZ = minZ;
    this.cols = Math.max(1, Math.ceil((maxX - minX) / cellSize) + 1);
    this.rows = Math.max(1, Math.ceil((maxZ - minZ) / cellSize) + 1);
    const count = this.cols * this.rows;
    const counts = new Int32Array(count + 1);
    for (const box of boxes) {
      for (let r = this.rowOf(box.minZ); r <= this.rowOf(box.maxZ); r++) {
        for (let c = this.colOf(box.minX); c <= this.colOf(box.maxX); c++) counts[r * this.cols + c + 1] = (counts[r * this.cols + c + 1] as number) + 1;
      }
    }
    for (let i = 1; i <= count; i++) counts[i] = (counts[i] as number) + (counts[i - 1] as number);
    const fill = counts.slice(0, count);
    const items = new Int32Array(counts[count] as number);
    boxes.forEach((box, id) => {
      for (let r = this.rowOf(box.minZ); r <= this.rowOf(box.maxZ); r++) {
        for (let c = this.colOf(box.minX); c <= this.colOf(box.maxX); c++) {
          const index = r * this.cols + c;
          const slot = fill[index] as number;
          items[slot] = id;
          fill[index] = slot + 1;
        }
      }
    });
    this.start = counts;
    this.items = items;
    this.seen = new Uint32Array(boxes.length);
  }

  get size(): number {
    return this.boxes.length;
  }

  box(id: number): Aabb {
    return this.boxes[id] as Aabb;
  }

  private colOf(x: number): number {
    const c = Math.floor((x - this.originX) / this.cell);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private rowOf(z: number): number {
    const r = Math.floor((z - this.originZ) / this.cell);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /**
   * Ids of the boxes overlapping a rectangle, written to the internal buffer (read with `candidate(i)` before the next
   * query). Returns how many.
   */
  candidates(minX: number, minZ: number, maxX: number, maxZ: number): number {
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      this.seen.fill(0);
      this.stamp = 1;
    }
    let count = 0;
    const r1 = this.rowOf(maxZ);
    const c1 = this.colOf(maxX);
    for (let r = this.rowOf(minZ); r <= r1; r++) {
      for (let c = this.colOf(minX); c <= c1; c++) {
        const index = r * this.cols + c;
        const to = this.start[index + 1] as number;
        for (let k = this.start[index] as number; k < to; k++) {
          const id = this.items[k] as number;
          if (this.seen[id] === this.stamp) continue;
          this.seen[id] = this.stamp;
          const box = this.boxes[id] as Aabb;
          if (box.maxX < minX || box.minX > maxX || box.maxZ < minZ || box.minZ > maxZ) continue;
          if (count < MAX_CANDIDATES) this.found[count++] = id;
        }
      }
    }
    return count;
  }

  candidate(index: number): Aabb {
    return this.boxes[this.found[index] as number] as Aabb;
  }

  /**
   * Push a circle out of every box it overlaps (two passes for corners). Mutates `p`; returns true when it moved.
   * `out` receives the summed push vector and the deepest penetration.
   */
  resolveCircle(p: MutablePoint, radius: number, out?: PushResult): boolean {
    let moved = false;
    if (out) {
      out.nx = 0;
      out.nz = 0;
      out.depth = 0;
    }
    for (let pass = 0; pass < 2; pass++) {
      let pushed = false;
      const count = this.candidates(p.x - radius, p.z - radius, p.x + radius, p.z + radius);
      for (let i = 0; i < count; i++) {
        if (!pushOutOfBox(p, radius, this.candidate(i), push)) continue;
        p.x += push.nx;
        p.z += push.nz;
        if (out) {
          out.nx += push.nx;
          out.nz += push.nz;
          out.depth = Math.max(out.depth, push.depth);
        }
        pushed = true;
        moved = true;
      }
      if (!pushed) break;
    }
    return moved;
  }

  /** True when a circle overlaps any box. */
  overlaps(x: number, z: number, radius: number): boolean {
    probe.x = x;
    probe.z = z;
    const count = this.candidates(x - radius, z - radius, x + radius, z + radius);
    for (let i = 0; i < count; i++) if (pushOutOfBox(probe, radius, this.candidate(i), push)) return true;
    return false;
  }

  /**
   * Distance along a ray from (ox, oy, oz) in unit direction (dx, dy, dz) to the first box (boxes span y ∈ [0, height]),
   * or `maxDistance` when nothing is hit.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDistance: number): number {
    const ex = ox + dx * maxDistance;
    const ez = oz + dz * maxDistance;
    let best = maxDistance;
    const count = this.candidates(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
    for (let i = 0; i < count; i++) {
      const t = raySlab(ox, oy, oz, dx, dy, dz, this.candidate(i));
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
}

const push: PushResult = { nx: 0, nz: 0, depth: 0 };
const probe: MutablePoint = { x: 0, z: 0 };

/** Minimal translation that moves a circle out of a box, written to `out`; false when they don't overlap. */
export function pushOutOfBox(p: MutablePoint, radius: number, box: Aabb, out: PushResult): boolean {
  const cx = p.x < box.minX ? box.minX : p.x > box.maxX ? box.maxX : p.x;
  const cz = p.z < box.minZ ? box.minZ : p.z > box.maxZ ? box.maxZ : p.z;
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const depth = radius - d;
    out.nx = (dx / d) * depth;
    out.nz = (dz / d) * depth;
    out.depth = depth;
    return true;
  }
  // Centre inside the box: leave through the nearest face.
  const left = p.x - box.minX;
  const right = box.maxX - p.x;
  const top = p.z - box.minZ;
  const bottom = box.maxZ - p.z;
  const min = Math.min(left, right, top, bottom);
  out.nx = 0;
  out.nz = 0;
  if (min === left) out.nx = -(left + radius);
  else if (min === right) out.nx = right + radius;
  else if (min === top) out.nz = -(top + radius);
  else out.nz = bottom + radius;
  out.depth = min + radius;
  return true;
}

let slabMin = 0;
let slabMax = 0;

/** Narrows [slabMin, slabMax] by one axis; false when the ray misses. */
function slab(o: number, d: number, lo: number, hi: number): boolean {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let t1 = (lo - o) / d;
  let t2 = (hi - o) / d;
  if (t1 > t2) {
    const swap = t1;
    t1 = t2;
    t2 = swap;
  }
  if (t1 > slabMin) slabMin = t1;
  if (t2 < slabMax) slabMax = t2;
  return slabMin <= slabMax;
}

/** Ray vs box slab test; returns the entry distance (0 when starting inside) or -1. */
export function raySlab(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, box: Aabb): number {
  slabMin = 0;
  slabMax = Number.POSITIVE_INFINITY;
  if (!slab(ox, dx, box.minX, box.maxX) || !slab(oy, dy, 0, box.height) || !slab(oz, dz, box.minZ, box.maxZ)) return -1;
  return slabMin;
}

/** Circle vs circle push (dynamic obstacles such as traffic): moves `p` out of a circle at (x, z); returns the depth. */
export function pushOutOfCircle(p: MutablePoint, radius: number, x: number, z: number, otherRadius: number): number {
  const dx = p.x - x;
  const dz = p.z - z;
  const min = radius + otherRadius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return 0;
  const d = Math.sqrt(d2) || 1e-4;
  const depth = min - d;
  p.x += (dx / d) * depth;
  p.z += (dz / d) * depth;
  return depth;
}
