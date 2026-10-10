import { AD_PLACEMENTS, venueLot, type AdPlacementSpot } from '@insidelife/shared';
import { APRON, VEHICLE_SCALE, cityPlan, frameOf, type CityPlan, type LotFrame } from '../../city/layout/placements';
import { ColliderGrid, type Aabb } from './collision';

/**
 * Everything solid in the city for the play layer: building footprints from the city plan, compound walls, kerbside
 * parked cars, the procedural landmarks (airport terminal, stadium bowl, central mosque) and the street ads you could
 * otherwise walk (and the camera see) through: lightbox totems, bus-shelter panels and billboard poles. Built once per page.
 */

/** Kenney car-kit footprint (model units) and height at the city's vehicle scale. */
const CAR_HALF_WIDTH = 0.75 * VEHICLE_SCALE;
const CAR_HALF_LENGTH = 1.3 * VEHICLE_SCALE;
const CAR_HEIGHT = 1.3 * VEHICLE_SCALE;
const WALL_THICKNESS = 0.3;

/** World AABB of a lot-local rectangle (x right when facing the lot from the road, z towards the road). */
function localRect(frame: LotFrame, x: number, z: number, halfW: number, halfD: number, height: number): Aabb {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const [u, v] of [
    [x - halfW, z - halfD],
    [x + halfW, z - halfD],
    [x + halfW, z + halfD],
    [x - halfW, z + halfD],
  ] as const) {
    const wx = frame.cx + u * frame.fz + v * frame.fx;
    const wz = frame.cz - u * frame.fx + v * frame.fz;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return { minX, minZ, maxX, maxZ, height };
}

function landmarkBoxes(): Aabb[] {
  const boxes: Aabb[] = [];
  const airport = venueLot('mmia-airport');
  if (airport) {
    const frame = frameOf(airport);
    boxes.push(localRect(frame, 0, -frame.depth / 2 + 13, 30, 9, 12));
    boxes.push(localRect(frame, 34, -frame.depth / 2 + 9, 2.4, 2.4, 34));
  }
  const stadium = venueLot('national-stadium');
  if (stadium) {
    const frame = frameOf(stadium);
    const rx = Math.min(27, frame.width / 2 - 2);
    const rz = Math.min(12.5, frame.depth / 2 - 2);
    boxes.push(localRect(frame, 0, -1.5, rx * 0.93, rz * 0.9, 11));
  }
  const mosque = venueLot('central-mosque');
  if (mosque) {
    const frame = frameOf(mosque);
    const front = frame.depth / 2 - APRON;
    boxes.push(localRect(frame, 0, front - 7, 7.2, 6.6, 14));
  }
  return boxes;
}

/** World AABB of a box in an ad spot's frame: `across` along its face, `back` behind it (away from viewers). */
function spotBox(spot: AdPlacementSpot, back: number, halfAcross: number, halfDepth: number, height: number): Aabb {
  const ux = -Math.sin(spot.facing);
  const uz = Math.cos(spot.facing);
  const bx = -Math.cos(spot.facing);
  const bz = -Math.sin(spot.facing);
  const cx = spot.position.x + bx * back;
  const cz = spot.position.z + bz * back;
  const ex = Math.abs(ux) * halfAcross + Math.abs(bx) * halfDepth;
  const ez = Math.abs(uz) * halfAcross + Math.abs(bz) * halfDepth;
  return { minX: cx - ex, minZ: cz - ez, maxX: cx + ex, maxZ: cz + ez, height };
}

/** The solid parts of the street ads (as `StreetAds` draws them): a totem's lightbox, a shelter's end panel, a billboard's pole. */
export function adStructureBoxes(spots: readonly AdPlacementSpot[] = AD_PLACEMENTS): Aabb[] {
  const boxes: Aabb[] = [];
  for (const spot of spots) {
    const top = spot.elevation + spot.height + 0.07;
    if (spot.kind === 'totem') boxes.push(spotBox(spot, 0, (spot.width + 0.14) / 2, 0.18, top));
    else if (spot.kind === 'bus-shelter') boxes.push(spotBox(spot, 0.07, (spot.width + 0.14) / 2, 0.07, top));
    else if (spot.kind === 'street-billboard') boxes.push(spotBox(spot, 0.4, 0.18, 0.18, spot.elevation));
  }
  return boxes;
}

function parkedCarBox(x: number, z: number, yaw: number): Aabb {
  // The model's +z front points along (sin yaw, cos yaw).
  const s = Math.abs(Math.sin(yaw));
  const c = Math.abs(Math.cos(yaw));
  const ex = s * CAR_HALF_LENGTH + c * CAR_HALF_WIDTH;
  const ez = c * CAR_HALF_LENGTH + s * CAR_HALF_WIDTH;
  return { minX: x - ex, minZ: z - ez, maxX: x + ex, maxZ: z + ez, height: CAR_HEIGHT };
}

export function buildObstacles(plan: CityPlan): Aabb[] {
  const boxes: Aabb[] = plan.colliders.map((collider) => ({ ...collider }));
  for (const wall of plan.walls) {
    const t = WALL_THICKNESS / 2;
    boxes.push({ minX: Math.min(wall.x0, wall.x1) - t, minZ: Math.min(wall.z0, wall.z1) - t, maxX: Math.max(wall.x0, wall.x1) + t, maxZ: Math.max(wall.z0, wall.z1) + t, height: wall.height });
  }
  for (const gate of plan.gates) {
    const half = gate.width / 2 + 0.5;
    boxes.push({
      minX: gate.x - Math.abs(gate.dx) * half - 0.15,
      maxX: gate.x + Math.abs(gate.dx) * half + 0.15,
      minZ: gate.z - Math.abs(gate.dz) * half - 0.15,
      maxZ: gate.z + Math.abs(gate.dz) * half + 0.15,
      height: 2.5,
    });
  }
  for (const car of plan.placements.vehicles) boxes.push(parkedCarBox(car.x, car.z, car.yaw));
  boxes.push(...landmarkBoxes());
  boxes.push(...adStructureBoxes());
  return boxes;
}

const grids = new WeakMap<CityPlan, ColliderGrid>();

/** The static collider grid of a city plan (built lazily once per plan, ≈ a few ms). */
export function cityColliders(plan: CityPlan = cityPlan()): ColliderGrid {
  let grid = grids.get(plan);
  if (!grid) {
    grid = new ColliderGrid(buildObstacles(plan));
    grids.set(plan, grid);
  }
  return grid;
}
