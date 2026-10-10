import { MAP_KM_PER_WORLD_METRE, canDriveVehicle, findVehicle, litresForKm, type DrivenVehicleDto } from '@insidelife/shared';
import type { ColliderGrid, MutablePoint, PushResult } from '../physics/collision';
import { pushOutOfCircle } from '../physics/collision';
import { damp } from '../physics/math';
import { drivable, groundHeightAt, surfaceAt, walkable } from '../physics/surface';
import { createVehicle, stepVehicle, vehicleSpecFor, type DriveIntent, type DriveWorld, type VehicleSpec, type VehicleState } from '../physics/vehicle';
import { WALKER_RADIUS, createWalker, stepWalker, type WalkIntent, type WalkWorld, type WalkerState } from '../physics/walker';
import { isDrivableModel, type DrivableModel } from '../vehicles/vehicle-kit';

/**
 * The player in the open world: on foot or at the wheel of their own car. Owns the physics state (plain objects,
 * mutated per frame), the transitions between walking and driving, and the collision world (static city colliders
 * plus dynamic circles — traffic — refreshed by the director each frame). No React, no three.js.
 */

export type Locomotion = 'walk' | 'drive';

export interface OwnCar {
  readonly vehicle: DrivenVehicleDto;
  readonly model: DrivableModel;
  readonly spec: VehicleSpec;
  readonly state: VehicleState;
  /** Rendered ride height (smoothed ground height). */
  y: number;
  /** Wheel spin angle (rad). */
  spin: number;
  /**
   * Running state: the server's (spawn, then every heartbeat), with the fuel burnt since then estimated locally so the
   * gauge moves and the engine dies on time. The server stays the judge (it refuses car moves it won't fuel).
   */
  readonly running: { fuelLitres: number; tankLitres: number; condition: number; brokenDown: boolean };
}

/** Pushing a dead car (no fuel, broken down): walking pace at most, forwards or back. */
export const PUSH_SPEED = 1.4;

/** How close (to the car centre) you must be to get in. */
export const CAR_REACH = 4.4;
const MAX_DYNAMIC = 96;

export class PlayerController {
  readonly walker: WalkerState;
  car: OwnCar | null = null;
  locomotion: Locomotion = 'walk';
  /** Metres driven since the counter was last reset (fuel estimate). */
  driven = 0;
  private colliders: ColliderGrid;
  /** Dynamic obstacle circles (x, z, r) refreshed every frame. */
  private readonly dynamic = new Float32Array(MAX_DYNAMIC * 3);
  private dynamicCount = 0;

  private readonly walkWorld: WalkWorld;
  private readonly driveWorld: DriveWorld;

  constructor(colliders: ColliderGrid, x: number, z: number, heading: number) {
    this.colliders = colliders;
    this.walker = createWalker(x, z, heading, groundHeightAt(x, z));
    this.walkWorld = {
      surfaceAt,
      groundHeightAt,
      resolve: (p, radius) => {
        this.colliders.resolveCircle(p, radius);
        this.resolveDynamic(p, radius, true);
      },
    };
    this.driveWorld = {
      surfaceAt,
      resolve: (p, radius, out) => {
        const moved = this.colliders.resolveCircle(p, radius, out);
        const beforeX = p.x;
        const beforeZ = p.z;
        if (this.resolveDynamic(p, radius, false)) {
          out.nx += p.x - beforeX;
          out.nz += p.z - beforeZ;
          return true;
        }
        return moved;
      },
    };
  }

  /** The city changed under us (your own house went up): collide with the new plan from now on. */
  setColliders(colliders: ColliderGrid): void {
    this.colliders = colliders;
  }

  // ----- Dynamic obstacles ------------------------------------------------------------------------------------------

  beginDynamic(): void {
    this.dynamicCount = 0;
  }

  addDynamic(x: number, z: number, radius: number): void {
    if (this.dynamicCount >= MAX_DYNAMIC) return;
    const o = this.dynamicCount * 3;
    this.dynamic[o] = x;
    this.dynamic[o + 1] = z;
    this.dynamic[o + 2] = radius;
    this.dynamicCount++;
  }

