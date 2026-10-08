import { createRng, type Rng } from '@insidelife/shared';
import { clamp, dampAngle } from '../physics/math';
import { ROUNDABOUT_LANE_RADIUS, type Lane, type LaneGraph } from './lane-graph';

/**
 * Ambient traffic: a modest set of cars, danfos and keke following the lane graph in the right-hand lane. Each car
 * follows a polyline (its lane, then a curved turn through the junction or an anticlockwise sweep of the roundabout),
 * keeps a gap to whatever is ahead in its lane (other traffic, the player), swerves round kerbside parked cars, and
 * is recycled ahead of the player when it drifts too far away. Seeded and pure (no three.js); nothing is allocated
 * per frame.
 */

export type TrafficKind = 'car' | 'danfo' | 'keke';

export interface TrafficCar {
  readonly index: number;
  kind: TrafficKind;
  /** Index into the renderer's model list for this kind. */
  variant: number;
  active: boolean;
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Cruise speed for this vehicle on open road (m/s). */
  cruise: number;
  lane: number;
  /** Next lane chosen for the junction ahead. */
  next: number;
  /** Following a junction/roundabout curve rather than a lane. */
  turning: boolean;
  /** Current path: xs/zs and cumulative distance. */
  readonly px: Float32Array;
  readonly pz: Float32Array;
  readonly cum: Float32Array;
  count: number;
  along: number;
  /** Swerve (metres towards the road centre) to pass parked cars. */
  swerve: number;
  /** Seconds spent stopped (deadlock breaker). */
  stuck: number;
  /** Seconds left ignoring other traffic after a deadlock. */
  creep: number;
}

/** Something traffic must not drive through (the player on foot or in a car). */
export interface TrafficObstacle {
  x: number;
  z: number;
  radius: number;
  /** Standing still (the player's empty car, a stopped player): swerve round it instead of queueing. */
  parked: boolean;
  active: boolean;
}

const MAX_PATH = 28;
const SPEED_BY_CLASS = { expressway: 15, arterial: 12.5, street: 9.5 } as const;
const TURN_SPEED = 6;
const ROUNDABOUT_SPEED = 6.5;
const KEKE_SPEED = 8;
/** Gap kept to the vehicle ahead (centre to centre). */
const MIN_GAP = 7.5;
const LOOK_AHEAD = 24;
const LANE_HALF = 2.3;
const SPAWN_MIN = 45;
const SPAWN_MAX = 160;
const DESPAWN = 210;

export class TrafficSim {
  readonly cars: TrafficCar[] = [];
  private readonly graph: LaneGraph;
  private readonly rng: Rng;
  private target: number;

  constructor(graph: LaneGraph, capacity: number, seed: string) {
    this.graph = graph;
    this.rng = createRng(`traffic:${seed}`);
    this.target = capacity;
    for (let i = 0; i < capacity; i++) {
      this.cars.push({
        index: i,
        kind: 'car',
        variant: 0,
        active: false,
        x: 0,
        z: 0,
        heading: 0,
        speed: 0,
        cruise: 10,
        lane: 0,
        next: -1,
        turning: false,
        px: new Float32Array(MAX_PATH),
        pz: new Float32Array(MAX_PATH),
        cum: new Float32Array(MAX_PATH),
        count: 0,
        along: 0,
        swerve: 0,
        stuck: 0,
        creep: 0,
      });
    }
  }

  /** How many cars should be on the road (≤ capacity). */
  setTarget(count: number): void {
    this.target = Math.max(0, Math.min(this.cars.length, Math.round(count)));
  }

  /** Place a car at a lane position (tests and spawning). */
  place(car: TrafficCar, lane: number, along: number, kind: TrafficKind, variant: number): void {
    const graphLane = this.graph.lanes[lane] as Lane;
    car.kind = kind;
    car.variant = variant;
    car.active = true;
    car.lane = lane;
    car.next = -1;
    car.speed = 0;
    car.stuck = 0;
    car.creep = 0;
    car.swerve = 0;
    car.cruise = (kind === 'keke' ? KEKE_SPEED : SPEED_BY_CLASS[graphLane.roadClass] + (kind === 'danfo' ? 1 : 0)) * (0.88 + this.rng.next() * 0.2);
    this.followLane(car, graphLane);
    car.along = clamp(along, 0, graphLane.length);
    this.locate(car);
    car.heading = Math.atan2(graphLane.dz, graphLane.dx);
  }

