import {
  CITY_MAP,
  DIR_E,
  DISTRICTS,
  LAGOS_ROWS,
  ROAD_LINE_WIDTH,
  cellBounds,
  cellCentreX,
  cellCentreZ,
  cityBounds,
  cityOfCell,
  findVenue,
  servicePointOnLot,
  type CityLot,
  type CityRoadTile,
  type CompassSide,
  type DistrictId,
  type ServicePoint,
  type VenueType,
} from '@insidelife/shared';
import { KIT_MANIFEST } from '../assets/kit-manifest';
import { ABUJA_GOVERNMENT_LOOKS, ABUJA_MARKET_STYLES, ABUJA_PARK_STYLES, ABUJA_PROCEDURAL, ABUJA_SHOP_LOOKS, ABUJA_TOWER_LOOKS } from './abuja-looks';
import { PROC_MODELS, type ProcModelId } from './proc-models';
import { estateSite, refinerySite, type Rect } from './showcase-sites';
import { DISTRICT_STYLES, type BuildingRef, type KitId } from './styles';

/**
 * The city plan: every model instance, lamp, wall and collider, derived deterministically from the shared CityMap.
 * Pure (no three.js) so it can be unit-tested and reused by the play layer for collisions.
 */

/** Raised pavement (kerb top) height. */
export const PAVEMENT_Y = 0.2;
/** Asphalt surface height. */
export const ROAD_Y = 0.1;
/** Pavement strip on the lot side of every road edge (metres). */
export const APRON = 1.6;
export const VEHICLE_SCALE = 1.73;
const COMMERCIAL_SCALE = 8.6;
const SUBURBAN_SCALE = 6.8;
/** The lagoon arm north of Third Mainland (layout columns 32–38) keeps flowing past the grid: world x range. */
export const LAGOON_ARM_X: readonly [number, number] = [cellBounds(32, 0).minX, cellBounds(38, 0).maxX];

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

/**
 * Street furniture along the roads (the road surface itself is procedural: `render/road-geometry.ts`). Lamps, poles
 * and traffic lights stand on the 1 m roadside pavement of the four-lane roads, on the same tiles and sides as on the
 * first city's roads (the ad spots are picked around them).
 */
function addRoads(plan: PlanBuilder): void {
  const poleChains = new Map<string, (readonly [number, number, number])[]>();
  for (const tile of CITY_MAP.roadTiles) {
    if (tile.kind === 'straight') streetFurniture(plan, tile, poleChains);
    if (tile.kind === 'cross' && tile.roadClass !== 'street') {
      // Traffic lights on two corners of the junction box.
      for (const [sx, sz, face] of [
        [1, 1, 0],
        [-1, -1, Math.PI],
      ] as const) {
        plan.add('roads', 'traffic-light', tile.x + sx * (tile.width / 2 - 0.6), PAVEMENT_Y, tile.z + sz * (tile.depth / 2 - 0.6), face + Math.PI / 4, 9);
      }
    }
  }
  for (const chain of poleChains.values()) if (chain.length > 1) plan.wires.push(chain);
}

/** A tree on each pavement of an Abuja arterial (every third cell), just behind the kerb. */
function boulevardTrees(plan: PlanBuilder, tile: CityRoadTile, px: number, pz: number, half: number): void {
  const random = rng(Math.imul(tile.col, 73856093) ^ Math.imul(tile.row, 19349663));
  for (const side of [-1, 1]) {
    const x = tile.x + px * side * (half + 0.9);
    const z = tile.z + pz * side * (half + 0.9);
    if (random() < 0.8) plan.tree(x, z, random);
    else plan.bush(x, z, random);
  }
}

