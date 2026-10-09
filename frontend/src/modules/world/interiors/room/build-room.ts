import { BufferAttribute, BufferGeometry } from 'three';
import { shadeHex } from '@/common/three/materials/color-utils';
import type { PropKit } from '../props/build-props';
import type { Opening, RoomSpec, WindowSpec } from '../templates/types';
import { FLOOR_TILE_METRES, WALL_TILE_METRES } from './room-textures';

export const WALL_THICKNESS = 0.14;
const SLAB = 0.14;
const DEFAULT_SILL = 0.85;
const DEFAULT_WINDOW_H = 1.05;
const DOOR_H = 2.05;

interface GeometryArrays {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
}

function arrays(): GeometryArrays {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function toGeometry(data: GeometryArrays): BufferGeometry {
  const geometry = new BufferGeometry();
  const count = data.positions.length / 3;
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(data.positions), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(data.normals), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(data.uvs), 2));
  geometry.setAttribute('color', new BufferAttribute(new Uint8Array(count * 3).fill(255), 3, true));
  const surface = new Uint8Array(count * 2);
  for (let i = 0; i < count; i++) surface[i * 2] = 220;
  geometry.setAttribute('surface', new BufferAttribute(surface, 2, true));
  geometry.setIndex(data.indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Axis-aligned box with UVs from world position: u along the wall (x or z), v = y / height. */
function uvBox(out: GeometryArrays, min: readonly [number, number, number], max: readonly [number, number, number], along: 'x' | 'z', height: number): void {
  const faces: ReadonlyArray<{ readonly n: readonly [number, number, number]; readonly corners: ReadonlyArray<readonly [number, number, number]> }> = [
    { n: [0, 0, 1], corners: [[min[0], min[1], max[2]], [max[0], min[1], max[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]]] },
    { n: [0, 0, -1], corners: [[max[0], min[1], min[2]], [min[0], min[1], min[2]], [min[0], max[1], min[2]], [max[0], max[1], min[2]]] },
    { n: [1, 0, 0], corners: [[max[0], min[1], max[2]], [max[0], min[1], min[2]], [max[0], max[1], min[2]], [max[0], max[1], max[2]]] },
    { n: [-1, 0, 0], corners: [[min[0], min[1], min[2]], [min[0], min[1], max[2]], [min[0], max[1], max[2]], [min[0], max[1], min[2]]] },
    { n: [0, 1, 0], corners: [[min[0], max[1], max[2]], [max[0], max[1], max[2]], [max[0], max[1], min[2]], [min[0], max[1], min[2]]] },
  ];
  for (const face of faces) {
    const base = out.positions.length / 3;
    for (const [x, y, z] of face.corners) {
      out.positions.push(x, y, z);
      out.normals.push(face.n[0], face.n[1], face.n[2]);
      const a = along === 'x' ? x : z;
      out.uvs.push(a / WALL_TILE_METRES, face.n[1] === 1 ? 0.995 : Math.min(0.995, y / height));
    }
    out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

interface Hole {
  readonly from: number;
  readonly to: number;
  /** Solid below / above the hole. */
  readonly bottom: number;
  readonly top: number;
}

function holes(room: RoomSpec, wall: 'back' | 'left'): Hole[] {
  const list: Hole[] = [];
  for (const w of room.windows ?? []) {
    if (w.wall !== wall) continue;
    const sill = w.sill ?? DEFAULT_SILL;
    list.push({ from: w.at - w.width / 2, to: w.at + w.width / 2, bottom: sill, top: Math.min(room.height - 0.15, sill + (w.height ?? DEFAULT_WINDOW_H)) });
  }
  for (const d of room.doors ?? []) {
    if (d.wall !== wall) continue;
    list.push({ from: d.at - d.width / 2, to: d.at + d.width / 2, bottom: 0, top: Math.min(room.height - 0.1, DOOR_H) });
  }
  return list.sort((a, b) => a.from - b.from);
}

/** Walls along the back (-z) and left (-x) — the dollhouse cutaway keeps front and right open. */
export function buildWalls(room: RoomSpec): BufferGeometry | null {
  if (room.outdoor) return null;
  const out = arrays();
  const { width: W, depth: D, height: H } = room;
  const t = WALL_THICKNESS;
  // Back wall: x from -W/2 - t to W/2, z in [-D/2 - t, -D/2].
  const backSegments = (from: number, to: number, y0: number, y1: number): void => uvBox(out, [from, y0, -D / 2 - t], [to, y1, -D / 2], 'x', H);
  const leftSegments = (from: number, to: number, y0: number, y1: number): void => uvBox(out, [-W / 2 - t, y0, from], [-W / 2, y1, to], 'z', H);
  const fill = (wall: 'back' | 'left', start: number, end: number, emit: (a: number, b: number, y0: number, y1: number) => void): void => {
    let cursor = start;
    for (const hole of holes(room, wall)) {
      if (hole.from > cursor) emit(cursor, hole.from, 0, H);
      if (hole.bottom > 0) emit(hole.from, hole.to, 0, hole.bottom);
      emit(hole.from, hole.to, hole.top, H);
      cursor = Math.max(cursor, hole.to);
    }
    if (cursor < end) emit(cursor, end, 0, H);
  };
  fill('back', -W / 2 - t, W / 2, backSegments);
  fill('left', -D / 2, D / 2, leftSegments);
  return toGeometry(out);
}

export function buildFloor(room: RoomSpec): BufferGeometry {
  const out = arrays();
  const { width: W, depth: D } = room;
  const base = 0;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [-W / 2, D / 2],
    [W / 2, D / 2],
    [W / 2, -D / 2],
    [-W / 2, -D / 2],
  ];
  for (const [x, z] of corners) {
    out.positions.push(x, 0, z);
    out.normals.push(0, 1, 0);
    out.uvs.push(x / FLOOR_TILE_METRES, -z / FLOOR_TILE_METRES);
  }
  out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return toGeometry(out);
}

/** Window panes (one emissive draw call; their glow follows the daylight). */
export function buildGlass(room: RoomSpec): BufferGeometry | null {
  if (room.outdoor || !room.windows?.length) return null;
  const out = arrays();
  const { width: W, depth: D } = room;
  for (const w of room.windows) {
    const sill = w.sill ?? DEFAULT_SILL;
    const top = Math.min(room.height - 0.15, sill + (w.height ?? DEFAULT_WINDOW_H));
    const base = out.positions.length / 3;
    const inset = WALL_THICKNESS * 0.6;
    const corners: ReadonlyArray<readonly [number, number]> = [
      [w.at - w.width / 2, sill],
      [w.at + w.width / 2, sill],
      [w.at + w.width / 2, top],
      [w.at - w.width / 2, top],
    ];
    for (const [a, y] of corners) {
      if (w.wall === 'back') {
        out.positions.push(a, y, -D / 2 - inset);
        out.normals.push(0, 0, 1);
      } else {
        out.positions.push(-W / 2 - inset, y, a);
        out.normals.push(1, 0, 0);
      }
      out.uvs.push((a - (w.at - w.width / 2)) / w.width, (y - sill) / (top - sill));
    }
    if (w.wall === 'back') out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else out.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  return toGeometry(out);
}

function windowTrims(kit: PropKit, room: RoomSpec, w: WindowSpec, frame: string): void {
  const sill = w.sill ?? DEFAULT_SILL;
  const top = Math.min(room.height - 0.15, sill + (w.height ?? DEFAULT_WINDOW_H));
  const h = top - sill;
  const { width: W, depth: D } = room;
  const onBack = w.wall === 'back';
  // Place the kit frame on the wall: local x along the wall, local z out of the wall.
  if (onBack) kit.place([w.at, -D / 2], 0, 0);
  else kit.place([-W / 2, w.at], 0, 90);
  const t = WALL_THICKNESS;
  kit.box([w.width + 0.12, 0.06, t + 0.08], [0, sill - 0.03, -t / 2 + 0.02], frame, 'paint', [0, 0, 0], 0.2);
  kit.box([w.width + 0.12, 0.06, t + 0.02], [0, top + 0.03, -t / 2], frame, 'paint', [0, 0, 0], 0.2);
  for (const s of [-1, 1]) kit.box([0.06, h + 0.12, t + 0.02], [(s * (w.width + 0.06)) / 2, sill + h / 2, -t / 2], frame, 'paint', [0, 0, 0], 0.2);
  kit.box([0.04, h, 0.04], [0, sill + h / 2, -t * 0.55], frame, 'paint', [0, 0, 0], 0.2);
  if (room.curtain) {
    // Gathered curtains either side, on a rail.
    kit.box([w.width + 0.6, 0.03, 0.03], [0, top + 0.12, 0.08], '#8d6e63', 'wood', [0, 0, 0], 0.4);
    const bottom = Math.max(0.05, sill - 0.35);
    const panel = Math.min(room.height - 0.1, top + 0.12) - bottom;
    for (const s of [-1, 1]) kit.drape([0.32, panel, 0.05], [s * (w.width / 2 + 0.12), bottom + panel / 2, 0.1], room.curtain);
  }
  if (w.bars !== false) {
    // Burglar-proof: vertical bars with a curl band — every Lagos window has them.
    const bars = Math.max(3, Math.round(w.width / 0.14));
    for (let i = 1; i < bars; i++) kit.box([0.018, h, 0.018], [-w.width / 2 + (i * w.width) / bars, sill + h / 2, -0.01], '#2b2f33', 'metal', [0, 0, 0], 0.4);
    for (const y of [0.33, 0.66]) kit.box([w.width, 0.02, 0.02], [0, sill + h * y, -0.01], '#2b2f33', 'metal', [0, 0, 0], 0.4);
  }
}

/** Frames, bars, door, skirting and the slab edge — merged into the props draw call. */
export function buildRoomTrims(kit: PropKit, room: RoomSpec, accent: { readonly frame: string; readonly door: string; readonly skirting: string }): void {
  const { width: W, depth: D } = room;
  // Slab under the floor (the dollhouse base).
  kit.place([0, 0], 0, 0);
  kit.box([W + (room.outdoor ? 0 : WALL_THICKNESS), SLAB, D + (room.outdoor ? 0 : WALL_THICKNESS)], [room.outdoor ? 0 : -WALL_THICKNESS / 2, -SLAB / 2 - 0.002, room.outdoor ? 0 : -WALL_THICKNESS / 2], room.outdoor ? '#6b5a45' : shadeHex(accent.skirting, -0.2), 'stone', [0, 0, 0], 0.05);
  if (room.outdoor) return;
  // Skirting boards.
  kit.box([W, 0.08, 0.02], [0, 0.04, -D / 2 + 0.01], accent.skirting, 'paint', [0, 0, 0], 0.1);
  kit.box([0.02, 0.08, D], [-W / 2 + 0.01, 0.04, 0], accent.skirting, 'paint', [0, 0, 0], 0.1);
  for (const w of room.windows ?? []) windowTrims(kit, room, w, accent.frame);
  for (const d of room.doors ?? []) doorTrims(kit, room, d, accent);
}

function doorTrims(kit: PropKit, room: RoomSpec, door: Opening, accent: { readonly frame: string; readonly door: string }): void {
  const { width: W, depth: D } = room;
  if (door.wall === 'back') kit.place([door.at, -D / 2], 0, 0);
  else kit.place([-W / 2, door.at], 0, 90);
  const t = WALL_THICKNESS;
  const h = Math.min(room.height - 0.1, DOOR_H);
  for (const s of [-1, 1]) kit.box([0.07, h, t + 0.04], [(s * (door.width + 0.07)) / 2, h / 2, -t / 2], accent.frame, 'wood', [0, 0, 0], 0.2);
  kit.box([door.width + 0.2, 0.08, t + 0.04], [0, h + 0.04, -t / 2], accent.frame, 'wood', [0, 0, 0], 0.2);
  // Door leaf, slightly ajar.
  kit.box([door.width - 0.02, h - 0.02, 0.05], [0, h / 2, -t * 0.6], accent.door, 'wood', [0, 0, 0], 0.15);
  kit.box([door.width * 0.7, h * 0.32, 0.02], [0, h * 0.72, -t * 0.6 + 0.03], shadeHex(accent.door, -0.08), 'wood', [0, 0, 0], 0.15);
  kit.box([door.width * 0.7, h * 0.32, 0.02], [0, h * 0.3, -t * 0.6 + 0.03], shadeHex(accent.door, -0.08), 'wood', [0, 0, 0], 0.15);
  kit.sphere(0.03, [door.width * 0.36, h * 0.48, -t * 0.6 + 0.05], '#c9a64a', 'metal');
}
