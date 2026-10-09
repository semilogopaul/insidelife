import { BLUEPRINTS, findHousePaint, findRoofColour, type BlueprintId } from '@insidelife/shared';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  type Matrix4,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  FRONT_LINE,
  GATE_HALF,
  HOUSE_BACK,
  HOUSE_SHAPES,
  STOREY,
  WALL_INSET,
  hexToInt,
  type OwnedLot,
} from '../layout/owned-lots';
import { frameOf } from '../layout/placements';
import { frameMatrix } from './landmark-geometry';
import { paint } from './paint';

/**
 * What stands on your lots, in the city's vertex-colour layout (one merged mesh for all of them), plus where the
 * signs go. Authored lot-local: x right when facing the lot from the road, z towards the road, y up; the compound
 * walls and gate come from the city plan (`withOwnedLots`).
 */

const CONCRETE = 0x9a9a94;
const BLOCK = 0xa7a69e;
const GLASS = 0x2f4450;
const FRAME = 0xf4f2ec;
const DOOR = 0x6b3f22;
const STEEL = 0x3b3f44;
const SCAFFOLD = 0x9b7b4f;
const REBAR = 0x7b4a2c;
const ROOF: Readonly<Record<BlueprintId, number>> = {
  bungalow: 0x8e2b2b,
  duplex: 0x2f5d50,
  'block-of-flats': 0xd8d2c4,
  mansion: 0x3a3d44,
};

type Part = (geometry: BufferGeometry, hex: number, shade?: number) => void;

