import type { Matrix4} from 'three';
import { BufferAttribute, BufferGeometry, Color, Matrix3, Sphere, Vector3 } from 'three';

/** [roughness, metalness], each 0-1. Baked per vertex and read by the surface material. */
export type Surface = readonly [roughness: number, metalness: number];

/** Up to four [boneIndex, weight] influences. Weights are normalised by the builder. */
export type SkinWeights = ReadonlyArray<readonly [bone: number, weight: number]>;

/** A single bone index (rigid) or a function of the bind-pose vertex position. */
export type SkinBinding = number | ((x: number, y: number, z: number) => SkinWeights);

/** A flat colour (linear working space) or a per-vertex function writing into `out`. */
export type ColorSource = Color | ((x: number, y: number, z: number, out: Color) => void);

export interface PartStyle {
  /** Material slot. Parts sharing a slot are merged into one draw call. */
  readonly slot: string;
  readonly color: ColorSource;
  readonly surface: Surface;
  readonly skin?: SkinBinding;
  /** 0-1: darken towards the bottom of the part (cheap baked occlusion, gives the soft-toy look depth). */
  readonly shade?: number;
}

interface PendingPart {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly colors: Uint8Array;
  readonly surface: Uint8Array;
  readonly skinIndex: Uint8Array | null;
  readonly skinWeight: Uint8Array | null;
  readonly indices: Uint32Array;
}

export interface BuiltGeometry {
  readonly geometry: BufferGeometry;
  /** Slot key per geometry group, in material-index order. */
  readonly slots: readonly string[];
  readonly vertexCount: number;
  readonly triangleCount: number;
}

const tmpV = new Vector3();
const tmpN = new Vector3();
const tmpColor = new Color();
const normalMatrix = new Matrix3();

/**
 * Accumulates procedural parts and merges them into one indexed geometry with one group per material slot.
 * Bakes colour, surface (roughness/metalness) and skin weights per vertex so a whole character renders in a handful
 * of draw calls.
 */
export class PartBuilder {
  private readonly parts = new Map<string, PendingPart[]>();
  private readonly skinned: boolean;
  private readonly slotOrder: string[] = [];

  constructor(options: { readonly skinned: boolean }) {
    this.skinned = options.skinned;
  }

  /** Copies the geometry (transformed by `matrix`) into the builder and disposes the input. */
  add(geometry: BufferGeometry, style: PartStyle, matrix?: Matrix4): void {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const count = position.count;
    const positions = new Float32Array(count * 3);
    const normals = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    if (matrix) normalMatrix.getNormalMatrix(matrix);
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      tmpV.fromBufferAttribute(position, i);
      if (matrix) tmpV.applyMatrix4(matrix);
      positions[i * 3] = tmpV.x;
      positions[i * 3 + 1] = tmpV.y;
      positions[i * 3 + 2] = tmpV.z;
      if (tmpV.y < minY) minY = tmpV.y;
      if (tmpV.y > maxY) maxY = tmpV.y;
      if (normal) {
        tmpN.fromBufferAttribute(normal, i);
        if (matrix) tmpN.applyMatrix3(normalMatrix).normalize();
        normals[i * 3] = tmpN.x;
        normals[i * 3 + 1] = tmpN.y;
        normals[i * 3 + 2] = tmpN.z;
      }
      if (uv) {
        uvs[i * 2] = uv.getX(i);
        uvs[i * 2 + 1] = uv.getY(i);
      }
    }