  private resolveDynamic(p: MutablePoint, radius: number, includeOwnCar: boolean): boolean {
    let moved = false;
    for (let i = 0; i < this.dynamicCount; i++) {
      const o = i * 3;
      if (pushOutOfCircle(p, radius, this.dynamic[o] as number, this.dynamic[o + 1] as number, this.dynamic[o + 2] as number) > 0) moved = true;
    }
    // The parked car is solid for the walker.
    const car = this.car;
    if (includeOwnCar && car && this.locomotion === 'walk') {
      const s = car.state;
      const reach = car.spec.halfLength - car.spec.halfWidth;
      const fx = Math.cos(s.heading);
      const fz = Math.sin(s.heading);
      for (let i = -1; i <= 1; i++) {
        if (pushOutOfCircle(p, radius, s.x + fx * reach * i, s.z + fz * reach * i, car.spec.halfWidth * 0.95) > 0) moved = true;
      }
    }
    return moved;
  }

  // ----- Placement --------------------------------------------------------------------------------------------------

  placeWalker(x: number, z: number, heading: number): void {
    const w = this.walker;
    w.x = x;
    w.z = z;
    w.heading = heading;
    w.vx = w.vz = w.speed = 0;
    w.y = groundHeightAt(x, z);
    this.locomotion = 'walk';
  }

  /** Park the player's car near (x, z) facing `heading`, nudged along the kerb to a free spot. */
  setCar(vehicle: DrivenVehicleDto | null, x: number, z: number, heading: number): void {
    if (!vehicle) {
      this.car = null;
      if (this.locomotion === 'drive') this.locomotion = 'walk';
      return;
    }
    const model: DrivableModel = isDrivableModel(vehicle.model) ? vehicle.model : 'sedan';
    const spec = vehicleSpecFor(model, findVehicle(vehicle.vehicleId)?.performance);
    const spot = this.freeSpot(x, z, heading, spec);
    const state = createVehicle(spot.x, spot.z, heading);
    // A pose saved by an older client has no running state: assume it runs until the first heartbeat says otherwise.
    const tankLitres = vehicle.tankLitres ?? 45;
    const running = { fuelLitres: vehicle.fuelLitres ?? tankLitres, tankLitres, condition: vehicle.condition ?? 70, brokenDown: vehicle.brokenDown ?? false };
    this.car = { vehicle, model, spec, state, y: groundHeightAt(spot.x, spot.z), spin: 0, running };
  }

  private carFits(x: number, z: number, heading: number, spec: VehicleSpec): boolean {
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    const reach = spec.halfLength - spec.halfWidth;
    for (let i = -1; i <= 1; i++) {
      const cx = x + fx * reach * i;
      const cz = z + fz * reach * i;
      if (this.colliders.overlaps(cx, cz, spec.halfWidth * 0.9)) return false;
      if (!drivable(surfaceAt(cx, cz))) return false;
    }
    return true;
  }

  private freeSpot(x: number, z: number, heading: number, spec: VehicleSpec): MutablePoint {
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    for (const offset of [0, 5, -5, 10, -10, 15, -15, 20, -20]) {
      const px = x + fx * offset;
      const pz = z + fz * offset;
      if (this.carFits(px, pz, heading, spec)) return { x: px, z: pz };
    }
    return { x, z };
  }

  // ----- Car doors --------------------------------------------------------------------------------------------------

  /** The engine won't run (out of fuel, broken down, too far gone): the car can only be pushed. */
  get engineOff(): boolean {
    return this.car !== null && !canDriveVehicle(this.car.running);
  }

  /** The server's view of the car after a heartbeat, a fill-up or a repair. */
  applyCarStatus(status: Pick<DrivenVehicleDto, 'ownedVehicleId' | 'fuelLitres' | 'tankLitres' | 'condition' | 'brokenDown'>): void {
    const car = this.car;
    if (!car || car.vehicle.ownedVehicleId !== status.ownedVehicleId) return;
    car.running.fuelLitres = status.fuelLitres;
    car.running.tankLitres = status.tankLitres;
    car.running.condition = status.condition;
    car.running.brokenDown = status.brokenDown;
  }

  /** Distance from the walker to the car centre (∞ without a car). */
  distanceToCar(): number {
    if (!this.car) return Number.POSITIVE_INFINITY;
    return Math.hypot(this.car.state.x - this.walker.x, this.car.state.z - this.walker.z);
  }