const box = (w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry =>
  new BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cylinder = (r: number, h: number, x: number, y: number, z: number, segments = 10): BufferGeometry =>
  new CylinderGeometry(r, r, h, segments).translate(x, y + h / 2, z);

/** A hipped roof over a w × d rectangle (ridge along x), eaves at y = 0. */
function hipRoof(w: number, d: number, h: number): BufferGeometry {
  const x = w / 2;
  const z = d / 2;
  const r = Math.max(0, x - z);
  const A = [-x, 0, -z];
  const B = [x, 0, -z];
  const C = [x, 0, z];
  const D = [-x, 0, z];
  const R1 = [-r, h, 0];
  const R2 = [r, h, 0];
  // Counter-clockwise seen from outside: front, back, left end, right end.
  const triangles = [D, C, R2, D, R2, R1, B, A, R1, B, R1, R2, A, D, R1, C, B, R2];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles.flat()), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Framed windows across a facade at height `y` (the facade faces +z at `z`). */
function windows(add: Part, xs: readonly number[], y: number, z: number, w = 1.1, h = 1.2): void {
  for (const x of xs) {
    add(box(w + 0.16, h + 0.16, 0.06, x, y - 0.08, z + 0.03), FRAME);
    add(box(w, h, 0.06, x, y, z + 0.07), GLASS);
  }
}

/** The house; `wall` and `roof` are the owner's paint and roofing sheets (sRGB). */
function house(add: Part, blueprintId: BlueprintId, back: number, wall: number, roof: number): void {
  const shape = HOUSE_SHAPES[blueprintId];
  const { width: w, depth: d, storeys } = shape;
  const cz = back + d / 2;
  const front = back + d;
  const top = storeys * STOREY + 0.3;
  add(box(w + 0.3, 0.3, d + 0.3, 0, 0, cz), CONCRETE);
  add(box(w, top - 0.3, d, 0, 0.3, cz), wall);
  // Floor bands between storeys.
  for (let s = 1; s < storeys; s++) add(box(w + 0.08, 0.18, d + 0.08, 0, s * STOREY + 0.2, cz), FRAME);

  switch (blueprintId) {
    case 'bungalow': {
      windows(add, [-2.4, 2.4], 1.2, front);
      add(box(1.1, 2.2, 0.08, 0, 0.3, front + 0.04), DOOR);
      // Porch slab on two pillars.
      add(box(2.6, 0.16, 1.4, 0, 2.9, front + 0.7), FRAME);
      for (const x of [-1.15, 1.15]) add(cylinder(0.12, 2.6, x, 0.3, front + 1.25), FRAME);
      add(hipRoof(w + 0.9, d + 0.9, 1.9).translate(0, top, cz), roof);
      break;
    }
    case 'duplex': {
      windows(add, [-2.6, 2.6], 1.2, front);
      windows(add, [-2.6, 2.6], 1.2 + STOREY, front);
      add(box(1.2, 2.3, 0.08, 0, 0.3, front + 0.04), DOOR);
      add(box(1.3, 2.1, 0.06, 0, STOREY + 0.5, front + 0.04), GLASS);
      // First-floor balcony on two columns.
      add(box(3.2, 0.2, 1.4, 0, STOREY + 0.2, front + 0.7), FRAME);
      add(box(3.2, 0.9, 0.08, 0, STOREY + 0.4, front + 1.36), STEEL);
      for (const x of [-1.45, 1.45]) add(cylinder(0.14, STOREY - 0.1, x, 0.3, front + 1.25), FRAME);
      add(hipRoof(w + 0.8, d + 0.8, 2.0).translate(0, top, cz), roof);
      break;
    }
    case 'block-of-flats': {
      // Two flats a floor either side of a breeze-block stairwell, with balconies.
      add(box(1.4, top - 0.3, 0.1, 0, 0.3, front + 0.05), 0xcfc6b4);
      for (let s = 0; s < storeys; s++) {
        const y = s * STOREY + 1.2;
        windows(add, [-3.2, -1.7, 1.7, 3.2], y, front, 0.9, 1.1);
        if (s > 0) {
          for (const x of [-2.45, 2.45]) {
            add(box(2.6, 0.16, 0.9, x, s * STOREY + 0.2, front + 0.45), FRAME);
            add(box(2.6, 0.8, 0.06, x, s * STOREY + 0.36, front + 0.88), STEEL);
          }
        }
      }
      add(box(1.1, 2.2, 0.08, 0, 0.3, front + 0.1), STEEL);
      // Parapet and the black water tank on its stand.
      add(box(w, 0.6, 0.15, 0, top, back + 0.08), roof);
      add(box(w, 0.6, 0.15, 0, top, front - 0.08), roof);
      add(box(0.15, 0.6, d, -w / 2 + 0.08, top, cz), roof);
      add(box(0.15, 0.6, d, w / 2 - 0.08, top, cz), roof);
      for (const x of [2.2, 3.2])
        for (const z of [back + 1, back + 2]) add(box(0.1, 1.2, 0.1, x, top, z), STEEL);
      add(cylinder(0.75, 1.6, 2.7, top + 1.2, back + 1.5, 14), 0x1e1e20);
      break;
    }
    case 'mansion': {
      windows(add, [-3.3, -2.1, 2.1, 3.3], 1.1, front, 0.9, 1.5);
      windows(add, [-3.3, -2.1, 2.1, 3.3], 1.1 + STOREY, front, 0.9, 1.5);
      add(box(1.6, 2.6, 0.08, 0, 0.3, front + 0.04), DOOR);
      add(box(1.6, 1.8, 0.06, 0, STOREY + 0.6, front + 0.04), GLASS);
      // Double-height portico: four columns, entablature and a pediment.
      const portico = front + 1.2;
      add(box(4.2, 0.3, 1.5, 0, 0, front + 0.75), FRAME);
      for (const x of [-1.8, -0.6, 0.6, 1.8]) add(cylinder(0.17, top - 0.6, x, 0.3, portico, 12), FRAME);
      add(box(4.4, 0.45, 1.5, 0, top - 0.3, front + 0.75), FRAME);
      add(hipRoof(4.6, 1.6, 1.0).translate(0, top + 0.15, front + 0.75), roof);
      add(hipRoof(w + 0.8, d + 0.8, 2.2).translate(0, top, cz), roof);
      // Gold trim and lamps either side of the door.
      add(box(w + 0.1, 0.12, d + 0.1, 0, top - 0.12, cz), 0xc9a227);
      for (const x of [-1.1, 1.1]) add(box(0.18, 0.3, 0.18, x, 2.2, front + 0.1), 0xf6d77a);
      break;
    }
  }
  // Under the eaves (seen from the street).
  if (blueprintId !== 'block-of-flats') add(box(w + 0.8, 0.06, d + 0.8, 0, top - 0.06, cz), FRAME);
}

/** Blockwork going up, columns with rebar, scaffold, sand and a stack of blocks. */
function site(add: Part, blueprintId: BlueprintId, back: number): void {
  const shape = HOUSE_SHAPES[blueprintId];
  const { width: w, depth: d } = shape;
  const cz = back + d / 2;
  const front = back + d;
  const wallTop = 2.1;
  add(box(w + 0.3, 0.3, d + 0.3, 0, 0, cz), CONCRETE);
  add(box(w, wallTop, 0.22, 0, 0.3, back + 0.11), BLOCK);
  add(box(0.22, wallTop, d, -w / 2 + 0.11, 0.3, cz), BLOCK);
  add(box(0.22, wallTop, d, w / 2 - 0.11, 0.3, cz), BLOCK);
  // Front wall with a door opening.
  add(box(w / 2 - 0.6, wallTop, 0.22, -(w / 4 + 0.3), 0.3, front - 0.11), BLOCK);
  add(box(w / 2 - 0.6, wallTop * 0.6, 0.22, w / 4 + 0.3, 0.3, front - 0.11), BLOCK);
  // Corner columns with rusty rebar sticking up (more storeys to come).
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) {
    for (const z of [back + 0.15, front - 0.15]) {
      add(box(0.3, 2.9, 0.3, x, 0.3, z), CONCRETE);
      if (shape.storeys > 1)
        for (const dx of [-0.07, 0.07]) add(box(0.025, 1.1, 0.025, x + dx, 3.2, z), REBAR);
    }
  }
  // Scaffold along the front: poles and two ledgers.
  for (const x of [-w / 2, -w / 6, w / 6, w / 2]) add(cylinder(0.05, 3.6, x, 0, front + 0.55, 6), SCAFFOLD);
  for (const y of [1.4, 2.8]) add(box(w + 0.2, 0.08, 0.08, 0, y, front + 0.55), SCAFFOLD);
  // Sand heap and a pallet of blocks in the yard.
  add(new ConeGeometry(1.1, 0.9, 12).translate(w / 2 - 1.1, 0.45, front + 1.55), 0xd8c08a);
  for (let row = 0; row < 3; row++)
    add(box(1.2, 0.2, 0.45, -w / 2 + 1.2, row * 0.21, front + 1.5), BLOCK, row % 2 ? 0.94 : 1);
}

