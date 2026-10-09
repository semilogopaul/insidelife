import {
  CITY_MAP,
  DIR_E,
  DIR_N,
  DIR_S,
  DIR_W,
  cellCentreX,
  cellCentreZ,
  findVenue,
  type CityLot,
  type CityRoadTile,
  type CompassSide,
  type DistrictId,
} from '@insidelife/shared';
import { KIT_MANIFEST } from '../assets/kit-manifest';
import { PROC_MODELS, type ProcModelId } from './proc-models';
import { DISTRICT_STYLES, type BuildingRef, type KitId } from './styles';

/**
 * The city plan: every model instance, lamp, wall and collider, derived deterministically from the shared CityMap.
 * Pure (no three.js) so it can be unit-tested and reused by the play layer for collisions.
 */

export const CELL = CITY_MAP.cellSize;
/** Raised pavement (kerb top) height, matching Kenney road tiles scaled ×10. */
export const PAVEMENT_Y = 0.2;
/** Asphalt surface height. */
export const ROAD_Y = 0.1;
/** Pavement strip on the lot side of every road edge (metres). */
export const APRON = 1.6;
export const ROAD_SCALE = 10;
export const VEHICLE_SCALE = 1.73;
const COMMERCIAL_SCALE = 8.6;
const SUBURBAN_SCALE = 6.8;
const LOT_FRONT_WIDTH = 9.2;
const LOT_DEPTH = 8;

export interface Placement {
  readonly kit: KitId;
  readonly model: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  /** sRGB multiplier (walls for buildings, foliage variety). */
  readonly tint: number;
  /** True when a simplified `<model>__lod` exists. */
  readonly lod: boolean;
}

export interface LampSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Warm sodium vs. cool LED. */
  readonly warm: boolean;
}

export interface WallSegment {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly height: number;
  readonly color: number;
}

export interface GateSpot {
  readonly x: number;
  readonly z: number;
  /** Gate leaves run along this direction (unit). */
  readonly dx: number;
  readonly dz: number;
  readonly width: number;
  /** Leaf colour (sRGB); black steel when absent. */
  readonly color?: number;
}

/** Axis-aligned obstacle footprint (buildings, landmarks) for the play layer's collisions. */
export interface Collider {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
  readonly height: number;
}

export interface CityPlan {
  readonly placements: Readonly<Record<KitId, readonly Placement[]>>;
  readonly lamps: readonly LampSpot[];
  readonly walls: readonly WallSegment[];
  readonly gates: readonly GateSpot[];
  /** Power line chains: pole-top points (x, y, z) in order. */
  readonly wires: readonly (readonly (readonly [number, number, number])[])[];
  readonly colliders: readonly Collider[];
  /** Ground colour per lot index (sRGB). */
  readonly lotGround: ReadonlyMap<number, number>;
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length) % list.length] as T;

const SIDE_VECTOR: Readonly<Record<CompassSide, readonly [number, number]>> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

/** Yaw (rotation.y) that turns a model's +z front towards direction (dx, dz). */
export const yawFacing = (dx: number, dz: number): number => Math.atan2(dx, dz);

type ModelSizes = Readonly<Record<string, { readonly size: readonly number[]; readonly lodTriangles?: number }>>;
const KIT_MODELS: Readonly<Record<KitId, ModelSizes>> = {
  commercial: KIT_MANIFEST.commercial.models,
  suburban: KIT_MANIFEST.suburban.models,
  roads: KIT_MANIFEST.roads.models,
  nature: KIT_MANIFEST.nature.models,
  vehicles: KIT_MANIFEST.parked.models,
};

function modelSize(kit: KitId, model: string): readonly [number, number, number] {
  if (model.startsWith('proc:')) {
    const proc = PROC_MODELS[model.slice(5) as ProcModelId];
    return proc.size;
  }
  const entry = KIT_MODELS[kit][model];
  return [entry?.size[0] ?? 1, entry?.size[1] ?? 1, entry?.size[2] ?? 1];
}

const hasLod = (kit: KitId, model: string): boolean => KIT_MODELS[kit][model]?.lodTriangles !== undefined;

function refKit(ref: BuildingRef): { kit: KitId; model: string; base: number } {
  return ref.startsWith('c:') ? { kit: 'commercial', model: ref.slice(2), base: COMMERCIAL_SCALE } : { kit: 'suburban', model: ref.slice(2), base: SUBURBAN_SCALE };
}

// ---------------------------------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------------------------------

class PlanBuilder {
  readonly placements: Record<KitId, Placement[]> = { commercial: [], suburban: [], roads: [], nature: [], vehicles: [] };
  readonly lamps: LampSpot[] = [];
  readonly walls: WallSegment[] = [];
  readonly gates: GateSpot[] = [];
  readonly wires: (readonly [number, number, number])[][] = [];
  readonly colliders: Collider[] = [];
  readonly lotGround = new Map<number, number>();