  update(dt: number, focusX: number, focusZ: number, obstacles: readonly TrafficObstacle[], visible?: (x: number, z: number) => boolean): void {
    let active = 0;
    for (const car of this.cars) if (car.active) active++;
    // Recycle far cars and top up to the target count, preferring spots the camera can't see.
    for (const car of this.cars) {
      if (car.active) {
        const far = Math.hypot(car.x - focusX, car.z - focusZ) > DESPAWN;
        if ((far || car.stuck > 20) && !(visible?.(car.x, car.z) ?? false)) {
          car.active = false;
          active--;
        }
      }
      if (!car.active && active < this.target && this.spawn(car, focusX, focusZ, visible)) active++;
    }
    if (active > this.target) {
      for (const car of this.cars) {
        if (active <= this.target) break;
        if (car.active && !(visible?.(car.x, car.z) ?? false)) {
          car.active = false;
          active--;
        }
      }
    }
    for (const car of this.cars) if (car.active) this.drive(car, dt, obstacles);
  }

  private spawn(car: TrafficCar, focusX: number, focusZ: number, visible?: (x: number, z: number) => boolean): boolean {
    const lanes = this.graph.lanes;
    for (let attempt = 0; attempt < 40; attempt++) {
      const lane = lanes[Math.floor(this.rng.next() * lanes.length)] as Lane;
      if (lane.length < 6) continue;
      const along = this.rng.next() * lane.length;
      const x = lane.x0 + lane.dx * along;
      const z = lane.z0 + lane.dz * along;
      const distance = Math.hypot(x - focusX, z - focusZ);
      if (distance < SPAWN_MIN || distance > SPAWN_MAX) continue;
      if (attempt < 30 && visible?.(x, z)) continue;
      if (this.occupied(x, z, car)) continue;
      const roll = this.rng.next();
      const kind: TrafficKind = roll < 0.3 ? 'danfo' : roll < 0.48 && lane.roadClass !== 'expressway' ? 'keke' : 'car';
      this.place(car, lane.id, along, kind, Math.floor(this.rng.next() * 1000));
      return true;
    }
    return false;
  }

  private occupied(x: number, z: number, self: TrafficCar): boolean {
    for (const other of this.cars) {
      if (other === self || !other.active) continue;
      if (Math.abs(other.x - x) < 9 && Math.abs(other.z - z) < 9) return true;
    }
    return false;
  }

  private followLane(car: TrafficCar, lane: Lane): void {
    car.turning = false;
    car.px[0] = lane.x0;
    car.pz[0] = lane.z0;
    car.px[1] = lane.x1;
    car.pz[1] = lane.z1;
    car.cum[0] = 0;
    car.cum[1] = lane.length;
    car.count = 2;
    car.along = 0;
  }

  /** Pick the lane after `lane`: never a U-turn unless it's a dead end; straight on is likelier than a turn. */
  private chooseNext(lane: Lane): number {
    const options = this.graph.outgoing[lane.to] ?? [];
    let total = 0;
    for (const id of options) total += this.weight(lane, this.graph.lanes[id] as Lane);
    if (total <= 0) {
      // Dead end: turn round.
      for (const id of options) if ((this.graph.lanes[id] as Lane).edge === lane.edge) return id;
      return options[0] ?? lane.id;
    }
    let roll = this.rng.next() * total;
    for (const id of options) {
      roll -= this.weight(lane, this.graph.lanes[id] as Lane);
      if (roll <= 0) return id;
    }
    return options[options.length - 1] ?? lane.id;
  }