function streetFurniture(plan: PlanBuilder, tile: CityRoadTile, poleChains: Map<string, (readonly [number, number, number])[]>): void {
  const alongX = (tile.mask & DIR_E) !== 0;
  const step = (alongX ? tile.col : tile.row) % 3;
  const big = tile.roadClass !== 'street';
  // Perpendicular unit vector (towards south / east side), and the road's half width across.
  const px = alongX ? 0 : 1;
  const pz = alongX ? 1 : 0;
  const half = (alongX ? tile.depth : tile.width) / 2;
  if (tile.bridge) {
    if (step !== 0) return;
    for (const side of [-1, 1]) {
      const x = tile.x + px * side * (half - 0.55);
      const z = tile.z + pz * side * (half - 0.55);
      plan.add('roads', 'light-curved', x, PAVEMENT_Y, z, yawFacing(-px * side, -pz * side), 9);
      plan.lamps.push({ x: x - px * side * 1.9, y: 6.3, z: z - pz * side * 1.9, warm: true });
    }
    return;
  }
  if (big) {
    // Abuja's boulevards are lined with trees on both pavements (the capital was planned as a garden city).
    if (step === 1 && cityOfCell(tile.col, tile.row) === 'abuja') boulevardTrees(plan, tile, px, pz, half);
    if (step !== 0) return;
    const side = (alongX ? tile.col : tile.row) % 2 === 0 ? 1 : -1;
    const x = tile.x + px * side * (half - 0.5);
    const z = tile.z + pz * side * (half - 0.5);
    plan.add('roads', 'light-curved', x, PAVEMENT_Y, z, yawFacing(-px * side, -pz * side), 9);
    plan.lamps.push({ x: x - px * side * 1.9, y: 6.3, z: z - pz * side * 1.9, warm: tile.roadClass === 'expressway' });
    return;
  }
  // Streets: a sodium lamp every fourth cell on the north/west side…
  if ((alongX ? tile.col : tile.row) % 4 === 3) {
    const lx = tile.x - px * (half - 0.5);
    const lz = tile.z - pz * (half - 0.5);
    plan.add('roads', 'light-curved', lx, PAVEMENT_Y, lz, yawFacing(px, pz), 8);
    plan.lamps.push({ x: lx + px * 1.7, y: 5.6, z: lz + pz * 1.7, warm: true });
  }
  // …and wooden electricity poles every third cell on the south/east side, wired together.
  if (step !== 1) return;
  const x = tile.x + px * (half - 0.45);
  const z = tile.z + pz * (half - 0.45);
  plan.add('roads', 'electricity-pole', x, PAVEMENT_Y, z, alongX ? 0 : Math.PI / 2, [6, 13, 9], 0x9c7c64);
  const key = alongX ? `r${tile.row}` : `c${tile.col}`;
  const chain = poleChains.get(key) ?? [];
  const last = chain[chain.length - 1];
  if (last && Math.hypot(last[0] - x, last[2] - z) > 3 * ROAD_LINE_WIDTH + 1) {
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

/**
 * A filling station or mechanic workshop (`SERVICE_POINTS`) instead of the lot's building: a concrete forecourt with
 * the pump canopy and a kiosk at the back, or a dirt yard with the shed and a customer's car waiting on parts.
 */
function serviceLot(plan: PlanBuilder, lot: CityLot, lotIndex: number, point: ServicePoint): void {
  const frame = frameOf(lot);
  const random = rng(lot.seed);
  const face = yawFacing(frame.fx, frame.fz);
  const frontLine = frame.depth / 2 - APRON;
  const collide = (u: number, v: number, halfU: number, halfV: number, height: number): void => {
    const [x, z] = at(frame, u, v);
    const ex = Math.abs(frame.ax) * halfU + Math.abs(frame.fx) * halfV;
    const ez = Math.abs(frame.az) * halfU + Math.abs(frame.fz) * halfV;
    plan.colliders.push({ minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez, height });
  };
  if (point.kind === 'fuel') {
    plan.lotGround.set(lotIndex, 0xa3a19b);
    const [cx, cz] = at(frame, 0, frontLine - 2.6);
    plan.proc('fuel-station', cx, 0, cz, face);
    for (const u of [-1.5, 1.5]) collide(u, frontLine - 2.6, 0.5, 1.2, 3.6);
    const [kx, kz] = at(frame, -2.2, -frame.depth / 2 + 1.4);
    plan.proc('kiosk', kx, 0, kz, face, 1.15, 0xf2f0ea);
    collide(-2.2, -frame.depth / 2 + 1.4, 1.3, 1.0, 2.6);
    return;
  }
  plan.lotGround.set(lotIndex, 0x8f7d5f);
  const [sx, sz] = at(frame, 0, -frame.depth / 2 + 2.6);
  plan.proc('workshop', sx, 0, sz, face);
  collide(0, -frame.depth / 2 + 0.6, 3.1, 0.2, 2.8);
  const vu = (random() < 0.5 ? -1 : 1) * 1.6;
  const [vx, vz] = at(frame, vu, frontLine - 2.2);
  plan.vehicle(pick(['sedan', 'taxi', 'hatchback-sports', 'suv'], random), vx, vz, Math.atan2(frame.az, frame.ax));
  collide(vu, frontLine - 2.2, 2.2, 1.0, 2.2);
}

function fillerLot(plan: PlanBuilder, lot: CityLot, lotIndex: number): void {
  const service = servicePointOnLot(lot.id);
  if (service) {
    serviceLot(plan, lot, lotIndex, service);
    return;
  }
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
  // Front face sits on the apron line. Lots in a road line are wider (or deeper) than 10 m: the building keeps its
  // size and gets more yard.
  const frame = frameOf(lot);
  const frontLine = frame.depth / 2 - APRON;
  let placed: number | null = null;
  for (let attempt = 0; attempt < 4 && placed === null; attempt++) {
    placed = plan.building(pick(refs, random), cx, cz, front, frame.width - 0.8, frame.depth - 2, stretch, tint, frontLine);
  }
  const isHouse = placed !== null && lot.kind === 'home' && style.compoundWalls;
  if (isHouse) {
    plan.lotGround.set(lotIndex, style.yard);
    compoundWall(plan, lot, random);
  }
  // Street trees on the apron, between doors.
  if (style.streetTrees !== 'none' && random() < 0.45) {
    const along: readonly [number, number] = [-dz, dx];
    const sideOffset = (random() < 0.5 ? -1 : 1) * (frame.width / 2 - 1.4);
    const tx = cx + dx * (frame.depth / 2 - 0.8) + along[0] * sideOffset;
    const tz = cz + dz * (frame.depth / 2 - 0.8) + along[1] * sideOffset;
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
      const { footprint } = lot;
      const fit = Math.min(footprint.maxX - footprint.minX, footprint.maxZ - footprint.minZ) - 0.6;
      const placed = plan.building(ref, cx, cz, pick(sides, random), fit, fit, style.stretch[1], pick(style.tints, random), fit / 2);
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

/**
 * How one market looks from the road (venues of one type share an archetype, so without this every market is the same
 * rows of striped stalls): its ground, what its stalls are painted, how many parasols and kiosks, the building behind.
 */
export interface MarketStyle {
  readonly ground: number;
  readonly stalls: readonly number[];
  /** Share of the rows' slots that are parasols; the rest are stalls. */
  readonly parasols: number;
  /** Share of the slots that are kiosks (phone shops, provision stores) instead. */
  readonly kiosks: number;
  readonly back: BuildingRef;
  readonly backTint: number;
}
const MARKET_STYLES: Readonly<Record<string, MarketStyle>> = {
  // A grid of phone shops and kiosks in front of a glass-fronted plaza, hardly a parasol.
  'computer-village': { ground: 0x6b6e73, stalls: [0x1d4e89, 0xffffff, 0x1e88e5, 0xcfd8dc], parasols: 0.08, kiosks: 0.45, back: 'c:building-i', backTint: 0x9cc7e3 },
  'yaba-market': { ground: 0x9a8466, stalls: [0xc8287a, 0xf2b81d, 0x00897b, 0x7b1fa2], parasols: 0.7, kiosks: 0, back: 'c:building-c', backTint: 0xeea6ad },
  'mushin-market': { ground: 0x8d7455, stalls: [0xd94b3b, 0x3c9a5f, 0xe07a2f], parasols: 0.35, kiosks: 0, back: 'c:building-a', backTint: 0xd98559 },
  'balogun-market': { ground: 0xa38663, stalls: [0x1d4e89, 0xc8287a, 0xf2b81d, 0x00897b, 0xd94b3b], parasols: 0.55, kiosks: 0.1, back: 'c:building-c', backTint: 0xf3d48a },
  'ajah-market': { ground: 0xb39b74, stalls: [0x3c9a5f, 0xf2b81d, 0xe07a2f], parasols: 0.5, kiosks: 0, back: 'c:building-d', backTint: 0xa9d39a },
};
const DEFAULT_MARKET: MarketStyle = { ground: 0xa38663, stalls: [0xd94b3b, 0x2f7fc1, 0xf2b81d, 0x3c9a5f, 0xe07a2f], parasols: 0.5, kiosks: 0, back: 'c:building-c', backTint: 0xffffff };

/** A park, a stadium ground or a nature reserve: its lawn, how many trees, and what stands in it. */
export interface ParkStyle {
  readonly ground: number;
  /** Trees per 55 m²: 1 is a plain park, 2 a forest. */
  readonly density: number;
  /** Colonial brick wall along the front (Freedom Park), flagpoles standing as art. */
  readonly wall: boolean;
  readonly poles: number;
}
const PARK_STYLES: Readonly<Record<string, ParkStyle>> = {
  'freedom-park': { ground: 0x7bb05a, density: 0.35, wall: true, poles: 3 },
  'lekki-conservation': { ground: 0x4c7f35, density: 2.2, wall: false, poles: 0 },
  'national-stadium': { ground: 0x6aa640, density: 0.5, wall: false, poles: 2 },
};
const DEFAULT_PARK: ParkStyle = { ground: 0x6f9a48, density: 1, wall: false, poles: 0 };

/** What sets a neighbourhood shop apart from the road: its paint and the thing out front. */
export interface ShopFlavour {
  readonly tint: number;
  readonly accessory?: 'kiosk' | 'stall' | 'flagpole' | 'hut';
  readonly accent?: number;
}
const SHOP_FLAVOURS: Readonly<Partial<Record<VenueType, ShopFlavour>>> = {
  pharmacy: { tint: 0xd6efd8, accessory: 'kiosk', accent: 0x2e9b5f },
  gym: { tint: 0x9fb4c8, accessory: 'flagpole', accent: 0xe2412e },
  buka: { tint: 0xf2b07e, accessory: 'stall', accent: 0xe07a2f },
  restaurant: { tint: 0xf4ece0, accessory: 'hut', accent: 0xc9a227 },
  'cbt-centre': { tint: 0xdfe6ec, accessory: 'flagpole', accent: 0x1d4e89 },
  'estate-agency': { tint: 0xf3dfb8, accessory: 'flagpole', accent: 0x13606b },
  cinema: { tint: 0xc3a9e0, accessory: 'kiosk', accent: 0xc62828 },
  salon: { tint: 0xeea6ad, accessory: 'kiosk', accent: 0xc8287a },
  club: { tint: 0x5b4a7a },
  bar: { tint: 0xb5651d },
};

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
  // Abuja's plots one cell deep (a bank, a mall, a tower on its street) are built to the pavement; Lagos's lots are as they were.
  const shallow = DISTRICTS[lot.districtId].cityId === 'abuja' && frame.depth < 14;
  // Beaches are parks to the map but have sand, parasols and a hut.
  const archetype = lot.archetype === 'park' && venue?.type === 'beach' ? 'beach' : lot.archetype;
  switch (archetype) {
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
      const style = (lot.venueId ? (MARKET_STYLES[lot.venueId] ?? ABUJA_MARKET_STYLES[lot.venueId]) : undefined) ?? DEFAULT_MARKET;
      plan.lotGround.set(lotIndex, style.ground);
      const rows = Math.max(1, Math.floor((frame.depth - 6) / 6));
      for (let r = 0; r < rows; r++) {
        for (let u = -frame.width / 2 + 3; u <= frame.width / 2 - 3; u += 4.2) {
          const v = frontLine - 3 - r * 6;
          const [x, z] = at(frame, u + (random() - 0.5), v);
          const roll = random();
          if (roll < style.kiosks) plan.proc('kiosk', x, 0, z, frontFace + (r % 2 ? Math.PI : 0), 1.1, pick(style.stalls, random));
          else if (roll < style.kiosks + style.parasols) plan.add('commercial', random() < 0.5 ? 'detail-parasol-a' : 'detail-parasol-b', x, 0, z, random() * Math.PI, 8.5);
          else plan.proc('stall', x, 0, z, frontFace + (random() < 0.5 ? 0 : Math.PI), 1, pick(style.stalls, random));
        }
      }
      const [bx, bz] = at(frame, 0, -halfDepth + 5);
      plan.building(style.back, bx, bz, lot.front ?? 'S', frame.width - 2, 8, 1, style === DEFAULT_MARKET ? tint : style.backTint, 0);
      return;
    }
    case 'mall': {
      plan.lotGround.set(lotIndex, 0x9c9a95);
      const mallTint = lot.venueId === 'silverbird-galleria' ? 0xf6efe0 : lot.venueId === 'ceddi-plaza' ? 0xe6dccb : 0xf2ece0;
      const mallDepth = shallow ? frame.depth - APRON - 0.3 : frame.depth - 9;
      const mallV = shallow ? frontLine : frontLine - 7;
      const placed = building(frame.width >= 25 ? 'c:building-n' : 'c:building-j', 0, mallV, frame.width - 1, mallDepth, shallow ? 1.5 : 1, mallTint);
      if (placed === null) building('c:building-k', 0, mallV, frame.width - 1, mallDepth, shallow ? 1.5 : 1, mallTint);
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
      const look = lot.venueId ? ABUJA_TOWER_LOOKS[lot.venueId] : undefined;
      const towers: readonly BuildingRef[] = look?.towers ?? (lot.archetype === 'hotel' ? ['c:building-skyscraper-a', 'c:building-skyscraper-e'] : ['c:building-skyscraper-d', 'c:building-skyscraper-b', 'c:building-skyscraper-c']);
      const count = look ? Math.min(look.count, Math.max(1, Math.floor(frame.width / 10))) : Math.max(1, Math.floor(frame.width / 10));
      // A tower one cell deep stands on the whole lot to the pavement.
      const towerDepth = shallow ? frame.depth - APRON - 0.3 : frame.depth - 3;
      const towerV = shallow ? frontLine : frontLine - 1;
      for (let i = 0; i < count; i++) {
        const u = ((i + 0.5) / count - 0.5) * frame.width;
        const width = frame.width / count - 0.6;
        if (look) building(towers[i % towers.length] as BuildingRef, u, towerV, width, towerDepth, look.stretch + i * 0.12, look.tint);
        else building(towers[i % towers.length] as BuildingRef, u, towerV, width, towerDepth, 1.25 + random() * 0.35, pick([0xf4f1ea, 0xdfe6ec, 0xe9e1d2], random));
      }
      return;
    }
    case 'office':
    case 'government':
    case 'school': {
      plan.lotGround.set(lotIndex, lot.archetype === 'school' ? 0x9fa36c : 0xaaa498);
      if (lot.venueId && ABUJA_PROCEDURAL.has(lot.venueId)) {
        proceduralSolid(plan, frame, lot.venueId);
        return;
      }
      const gov = lot.venueId ? ABUJA_GOVERNMENT_LOOKS[lot.venueId] : undefined;
      const office = lot.venueId && lot.archetype === 'office' ? ABUJA_SHOP_LOOKS[lot.venueId] : undefined;
      const ref: BuildingRef = gov?.ref ?? office?.refs?.[0] ?? (lot.archetype === 'office' ? 'c:building-i' : frame.width >= 25 ? 'c:building-k' : 'c:building-e');
      // Shallow plots (one cell deep) build to the pavement; the others keep a yard behind the front.
      const officeDepth = shallow ? frame.depth - APRON - 0.3 : frame.depth - 3;
      const officeTint = gov?.tint ?? office?.tint ?? (lot.archetype === 'government' ? 0xf1ead8 : tint);
      if (building(ref, 0, frontLine, frame.width - 1, officeDepth, gov?.stretch ?? 1, officeTint) === null) building('c:building-c', 0, frontLine, frame.width - 1, officeDepth, 1, officeTint);
      if (gov?.walled) embassyWalls(plan, frame);
      for (const u of [-frame.width / 2 + 1.6, frame.width / 2 - 1.6]) {
        const [x, z] = at(frame, u, frontLine - 0.8);
        plan.palm(x, z, random);
      }
      if (lot.archetype !== 'office') {
        const [x, z] = at(frame, frame.width / 2 - 3, frontLine - 1);
        plan.proc('flagpole', x, 0, z, frontFace);
      } else if (office?.accessory) {
        const [x, z] = at(frame, frame.width / 2 - 2.4, frontLine - 1.2);
        plan.proc(office.accessory, x, 0, z, frontFace, 1, office.accent ?? 0xffffff);
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
      const style = (lot.venueId ? (PARK_STYLES[lot.venueId] ?? ABUJA_PARK_STYLES[lot.venueId]) : undefined) ?? DEFAULT_PARK;
      plan.lotGround.set(lotIndex, style.ground);
      const count = Math.round(((frame.width * frame.depth) / 55) * style.density);
      if (style.wall) {
        // Freedom Park keeps the old prison's brick wall along the street, with a gap for the gate.
        const [ax, az] = at(frame, -frame.width / 2 + 1, frontLine - 0.4);
        const [bx, bz] = at(frame, -3, frontLine - 0.4);
        const [cx, cz] = at(frame, 3, frontLine - 0.4);
        const [dx, dz] = at(frame, frame.width / 2 - 1, frontLine - 0.4);
        plan.walls.push({ x0: ax, z0: az, x1: bx, z1: bz, height: 1.6, color: 0x8d4b32 }, { x0: cx, z0: cz, x1: dx, z1: dz, height: 1.6, color: 0x8d4b32 });
      }
      for (let i = 0; i < style.poles; i++) {
        const [x, z] = at(frame, (i - (style.poles - 1) / 2) * (frame.width / (style.poles + 1)), -halfDepth + 5);
        plan.proc('flagpole', x, 0, z, frontFace, 1, pick([0xf2b81d, 0xd94b3b, 0x1d4e89, 0x2e7d32], random));
      }
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
    case 'mansion':
      plan.lotGround.set(lotIndex, 0x7aa54e);
      estateGrounds(plan, random);
      return;
    case 'jet-pad':
      plan.lotGround.set(lotIndex, 0x55595e);
      return;
    case 'refinery':
      plan.lotGround.set(lotIndex, 0xcfccc5);
      refineryGate(plan, random);
      return;
    case 'stadium':
      plan.lotGround.set(lotIndex, 0x9a9a8c);
      return;
    case 'mosque':
      plan.lotGround.set(lotIndex, lot.venueId === 'national-mosque' ? 0xdad3c1 : 0xc9c0ad);
      proceduralSolid(plan, frame, lot.venueId);
      return;
    case 'church': {
      plan.lotGround.set(lotIndex, 0xa9a59a);
      // Abuja's churches (the National Christian Centre, the Glory Dome, RCCG) are drawn whole by the landmarks.
      if (lot.venueId && ABUJA_PROCEDURAL.has(lot.venueId)) {
        proceduralSolid(plan, frame, lot.venueId);
        return;
      }
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
      const models = lot.venueId === 'lekki-car-mart' || lot.venueId === 'jabi-auto-gallery' ? ['suv-luxury', 'sedan-sports', 'suv', 'hatchback-sports'] : lot.venueId === 'garki-auto-mart' ? ['sedan', 'sedan', 'van', 'taxi', 'suv'] : ['sedan', 'suv', 'taxi', 'hatchback-sports', 'van'];
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
      const authored = lot.venueId ? ABUJA_SHOP_LOOKS[lot.venueId] : undefined;
      const flavour: ShopFlavour | undefined = authored ?? (venue ? SHOP_FLAVOURS[venue.type] : undefined);
      let placed: number | null = null;
      for (let attempt = 0; attempt < 5 && placed === null; attempt++) placed = building(pick(authored?.refs ?? refs, random), 0, frontLine, frame.width - 0.8, frame.depth - APRON - 0.3, 1, flavour?.tint ?? tint);
      if (flavour?.accessory) {
        // Something out front that says what the place is: a kiosk, a food stall, a flagpole.
        const [x, z] = at(frame, frame.width / 2 - 2.4, frontLine - 1.2);
        plan.proc(flavour.accessory, x, 0, z, frontFace, 1, flavour.accent ?? 0xffffff);
      }
      return;
    }
  }
}

/** A solid block for a place the landmarks draw whole: inside the lot, clear of the pavement and the front yard. */
function proceduralSolid(plan: PlanBuilder, frame: LotFrame, venueId: string | undefined): void {
  const spec = venueId ? ABUJA_PROCEDURAL.get(venueId) : undefined;
  if (!spec) return;
  const [x0, z0] = at(frame, -frame.width / 2 + 1.5, -frame.depth / 2 + 1.5);
  const [x1, z1] = at(frame, frame.width / 2 - 1.5, frame.depth / 2 - APRON - 4.5);
  plan.colliders.push({ minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(z0, z1), maxZ: Math.max(z0, z1), height: spec.height });
}

/** An embassy's compound wall round its lot, with the gate gap on the front. */
function embassyWalls(plan: PlanBuilder, frame: LotFrame): void {
  const hw = frame.width / 2 - 0.4;
  const back = -frame.depth / 2 + 0.4;
  const front = frame.depth / 2 - APRON - 0.2;
  const gate = 2.6;
  const line = (u0: number, v0: number, u1: number, v1: number): void => {
    const [x0, z0] = at(frame, u0, v0);
    const [x1, z1] = at(frame, u1, v1);
    plan.walls.push({ x0, z0, x1, z1, height: 2.6, color: 0xe6e1d3 });
  };
  line(-hw, back, hw, back);
  line(-hw, back, -hw, front);
  line(hw, back, hw, front);
  line(-hw, front, -gate, front);
  line(gate, front, hw, front);
}

function sideOf(dx: number, dz: number): CompassSide {
  if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? 'E' : 'W';
  return dz > 0 ? 'S' : 'N';
}

// ---------------------------------------------------------------------------------------------------------------
// Showcase places: OBO's estate and Dangote Refinery (their buildings are procedural: `render/showcase-geometry.ts`)
// ---------------------------------------------------------------------------------------------------------------

const ESTATE_WALL = 0xf4f1ea;
const GATE_HALF = 2.6;

function wall(plan: PlanBuilder, x0: number, z0: number, x1: number, z1: number, height: number, color: number): void {
  if (Math.hypot(x1 - x0, z1 - z0) > 0.2) plan.walls.push({ x0, z0, x1, z1, height, color });
}

function solid(plan: PlanBuilder, r: Rect, height: number): void {
  plan.colliders.push({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ, height });
}

/**
 * OBO's estate: a white wall round the grounds with the gold gate on the bend and the jet's apron gate beside it, a
 * low wall on the waterfront, palms along the drive and the south wall, and solid house, jet and gates.
 */
function estateGrounds(plan: PlanBuilder, random: () => number): void {
  const site = estateSite();
  if (!site) return;
  const { grounds: g, pad: p, apron: a, gate, jetGate } = site;
  const i = 0.3;
  wall(plan, g.minX + i, g.minZ + i, gate.x - GATE_HALF, g.minZ + i, 2.4, ESTATE_WALL);
  wall(plan, gate.x + GATE_HALF, g.minZ + i, p.minX + i, g.minZ + i, 2.4, ESTATE_WALL);
  wall(plan, g.minX + i, g.minZ + i, g.minX + i, g.maxZ - i, 2.4, ESTATE_WALL);
  wall(plan, g.minX + i, g.maxZ - i, g.maxX - i, g.maxZ - i, 2.4, ESTATE_WALL);
  wall(plan, g.maxX - i, g.minZ, g.maxX - i, g.maxZ - i, 0.6, ESTATE_WALL);
  wall(plan, p.minX + i, p.minZ + i, p.minX + i, jetGate.z - GATE_HALF, 2.4, ESTATE_WALL);
  wall(plan, p.minX + i, jetGate.z + GATE_HALF, p.minX + i, g.minZ + i, 2.4, ESTATE_WALL);
  wall(plan, p.maxX - i, p.minZ, p.maxX - i, p.maxZ, 0.6, ESTATE_WALL);
  if (a) {
    wall(plan, p.minX + i, p.minZ + i, a.minX + i, p.minZ + i, 2.4, ESTATE_WALL);
    wall(plan, a.minX + i, a.minZ + i, a.minX + i, p.minZ + i, 2.4, ESTATE_WALL);
    wall(plan, a.minX + i, a.minZ + i, a.maxX - i, a.minZ + i, 0.6, ESTATE_WALL);
    wall(plan, a.maxX - i, a.minZ + i, a.maxX - i, a.maxZ, 0.6, ESTATE_WALL);
  } else wall(plan, p.minX + i, p.minZ + i, p.maxX - i, p.minZ + i, 2.4, ESTATE_WALL);
  // The gates are drawn open but you can't walk in: the house and the jet are entered by their doors.
  solid(plan, { minX: gate.x - GATE_HALF, maxX: gate.x + GATE_HALF, minZ: g.minZ, maxZ: g.minZ + 0.6 }, 2.4);
  solid(plan, { minX: p.minX, maxX: p.minX + 0.6, minZ: jetGate.z - GATE_HALF, maxZ: jetGate.z + GATE_HALF }, 2.4);
  solid(plan, site.house.first, 9.9);
  solid(plan, site.house.top, 13.8);
  solid(plan, { minX: site.jet.nose, maxX: site.jet.tail, minZ: site.jet.z - 1.3, maxZ: site.jet.z + 1.3 }, 3.6);
  // Palms down the drive, along the south wall and at the pool; bushes along the west wall.
  for (let z = g.minZ + 3; z < site.deck.minZ - 0.5; z += 4) plan.palm(g.minX + 1.3, z, random);
  for (let x = site.house.ground.minX - 1; x < g.maxX - 1; x += 4.5) plan.palm(x, g.maxZ - 1.3, random);
  plan.palm(site.deck.maxX - 0.6, site.deck.maxZ - 0.6, random);
  plan.palm(g.maxX - 1.6, g.minZ + 4.2, random);
  plan.palm(g.maxX - 1.6, site.house.ground.minZ + 2, random);
  for (let z = site.deck.minZ + 1; z < g.maxZ - 2; z += 2.6) plan.bush(g.minX + 0.9, z, random);
}

/** Dangote Refinery's gate lot: the visitor centre is solid; flags out front. The works get a perimeter fence. */
function refineryGate(plan: PlanBuilder, random: () => number): void {
  const site = refinerySite();
  if (!site) return;
  const c = site.centre;
  solid(plan, { minX: c.minX + 1, maxX: c.maxX - 2.6, minZ: c.minZ + 1, maxZ: c.maxZ - 1 }, 7.2);
  for (const [k, z] of [c.minZ + 1.6, c.minZ + 3.1, c.maxZ - 1.6].entries()) plan.proc('flagpole', c.maxX - 1.1, 0, z, Math.PI / 2, 1, k === 1 ? 0x1d4f91 : 0xffffff);
  plan.palm(c.maxX - 1.2, c.maxZ - 0.9, random);
}

function refineryWorks(plan: PlanBuilder, lotIndex: number): void {
  const site = refinerySite();
  if (!site) return;
  plan.lotGround.set(lotIndex, 0xa7a49c);
  const w = site.works;
  const i = 0.3;
  const fence = 0x9aa0a6;
  wall(plan, w.minX + i, w.minZ + i, w.maxX - i, w.minZ + i, 2.6, fence);
  wall(plan, w.maxX - i, w.minZ + i, w.maxX - i, w.maxZ - i, 2.6, fence);
  wall(plan, w.minX + i, w.maxZ - i, w.maxX - i, w.maxZ - i, 2.6, fence);
  wall(plan, w.minX + i, w.minZ + i, w.minX + i, w.maxZ - i, 2.6, fence);
}

function landmarkLot(plan: PlanBuilder, lot: CityLot, lotIndex: number): void {
  if (lot.id === 'landmark:aso-rock') {
    // The granite monolith over Asokoro: bare rock under a ring of scrub, solid to walk into.
    plan.lotGround.set(lotIndex, 0x8a8470);
    const frame = frameOf(lot);
    solid(plan, { minX: frame.cx - 11, maxX: frame.cx + 11, minZ: frame.cz - 11, maxZ: frame.cz + 11 }, 70);
  }
  if (lot.id === 'landmark:obo-apron') plan.lotGround.set(lotIndex, 0x55595e);
  if (lot.id === 'landmark:dangote-works') refineryWorks(plan, lotIndex);
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
      // Abuja's sand is dry scrub, not a beach: acacia and bush, no palms or parasols.
      if (cityOfCell(col, row) === 'abuja') {
        if (random() < 0.5) plan.bush(x + (random() - 0.5) * 7, z + (random() - 0.5) * 7, random);
        else if (random() < 0.2) plan.tree(x + (random() - 0.5) * 6, z + (random() - 0.5) * 6, random);
        continue;
      }
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
    const wealthy = ['ikoyi', 'banana-island', 'lekki', 'victoria-island', 'maitama', 'asokoro'].includes(lot.districtId);
    plan.vehicle(wealthy ? pick(['suv-luxury', 'suv', 'sedan-sports', 'sedan'], random) : pick(models, random), x, z, parking.heading);
  }
}

/** A belt of palms and bush just outside the playable edge, so the mainland seems to go on. */
function outskirts(plan: PlanBuilder): void {
  const { minX, minZ, maxX } = cityBounds('lagos');
  const coastZ = cellBounds(0, LAGOS_ROWS - 2).minZ;
  const random = rng(0x5eed);
  const scatter = (x0: number, z0: number, x1: number, z1: number, count: number): void => {
    for (let i = 0; i < count; i++) {
      const x = x0 + random() * (x1 - x0);
      const z = z0 + random() * (z1 - z0);
      if (x > LAGOON_ARM_X[0] - 2 && x < LAGOON_ARM_X[1] + 2 && z < minZ) continue; // lagoon arm
      if (random() < 0.55) plan.palm(x, z, random);
      else if (random() < 0.6) plan.tree(x, z, random);
      else plan.bush(x, z, random);
    }
  };
  scatter(minX - 70, minZ - 70, maxX + 70, minZ - 6, 150);
  scatter(minX - 70, minZ, minX - 6, coastZ - 4, 70);
  scatter(maxX + 6, minZ, maxX + 70, coastZ - 4, 70);
  abujaOutskirts(plan);
}

/** Abuja's scrub and acacia just beyond its edge (it is inland: no palms). */
function abujaOutskirts(plan: PlanBuilder): void {
  const { minX, minZ, maxX, maxZ } = cityBounds('abuja');
  const random = rng(0xab07a);
  const scatter = (x0: number, z0: number, x1: number, z1: number, count: number): void => {
    for (let i = 0; i < count; i++) {
      const x = x0 + random() * (x1 - x0);
      const z = z0 + random() * (z1 - z0);
      if (random() < 0.4) plan.tree(x, z, random);
      else plan.bush(x, z, random);
    }
  };
  scatter(minX - 70, minZ - 70, maxX + 70, minZ - 6, 110);
  scatter(minX - 70, maxZ + 6, maxX + 70, maxZ + 70, 110);
  scatter(minX - 70, minZ, minX - 6, maxZ, 70);
  scatter(maxX + 6, minZ, maxX + 70, maxZ, 70);
}

// ---------------------------------------------------------------------------------------------------------------

function buildPlan(): CityPlan {
  const plan = new PlanBuilder();
  addRoads(plan);
  CITY_MAP.lots.forEach((lot, index) => {
    if (lot.kind === 'venue') venueLot(plan, lot, index);
    else if (lot.kind === 'landmark') landmarkLot(plan, lot, index);
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
