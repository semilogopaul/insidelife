import { CITY_MAP, type CityRoadEdge, type CityRoadNode, type RoadClass } from '@insidelife/shared';
import { VEHICLE_SCALE, cityPlan } from '../../city/layout/placements';
import { LANE_OFFSET } from '../physics/surface';

/**
 * Directed driving lanes over the shared road graph. The graph follows road centrelines; every edge gives two
 * lanes offset to the right of travel (right-hand traffic). Lanes stop short of junctions so turns can be drawn as
 * curves, and short of the Ajah roundabout ring so cars can circulate anticlockwise.
 */

export interface Lane {
  readonly id: number;
  readonly edge: number;
  /** Node the lane leaves from / arrives at. */
  readonly from: number;
  readonly to: number;
  /** Unit direction of travel. */
  readonly dx: number;
  readonly dz: number;
  /** Start and end points (offset into the right-hand lane, inset from junctions). */
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly length: number;
  readonly roadClass: RoadClass;
  readonly bridge: boolean;
  /** Distances along the lane of kerbside parked cars that block it (cars swerve round them), ascending. */
  readonly parked: readonly number[];
}

export interface LaneGraph {
  readonly lanes: readonly Lane[];
  /** Lanes leaving each node. */
  readonly outgoing: readonly (readonly number[])[];
  /** Roundabout centre per node id (absent for ordinary junctions). */
  readonly roundabouts: ReadonlyMap<number, { readonly x: number; readonly z: number }>;
}

/** Radius cars circulate the roundabout at (asphalt ring 4.2–11.6 m). */
export const ROUNDABOUT_LANE_RADIUS = 8.6;
const ROUNDABOUT_INSET = 13;
const JUNCTION_INSET = 4.6;

function insetAt(node: CityRoadNode, roundabout: boolean, straightThrough: boolean): number {
  if (roundabout) return ROUNDABOUT_INSET;
  if (node.degree === 2 && straightThrough) return 0;
  return JUNCTION_INSET;
}

/** True when a degree-2 node continues straight (a name change, not a bend). */
function isStraightNode(nodeId: number, edges: readonly CityRoadEdge[], adjacency: readonly (readonly number[])[]): boolean {
  const list = adjacency[nodeId] ?? [];
  if (list.length !== 2) return false;
  const a = edges[list[0] as number] as CityRoadEdge;
  const b = edges[list[1] as number] as CityRoadEdge;
  return Math.abs(a.dx * b.dx + a.dz * b.dz) > 0.99;
}

export function buildLaneGraph(parkedCars: readonly { readonly x: number; readonly z: number }[] = []): LaneGraph {
  const { nodes, edges } = CITY_MAP;
  const adjacency: number[][] = nodes.map(() => []);
  for (const edge of edges) {
    adjacency[edge.a]?.push(edge.id);
    adjacency[edge.b]?.push(edge.id);
  }
  const roundabouts = new Map<number, { x: number; z: number }>();
  for (const entry of CITY_MAP.roundabouts) if (entry.nodeId >= 0) roundabouts.set(entry.nodeId, entry.centre);

  const lanes: Lane[] = [];
  const outgoing: number[][] = nodes.map(() => []);
  for (const edge of edges) {
    for (const reverse of [false, true]) {
      const from = reverse ? edge.b : edge.a;
      const to = reverse ? edge.a : edge.b;
      const dx = reverse ? -edge.dx : edge.dx;
      const dz = reverse ? -edge.dz : edge.dz;
      const start = nodes[from] as CityRoadNode;
      const end = nodes[to] as CityRoadNode;
      let inset0 = insetAt(start, roundabouts.has(from), isStraightNode(from, edges, adjacency));
      let inset1 = insetAt(end, roundabouts.has(to), isStraightNode(to, edges, adjacency));
      const room = edge.length - 1;
      if (inset0 + inset1 > room) {
        const scale = room / (inset0 + inset1);
        inset0 *= scale;
        inset1 *= scale;
      }
      // Right of travel: (-dz, dx).
      const ox = -dz * LANE_OFFSET;
      const oz = dx * LANE_OFFSET;
      const x0 = start.x + dx * inset0 + ox;
      const z0 = start.z + dz * inset0 + oz;
      const x1 = end.x - dx * inset1 + ox;
      const z1 = end.z - dz * inset1 + oz;
      const length = Math.max(0.5, edge.length - inset0 - inset1);
      const parked: number[] = [];
      for (const car of parkedCars) {
        const rx = car.x - x0;
        const rz = car.z - z0;
        const along = rx * dx + rz * dz;
        const side = rx * -dz + rz * dx;
        if (along > -3 && along < length + 3 && Math.abs(side) < 2.4) parked.push(along);
      }
      parked.sort((a, b) => a - b);
      const id = lanes.length;
      lanes.push({ id, edge: edge.id, from, to, dx, dz, x0, z0, x1, z1, length, roadClass: edge.roadClass, bridge: edge.bridge, parked });
      outgoing[from]?.push(id);
    }
  }
  return { lanes, outgoing, roundabouts };
}

let cached: LaneGraph | null = null;

/** The city's lane graph with its kerbside parked cars (built once per page). */
export function cityLaneGraph(): LaneGraph {
  cached ??= buildLaneGraph(cityPlan().placements.vehicles.filter((placement) => placement.sx === VEHICLE_SCALE));
  return cached;
}
