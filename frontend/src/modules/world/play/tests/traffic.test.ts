import { CITY_MAP } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { LANE_OFFSETS, surfaceAt } from '../physics/surface';
import { buildLaneGraph, type Lane } from '../traffic/lane-graph';
import { TrafficSim, type TrafficObstacle } from '../traffic/traffic-sim';

const graph = buildLaneGraph();
const longLane = (): Lane => graph.lanes.filter((lane) => lane.length > 60).sort((a, b) => b.length - a.length)[0] as Lane;

/** Signed distance of a point to the right of a lane's road centreline. */
function sideOf(lane: Lane, x: number, z: number): number {
  const a = CITY_MAP.nodes[lane.from]!;
  return (x - a.x) * -lane.dz + (z - a.z) * lane.dx;
}

describe('traffic lanes', () => {
  it('builds four lanes per road edge, two each way, offset into the right-hand carriageway', () => {
    expect(graph.lanes.length).toBe(CITY_MAP.edges.length * 4);
    for (const lane of graph.lanes) {
      expect(sideOf(lane, lane.x0, lane.z0)).toBeCloseTo(LANE_OFFSETS[lane.slot], 5);
      expect(surfaceAt(lane.x0, lane.z0)).toBe('asphalt');
      expect(surfaceAt(lane.x1, lane.z1)).toBe('asphalt');
    }
    expect(graph.lanes.filter((lane) => lane.slot === 0)).toHaveLength(CITY_MAP.edges.length * 2);
    // Eastbound traffic keeps to the south (+z) side.
    const east = graph.lanes.find((lane) => lane.dx === 1)!;
    expect(east.z0).toBeGreaterThan(CITY_MAP.nodes[east.from]!.z);
  });

  it('follows its lane at the right-hand offset and through junction curves', () => {
    const sim = new TrafficSim(graph, 1, 'test');
    sim.setTarget(1);
    const car = sim.cars[0]!;
    const lane = longLane();
    sim.place(car, lane.id, 0, 'car', 0);
    let worst = 0;
    for (let i = 0; i < 60 * 30; i++) {
      sim.update(1 / 60, car.x, car.z, []);
      if (!car.turning && car.swerve < 0.01) {
        const current = graph.lanes[car.lane]!;
        worst = Math.max(worst, Math.abs(sideOf(current, car.x, car.z) - LANE_OFFSETS[current.slot]));
      }
      expect(['asphalt', 'pavement']).toContain(surfaceAt(car.x, car.z));
    }
    expect(worst).toBeLessThan(0.05);
    expect(car.speed).toBeGreaterThan(1);
  });

  it('keeps its distance behind a slower car and stops for the player', () => {
    const lane = longLane();
    const sim = new TrafficSim(graph, 2, 'gap');
    sim.setTarget(2);
    const [lead, follower] = sim.cars as [NonNullable<(typeof sim.cars)[0]>, NonNullable<(typeof sim.cars)[0]>];
    sim.place(lead, lane.id, 40, 'keke', 0);
    sim.place(follower, lane.id, 5, 'car', 0);
    let minGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 60 * 6; i++) {
      sim.update(1 / 60, follower.x, follower.z, []);
      if (lead.lane === follower.lane && !lead.turning && !follower.turning) minGap = Math.min(minGap, Math.hypot(lead.x - follower.x, lead.z - follower.z));
    }
    expect(minGap).toBeGreaterThan(5);

    const solo = new TrafficSim(graph, 1, 'stop');
    solo.setTarget(1);
    const car = solo.cars[0]!;
    solo.place(car, lane.id, 0, 'car', 0);
    const player: TrafficObstacle = { x: lane.x0 + lane.dx * 30, z: lane.z0 + lane.dz * 30, radius: 0.6, parked: false, active: true };
    for (let i = 0; i < 60 * 12; i++) solo.update(1 / 60, car.x, car.z, [player]);
    const ahead = (player.x - car.x) * lane.dx + (player.z - car.z) * lane.dz;
    expect(ahead).toBeGreaterThan(2);
    expect(car.speed).toBeLessThan(0.6);
  });

  it('drives round a player who has stopped in the lane', () => {
    const lane = longLane();
    const sim = new TrafficSim(graph, 1, 'swerve');
    sim.setTarget(1);
    const car = sim.cars[0]!;
    sim.place(car, lane.id, 0, 'car', 0);
    const parkedPlayer: TrafficObstacle = { x: lane.x0 + lane.dx * 30, z: lane.z0 + lane.dz * 30, radius: 1.6, parked: true, active: true };
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 60 * 10; i++) {
      sim.update(1 / 60, car.x, car.z, [parkedPlayer]);
      closest = Math.min(closest, Math.hypot(parkedPlayer.x - car.x, parkedPlayer.z - car.z));
    }
    const ahead = (car.x - parkedPlayer.x) * lane.dx + (car.z - parkedPlayer.z) * lane.dz;
    expect(ahead > 5 || car.lane !== lane.id).toBe(true);
    expect(closest).toBeGreaterThan(2.4);
  });

  it('passes a slow car in the next lane: traffic in the kerbside lane never blocks the overtaking lane', () => {
    const outer = graph.lanes.filter((lane) => lane.slot === 1 && lane.length > 60).sort((a, b) => b.length - a.length)[0]!;
    const inner = graph.lanes.find((lane) => lane.edge === outer.edge && lane.from === outer.from && lane.slot === 0)!;
    const sim = new TrafficSim(graph, 2, 'overtake');
    sim.setTarget(2);
    const [slow, fast] = sim.cars as [NonNullable<(typeof sim.cars)[0]>, NonNullable<(typeof sim.cars)[0]>];
    sim.place(slow, outer.id, 20, 'keke', 0);
    sim.place(fast, inner.id, 2, 'car', 0);
    let passed = false;
    for (let i = 0; i < 60 * 8 && !passed; i++) {
      sim.update(1 / 60, fast.x, fast.z, []);
      if (fast.lane !== inner.id || slow.lane !== outer.id) break;
      passed = (fast.x - slow.x) * outer.dx + (fast.z - slow.z) * outer.dz > 3;
    }
    expect(passed).toBe(true);
  });

  it('respawns cars near the focus and recycles distant ones', () => {
    const sim = new TrafficSim(graph, 8, 'spawn');
    const focus = { x: 0, z: 0 };
    sim.update(1 / 60, focus.x, focus.z, []);
    const active = sim.cars.filter((car) => car.active);
    expect(active.length).toBe(8);
    for (const car of active) expect(Math.hypot(car.x - focus.x, car.z - focus.z)).toBeLessThan(170);
  });
});
