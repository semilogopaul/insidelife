import { CITY_MAP, createRng, type Rng } from '@insidelife/shared';
import { dampAngle } from '../physics/math';

/**
 * Ambient pedestrians on the pavements near the player: each walks along a road's pavement (between the junctions),
 * pauses now and then, turns back at the end, and is moved to a fresh pavement near the player once it falls out of
 * range. Seeded; no allocations per frame.
 */

/** On the road cell's pavement strip (asphalt ends at 4 m). */
export const PED_OFFSET = 4.55;
const JUNCTION_CLEAR = 6;
const SPAWN_MIN = 14;
const SPAWN_MAX = 55;
const DESPAWN = 75;

export interface Pedestrian {
  readonly index: number;
  active: boolean;
  x: number;
  z: number;
  heading: number;
  speed: number;
  /** Path: start point, unit direction and length (along a pavement). */
  sx: number;
  sz: number;
  dx: number;
  dz: number;
  length: number;
  along: number;
  dir: 1 | -1;
  pause: number;
  pace: number;
}

export class PedestrianSim {
  readonly peds: Pedestrian[] = [];
  private readonly rng: Rng;
  private target: number;

  constructor(capacity: number, seed: string) {
    this.rng = createRng(`peds:${seed}`);
    this.target = capacity;
    for (let i = 0; i < capacity; i++) {
      this.peds.push({ index: i, active: false, x: 0, z: 0, heading: 0, speed: 0, sx: 0, sz: 0, dx: 1, dz: 0, length: 0, along: 0, dir: 1, pause: 0, pace: 1.3 });
    }
  }

  setTarget(count: number): void {
    this.target = Math.max(0, Math.min(this.peds.length, count));
  }

  private spawn(ped: Pedestrian, focusX: number, focusZ: number, visible?: (x: number, z: number) => boolean): boolean {
    const { edges, nodes } = CITY_MAP;
    for (let attempt = 0; attempt < 30; attempt++) {
      const edge = edges[Math.floor(this.rng.next() * edges.length)];
      if (!edge || edge.bridge || edge.length < JUNCTION_CLEAR * 2 + 4) continue;
      const a = nodes[edge.a];
      if (!a) continue;
      const side = this.rng.next() < 0.5 ? 1 : -1;
      // Perpendicular (right of a → b): (-dz, dx).
      const sx = a.x + edge.dx * JUNCTION_CLEAR - edge.dz * PED_OFFSET * side;
      const sz = a.z + edge.dz * JUNCTION_CLEAR + edge.dx * PED_OFFSET * side;
      const length = edge.length - JUNCTION_CLEAR * 2;
      const along = this.rng.next() * length;
      const x = sx + edge.dx * along;
      const z = sz + edge.dz * along;
      const distance = Math.hypot(x - focusX, z - focusZ);
      if (distance < SPAWN_MIN || distance > SPAWN_MAX) continue;
      if (attempt < 20 && visible?.(x, z) && distance > 25) continue;
      ped.active = true;
      ped.sx = sx;
      ped.sz = sz;
      ped.dx = edge.dx;
      ped.dz = edge.dz;
      ped.length = length;
      ped.along = along;
      ped.dir = this.rng.next() < 0.5 ? 1 : -1;
      ped.pace = 1.1 + this.rng.next() * 0.55;
      ped.pause = this.rng.next() < 0.3 ? 1 + this.rng.next() * 3 : 0;
      ped.x = x;
      ped.z = z;
      ped.heading = Math.atan2(edge.dz * ped.dir, edge.dx * ped.dir);
      ped.speed = 0;
      return true;
    }
    return false;
  }

  update(dt: number, focusX: number, focusZ: number, playerX: number, playerZ: number, visible?: (x: number, z: number) => boolean): void {
    let active = 0;
    for (const ped of this.peds) if (ped.active) active++;
    for (const ped of this.peds) {
      if (ped.active && Math.hypot(ped.x - focusX, ped.z - focusZ) > DESPAWN && !(visible?.(ped.x, ped.z) ?? false)) {
        ped.active = false;
        active--;
      }
      if (!ped.active && active < this.target && this.spawn(ped, focusX, focusZ, visible)) active++;
      if (!ped.active) continue;

      // Step aside for the player: wait while they're right in front.
      const ahead = (playerX - ped.x) * Math.cos(ped.heading) + (playerZ - ped.z) * Math.sin(ped.heading);
      const blocked = ahead > 0 && ahead < 1.6 && Math.hypot(playerX - ped.x, playerZ - ped.z) < 1.4;
      if (ped.pause > 0 || blocked) {
        ped.pause = Math.max(0, ped.pause - dt);
        ped.speed = 0;
      } else {
        ped.speed = ped.pace;
        ped.along += ped.dir * ped.pace * dt;
        if (ped.along <= 0 || ped.along >= ped.length) {
          ped.along = Math.max(0, Math.min(ped.length, ped.along));
          ped.dir = ped.dir === 1 ? -1 : 1;
          ped.pause = 0.6 + this.rng.next() * 2.5;
        } else if (this.rng.next() < dt * 0.04) ped.pause = 1.5 + this.rng.next() * 3;
      }
      ped.x = ped.sx + ped.dx * ped.along;
      ped.z = ped.sz + ped.dz * ped.along;
      ped.heading = dampAngle(ped.heading, Math.atan2(ped.dz * ped.dir, ped.dx * ped.dir), 6, dt);
    }
  }
}
