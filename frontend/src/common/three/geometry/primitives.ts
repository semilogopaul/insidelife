import { BufferAttribute, BufferGeometry, Vector3 } from 'three';

/**
 * Procedural primitives for the chibi style: soft superellipsoids ("rounded boxes" without the faceted look), lofts
 * with superellipse cross-sections (torsos, limbs, garments, skirts) and tubes (straps, chains, cornrows).
 *
 * All primitives are indexed and carry `position`, `normal` and `uv` (UVs in metres so fabric prints keep a
 * consistent scale across garments). Normals are computed analytically or by central differences, so there are no
 * seams at the wrap-around.
 */

/** sign(v)·|v|^e */
export function sgnPow(value: number, exponent: number): number {
  return Math.sign(value) * Math.abs(value) ** exponent;
}

function geometryFrom(positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

// ---------------------------------------------------------------------------------------------------------------
// Superellipsoid
// ---------------------------------------------------------------------------------------------------------------

export interface SuperellipsoidOptions {
  /** Full extents. */
  readonly w: number;
  readonly h: number;
  readonly d: number;
  /** Roundness: 1 = ellipsoid, ~0.35 = soft rounded box, 0.15 = crisp box. */
  readonly round?: number;
  readonly segU?: number;
  readonly segV?: number;
  /** Optional vertex deformation applied after generation (normals are recomputed numerically when given). */
  readonly deform?: (p: Vector3) => void;
}

/**
 * A rounded box / ellipsoid. Centered at the origin. Normals come from the implicit-surface gradient, so the soft
 * edges shade smoothly without the faceting of RoundedBoxGeometry.
 */
export function superellipsoid(options: SuperellipsoidOptions): BufferGeometry {
  const { w, h, d, round = 0.4, segU = 20, segV = 14, deform } = options;
  const a = w / 2;
  const b = h / 2;
  const c = d / 2;
  const e = Math.max(0.08, round);
  const p = 2 / e;
  const cols = segU + 1;
  const rows = segV + 1;
  const positions = new Float32Array(cols * rows * 3);
  const normals = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const perimeter = Math.PI * (a + c);
  const point = new Vector3();
  for (let row = 0; row < rows; row++) {
    const v = -Math.PI / 2 + (row / segV) * Math.PI;
    const cv = Math.cos(v);
    const sv = Math.sin(v);
    for (let col = 0; col < cols; col++) {
      // Start at the back (-Z) so the UV seam hides behind the part.
      const u = -Math.PI / 2 + (col / segU) * Math.PI * 2;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      const x = a * sgnPow(cv, e) * sgnPow(cu, e);
      const y = b * sgnPow(sv, e);
      const z = c * sgnPow(cv, e) * sgnPow(su, e);
      const i = (row * cols + col) * 3;
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = z;
      // Gradient of |x/a|^p + |y/b|^p + |z/c|^p.
      let nx = (p * sgnPow(x / a, p - 1)) / a;
      let ny = (p * sgnPow(y / b, p - 1)) / b;
      let nz = (p * sgnPow(z / c, p - 1)) / c;
      if (row === 0 || row === segV) {
        nx = 0;
        nz = 0;
        ny = row === 0 ? -1 : 1;
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
      const k = (row * cols + col) * 2;
      uvs[k] = (col / segU) * perimeter;
      uvs[k + 1] = (row / segV) * h;
    }
  }
  if (deform) {
    for (let i = 0; i < positions.length; i += 3) {
      point.set(positions[i]!, positions[i + 1]!, positions[i + 2]!);
      deform(point);
      positions[i] = point.x;
      positions[i + 1] = point.y;
      positions[i + 2] = point.z;
    }
    gridNormals(positions, normals, cols, rows, false, true);
  }
  const indices: number[] = [];
  for (let row = 0; row < segV; row++) {
    for (let col = 0; col < segU; col++) {
      const i0 = row * cols + col;
      const i1 = i0 + 1;
      const i2 = i0 + cols;
      const i3 = i2 + 1;
      indices.push(i0, i2, i1, i1, i2, i3);
    }
  }
  return geometryFrom(positions, normals, uvs, indices);
}

// ---------------------------------------------------------------------------------------------------------------
// Loft
// ---------------------------------------------------------------------------------------------------------------

export interface LoftRing {
  /** Centre height. */
  readonly y: number;
  /** Full width (x) and depth (z) of the cross-section. */
  readonly w: number;
  readonly d: number;
  /** Centre offset. */
  readonly x?: number;
  readonly z?: number;
}

export interface LoftOptions {
  /** Radial segments. */
  readonly segments?: number;
  /** Superellipse exponent of the cross-section: 2 = ellipse, 3-4 = soft rounded rectangle. */
  readonly exponent?: number;
  /** Per-vertex height offset, e.g. a curved hem: (ringIndex, angle, x, z) → dy. Angle 0 = back, π = front. */
  readonly shapeY?: (ring: number, angle: number, x: number, z: number) => number;
  /** Per-vertex radial scale, e.g. pleats: (ringIndex, angle) → multiplier. */
  readonly shapeR?: (ring: number, angle: number) => number;
  /** Close the first / last ring with a small cap. Use dome rings (see `domeRings`) for a rounded end. */
  readonly capStart?: boolean;
  readonly capEnd?: boolean;
  /** Open sheet over an angle range [start, end] (radians, 0 = back, π = front) instead of a closed ring. */
  readonly arc?: readonly [number, number];
}

/**
 * Sweeps superellipse cross-sections through the given rings, in order. Ring order defines the surface direction:
 * listing rings bottom→top gives an outward-facing tube; folding back (e.g. top→hem→inner lip) gives a hem with
 * visible thickness. Angle 0 is the back (-Z) so the UV seam sits behind.
 */
export function loft(rings: readonly LoftRing[], options: LoftOptions = {}): BufferGeometry {
  const { segments = 18, exponent = 2.6, shapeY, shapeR, capStart = false, capEnd = false, arc } = options;
  const arcStart = arc ? arc[0] : 0;
  const arcSpan = arc ? arc[1] - arc[0] : Math.PI * 2;
  if (rings.length < 2) throw new RangeError('loft needs at least two rings');
  const cols = segments + 1;
  const ringCount = rings.length;
  const extra = (capStart ? 1 : 0) + (capEnd ? 1 : 0);
  const vertexCount = cols * ringCount + extra;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const power = 2 / exponent;

  // Positions.
  for (let r = 0; r < ringCount; r++) {
    const ring = rings[r]!;
    const cx = ring.x ?? 0;
    const cz = ring.z ?? 0;
    for (let s = 0; s < cols; s++) {
      const angle = arcStart + (s / segments) * arcSpan;
      const dirX = Math.sin(angle);
      const dirZ = -Math.cos(angle);
      const radial = shapeR ? shapeR(r, angle) : 1;
      const x = cx + (ring.w / 2) * sgnPow(dirX, power) * radial;
      const z = cz + (ring.d / 2) * sgnPow(dirZ, power) * radial;
      const y = ring.y + (shapeY ? shapeY(r, angle, x, z) : 0);
      const i = (r * cols + s) * 3;
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = z;
    }
  }
  // UVs: arc length around (u) and along the profile (v), in metres.
  let along = 0;
  for (let r = 0; r < ringCount; r++) {
    if (r > 0) {
      const a = r * cols * 3;
      const b = (r - 1) * cols * 3;
      along += Math.hypot(positions[a]! - positions[b]!, positions[a + 1]! - positions[b + 1]!, positions[a + 2]! - positions[b + 2]!);
    }
    let around = 0;
    for (let s = 0; s < cols; s++) {
      const i = (r * cols + s) * 3;
      if (s > 0) around += Math.hypot(positions[i]! - positions[i - 3]!, positions[i + 2]! - positions[i - 1]!);
      const k = (r * cols + s) * 2;
      uvs[k] = around;
      uvs[k + 1] = along;
    }
  }
  gridNormals(positions, normals, cols, ringCount, false, !arc);

  const indices: number[] = [];
  for (let r = 0; r < ringCount - 1; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * cols + s;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  let next = cols * ringCount;
  const addCap = (ringIndex: number, neighbourIndex: number): void => {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let s = 0; s < segments; s++) {
      const i = (ringIndex * cols + s) * 3;
      const j = (neighbourIndex * cols + s) * 3;
      cx += positions[i]!;
      cy += positions[i + 1]!;
      cz += positions[i + 2]!;
      nx += positions[i]! - positions[j]!;
      ny += positions[i + 1]! - positions[j + 1]!;
      nz += positions[i + 2]! - positions[j + 2]!;
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    const centre = next++;
    positions[centre * 3] = cx / segments;
    positions[centre * 3 + 1] = cy / segments;
    positions[centre * 3 + 2] = cz / segments;
    normals[centre * 3] = nx / len;
    normals[centre * 3 + 1] = ny / len;
    normals[centre * 3 + 2] = nz / len;
    uvs[centre * 2] = 0;
    uvs[centre * 2 + 1] = 0;
    // Winding: pick the order whose geometric normal agrees with the outward direction.
    const i0 = ringIndex * cols * 3;
    const i1 = (ringIndex * cols + 1) * 3;
    const ax = positions[i0]! - positions[centre * 3]!;
    const ay = positions[i0 + 1]! - positions[centre * 3 + 1]!;
    const az = positions[i0 + 2]! - positions[centre * 3 + 2]!;
    const bx = positions[i1]! - positions[centre * 3]!;
    const by = positions[i1 + 1]! - positions[centre * 3 + 1]!;
    const bz = positions[i1 + 2]! - positions[centre * 3 + 2]!;
    const gx = ay * bz - az * by;
    const gy = az * bx - ax * bz;
    const gz = ax * by - ay * bx;
    const forward = gx * nx + gy * ny + gz * nz > 0;
    for (let s = 0; s < segments; s++) {
      const a = ringIndex * cols + s;
      const b = a + 1;
      if (forward) indices.push(centre, a, b);
      else indices.push(centre, b, a);
    }
  };
  if (capStart) addCap(0, 1);
  if (capEnd) addCap(ringCount - 1, ringCount - 2);

  return geometryFrom(positions, normals, uvs, indices);
}

/**
 * Normals for a (cols × rows) grid whose last column duplicates the first (UV seam). Central differences along both
 * directions; the column direction wraps.
 */
function gridNormals(positions: Float32Array, normals: Float32Array, cols: number, rows: number, flip: boolean, wrap = true): void {
  const segments = cols - 1;
  const t = new Vector3();
  const bt = new Vector3();
  const n = new Vector3();
  const at = (r: number, s: number, out: Vector3): Vector3 => {
    const i = (r * cols + s) * 3;
    return out.set(positions[i]!, positions[i + 1]!, positions[i + 2]!);
  };
  const p0 = new Vector3();
  const p1 = new Vector3();
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < cols; s++) {
      const sPrev = wrap ? (s - 1 + segments) % segments : Math.max(0, s - 1);
      const sNext = wrap ? (s + 1) % segments : Math.min(cols - 1, s + 1);
      t.subVectors(at(r, sNext, p0), at(r, sPrev, p1));
      const rPrev = Math.max(0, r - 1);
      const rNext = Math.min(rows - 1, r + 1);
      const sCol = wrap ? s % segments : s;
      bt.subVectors(at(rNext, sCol, p0), at(rPrev, sCol, p1));
      n.crossVectors(bt, t);
      if (flip) n.negate();
      if (n.lengthSq() < 1e-12) {
        // Degenerate (collapsed ring): point along the profile direction.
        n.copy(bt).normalize();
        if (r === 0) n.negate();
      }
      n.normalize();
      const i = (r * cols + s) * 3;
      normals[i] = n.x;
      normals[i + 1] = n.y;
      normals[i + 2] = n.z;
    }
  }
}

/**
 * Rings that round off the end of a loft like a dome. `from` is the last full ring; returns rings moving away from
 * it by `height` (positive = up), shrinking along a quarter circle. The final ring is tiny so a cap closes it.
 */
export function domeRings(from: LoftRing, height: number, steps = 4, minScale = 0.06): LoftRing[] {
  const rings: LoftRing[] = [];
  for (let k = 1; k <= steps; k++) {
    const phi = (k / steps) * (Math.PI / 2);
    const scale = Math.max(minScale, Math.cos(phi));
    rings.push({ y: from.y + height * Math.sin(phi), w: from.w * scale, d: from.d * scale, x: from.x, z: from.z });
  }
  return rings;
}

/** Linear interpolation between two rings. */
export function lerpRing(a: LoftRing, b: LoftRing, t: number): LoftRing {
  const mix = (x: number, y: number): number => x + (y - x) * t;
  return { y: mix(a.y, b.y), w: mix(a.w, b.w), d: mix(a.d, b.d), x: mix(a.x ?? 0, b.x ?? 0), z: mix(a.z ?? 0, b.z ?? 0) };
}

/** Grow every ring by `amount` on each side (garment shells over the body). */
export function inflateRings(rings: readonly LoftRing[], amount: number | ((ring: LoftRing, index: number) => number)): LoftRing[] {
  return rings.map((ring, index) => {
    const grow = typeof amount === 'number' ? amount : amount(ring, index);
    return { ...ring, w: ring.w + grow * 2, d: ring.d + grow * 2 };
  });
}

/**
 * Cut a bottom→top ring profile to the height range [yMin, yMax], interpolating new end rings. Lets garments reuse
 * the body profile exactly (sleeves, shirts, trousers) so shells and skin deform identically.
 */
export function sliceRings(rings: readonly LoftRing[], yMin: number, yMax: number): LoftRing[] {
  const out: LoftRing[] = [];
  const sorted = [...rings].sort((a, b) => a.y - b.y);
  const sample = (y: number): LoftRing => {
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      if (y >= a.y && y <= b.y) return lerpRing(a, b, b.y === a.y ? 0 : (y - a.y) / (b.y - a.y));
    }
    return y < sorted[0]!.y ? { ...sorted[0]!, y } : { ...sorted[sorted.length - 1]!, y };
  };
  out.push(sample(yMin));
  for (const ring of sorted) if (ring.y > yMin + 1e-4 && ring.y < yMax - 1e-4) out.push(ring);
  out.push(sample(yMax));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Tube along a polyline
// ---------------------------------------------------------------------------------------------------------------

export interface TubeOptions {
  readonly radius: number | ((t: number) => number);
  readonly radial?: number;
  /** Flatten the cross-section (ribbon-like straps): depth scale relative to width. */
  readonly flatten?: number;
  readonly capEnds?: boolean;
}

/**
 * A tube along points (Catmull-Rom-free: callers pass already-smooth points). Uses parallel-transport frames so it
 * never twists unexpectedly.
 */
export function tube(points: readonly Vector3[], options: TubeOptions): BufferGeometry {
  const { radius, radial = 8, flatten = 1, capEnds = true } = options;
  const count = points.length;
  if (count < 2) throw new RangeError('tube needs at least two points');
  const cols = radial + 1;
  const extra = capEnds ? 2 : 0;
  const positions = new Float32Array((count * cols + extra) * 3);
  const normals = new Float32Array((count * cols + extra) * 3);
  const uvs = new Float32Array((count * cols + extra) * 2);
  const tangents: Vector3[] = points.map((_, i) => {
    const prev = points[Math.max(0, i - 1)]!;
    const nextPoint = points[Math.min(count - 1, i + 1)]!;
    return new Vector3().subVectors(nextPoint, prev).normalize();
  });
  // Initial normal: any vector perpendicular to the first tangent.
  const t0 = tangents[0]!;
  const helper = Math.abs(t0.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  let normal = new Vector3().crossVectors(t0, helper).normalize();
  let along = 0;
  for (let i = 0; i < count; i++) {
    const tangent = tangents[i]!;
    if (i > 0) {
      // Parallel transport.
      const prevT = tangents[i - 1]!;
      const axis = new Vector3().crossVectors(prevT, tangent);
      const sin = axis.length();
      if (sin > 1e-6) {
        axis.normalize();
        const angle = Math.asin(Math.min(1, sin));
        normal = normal.clone().applyAxisAngle(axis, prevT.dot(tangent) < 0 ? Math.PI - angle : angle);
      }
      along += points[i]!.distanceTo(points[i - 1]!);
    }
    const binormal = new Vector3().crossVectors(tangent, normal).normalize();
    const r = typeof radius === 'number' ? radius : radius(i / (count - 1));
    for (let s = 0; s < cols; s++) {
      const angle = (s / radial) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle) * flatten;
      const nx = normal.x * cos + binormal.x * sin;
      const ny = normal.y * cos + binormal.y * sin;
      const nz = normal.z * cos + binormal.z * sin;
      const k = (i * cols + s) * 3;
      positions[k] = points[i]!.x + nx * r;
      positions[k + 1] = points[i]!.y + ny * r;
      positions[k + 2] = points[i]!.z + nz * r;
      const nl = Math.hypot(nx, ny, nz) || 1;
      normals[k] = nx / nl;
      normals[k + 1] = ny / nl;
      normals[k + 2] = nz / nl;
      uvs[(i * cols + s) * 2] = (s / radial) * Math.PI * 2 * r;
      uvs[(i * cols + s) * 2 + 1] = along;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < count - 1; i++) {
    for (let s = 0; s < radial; s++) {
      const a = i * cols + s;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  if (capEnds) {
    const ends: ReadonlyArray<readonly [number, number]> = [
      [0, -1],
      [count - 1, 1],
    ];
    let centre = count * cols;
    for (const [ring, sign] of ends) {
      const p = points[ring]!;
      const t = tangents[ring]!;
      positions[centre * 3] = p.x;
      positions[centre * 3 + 1] = p.y;
      positions[centre * 3 + 2] = p.z;
      normals[centre * 3] = t.x * sign;
      normals[centre * 3 + 1] = t.y * sign;
      normals[centre * 3 + 2] = t.z * sign;
      for (let s = 0; s < radial; s++) {
        const a = ring * cols + s;
        if (sign < 0) indices.push(centre, a + 1, a);
        else indices.push(centre, a, a + 1);
      }
      centre++;
    }
  }
  return geometryFrom(positions, normals, uvs, indices);
}

/** Sample a smooth curve through control points (centripetal-ish Catmull-Rom) into `samples` points. */
export function smoothPath(control: readonly Vector3[], samples: number): Vector3[] {
  const out: Vector3[] = [];
  const n = control.length;
  for (let i = 0; i < samples; i++) {
    const u = (i / (samples - 1)) * (n - 1);
    const seg = Math.min(n - 2, Math.floor(u));
    const t = u - seg;
    const p0 = control[Math.max(0, seg - 1)]!;
    const p1 = control[seg]!;
    const p2 = control[seg + 1]!;
    const p3 = control[Math.min(n - 1, seg + 2)]!;
    const t2 = t * t;
    const t3 = t2 * t;
    const v = new Vector3();
    for (const axis of ['x', 'y', 'z'] as const) {
      v[axis] = 0.5 * (2 * p1[axis] + (-p0[axis] + p2[axis]) * t + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3);
    }
    out.push(v);
  }
  return out;
}

/**
 * Give an open sheet a back face: duplicates it offset by `thickness` along -normal with flipped winding. Used for
 * hair curtains, brims and drapes that are seen from both sides.
 */
export function doubleSided(geometry: BufferGeometry, thickness: number): BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  const n = position.count;
  const positions = new Float32Array(n * 6);
  const normals = new Float32Array(n * 6);
  const uvs = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const p = position.getComponent(i, k);
      const q = normal.getComponent(i, k);
      positions[i * 3 + k] = p;
      normals[i * 3 + k] = q;
      positions[(n + i) * 3 + k] = p - q * thickness;
      normals[(n + i) * 3 + k] = -q;
    }
    uvs[i * 2] = uv.getX(i);
    uvs[i * 2 + 1] = uv.getY(i);
    uvs[(n + i) * 2] = uv.getX(i);
    uvs[(n + i) * 2 + 1] = uv.getY(i);
  }
  const source: number[] = index ? Array.from({ length: index.count }, (_, i) => index.getX(i)) : Array.from({ length: n }, (_, i) => i);
  const indices: number[] = [...source];
  for (let i = 0; i < source.length; i += 3) indices.push(source[i]! + n, source[i + 2]! + n, source[i + 1]! + n);
  geometry.dispose();
  return geometryFrom(positions, normals, uvs, indices);
}
