import type { Rect } from '../layouts/types';
import type { At, Spot } from '../templates/types';

/**
 * A walkability grid over a room (≈0.2 m cells) with A* paths, so the avatar can walk round the furniture to a bed,
 * a cooker or a door when an activity starts or the player taps the floor. Pure; built once per room.
 */

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Min-heap of cell indices keyed by f-score. */
class Heap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    const items = this.items;
    const keys = this.keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((keys[parent] as number) <= key) break;
      items[i] = items[parent] as number;
      keys[i] = keys[parent] as number;
      i = parent;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): number {
    const items = this.items;
    const keys = this.keys;
    const top = items[0] as number;
    const lastItem = items.pop() as number;
    const lastKey = keys.pop() as number;
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && (keys[r] as number) < (keys[l] as number) ? r : l;
        if ((keys[c] as number) >= lastKey) break;
        items[i] = items[c] as number;
        keys[i] = keys[c] as number;
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

export class NavGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private readonly originX: number;
  private readonly originZ: number;
  private readonly free: Uint8Array;

  /** `isFree(x, z)`: can the walker's centre stand here? Sampled at every cell centre. */
  constructor(bounds: Rect, isFree: (x: number, z: number) => boolean, cell = 0.2) {
    this.cell = cell;
    this.originX = bounds.minX;
    this.originZ = bounds.minZ;
    this.cols = Math.max(1, Math.round((bounds.maxX - bounds.minX) / cell));
    this.rows = Math.max(1, Math.round((bounds.maxZ - bounds.minZ) / cell));
    this.free = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const [x, z] = this.centre(c, r);
        this.free[r * this.cols + c] = isFree(x, z) ? 1 : 0;
      }
    }
  }

  centre(c: number, r: number): [number, number] {
    return [this.originX + (c + 0.5) * this.cell, this.originZ + (r + 0.5) * this.cell];
  }

  private colOf(x: number): number {
    return Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.originX) / this.cell)));
  }

  private rowOf(z: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.originZ) / this.cell)));
  }

  private freeCell(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.free[r * this.cols + c] === 1;
  }

  /** Is the cell under (x, z) walkable? */
  isFreeAt(x: number, z: number): boolean {
    const c = Math.floor((x - this.originX) / this.cell);
    const r = Math.floor((z - this.originZ) / this.cell);
    return this.freeCell(c, r);
  }

  /** How many walkable cells (tests, diagnostics). */
  get freeCount(): number {
    let n = 0;
    for (const value of this.free) n += value;
    return n;
  }

  /** Centre of the walkable cell nearest to (x, z), searching rings out to `maxDistance` metres. */
  nearestFree(x: number, z: number, maxDistance = 3): [number, number] | null {
    const c0 = this.colOf(x);
    const r0 = this.rowOf(z);
    if (this.freeCell(c0, r0)) return this.centre(c0, r0);
    const rings = Math.ceil(maxDistance / this.cell);
    let best: [number, number] | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (let ring = 1; ring <= rings; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (!this.freeCell(c0 + dc, r0 + dr)) continue;
          const p = this.centre(c0 + dc, r0 + dr);
          const d = Math.hypot(p[0] - x, p[1] - z);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
      }
      // Anything found in this ring beats every point of the next one only roughly; one more ring settles it.
      if (best && bestD <= ring * this.cell) return best;
    }
    return best;
  }

  /** Straight walk from a to b stays on walkable cells (sampled every half cell). */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const length = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(length / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFreeAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
    }
    return true;
  }

  /**
   * Shortest walkable path from `from` to `to` (A*, 8-connected, no corner cutting), smoothed to the fewest straight
   * legs. Both ends snap to the nearest walkable cell. Returns the waypoints after `from`, ending at `to` (snapped),
   * or null when unreachable.
   */
  findPath(from: At, to: At): At[] | null {
    const start = this.nearestFree(from[0], from[1], 1.5);
    const goal = this.nearestFree(to[0], to[1], 2);
    if (!start || !goal) return null;
    const cols = this.cols;
    const s = this.rowOf(start[1]) * cols + this.colOf(start[0]);
    const g = this.rowOf(goal[1]) * cols + this.colOf(goal[0]);
    const gc = g % cols;
    const gr = Math.floor(g / cols);
    const n = cols * this.rows;
    const cost = new Float32Array(n).fill(Number.POSITIVE_INFINITY);
    const came = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const heap = new Heap();
    const h = (c: number, r: number): number => {
      const dx = Math.abs(c - gc);
      const dz = Math.abs(r - gr);
      return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
    };
    cost[s] = 0;
    heap.push(s, h(s % cols, Math.floor(s / cols)));
    let found = s === g;
    while (heap.size > 0 && !found) {
      const current = heap.pop();
      if (closed[current]) continue;
      closed[current] = 1;
      if (current === g) {
        found = true;
        break;
      }
      const c = current % cols;
      const r = Math.floor(current / cols);
      for (const [dc, dr, step] of NEIGHBOURS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!this.freeCell(nc, nr)) continue;
        // No squeezing diagonally between two blocked cells.
        if (dc !== 0 && dr !== 0 && (!this.freeCell(c + dc, r) || !this.freeCell(c, r + dr))) continue;
        const next = nr * cols + nc;
        const candidate = (cost[current] as number) + step;
        if (candidate < (cost[next] as number)) {
          cost[next] = candidate;
          came[next] = current;
          heap.push(next, candidate + h(nc, nr));
        }
      }
    }
    if (!found) return null;
    const cells: At[] = [];
    for (let at = g; at !== -1; at = came[at] as number) {
      cells.push(this.centre(at % cols, Math.floor(at / cols)));
      if (at === s) break;
    }
    cells.reverse();
    // String-pull: from each anchor, jump to the farthest waypoint in a clear straight line.
    const path: At[] = [];
    let anchor: At = from;
    let i = 0;
    while (i < cells.length) {
      let far = i;
      for (let j = cells.length - 1; j > i; j--) {
        const target = cells[j] as At;
        if (this.clear(anchor[0], anchor[1], target[0], target[1])) {
          far = j;
          break;
        }
      }
      const point = cells[far] as At;
      path.push(point);
      anchor = point;
      i = far + 1;
    }
    return path;
  }
}

/** Facing direction (unit x/z) of a spot (`rot` degrees, 0 faces +Z). */
function facingOf(spot: Spot): [number, number] {
  const r = ((spot.rot ?? 0) * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
}

/**
 * Where to walk to before settling into a spot: the spot itself when you can stand there (cooking at the stove),
 * else in front of the seat or bed, then behind or beside it, else the nearest walkable cell.
 */
export function approachPoint(nav: NavGrid, spot: Spot): At | null {
  const x = spot.at[0];
  const z = spot.at[spot.at.length - 1] as number;
  if (nav.isFreeAt(x, z)) return [x, z];
  const [fx, fz] = facingOf(spot);
  const directions: ReadonlyArray<readonly [number, number]> = [
    [fx, fz],
    [-fx, -fz],
    [fz, -fx],
    [-fz, fx],
  ];
  for (const distance of [0.45, 0.6, 0.8, 1.0, 1.25]) {
    for (const [dx, dz] of directions) {
      const px = x + dx * distance;
      const pz = z + dz * distance;
      if (nav.isFreeAt(px, pz)) return [px, pz];
    }
  }
  return nav.nearestFree(x, z, 2.5);
}