  add(kit: KitId, model: string, x: number, y: number, z: number, yaw: number, scale: number | readonly [number, number, number], tint = 0xffffff): void {
    const [sx, sy, sz] = typeof scale === 'number' ? [scale, scale, scale] : scale;
    this.placements[kit].push({ kit, model, x, y, z, yaw, sx, sy, sz, tint, lod: hasLod(kit, model) });
  }

  /** Building with its front on a lot edge; returns the depth used (metres). */
  building(ref: BuildingRef, cx: number, cz: number, front: CompassSide, frontWidth: number, depth: number, stretch: number, tint: number, setback = 0): number | null {
    const { kit, model, base } = refKit(ref);
    const [w, h, d] = modelSize(kit, model);
    const fit = Math.min(frontWidth / w, depth / d);
    const scale = Math.min(base, fit);
    if (scale < base * 0.7) return null;
    const [dx, dz] = SIDE_VECTOR[front];
    // (cx, cz) + setback towards the road = where the front facade stands.
    const x = cx + dx * setback;
    const z = cz + dz * setback;
    const yaw = yawFacing(dx, dz);
    this.add(kit, model, x - (dx * d * scale) / 2, 0, z - (dz * d * scale) / 2, yaw, [scale, scale * stretch, scale], tint);
    const halfAlong = (w * scale) / 2;
    const depthWorld = d * scale;
    const px = x - (dx * depthWorld) / 2;
    const pz = z - (dz * depthWorld) / 2;
    const ex = dx !== 0 ? depthWorld / 2 : halfAlong;
    const ez = dz !== 0 ? depthWorld / 2 : halfAlong;
    this.colliders.push({ minX: px - ex, maxX: px + ex, minZ: pz - ez, maxZ: pz + ez, height: h * scale * stretch });
    return depthWorld;
  }

  nature(model: string, x: number, z: number, scale: number, random: () => number, tintBase = 0xffffff, y = 0): void {
    const v = 0.86 + random() * 0.24;
    const r = Math.min(255, Math.round(((tintBase >> 16) & 255) * v));
    const g = Math.min(255, Math.round(((tintBase >> 8) & 255) * (v + (random() - 0.5) * 0.08)));
    const b = Math.min(255, Math.round((tintBase & 255) * v));
    this.add('nature', model, x, y, z, random() * Math.PI * 2, scale * (0.85 + random() * 0.3), (r << 16) | (g << 8) | b);
  }

  palm(x: number, z: number, random: () => number, y = 0): void {
    const model = pick(['tree_palm', 'tree_palmTall', 'tree_palmBend', 'tree_palmDetailedTall', 'tree_palm'], random);
    this.nature(model, x, z, 6.2, random, 0xffffff, y);
  }

  tree(x: number, z: number, random: () => number): void {
    const model = pick(['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat', 'tree_plateau'], random);
    this.nature(model, x, z, 5.2, random);
  }

  bush(x: number, z: number, random: () => number): void {
    this.nature(pick(['plant_bush', 'plant_bushLarge', 'plant_bushDetailed'], random), x, z, 4.4, random);
  }

  proc(model: ProcModelId, x: number, y: number, z: number, yaw: number, scale = 1, tint = 0xffffff): void {
    this.add('nature', `proc:${model}`, x, y, z, yaw, scale, tint);
  }