  /**
   * Walk up to the car's nearer side (a tap on your car from a few metres away): the walker is put beside the door,
   * within reach. Returns false without a car or when it's further than `maxDistance`.
   */
  stepBesideCar(maxDistance: number): boolean {
    const car = this.car;
    if (this.locomotion !== 'walk' || !car || this.distanceToCar() > maxDistance) return false;
    if (this.distanceToCar() <= CAR_REACH) return true;
    const s = car.state;
    // Right of travel is (-sin, cos); pick the side the walker is on.
    const rx = -Math.sin(s.heading);
    const rz = Math.cos(s.heading);
    const side = (this.walker.x - s.x) * rx + (this.walker.z - s.z) * rz >= 0 ? 1 : -1;
    const offset = car.spec.halfWidth + 0.8;
    const x = s.x + rx * offset * side;
    const z = s.z + rz * offset * side;
    this.placeWalker(x, z, Math.atan2(s.z - z, s.x - x));
    return true;
  }

  canEnterCar(): boolean {
    return this.locomotion === 'walk' && this.car !== null && this.distanceToCar() <= CAR_REACH;
  }

  enterCar(): boolean {
    if (!this.canEnterCar()) return false;
    this.locomotion = 'drive';
    const car = this.car as OwnCar;
    car.state.vx = car.state.vz = car.state.speed = car.state.steer = 0;
    return true;
  }

  /** Step out on the driver's side (left), else the passenger side, else behind the car. */
  exitCar(): boolean {
    const car = this.car;
    if (this.locomotion !== 'drive' || !car) return false;
    const s = car.state;
    const fx = Math.cos(s.heading);
    const fz = Math.sin(s.heading);
    // Left of travel: (fz, -fx).
    const side = car.spec.halfWidth + 0.75;
    const candidates: readonly (readonly [number, number])[] = [
      [s.x + fz * side - fx * 0.6, s.z - fx * side - fz * 0.6],
      [s.x - fz * side - fx * 0.6, s.z + fx * side - fz * 0.6],
      [s.x - fx * (car.spec.halfLength + 0.8), s.z - fz * (car.spec.halfLength + 0.8)],
      [s.x + fx * (car.spec.halfLength + 0.8), s.z + fz * (car.spec.halfLength + 0.8)],
    ];
    let spot = candidates[0] as readonly [number, number];
    for (const candidate of candidates) {
      if (walkable(surfaceAt(candidate[0], candidate[1])) && !this.colliders.overlaps(candidate[0], candidate[1], WALKER_RADIUS)) {
        spot = candidate;
        break;
      }
    }
    s.vx = s.vz = s.speed = 0;
    s.steer = 0;
    this.placeWalker(spot[0], spot[1], s.heading);
    return true;
  }

  // ----- Stepping ---------------------------------------------------------------------------------------------------

  stepWalk(intent: WalkIntent, dt: number): void {
    stepWalker(this.walker, intent, dt, this.walkWorld);
  }

  stepDrive(intent: DriveIntent, dt: number): void {
    const car = this.car;
    if (!car) return;
    const s = car.state;
    const x0 = s.x;
    const z0 = s.z;
    // Sub-step for stable collisions at speed.
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    for (let i = 0; i < steps; i++) stepVehicle(s, intent, car.spec, dt / steps, this.driveWorld);
    const moved = Math.hypot(s.x - x0, s.z - z0);
    this.driven += moved;
    car.running.fuelLitres = Math.max(0, car.running.fuelLitres - litresForKm(car.vehicle, moved * MAP_KM_PER_WORLD_METRE));
    car.y += (groundHeightAt(s.x, s.z) - car.y) * damp(12, dt);
    car.spin += (s.speed / (0.3 * 1.73)) * dt;
    // The walker rides along (hidden) so leaving the car and the GPS stay consistent.
    this.walker.x = s.x;
    this.walker.z = s.z;
    this.walker.heading = s.heading;
    this.walker.speed = Math.abs(s.speed);
  }

  /** Pose of whatever the camera follows. */
  get x(): number {
    return this.locomotion === 'drive' && this.car ? this.car.state.x : this.walker.x;
  }

  get z(): number {
    return this.locomotion === 'drive' && this.car ? this.car.state.z : this.walker.z;
  }

  get y(): number {
    return this.locomotion === 'drive' && this.car ? this.car.y : this.walker.y;
  }

  get heading(): number {
    return this.locomotion === 'drive' && this.car ? this.car.state.heading : this.walker.heading;
  }

  /** Signed speed (m/s). */
  get speed(): number {
    return this.locomotion === 'drive' && this.car ? this.car.state.speed : this.walker.speed;
  }
}

export type { PushResult };