/** Survey beacons at the corners of bare land (concrete with red tops). */
function beacons(add: Part, half: number, back: number, front: number): void {
  for (const x of [-half, half]) {
    for (const z of [back, front]) {
      add(box(0.24, 0.55, 0.24, x, 0, z), 0xdedbd2);
      add(box(0.26, 0.08, 0.26, x, 0.55, z), 0xc0392b);
    }
  }
}

export interface OwnedSign {
  readonly key: string;
  readonly kind: 'land' | 'site' | 'plate' | 'wall';
  readonly lines: readonly string[];
  readonly matrix: Matrix4;
  /** Lot-local centre and size of the face (metres). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly width: number;
  readonly height: number;
}

const NAMEPLATE: Readonly<Record<BlueprintId, string>> = {
  bungalow: 'HOUSE',
  duplex: 'LODGE',
  'block-of-flats': 'COURT',
  mansion: 'VILLA',
};

/** The merged structures on every owned lot, and the signs that go with them. */
export function buildOwnedGeometry(
  owned: readonly OwnedLot[],
  owner: { readonly firstName: string; readonly lastName: string },
): { readonly geometry: BufferGeometry | null; readonly signs: readonly OwnedSign[] } {
  const parts: BufferGeometry[] = [];
  const signs: OwnedSign[] = [];
  for (const { lot, property } of owned) {
    const frame = frameOf(lot);
    const matrix = frameMatrix(frame);
    const add: Part = (geometry, hex, shade = 1) => {
      parts.push(paint(geometry, hex, shade).applyMatrix4(matrix));
    };
    const back = -frame.depth / 2 + WALL_INSET + HOUSE_BACK;
    const frontLine = FRONT_LINE(frame);
    const half = frame.width / 2 - WALL_INSET;
    const fullName = `${owner.firstName} ${owner.lastName}`;
    const sign = (
      kind: OwnedSign['kind'],
      lines: readonly string[],
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
    ): void => {
      signs.push({ key: `${property.id}:${kind}`, kind, lines, matrix, x, y, z, width, height });
    };
    const signboard = (x: number, z: number): void => {
      for (const dx of [-0.8, 0.8]) add(box(0.09, 2.2, 0.09, x + dx, 0, z - 0.2), 0x5d4037);
      add(box(2.0, 1.15, 0.06, x, 1.05, z - 0.12), FRAME);
    };

    if (property.stage === 'land' || !property.blueprintId) {
      beacons(add, half, -frame.depth / 2 + WALL_INSET, frontLine);
      signboard(-1.6, frontLine - 0.4);
      sign(
        'land',
        ['THIS LAND IS', 'NOT FOR SALE', 'BEWARE OF 419', `Property of ${fullName}`],
        -1.6,
        1.625,
        frontLine - 0.4 - 0.08,
        1.9,
        1.05,
      );
    } else if (property.stage === 'construction') {
      site(add, property.blueprintId, back);
      signboard(half - 1.3, frontLine + 0.75);
      sign(
        'site',
        [
          'PROPOSED',
          BLUEPRINTS[property.blueprintId].label.toUpperCase(),
          `For ${fullName}`,
          'Site in progress',
        ],
        half - 1.3,
        1.625,
        frontLine + 0.75 - 0.08,
        1.9,
        1.05,
      );
    } else {
      const { exterior } = property;
      const paint = findHousePaint(exterior.paint)?.hex;
      const sheets = findRoofColour(exterior.roof)?.hex;
      const wall = paint ? hexToInt(paint) : HOUSE_SHAPES[property.blueprintId].wall;
      house(add, property.blueprintId, back, wall, sheets ? hexToInt(sheets) : ROOF[property.blueprintId]);
      // Nameplate on the wall beside the gate; the classic warning painted on the other side (both clear of the
      // gate pillars, which stand 0.5 m either side of the opening).
      const clear = GATE_HALF + 0.65;
      sign(
        'plate',
        [(property.exterior.name ?? `${owner.lastName} ${NAMEPLATE[property.blueprintId]}`).toUpperCase()],
        -(clear + half) / 2,
        1.55,
        frontLine + 0.14,
        half - clear - 0.15,
        0.34,
      );
      sign(
        'wall',
        ['THIS HOUSE IS', 'NOT FOR SALE'],
        (clear + half) / 2,
        0.95,
        frontLine + 0.14,
        half - clear - 0.15,
        0.62,
      );
    }
  }
  if (parts.length === 0) return { geometry: null, signs };
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  return { geometry, signs };
}