    const colors = new Uint8Array(count * 3);
    const surface = new Uint8Array(count * 2);
    const rough = Math.round(clamp01(style.surface[0]) * 255);
    const metal = Math.round(clamp01(style.surface[1]) * 255);
    const span = Math.max(1e-4, maxY - minY);
    const shade = style.shade ?? 0;
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3]!;
      const y = positions[i * 3 + 1]!;
      const z = positions[i * 3 + 2]!;
      if (typeof style.color === 'function') style.color(x, y, z, tmpColor);
      else tmpColor.copy(style.color);
      let k = 1;
      if (shade > 0) {
        // Clamp: transformed positions can land a hair outside [minY, maxY], and a negative base ** 1.6 is NaN.
        const t = clamp01((y - minY) / span);
        k = 1 - shade * (1 - t) ** 1.6;
      }
      colors[i * 3] = toByte(linearToStored(tmpColor.r) * k);
      colors[i * 3 + 1] = toByte(linearToStored(tmpColor.g) * k);
      colors[i * 3 + 2] = toByte(linearToStored(tmpColor.b) * k);
      surface[i * 2] = rough;
      surface[i * 2 + 1] = metal;
    }

    let skinIndex: Uint8Array | null = null;
    let skinWeight: Uint8Array | null = null;
    if (this.skinned) {
      skinIndex = new Uint8Array(count * 4);
      skinWeight = new Uint8Array(count * 4);
      const binding = style.skin ?? 0;
      for (let i = 0; i < count; i++) {
        if (typeof binding === 'number') {
          skinIndex[i * 4] = binding;
          skinWeight[i * 4] = 255;
          continue;
        }
        const weights = binding(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!);
        writeWeights(weights, skinIndex, skinWeight, i * 4);
      }
    }

    const index = geometry.getIndex();
    const indices = new Uint32Array(index ? index.count : count);
    if (index) for (let i = 0; i < index.count; i++) indices[i] = index.getX(i);
    else for (let i = 0; i < count; i++) indices[i] = i;

    const list = this.parts.get(style.slot);
    const part: PendingPart = { positions, normals, uvs, colors, surface, skinIndex, skinWeight, indices };
    if (list) list.push(part);
    else {
      this.parts.set(style.slot, [part]);
      this.slotOrder.push(style.slot);
    }
    geometry.dispose();
  }

  /** True if at least one part was added to `slot`. */
  has(slot: string): boolean {
    return this.parts.has(slot);
  }

  /**
   * Merge everything. `order` sorts slots (e.g. opaque first, transparent face last); unknown slots keep insertion
   * order after the listed ones.
   */
  build(order: (slot: string) => number = () => 0): BuiltGeometry {
    const slots = [...this.slotOrder].sort((a, b) => order(a) - order(b));
    let vertexTotal = 0;
    let indexTotal = 0;
    for (const slot of slots) {
      for (const part of this.parts.get(slot) ?? []) {
        vertexTotal += part.positions.length / 3;
        indexTotal += part.indices.length;
      }
    }
    const positions = new Float32Array(vertexTotal * 3);
    const normals = new Float32Array(vertexTotal * 3);
    const uvs = new Float32Array(vertexTotal * 2);
    const colors = new Uint8Array(vertexTotal * 3);
    const surface = new Uint8Array(vertexTotal * 2);
    const skinIndex = this.skinned ? new Uint8Array(vertexTotal * 4) : null;
    const skinWeight = this.skinned ? new Uint8Array(vertexTotal * 4) : null;
    const indices = vertexTotal > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);
    const geometry = new BufferGeometry();
    let vOffset = 0;
    let iOffset = 0;
    slots.forEach((slot, materialIndex) => {
      const groupStart = iOffset;
      for (const part of this.parts.get(slot) ?? []) {
        const n = part.positions.length / 3;
        positions.set(part.positions, vOffset * 3);
        normals.set(part.normals, vOffset * 3);
        uvs.set(part.uvs, vOffset * 2);
        colors.set(part.colors, vOffset * 3);
        surface.set(part.surface, vOffset * 2);
        if (skinIndex && skinWeight && part.skinIndex && part.skinWeight) {
          skinIndex.set(part.skinIndex, vOffset * 4);
          skinWeight.set(part.skinWeight, vOffset * 4);
        }
        for (let i = 0; i < part.indices.length; i++) indices[iOffset + i] = part.indices[i]! + vOffset;
        vOffset += n;
        iOffset += part.indices.length;
      }
      geometry.addGroup(groupStart, iOffset - groupStart, materialIndex);
    });
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new BufferAttribute(colors, 3, true));
    geometry.setAttribute('surface', new BufferAttribute(surface, 2, true));
    if (skinIndex && skinWeight) {
      geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
      geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4, true));
    }
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.boundingSphere = geometry.boundingBox ? geometry.boundingBox.getBoundingSphere(new Sphere()) : new Sphere();
    this.parts.clear();
    this.slotOrder.length = 0;
    return { geometry, slots, vertexCount: vertexTotal, triangleCount: indexTotal / 3 };
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toByte(value: number): number {
  return Math.round(clamp01(value) * 255);
}

/**
 * Vertex colours are stored as normalised bytes. Storing linear values in 8 bits bands the darks (and our skin
 * palette is deep), so we store sRGB-encoded bytes and decode in the shader (see surface material).
 */
function linearToStored(linear: number): number {
  const c = clamp01(linear);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
}

function writeWeights(weights: SkinWeights, index: Uint8Array, weight: Uint8Array, offset: number): void {
  const sorted = [...weights].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = sorted.reduce((sum, [, w]) => sum + w, 0) || 1;
  let assigned = 0;
  sorted.forEach(([bone, w], k) => {
    index[offset + k] = bone;
    const byte = k === sorted.length - 1 ? 255 - assigned : Math.round((w / total) * 255);
    weight[offset + k] = byte;
    assigned += byte;
  });
  if (sorted.length === 0) weight[offset] = 255;
}