  vehicle(model: string, x: number, z: number, heading: number): void {
    this.add('vehicles', model, x, ROAD_Y, z, yawFacing(Math.cos(heading), Math.sin(heading)), VEHICLE_SCALE);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Roads
// ---------------------------------------------------------------------------------------------------------------

/** Openings of each Kenney tile in model space (before rotation). */
const TILE_BASE: Readonly<Record<string, { model: string; mask: number }>> = {
  straight: { model: 'road-straight', mask: DIR_E | DIR_W },
  bend: { model: 'road-bend', mask: DIR_W | DIR_S },
  tee: { model: 'road-intersection', mask: DIR_W | DIR_E | DIR_S },
  cross: { model: 'road-crossroad', mask: DIR_N | DIR_E | DIR_S | DIR_W },
  end: { model: 'road-end-round', mask: DIR_E },
  roundabout: { model: 'road-roundabout', mask: DIR_N | DIR_E | DIR_S | DIR_W },
};

/** A quarter turn (+90° yaw) maps E→N, N→W, W→S, S→E. */
function rotateMask(mask: number): number {
  let out = 0;
  if (mask & DIR_E) out |= DIR_N;
  if (mask & DIR_N) out |= DIR_W;
  if (mask & DIR_W) out |= DIR_S;
  if (mask & DIR_S) out |= DIR_E;
  return out;
}

function tileYaw(baseMask: number, mask: number): number {
  let current = baseMask;
  for (let k = 0; k < 4; k++) {
    if (current === mask) return (k * Math.PI) / 2;
    current = rotateMask(current);
  }
  return 0;
}

function addRoads(plan: PlanBuilder): void {
  const poleChains = new Map<string, (readonly [number, number, number])[]>();
  for (const tile of CITY_MAP.roadTiles) {
    const base = TILE_BASE[tile.kind] ?? TILE_BASE.straight!;
    const yaw = tile.kind === 'roundabout' ? 0 : tileYaw(base.mask, tile.mask);
    const crossing = tile.kind === 'cross' && tile.roadClass !== 'street';
    plan.add('roads', crossing ? 'road-crossroad-path' : base.model, tile.x, 0, tile.z, yaw, ROAD_SCALE);
    if (tile.bridge) plan.add('roads', 'road-straight-barrier', tile.x, 0, tile.z, yaw, ROAD_SCALE);
    if (tile.kind === 'straight') streetFurniture(plan, tile, poleChains);
    if (tile.kind === 'cross' && tile.roadClass !== 'street') {
      // Traffic lights on two corners.
      for (const [sx, sz, face] of [
        [1, 1, 0],
        [-1, -1, Math.PI],
      ] as const) {
        plan.add('roads', 'traffic-light', tile.x + sx * 4.4, PAVEMENT_Y, tile.z + sz * 4.4, face + Math.PI / 4, 9);
      }
    }
  }
  for (const chain of poleChains.values()) if (chain.length > 1) plan.wires.push(chain);
}

function streetFurniture(plan: PlanBuilder, tile: CityRoadTile, poleChains: Map<string, (readonly [number, number, number])[]>): void {
  const alongX = (tile.mask & DIR_E) !== 0;
  const step = (alongX ? tile.col : tile.row) % 3;
  const big = tile.roadClass !== 'street';
  // Perpendicular unit vector (towards south / east side).
  const px = alongX ? 0 : 1;
  const pz = alongX ? 1 : 0;
  if (tile.bridge) {
    if (step !== 0) return;
    for (const side of [-1, 1]) {
      const x = tile.x + px * side * 4.45;
      const z = tile.z + pz * side * 4.45;
      plan.add('roads', 'light-curved', x, PAVEMENT_Y, z, yawFacing(-px * side, -pz * side), 9);
      plan.lamps.push({ x: x - px * side * 1.9, y: 6.3, z: z - pz * side * 1.9, warm: true });
    }
    return;
  }
  if (big) {
    if (step !== 0) return;
    const side = (alongX ? tile.col : tile.row) % 2 === 0 ? 1 : -1;
    const x = tile.x + px * side * 4.5;
    const z = tile.z + pz * side * 4.5;
    plan.add('roads', 'light-curved', x, PAVEMENT_Y, z, yawFacing(-px * side, -pz * side), 9);
    plan.lamps.push({ x: x - px * side * 1.9, y: 6.3, z: z - pz * side * 1.9, warm: tile.roadClass === 'expressway' });
    return;
  }
  // Streets: a sodium lamp every fourth cell on the north/west side…
  if ((alongX ? tile.col : tile.row) % 4 === 3) {
    const lx = tile.x - px * 4.5;
    const lz = tile.z - pz * 4.5;
    plan.add('roads', 'light-curved', lx, PAVEMENT_Y, lz, yawFacing(px, pz), 8);
    plan.lamps.push({ x: lx + px * 1.7, y: 5.6, z: lz + pz * 1.7, warm: true });
  }
  // …and wooden electricity poles every third cell on the south/east side, wired together.
  if (step !== 1) return;
  const x = tile.x + px * 4.55;
  const z = tile.z + pz * 4.55;
  plan.add('roads', 'electricity-pole', x, PAVEMENT_Y, z, alongX ? 0 : Math.PI / 2, [6, 13, 9], 0x9c7c64);
  const key = alongX ? `r${tile.row}` : `c${tile.col}`;
  const chain = poleChains.get(key) ?? [];
  const last = chain[chain.length - 1];
  if (last && Math.hypot(last[0] - x, last[2] - z) > 3 * CELL + 1) {
    if (chain.length > 1) plan.wires.push(chain.slice());
    chain.length = 0;
  }
  chain.push([x, 6.5, z]);
  poleChains.set(key, chain);
}

// ---------------------------------------------------------------------------------------------------------------
// Lots
// ---------------------------------------------------------------------------------------------------------------

function frontVector(lot: CityLot): readonly [number, number] {
  return SIDE_VECTOR[lot.front ?? 'S'];
}

function lotCentre(lot: CityLot): readonly [number, number] {
  return [(lot.footprint.minX + lot.footprint.maxX) / 2, (lot.footprint.minZ + lot.footprint.maxZ) / 2];
}

function fillerLot(plan: PlanBuilder, lot: CityLot, lotIndex: number): void {
  const style = DISTRICT_STYLES[lot.districtId];
  const random = rng(lot.seed);
  const [cx, cz] = lotCentre(lot);
  const tint = pick(style.tints, random);
  const stretch = style.stretch[0] + random() * (style.stretch[1] - style.stretch[0]);

  if (lot.kind === 'infill') {
    infill(plan, lot, lotIndex, random);
    return;
  }
  const front = lot.front ?? 'S';
  const [dx, dz] = frontVector(lot);
  if (random() > style.buildChance) {
    // Bush plot with a palm or two.
    plan.lotGround.set(lotIndex, style.yard);
    plan.palm(cx + (random() - 0.5) * 5, cz + (random() - 0.5) * 5, random);
    plan.bush(cx + (random() - 0.5) * 6, cz + (random() - 0.5) * 6, random);
    return;
  }
  const refs = lot.kind === 'home' ? style.homes : style.buildings;
  // Front face sits on the apron line: CELL/2 - APRON from the cell centre.
  const frontLine = CELL / 2 - APRON;
  let placed: number | null = null;
  for (let attempt = 0; attempt < 4 && placed === null; attempt++) {
    placed = plan.building(pick(refs, random), cx, cz, front, LOT_FRONT_WIDTH, LOT_DEPTH, stretch, tint, frontLine);
  }
  const isHouse = placed !== null && lot.kind === 'home' && style.compoundWalls;
  if (isHouse) {
    plan.lotGround.set(lotIndex, style.yard);
    compoundWall(plan, lot, random);
  }
  // Street trees on the apron, between doors.
  if (style.streetTrees !== 'none' && random() < 0.45) {
    const along: readonly [number, number] = [-dz, dx];
    const sideOffset = (random() < 0.5 ? -1 : 1) * 3.6;
    const tx = cx + dx * (CELL / 2 - 0.8) + along[0] * sideOffset;
    const tz = cz + dz * (CELL / 2 - 0.8) + along[1] * sideOffset;
    if (style.streetTrees === 'palm' || (style.streetTrees === 'mixed' && random() < 0.5)) plan.palm(tx, tz, random, PAVEMENT_Y);
    else plan.nature(pick(['tree_default', 'tree_oak', 'tree_fat'], random), tx, tz, 4.2, random, 0xffffff, PAVEMENT_Y);
  }
}

function compoundWall(plan: PlanBuilder, lot: CityLot, random: () => number): void {
  const { minX, minZ, maxX, maxZ } = lot.footprint;
  const inset = 0.4;
  const color = pick([0xf1e8d6, 0xe9dcc4, 0xf6f1e7, 0xdccfb8, 0xcfd6c9], random);
  const height = 2.1;
  const x0 = minX + inset;
  const x1 = maxX - inset;
  const z0 = minZ + inset;
  const z1 = maxZ - inset;
  const front = lot.front ?? 'S';
  // Front wall sits just behind the apron with a 4 m gate gap.
  const fx0 = front === 'W' ? minX + APRON : x0;
  const fx1 = front === 'E' ? maxX - APRON : x1;
  const fz0 = front === 'N' ? minZ + APRON : z0;
  const fz1 = front === 'S' ? maxZ - APRON : z1;
  const segments: [number, number, number, number, CompassSide][] = [
    [fx0, fz0, fx1, fz0, 'N'],
    [fx1, fz0, fx1, fz1, 'E'],
    [fx0, fz1, fx1, fz1, 'S'],
    [fx0, fz0, fx0, fz1, 'W'],
  ];
  for (const [ax, az, bx, bz, side] of segments) {
    if (side !== front) {
      plan.walls.push({ x0: ax, z0: az, x1: bx, z1: bz, height, color });
      continue;
    }
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const horizontal = az === bz;
    const gap = 2.2;
    if (horizontal) {
      plan.walls.push({ x0: ax, z0: az, x1: mx - gap, z1: bz, height, color });
      plan.walls.push({ x0: mx + gap, z0: az, x1: bx, z1: bz, height, color });
      plan.gates.push({ x: mx, z: mz, dx: 1, dz: 0, width: gap * 2 });
    } else {
      plan.walls.push({ x0: ax, z0: az, x1: bx, z1: mz - gap, height, color });
      plan.walls.push({ x0: ax, z0: mz + gap, x1: bx, z1: bz, height, color });
      plan.gates.push({ x: mx, z: mz, dx: 0, dz: 1, width: gap * 2 });
    }
  }
  if (random() < 0.5) plan.palm(x0 + 1.4 + random() * 2, z0 + 1.4 + random() * 2, random);
}

function infill(plan: PlanBuilder, lot: CityLot, lotIndex: number, random: () => number): void {
  const style = DISTRICT_STYLES[lot.districtId];
  const [cx, cz] = lotCentre(lot);
  switch (style.infill) {
    case 'dense':
    case 'towers': {
      const sides: CompassSide[] = ['N', 'E', 'S', 'W'];
      const ref = style.infill === 'towers' && random() < 0.6 ? pick(style.buildings, random) : pick(style.homes, random);
      const placed = plan.building(ref, cx, cz, pick(sides, random), 9.4, 9.4, style.stretch[1], pick(style.tints, random), 4.7);
      if (placed === null) plan.tree(cx, cz, random);
      return;
    }
    case 'garden': {
      plan.lotGround.set(lotIndex, style.yard);
      const count = 1 + Math.floor(random() * 2);
      for (let i = 0; i < count; i++) {
        if (style.streetTrees === 'palm' || random() < 0.5) plan.palm(cx + (random() - 0.5) * 6, cz + (random() - 0.5) * 6, random);
        else plan.tree(cx + (random() - 0.5) * 6, cz + (random() - 0.5) * 6, random);
      }
      plan.bush(cx + (random() - 0.5) * 7, cz + (random() - 0.5) * 7, random);
      return;
    }
    case 'rural': {
      plan.lotGround.set(lotIndex, 0x8b9a55);
      const count = 2 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) {
        const x = cx + (random() - 0.5) * 8;
        const z = cz + (random() - 0.5) * 8;
        if (random() < 0.55) plan.palm(x, z, random);
        else if (random() < 0.5) plan.tree(x, z, random);
        else plan.bush(x, z, random);
      }
      if (random() < 0.5) plan.nature('plant_bushLarge', cx + (random() - 0.5) * 8, cz + (random() - 0.5) * 8, 4.4, random);
      return;
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Venues
// ---------------------------------------------------------------------------------------------------------------

export interface LotFrame {
  readonly cx: number;
  readonly cz: number;
  /** Unit vector towards the road. */
  readonly fx: number;
  readonly fz: number;
  /** Unit vector along the frontage (left → right when facing the road from inside). */
  readonly ax: number;
  readonly az: number;
  /** Lot extent along the frontage and in depth (metres). */
  readonly width: number;
  readonly depth: number;
}

export function frameOf(lot: CityLot): LotFrame {
  const [fx, fz] = frontVector(lot);
  const [cx, cz] = lotCentre(lot);
  const sizeX = lot.footprint.maxX - lot.footprint.minX;
  const sizeZ = lot.footprint.maxZ - lot.footprint.minZ;
  const alongX = fz !== 0;
  return { cx, cz, fx, fz, ax: -fz, az: fx, width: alongX ? sizeX : sizeZ, depth: alongX ? sizeZ : sizeX };
}

/** Lot-local (u along frontage, v towards the road) → world. */
export const at = (frame: LotFrame, u: number, v: number): readonly [number, number] => [frame.cx + frame.ax * u + frame.fx * v, frame.cz + frame.az * u + frame.fz * v];

function venueLot(plan: PlanBuilder, lot: CityLot, lotIndex: number): void {
  const frame = frameOf(lot);
  const random = rng(lot.seed);
  const style = DISTRICT_STYLES[lot.districtId];
  const tint = pick(style.tints, random);
  const frontFace = yawFacing(frame.fx, frame.fz);
  const halfDepth = frame.depth / 2;
  const frontLine = halfDepth - APRON;
  const building = (ref: BuildingRef, u: number, v: number, width: number, depth: number, stretch = 1, colour = tint): number | null => {
    const [x, z] = at(frame, u, v);
    return plan.building(ref, x, z, lot.front ?? 'S', width, depth, stretch, colour, 0);
  };
  const venue = lot.venueId ? findVenue(lot.venueId) : undefined;
  switch (lot.archetype) {
    case 'airport':
      plan.lotGround.set(lotIndex, 0x9d9a92);
      // The terminal is procedural (Landmarks); forecourt palms and waiting taxis here.
      for (let u = -frame.width / 2 + 6; u < frame.width / 2 - 4; u += 9) {
        const [x, z] = at(frame, u, frontLine - 1.2);
        plan.palm(x, z, random, 0);
      }
      for (let i = 0; i < 5; i++) {
        const [x, z] = at(frame, -16 + i * 6.5, frontLine - 7);
        plan.vehicle(i % 2 ? 'taxi' : 'sedan', x, z, Math.atan2(frame.az, frame.ax));
      }
      return;
    case 'campus': {
      plan.lotGround.set(lotIndex, 0x86a35a);
      const blocks: BuildingRef[] = ['c:building-c', 'c:building-e', 'c:building-k', 'c:building-c'];
      const across = frame.width >= frame.depth;
      const count = Math.max(2, Math.floor((across ? frame.width : frame.depth) / 16));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count - 0.5;
        const ref = blocks[i % blocks.length] as BuildingRef;
        if (across) building(ref, t * frame.width, -halfDepth + 9, frame.width / count - 2, 12, 1, 0xefe3c8);
        else {
          const [x, z] = at(frame, (i % 2 ? 1 : -1) * (frame.width / 2 - 6), -halfDepth + 8 + (i * (frame.depth - 16)) / Math.max(1, count - 1));
          plan.building(ref, x, z, i % 2 ? sideOf(-frame.ax, -frame.az) : sideOf(frame.ax, frame.az), frame.depth / count, 10, 1, 0xefe3c8, 0);
        }
      }
      for (let i = 0; i < 6; i++) {
        const [x, z] = at(frame, (random() - 0.5) * (frame.width - 8), (random() - 0.5) * (frame.depth - 14));
        plan.tree(x, z, random);
      }
      return;
    }
    case 'market': {
      plan.lotGround.set(lotIndex, 0xa38663);
      const rows = Math.max(1, Math.floor((frame.depth - 6) / 6));
      for (let r = 0; r < rows; r++) {
        for (let u = -frame.width / 2 + 3; u <= frame.width / 2 - 3; u += 4.2) {
          const v = frontLine - 3 - r * 6;
          const [x, z] = at(frame, u + (random() - 0.5), v);
          if (random() < 0.5) plan.add('commercial', random() < 0.5 ? 'detail-parasol-a' : 'detail-parasol-b', x, 0, z, random() * Math.PI, 8.5);
          else plan.proc('stall', x, 0, z, frontFace + (random() < 0.5 ? 0 : Math.PI), 1, pick([0xd94b3b, 0x2f7fc1, 0xf2b81d, 0x3c9a5f, 0xe07a2f], random));
        }
      }
      const [bx, bz] = at(frame, 0, -halfDepth + 5);
      plan.building('c:building-c', bx, bz, lot.front ?? 'S', frame.width - 2, 8, 1, tint, 0);
      return;
    }
    case 'mall': {
      plan.lotGround.set(lotIndex, 0x9c9a95);
      const placed = building(frame.width >= 25 ? 'c:building-n' : 'c:building-j', 0, frontLine - 7, frame.width - 1, frame.depth - 9, 1, 0xf2ece0);
      if (placed === null) building('c:building-k', 0, frontLine - 7, frame.width - 1, frame.depth - 9, 1, 0xf2ece0);
      for (let i = 0; i < 3; i++) {
        const [x, z] = at(frame, -frame.width / 2 + 4 + i * 6, frontLine - 1.5);
        plan.vehicle(pick(['sedan', 'suv', 'hatchback-sports', 'suv-luxury'], random), x, z, Math.atan2(frame.az, frame.ax));
      }
      return;
    }
    case 'hospital': {
      plan.lotGround.set(lotIndex, 0xa8a9a0);
      const big = frame.width >= 20;
      building(big ? 'c:building-l' : 'c:building-f', 0, frontLine, Math.min(frame.width - 1, 14), frame.depth - 3, 1, 0xf6f4ee);
      if (big) {
        const [x, z] = at(frame, frame.width / 2 - 4, frontLine - 1.4);
        plan.vehicle('ambulance', x, z, Math.atan2(-frame.az, -frame.ax));
      }
      return;
    }
    case 'office-tower':
    case 'hotel': {
      plan.lotGround.set(lotIndex, 0xb3aea4);
      const towers: BuildingRef[] = lot.archetype === 'hotel' ? ['c:building-skyscraper-a', 'c:building-skyscraper-e'] : ['c:building-skyscraper-d', 'c:building-skyscraper-b', 'c:building-skyscraper-c'];
      const count = Math.max(1, Math.floor(frame.width / 10));
      for (let i = 0; i < count; i++) {
        const u = ((i + 0.5) / count - 0.5) * frame.width;
        building(towers[i % towers.length] as BuildingRef, u, frontLine - 1, frame.width / count - 0.6, frame.depth - 3, 1.25 + random() * 0.35, pick([0xf4f1ea, 0xdfe6ec, 0xe9e1d2], random));
      }
      return;
    }
    case 'office':
    case 'government':
    case 'school': {
      plan.lotGround.set(lotIndex, lot.archetype === 'school' ? 0x9fa36c : 0xaaa498);
      const ref: BuildingRef = lot.archetype === 'office' ? 'c:building-i' : frame.width >= 25 ? 'c:building-k' : 'c:building-e';
      if (building(ref, 0, frontLine, frame.width - 1, frame.depth - 3, 1, lot.archetype === 'government' ? 0xf1ead8 : tint) === null) building('c:building-c', 0, frontLine, frame.width - 1, frame.depth - 3, 1, tint);
      for (const u of [-frame.width / 2 + 1.6, frame.width / 2 - 1.6]) {
        const [x, z] = at(frame, u, frontLine - 0.8);
        plan.palm(x, z, random);
      }
      if (lot.archetype !== 'office') {
        const [x, z] = at(frame, frame.width / 2 - 3, frontLine - 1);
        plan.proc('flagpole', x, 0, z, frontFace);
      }
      // Big lots: a staff car park on one side and shade trees at the back.
      if (frame.width >= 25) {
        const side = random() < 0.5 ? -1 : 1;
        for (let i = 0; i < 4; i++) {
          const [x, z] = at(frame, side * (frame.width / 2 - 3.2), frontLine - 3 - i * 4.4);
          if (random() < 0.8) plan.vehicle(pick(['sedan', 'suv', 'hatchback-sports', 'sedan-sports'], random), x, z, Math.atan2(side * frame.az, side * frame.ax));
        }
        for (let i = 0; i < 3; i++) {
          const [x, z] = at(frame, (i - 1) * (frame.width / 3), -halfDepth + 2.5);
          plan.tree(x, z, random);
        }
      }
      return;
    }
    case 'park': {
      plan.lotGround.set(lotIndex, 0x6f9a48);
      const count = Math.round((frame.width * frame.depth) / 55);
      for (let i = 0; i < count; i++) {
        const [x, z] = at(frame, (random() - 0.5) * (frame.width - 4), (random() - 0.5) * (frame.depth - 4));
        if (random() < 0.6) plan.tree(x, z, random);
        else if (random() < 0.5) plan.palm(x, z, random);
        else plan.bush(x, z, random);
      }
      return;
    }
    case 'beach': {
      for (let i = 0; i < Math.round(frame.width / 4); i++) {
        const [x, z] = at(frame, (random() - 0.5) * (frame.width - 3), (random() - 0.5) * 5 - 0.5);
        if (random() < 0.55) plan.add('commercial', random() < 0.5 ? 'detail-parasol-a' : 'detail-parasol-b', x, 0, z, random() * Math.PI, 9);
        else plan.palm(x, z, random);
      }
      const [hx, hz] = at(frame, frame.width / 2 - 4, 1);
      plan.proc('hut', hx, 0, hz, frontFace);
      const [kx, kz] = at(frame, -frame.width / 2 + 3, -2.5);
      plan.add('nature', 'canoe', kx, 0, kz, frontFace + 1.2, 6.5, 0xffffff);
      return;
    }
    case 'stadium':
      plan.lotGround.set(lotIndex, 0x9a9a8c);
      return;
    case 'mosque':
      plan.lotGround.set(lotIndex, 0xc9c0ad);
      return;
    case 'church': {
      plan.lotGround.set(lotIndex, 0xa9a59a);
      building(frame.width >= 25 ? 'c:building-k' : 'c:building-e', 0, frontLine - 2, frame.width - 1, frame.depth - 5, 1, 0xf3efe6);
      return;
    }
    case 'motor-park': {
      plan.lotGround.set(lotIndex, 0x8e8a82);
      const rows = Math.max(1, Math.floor((frame.depth - 4) / 6));
      for (let r = 0; r < rows; r++) {
        for (let u = -frame.width / 2 + 3; u <= frame.width / 2 - 3; u += 3.4) {
          const [x, z] = at(frame, u, frontLine - 3.5 - r * 6.5);
          if (random() < 0.82) plan.vehicle(random() < 0.8 ? 'danfo' : 'van', x, z, Math.atan2(frame.fz, frame.fx) + (r % 2 ? Math.PI : 0));
        }
        const [sx, sz] = at(frame, 0, frontLine - 6.7 - r * 6.5);
        plan.proc('shelter', sx, 0, sz, frontFace, Math.min(1, (frame.width - 6) / 20));
      }
      return;
    }
    case 'car-dealer': {
      plan.lotGround.set(lotIndex, 0xa7a49c);
      building('c:building-e', 0, -halfDepth + 7, frame.width - 1, 9, 1, 0xf0f0f0);
      const models = lot.venueId === 'lekki-car-mart' ? ['suv-luxury', 'sedan-sports', 'suv', 'hatchback-sports'] : ['sedan', 'suv', 'taxi', 'hatchback-sports', 'van'];
      for (let u = -frame.width / 2 + 3.5; u <= frame.width / 2 - 3.5; u += 4.4) {
        const [x, z] = at(frame, u, frontLine - 2.6);
        plan.vehicle(pick(models, random), x, z, Math.atan2(frame.fz, frame.fx) + Math.PI * 0.15);
      }
      return;
    }
    case 'club':
    case 'shop':
    default: {
      const refs: BuildingRef[] = venue?.type === 'club' || venue?.type === 'bar' ? ['c:building-h', 'c:building-d', 'c:building-g'] : ['c:building-a', 'c:building-b', 'c:building-d', 'c:building-h', 'c:building-c'];
      let placed: number | null = null;
      for (let attempt = 0; attempt < 5 && placed === null; attempt++) placed = building(pick(refs, random), 0, frontLine, frame.width - 0.8, frame.depth - APRON - 0.3, 1, tint);
      return;
    }
  }
}

function sideOf(dx: number, dz: number): CompassSide {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'E' : 'W';
  return dz > 0 ? 'S' : 'N';
}

function landmarkLot(plan: PlanBuilder, lot: CityLot): void {
  if (lot.id === 'landmark:vi-towers') {
    const frame = frameOf(lot);
    const [x, z] = at(frame, 0, frame.depth / 2 - APRON);
    plan.building('c:building-skyscraper-d', x, z, lot.front ?? 'S', frame.width - 1, frame.depth - 2, 1.45, 0xe4ebef, 0);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Beaches, parked cars, waterfront palms
// ---------------------------------------------------------------------------------------------------------------

function beaches(plan: PlanBuilder): void {
  for (let row = 0; row < CITY_MAP.rows; row++) {
    for (let col = 0; col < CITY_MAP.cols; col++) {
      const index = row * CITY_MAP.cols + col;
      if (CITY_MAP.cells[index] !== 2 || (CITY_MAP.lotIndex[index] ?? -1) >= 0) continue;
      const random = rng(index * 2654435761);
      const x = cellCentreX(col);
      const z = cellCentreZ(row);
      if (random() < 0.55) plan.palm(x + (random() - 0.5) * 7, z - 2 + (random() - 0.5) * 4, random);
      if (random() < 0.25) plan.add('commercial', 'detail-parasol-a', x + (random() - 0.5) * 6, 0, z + (random() - 0.5) * 4, random() * Math.PI, 9);
    }
  }
}

function parkedCars(plan: PlanBuilder): void {
  const models = ['sedan', 'sedan', 'taxi', 'suv', 'hatchback-sports', 'danfo', 'van', 'sedan-sports', 'suv-luxury', 'truck', 'delivery'];
  for (const lot of CITY_MAP.lots) {
    if (!lot.entrance || lot.kind === 'venue') continue;
    const random = rng(lot.seed ^ 0x9e3779b9);
    if (random() > 0.14) continue;
    const { parking } = lot.entrance;
    const shift = (random() - 0.5) * 3;
    const x = parking.x + Math.cos(parking.heading) * shift;
    const z = parking.z + Math.sin(parking.heading) * shift;
    const wealthy = lot.districtId === 'ikoyi' || lot.districtId === 'banana-island' || lot.districtId === 'lekki' || lot.districtId === 'victoria-island';
    plan.vehicle(wealthy ? pick(['suv-luxury', 'suv', 'sedan-sports', 'sedan'], random) : pick(models, random), x, z, parking.heading);
  }
}

/** A belt of palms and bush just outside the playable edge, so the mainland seems to go on. */
function outskirts(plan: PlanBuilder): void {
  const { minX, minZ, maxX } = CITY_MAP.bounds;
  const coastZ = minZ + (CITY_MAP.rows - 2) * CELL;
  const random = rng(0x5eed);
  const scatter = (x0: number, z0: number, x1: number, z1: number, count: number): void => {
    for (let i = 0; i < count; i++) {
      const x = x0 + random() * (x1 - x0);
      const z = z0 + random() * (z1 - z0);
      if (x > -2 && x < 72 && z < minZ) continue; // lagoon arm
      if (random() < 0.55) plan.palm(x, z, random);
      else if (random() < 0.6) plan.tree(x, z, random);
      else plan.bush(x, z, random);
    }
  };
  scatter(minX - 70, minZ - 70, maxX + 70, minZ - 6, 150);
  scatter(minX - 70, minZ, minX - 6, coastZ - 4, 70);
  scatter(maxX + 6, minZ, maxX + 70, coastZ - 4, 70);
}

// ---------------------------------------------------------------------------------------------------------------

function buildPlan(): CityPlan {
  const plan = new PlanBuilder();
  addRoads(plan);
  CITY_MAP.lots.forEach((lot, index) => {
    if (lot.kind === 'venue') venueLot(plan, lot, index);
    else if (lot.kind === 'landmark') landmarkLot(plan, lot);
    else fillerLot(plan, lot, index);
  });
  beaches(plan);
  outskirts(plan);
  parkedCars(plan);
  return plan;
}

let cached: CityPlan | null = null;

/** The plan is built lazily once per page (≈ a few ms). */
export function cityPlan(): CityPlan {
  cached ??= buildPlan();
  return cached;
}

export type { DistrictId };
