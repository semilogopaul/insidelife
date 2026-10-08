import { CITY_MAP, CELL_EDGES, colAt, rowAt, cellIndex, cityCellInGrid, type CityRoadEdge } from './city-map.js';
import type { WorldPoint } from './types.js';

/**
 * Road routing over the city graph: nearest road point, A* (binary heap, scratch buffers reused between queries)
 * and turn-by-turn maneuvers. Pure and allocation-light enough to run on the server for every heartbeat.
 */

const S = CITY_MAP.cellSize;
const NODES = CITY_MAP.nodes;
const EDGES = CITY_MAP.edges;
const NODE_COUNT = NODES.length;

const node = (id: number) => NODES[id] as (typeof NODES)[number];
const edgeAt = (id: number): CityRoadEdge => EDGES[id] as CityRoadEdge;

// Adjacency (CSR).
const ADJ_START = new Int32Array(NODE_COUNT + 1);
const ADJ_NODE = new Int32Array(EDGES.length * 2);
const ADJ_EDGE = new Int32Array(EDGES.length * 2);
{
  for (const edge of EDGES) {
    ADJ_START[edge.a + 1] = (ADJ_START[edge.a + 1] as number) + 1;
    ADJ_START[edge.b + 1] = (ADJ_START[edge.b + 1] as number) + 1;
  }
  for (let i = 1; i <= NODE_COUNT; i++) ADJ_START[i] = (ADJ_START[i] as number) + (ADJ_START[i - 1] as number);
  const fill = ADJ_START.slice(0, NODE_COUNT);
  for (const edge of EDGES) {
    let slot = fill[edge.a] as number;
    ADJ_NODE[slot] = edge.b;
    ADJ_EDGE[slot] = edge.id;
    fill[edge.a] = slot + 1;
    slot = fill[edge.b] as number;
    ADJ_NODE[slot] = edge.a;
    ADJ_EDGE[slot] = edge.id;
    fill[edge.b] = slot + 1;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Nearest road point
// ---------------------------------------------------------------------------------------------------------------

export interface RoadSnap {
  /** Closest point on a road centreline. */
  readonly point: WorldPoint;
  readonly edgeId: number;
  /** Distance from the edge's `a` node along the edge (metres). */
  readonly offset: number;
  /** Straight distance from the query point to `point`. */
  readonly distance: number;
  readonly streetName: string;
}

/** Closest point on any road centreline (null only if the city had no roads). */
export function nearestRoadPoint(point: WorldPoint): RoadSnap | null {
  const startCol = Math.min(CITY_MAP.cols - 1, Math.max(0, colAt(point.x)));
  const startRow = Math.min(CITY_MAP.rows - 1, Math.max(0, rowAt(point.z)));
  const maxRing = Math.max(CITY_MAP.cols, CITY_MAP.rows);
  // Points outside the grid: account for the gap to the clamped cell.
  const outside = Math.max(0, Math.abs(point.x) - CITY_MAP.bounds.maxX, Math.abs(point.z) - CITY_MAP.bounds.maxZ);
  let best = Number.POSITIVE_INFINITY;
  let bestEdge = -1;
  let bestOffset = 0;
  let bestX = 0;
  let bestZ = 0;
  for (let ring = 0; ring <= maxRing; ring++) {
    if (bestEdge >= 0 && (ring - 1) * S + outside > best) break;
    for (let row = startRow - ring; row <= startRow + ring; row++) {
      const edgeRow = row === startRow - ring || row === startRow + ring;
      for (let col = startCol - ring; col <= startCol + ring; col += edgeRow || ring === 0 ? 1 : ring * 2) {
        if (!cityCellInGrid(col, row)) continue;
        const index = cellIndex(col, row);
        const from = CELL_EDGES.start[index] as number;
        const to = CELL_EDGES.start[index + 1] as number;
        for (let k = from; k < to; k++) {
          const edge = edgeAt(CELL_EDGES.edges[k] as number);
          const a = node(edge.a);
          let t = (point.x - a.x) * edge.dx + (point.z - a.z) * edge.dz;
          t = t < 0 ? 0 : t > edge.length ? edge.length : t;
          const x = a.x + edge.dx * t;
          const z = a.z + edge.dz * t;
          const d = Math.hypot(point.x - x, point.z - z);
          if (d < best) {
            best = d;
            bestEdge = edge.id;
            bestOffset = t;
            bestX = x;
            bestZ = z;
          }
        }
      }
    }
  }
  if (bestEdge < 0) return null;
  return { point: { x: bestX, z: bestZ }, edgeId: bestEdge, offset: bestOffset, distance: best, streetName: edgeAt(bestEdge).name };
}

/** Name of the street at a point (null when further than `maxDistance` from any road). */
export function streetNameAt(point: WorldPoint, maxDistance = 14): string | null {
  const snap = nearestRoadPoint(point);
  return snap && snap.distance <= maxDistance ? snap.streetName : null;
}

// ---------------------------------------------------------------------------------------------------------------
// A*
// ---------------------------------------------------------------------------------------------------------------

const START = NODE_COUNT;
const GOAL = NODE_COUNT + 1;
const G = new Float64Array(NODE_COUNT + 2);
const PREV = new Int32Array(NODE_COUNT + 2);
const PREV_EDGE = new Int32Array(NODE_COUNT + 2);
const STAMP = new Uint32Array(NODE_COUNT + 2);
const CLOSED = new Uint32Array(NODE_COUNT + 2);
let stamp = 0;

const HEAP_CAPACITY = EDGES.length * 2 + 8;
const HEAP_NODE = new Int32Array(HEAP_CAPACITY);
const HEAP_F = new Float64Array(HEAP_CAPACITY);
let heapSize = 0;

function heapPush(id: number, f: number): void {
  if (heapSize >= HEAP_CAPACITY) return;
  let i = heapSize++;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    const pf = HEAP_F[parent] as number;
    if (pf <= f) break;
    HEAP_NODE[i] = HEAP_NODE[parent] as number;
    HEAP_F[i] = pf;
    i = parent;
  }
  HEAP_NODE[i] = id;
  HEAP_F[i] = f;
}

function heapPop(): number {
  const top = HEAP_NODE[0] as number;
  const lastNode = HEAP_NODE[--heapSize] as number;
  const lastF = HEAP_F[heapSize] as number;
  let i = 0;
  for (;;) {
    const left = i * 2 + 1;
    if (left >= heapSize) break;
    const right = left + 1;
    const child = right < heapSize && (HEAP_F[right] as number) < (HEAP_F[left] as number) ? right : left;
    if ((HEAP_F[child] as number) >= lastF) break;
    HEAP_NODE[i] = HEAP_NODE[child] as number;
    HEAP_F[i] = HEAP_F[child] as number;
    i = child;
  }
  HEAP_NODE[i] = lastNode;
  HEAP_F[i] = lastF;
  return top;
}

const gOf = (id: number): number => (STAMP[id] === stamp ? (G[id] as number) : Number.POSITIVE_INFINITY);

function relax(from: number, to: number, cost: number, viaEdge: number, goal: WorldPoint): void {
  const g = (G[from] as number) + cost;
  if (g >= gOf(to)) return;
  STAMP[to] = stamp;
  G[to] = g;
  PREV[to] = from;
  PREV_EDGE[to] = viaEdge;
  const h = to === GOAL ? 0 : Math.hypot(node(to).x - goal.x, node(to).z - goal.z);
  heapPush(to, g + h);
}

/** Node sequence START → … → GOAL as [nodeIds, edgeIds] (edge ids per hop; -1 for the partial start/goal hops). */
function search(start: RoadSnap, goal: RoadSnap): { nodes: number[]; edges: number[] } | null {
  stamp = (stamp + 1) >>> 0;
  if (stamp === 0) {
    STAMP.fill(0);
    CLOSED.fill(0);
    stamp = 1;
  }
  heapSize = 0;
  const se = edgeAt(start.edgeId);
  const ge = edgeAt(goal.edgeId);
  STAMP[START] = stamp;
  G[START] = 0;
  PREV[START] = -1;
  relax(START, se.a, start.offset, se.id, goal.point);
  relax(START, se.b, se.length - start.offset, se.id, goal.point);

  while (heapSize > 0) {
    const u = heapPop();
    if (CLOSED[u] === stamp) continue;
    CLOSED[u] = stamp;
    if (u === GOAL) break;
    if (u === ge.a) relax(u, GOAL, goal.offset, ge.id, goal.point);
    if (u === ge.b) relax(u, GOAL, ge.length - goal.offset, ge.id, goal.point);
    const from = ADJ_START[u] as number;
    const to = ADJ_START[u + 1] as number;
    for (let k = from; k < to; k++) {
      const v = ADJ_NODE[k] as number;
      if (CLOSED[v] === stamp) continue;
      relax(u, v, edgeAt(ADJ_EDGE[k] as number).length, ADJ_EDGE[k] as number, goal.point);
    }
  }
  if (CLOSED[GOAL] !== stamp) return null;
  const nodes: number[] = [];
  const edges: number[] = [];
  let cursor = GOAL;
  while (cursor !== START) {
    nodes.push(cursor);
    edges.push(PREV_EDGE[cursor] as number);
    cursor = PREV[cursor] as number;
  }
  nodes.reverse();
  edges.reverse();
  return { nodes, edges };
}

// ---------------------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------------------

export type RouteLegKind = 'access' | 'road' | 'bridge' | 'roundabout';

export interface RouteLeg {
  readonly name: string;
  readonly kind: RouteLegKind;
  /** Index of the first and last point of the leg in `CityRoute.points`. */
  readonly from: number;
  readonly to: number;
  readonly length: number;
  /** Roundabouts: exit number taken (1-based). */
  readonly exit?: number;
}

export interface CityRoute {
  readonly from: WorldPoint;
  readonly to: WorldPoint;
  readonly points: readonly WorldPoint[];
  /** Distance along the route at each point. */
  readonly cumulative: readonly number[];
  /** Graph degree of the junction at each point (0 when the point is not a junction). */
  readonly junctions: readonly number[];
  readonly length: number;
  readonly legs: readonly RouteLeg[];
}

interface Segment {
  readonly name: string;
  readonly kind: RouteLegKind;
  readonly exit?: number;
}

const ROUNDABOUT_BY_NODE = new Map(CITY_MAP.roundabouts.map((entry) => [entry.nodeId, entry]));
const TWO_PI = Math.PI * 2;

/** Arms (angles) of a roundabout node. */
function roundaboutArms(nodeId: number): number[] {
  const arms: number[] = [];
  const from = ADJ_START[nodeId] as number;
  const to = ADJ_START[nodeId + 1] as number;
  for (let k = from; k < to; k++) {
    const other = node(ADJ_NODE[k] as number);
    arms.push(Math.atan2(other.z - node(nodeId).z, other.x - node(nodeId).x));
  }
  return arms;
}

/** Road route between two points (A* over the road graph). Returns null when either point has no road nearby. */
export function findRoute(from: WorldPoint, to: WorldPoint): CityRoute | null {
  const start = nearestRoadPoint(from);
  const goal = nearestRoadPoint(to);
  if (!start || !goal) return null;

  const points: WorldPoint[] = [];
  const junctions: number[] = [];
  const segments: Segment[] = [];
  const push = (point: WorldPoint, junction: number, segment: Segment | null): void => {
    const last = points[points.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.01 && Math.abs(last.z - point.z) < 0.01) {
      junctions[junctions.length - 1] = Math.max(junctions[junctions.length - 1] ?? 0, junction);
      return;
    }
    if (segment && points.length > 0) segments.push(segment);
    points.push(point);
    junctions.push(junction);
  };

  push(from, 0, null);
  push(start.point, 0, { name: start.streetName, kind: 'access' });

  if (start.edgeId === goal.edgeId) {
    const edge = edgeAt(start.edgeId);
    push(goal.point, 0, { name: edge.name, kind: edge.bridge ? 'bridge' : 'road' });
  } else {
    const path = search(start, goal);
    if (!path) return null;
    for (let i = 0; i < path.nodes.length; i++) {
      const id = path.nodes[i] as number;
      const edge = edgeAt(path.edges[i] as number);
      const segment: Segment = { name: edge.name, kind: edge.bridge ? 'bridge' : 'road' };
      if (id === GOAL) {
        push(goal.point, 0, segment);
        continue;
      }
      const roundabout = ROUNDABOUT_BY_NODE.get(id);
      const n = node(id);
      if (!roundabout) {
        push({ x: n.x, z: n.z }, n.degree, segment);
        continue;
      }
      // Replace the roundabout centre with an anticlockwise arc (right-hand traffic) from the entry to the exit arm.
      const prev = points[points.length - 1] as WorldPoint;
      const nextId = path.nodes[i + 1] as number;
      const next = nextId === GOAL ? goal.point : { x: node(nextId).x, z: node(nextId).z };
      const entry = Math.atan2(prev.z - n.z, prev.x - n.x);
      const exitAngle = Math.atan2(next.z - n.z, next.x - n.x);
      let sweep = entry - exitAngle;
      while (sweep <= 0.01) sweep += TWO_PI;
      const arms = roundaboutArms(id);
      let exit = 0;
      for (const arm of arms) {
        let delta = entry - arm;
        while (delta <= 0.01) delta += TWO_PI;
        if (delta <= sweep + 0.01) exit++;
      }
      const steps = Math.max(3, Math.ceil(sweep / (Math.PI / 8)));
      const r = roundabout.ringRadius;
      push({ x: n.x + Math.cos(entry) * r, z: n.z + Math.sin(entry) * r }, n.degree, segment);
      for (let s = 1; s <= steps; s++) {
        const angle = entry - (sweep * s) / steps;
        push({ x: n.x + Math.cos(angle) * r, z: n.z + Math.sin(angle) * r }, 0, { name: roundabout.name, kind: 'roundabout', exit: Math.max(1, exit) });
      }
    }
  }
  push(to, 0, { name: goal.streetName, kind: 'access' });

  // Cumulative distances and legs.
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as WorldPoint;
    const b = points[i] as WorldPoint;
    cumulative.push((cumulative[i - 1] as number) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const legs: RouteLeg[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] as Segment;
    const length = (cumulative[i + 1] as number) - (cumulative[i] as number);
    const last = legs[legs.length - 1];
    if (last && last.name === segment.name && last.kind === segment.kind) {
      legs[legs.length - 1] = { ...last, to: i + 1, length: last.length + length };
    } else {
      legs.push({ name: segment.name, kind: segment.kind, from: i, to: i + 1, length, exit: segment.exit });
    }
  }
  return { from, to, points, cumulative, junctions, length: cumulative[cumulative.length - 1] as number, legs: legs.filter((leg) => leg.length > 0.01) };
}

// ---------------------------------------------------------------------------------------------------------------
// Turn by turn
// ---------------------------------------------------------------------------------------------------------------

export type ManeuverKind = 'depart' | 'straight' | 'left' | 'right' | 'slight-left' | 'slight-right' | 'u-turn' | 'roundabout' | 'arrive';

export interface RouteManeuver {
  readonly kind: ManeuverKind;
  /** Distance along the route where the maneuver happens (metres). */
  readonly at: number;
  readonly point: WorldPoint;
  /** Street after the maneuver ("onto"). */
  readonly street: string;
  /** Full instruction, e.g. "Turn left onto Herbert Macaulay Way". */
  readonly text: string;
  /** Roundabouts: exit number (1-based). */
  readonly exit?: number;
}

export interface TurnByTurnOptions {
  /** Shown in the arrival instruction ("You have arrived at LUTH"). */
  readonly destinationName?: string;
}

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'] as const;
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'] as const;

function compassOf(dx: number, dz: number): string {
  const angle = Math.atan2(dz, dx);
  const index = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return COMPASS[index] ?? 'north';
}

/** Signed turn angle (radians, + = right) between two consecutive segments. */
function turnAngle(a: WorldPoint, b: WorldPoint, c: WorldPoint): number {
  const ax = b.x - a.x;
  const az = b.z - a.z;
  const bx = c.x - b.x;
  const bz = c.z - b.z;
  return Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
}

const DEG = Math.PI / 180;

/** Maneuvers along a route: depart, turns at junctions, roundabouts, name changes and arrival. */
export function turnByTurn(route: CityRoute, options: TurnByTurnOptions = {}): readonly RouteManeuver[] {
  const { points, cumulative, junctions, legs } = route;
  const maneuvers: RouteManeuver[] = [];
  const roadLegs = legs.filter((leg) => leg.kind !== 'access');
  const first = roadLegs[0];
  if (first) {
    const a = points[first.from] as WorldPoint;
    const b = points[Math.min(first.to, first.from + 1)] as WorldPoint;
    maneuvers.push({
      kind: 'depart',
      at: cumulative[first.from] as number,
      point: a,
      street: first.name,
      text: `Head ${compassOf(b.x - a.x, b.z - a.z)} on ${first.name}`,
    });
  }

  // Leg boundaries and junction points are maneuver candidates.
  const legAtPoint = new Map<number, (typeof legs)[number]>();
  for (const leg of roadLegs) legAtPoint.set(leg.from, leg);

  let currentName = first?.name ?? '';
  const startIndex = first ? first.from + 1 : 1;
  const endIndex = roadLegs.length > 0 ? (roadLegs[roadLegs.length - 1] as RouteLeg).to : points.length - 1;
  for (let i = startIndex; i < endIndex; i++) {
    const leg = legAtPoint.get(i);
    const point = points[i] as WorldPoint;
    if (leg?.kind === 'roundabout') {
      const after = roadLegs[roadLegs.indexOf(leg) + 1];
      const onto = after?.name ?? currentName;
      const ordinal = ORDINALS[Math.max(0, (leg.exit ?? 1) - 1)] ?? `${leg.exit}th`;
      maneuvers.push({
        kind: 'roundabout',
        at: cumulative[i] as number,
        point,
        street: onto,
        exit: leg.exit,
        text: `At ${leg.name}, take the ${ordinal} exit onto ${onto}`,
      });
      currentName = onto;
      i = leg.to - 1;
      continue;
    }
    const nextName = leg?.name ?? currentName;
    const nameChanges = leg !== undefined && nextName !== currentName;
    const degree = junctions[i] ?? 0;
    if (degree < 3 && !nameChanges) continue;
    const angle = turnAngle(points[i - 1] as WorldPoint, point, points[i + 1] as WorldPoint);
    const abs = Math.abs(angle);
    let kind: ManeuverKind;
    if (abs < 25 * DEG) kind = 'straight';
    else if (abs < 60 * DEG) kind = angle > 0 ? 'slight-right' : 'slight-left';
    else if (abs < 150 * DEG) kind = angle > 0 ? 'right' : 'left';
    else kind = 'u-turn';
    if (kind === 'straight' && !nameChanges) continue;
    // A bend without a junction is just the road curving: only announce a name change.
    if (degree < 3 && kind !== 'straight') kind = 'straight';
    const verb = kind.startsWith('slight') ? 'Keep' : 'Turn';
    const side = kind.replace('slight-', '');
    const text =
      kind === 'straight'
        ? `Continue onto ${nextName}`
        : kind === 'u-turn'
          ? `Make a U-turn onto ${nextName}`
          : nameChanges
            ? `${verb} ${side} onto ${nextName}`
            : `${verb} ${side} to stay on ${nextName}`;
    maneuvers.push({ kind, at: cumulative[i] as number, point, street: nextName, text });
    currentName = nextName;
  }

  const lastPoint = points[points.length - 1] as WorldPoint;
  maneuvers.push({
    kind: 'arrive',
    at: route.length,
    point: lastPoint,
    street: currentName,
    text: options.destinationName ? `You have arrived at ${options.destinationName}` : 'You have arrived',
  });
  return maneuvers;
}

/** Shortest distance along roads (plus the walk to and from the kerb), or null when unroutable. */
export function routeDistance(a: WorldPoint, b: WorldPoint): number | null {
  const start = nearestRoadPoint(a);
  const goal = nearestRoadPoint(b);
  if (!start || !goal) return null;
  if (start.edgeId === goal.edgeId) return start.distance + Math.abs(start.offset - goal.offset) + goal.distance;
  const path = search(start, goal);
  if (!path) return null;
  return start.distance + (G[GOAL] as number) + goal.distance;
}