  private weight(from: Lane, to: Lane): number {
    if (to.edge === from.edge) return 0;
    if (to.length < 2) return 0.1;
    const straight = from.dx * to.dx + from.dz * to.dz > 0.9;
    return straight ? 2.2 : 1;
  }

  /** Build the junction curve from the end of `from` to the start of `to`. */
  private buildTurn(car: TrafficCar, from: Lane, to: Lane): void {
    const centre = this.graph.roundabouts.get(from.to);
    let n = 0;
    const push = (x: number, z: number): void => {
      if (n >= MAX_PATH) return;
      car.px[n] = x;
      car.pz[n] = z;
      car.cum[n] = n === 0 ? 0 : (car.cum[n - 1] as number) + Math.hypot(x - (car.px[n - 1] as number), z - (car.pz[n - 1] as number));
      n++;
    };
    push(from.x1, from.z1);
    if (centre) {
      // Anticlockwise (right-hand traffic) sweep of the ring from the entry arm to the exit arm.
      const entry = Math.atan2(from.z1 - centre.z, from.x1 - centre.x);
      const exit = Math.atan2(to.z0 - centre.z, to.x0 - centre.x);
      let sweep = entry - exit;
      while (sweep <= 0.2) sweep += Math.PI * 2;
      const steps = Math.min(MAX_PATH - 3, Math.max(4, Math.ceil(sweep / 0.3)));
      for (let s = 0; s <= steps; s++) {
        const angle = entry - (sweep * s) / steps;
        push(centre.x + Math.cos(angle) * ROUNDABOUT_LANE_RADIUS, centre.z + Math.sin(angle) * ROUNDABOUT_LANE_RADIUS);
      }
    } else {
      // Cubic Bézier along the incoming and outgoing directions.
      const span = Math.hypot(to.x0 - from.x1, to.z0 - from.z1);
      const k = Math.max(3, span * 0.55);
      const c1x = from.x1 + from.dx * k;
      const c1z = from.z1 + from.dz * k;
      const c2x = to.x0 - to.dx * k;
      const c2z = to.z0 - to.dz * k;
      const steps = 8;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const c = 3 * u * t * t;
        const d = t * t * t;
        push(a * from.x1 + b * c1x + c * c2x + d * to.x0, a * from.z1 + b * c1z + c * c2z + d * to.z0);
      }
    }
    push(to.x0, to.z0);
    car.count = n;
    car.along = 0;
    car.turning = true;
  }

  /** Position (and path direction) at `car.along`, with the swerve applied on lanes. */
  private locate(car: TrafficCar): void {
    const along = car.along;
    let i = 1;
    while (i < car.count - 1 && (car.cum[i] as number) < along) i++;
    const x0 = car.px[i - 1] as number;
    const z0 = car.pz[i - 1] as number;
    const x1 = car.px[i] as number;
    const z1 = car.pz[i] as number;
    const c0 = car.cum[i - 1] as number;
    const segment = Math.max(1e-6, (car.cum[i] as number) - c0);
    const t = clamp((along - c0) / segment, 0, 1);
    const dx = (x1 - x0) / segment;
    const dz = (z1 - z0) / segment;
    // Swerve towards the road centre (left of travel: (dz, -dx)).
    car.x = x0 + (x1 - x0) * t + dz * car.swerve;
    car.z = z0 + (z1 - z0) * t - dx * car.swerve;
    pathDirX = dx;
    pathDirZ = dz;
  }

  private drive(car: TrafficCar, dt: number, obstacles: readonly TrafficObstacle[]): void {
    const lane = this.graph.lanes[car.lane] as Lane;
    const length = car.cum[car.count - 1] as number;
    if (!car.turning && car.next < 0) car.next = this.chooseNext(lane);

    // Speed target: cruise on lanes, slower through turns and the roundabout, slower approaching a turn.
    let desired = car.turning ? (this.graph.roundabouts.has(lane.to) ? ROUNDABOUT_SPEED : TURN_SPEED) : car.cruise;
    if (!car.turning) {
      const next = this.graph.lanes[car.next] as Lane | undefined;
      const turnAhead = next && (next.dx * lane.dx + next.dz * lane.dz < 0.9 || this.graph.roundabouts.has(lane.to));
      if (turnAhead) desired = Math.min(desired, TURN_SPEED + Math.max(0, length - car.along) * 0.35);
    }

    // Gap to whatever is ahead in the lane.
    const fx = Math.cos(car.heading);
    const fz = Math.sin(car.heading);
    let gap = Number.POSITIVE_INFINITY;
    if (car.creep <= 0) {
      for (const other of this.cars) {
        if (other === car || !other.active) continue;
        const rx = other.x - car.x;
        const rz = other.z - car.z;
        const ahead = rx * fx + rz * fz;
        if (ahead <= 0 || ahead > LOOK_AHEAD) continue;
        const side = rx * -fz + rz * fx;
        if (Math.abs(side) > LANE_HALF) continue;
        // Ignore oncoming traffic that merely passes beside us.
        if (Math.cos(other.heading) * fx + Math.sin(other.heading) * fz < -0.5 && Math.abs(side) > 1.2) continue;
        gap = Math.min(gap, ahead);
      }
    } else car.creep -= dt;
    let swerveTarget = 0;
    for (const obstacle of obstacles) {
      if (!obstacle.active) continue;
      const rx = obstacle.x - car.x;
      const rz = obstacle.z - car.z;
      const ahead = rx * fx + rz * fz;
      if (ahead <= -2 || ahead > LOOK_AHEAD) continue;
      const side = rx * -fz + rz * fx;
      if (obstacle.parked) {
        // Something standing still in (or at the edge of) the lane: drive round it, Lagos style.
        if (!car.turning && Math.abs(side) < LANE_HALF + obstacle.radius) swerveTarget = Math.max(swerveTarget, Math.min(4, 1.2 + obstacle.radius + Math.max(0, side)));
        continue;
      }
      // Moving obstacles (the player): queue behind them only when they're really in front of the bumper.
      if (ahead > 1 && Math.abs(side) < LANE_HALF + obstacle.radius * 0.5) gap = Math.min(gap, ahead - obstacle.radius + 1.5);
    }
    if (!car.turning) {
      for (const parkedAt of lane.parked) {
        const delta = parkedAt - car.along;
        if (delta > -5 && delta < 16) {
          swerveTarget = 2.6;
          break;
        }
        if (delta >= 16) break;
      }
    }
    car.swerve += (swerveTarget - car.swerve) * Math.min(1, dt * 1.6);
    if (gap < Number.POSITIVE_INFINITY) desired = Math.min(desired, Math.max(0, (gap - MIN_GAP) * 1.1));

    const accel = desired > car.speed ? 2.8 : 9;
    car.speed += clamp(desired - car.speed, -accel * dt, accel * dt);
    if (gap < MIN_GAP - 2) car.speed = Math.min(car.speed, 0.5);
    car.stuck = car.speed < 0.3 ? car.stuck + dt : 0;
    if (car.stuck > 6 && car.creep <= 0) car.creep = 2;

    car.along += car.speed * dt;
    // Hand over to the next path piece when this one ends.
    while (car.along >= (car.cum[car.count - 1] as number)) {
      const overshoot = car.along - (car.cum[car.count - 1] as number);
      if (car.turning) {
        const next = this.graph.lanes[car.next] as Lane;
        car.lane = next.id;
        car.next = -1;
        this.followLane(car, next);
        car.next = this.chooseNext(next);
      } else {
        const from = this.graph.lanes[car.lane] as Lane;
        if (car.next < 0) car.next = this.chooseNext(from);
        this.buildTurn(car, from, this.graph.lanes[car.next] as Lane);
        car.swerve = 0;
      }
      car.along = overshoot;
      if ((car.cum[car.count - 1] as number) <= 0.01) break;
    }
    this.locate(car);
    car.heading = dampAngle(car.heading, Math.atan2(pathDirZ, pathDirX), car.turning ? 9 : 6, dt);
  }
}

let pathDirX = 1;
let pathDirZ = 0;
