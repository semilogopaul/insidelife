import { Frustum, Matrix4, Sphere, Vector3, type Group, type Object3D, type PerspectiveCamera } from 'three';
import { AVATAR_GAIT_SPEED, type AvatarClip, type AvatarHandle } from '@/common/three/avatar';
import { publishLivePose } from '../../navigation/live-pose';
import { CameraRig, type CameraMode, type CameraSubject } from '../camera/camera-rig';
import { controls, driveAxes, moveAxes } from '../input/controls';
import type { ColliderGrid } from '../physics/collision';
import { clamp, yawFromHeading } from '../physics/math';
import type { DriveIntent } from '../physics/vehicle';
import { PUSH_SPEED, PlayerController } from '../player/player-controller';
import { PACE_BOOST } from '../physics/walker';
import { cityLaneGraph } from '../traffic/lane-graph';
import { TrafficSim, type TrafficObstacle } from '../traffic/traffic-sim';
import type { VehicleBatch } from '../vehicles/vehicle-batch';

/**
 * Per-mount state of the play layer and its frame step. React components create the meshes and register them here;
 * the director calls `frame()` once per frame (before the city's shadow/LOD passes) to read input, step the player
 * and traffic, move the camera, publish the live pose and place the player's meshes. Everything is mutable and
 * allocation-free per frame; React state is only touched by low-rate hooks reading this object.
 */

export type PlayMode = 'walk' | 'drive' | 'ride';

/** The avatar is scaled up to read at street scale next to the city's vehicles. */
export const PLAYER_SCALE = 1.3;

/** Pose of a booked ride's vehicle (written by the ride layer). */
export interface RidePose {
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  active: boolean;
  /** Trekking: the player walks the route themselves. */
  onFoot: boolean;
  /** Visible seat for the player (okada pillion, keke bench), in vehicle-local metres (right, up, forward). */
  seat: { readonly x: number; readonly y: number; readonly z: number } | null;
}

export interface PlayRuntimeEvents {
  /** A footstep (walking). */
  onStep(): void;
  /** The car came to a stop after `requestExitCar()` and the player stepped out. */
  onExitedCar(): void;
}

export interface PlayRuntimeOptions {
  readonly colliders: ColliderGrid;
  readonly trafficCapacity: number;
  readonly seed: string;
  readonly reducedMotion: boolean;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

interface CarMeshes {
  readonly root: Group;
  readonly body: Object3D | null;
  readonly frontWheels: readonly Object3D[];
  readonly rearWheels: readonly Object3D[];
}

/** Locomotion clip for a ground speed, and the time scale that keeps its feet planted at the player's scale. */
export function gaitFor(speed: number, scale: number): { readonly clip: AvatarClip; readonly timeScale: number } {
  if (speed < 0.3) return { clip: 'idle', timeScale: 1 };
  // Gait changes sit between the walker's paces (walk 2.7, jog 5.2 m/s), the clip rate keeps up with them.
  const clip = speed < 2.5 * PACE_BOOST ? 'walk' : speed < 4.5 * PACE_BOOST ? 'jog' : 'run';
  return { clip, timeScale: clamp(speed / (AVATAR_GAIT_SPEED[clip] * scale), 0.6, 2.6 * PACE_BOOST) };
}

const fwd = { x: 0, z: 0 };
const axes = { x: 0, y: 0 };
const intent: DriveIntent = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const walkIntent = { dirX: 0, dirZ: 0, run: false };
const projScreen = new Matrix4();
const sphere = new Sphere(new Vector3(), 3);

export class PlayRuntime {
  readonly controller: PlayerController;
  readonly rig = new CameraRig();
  readonly traffic: TrafficSim;
  private grid: ColliderGrid;
  readonly ride: RidePose = { x: 0, y: 0.1, z: 0, heading: 0, speed: 0, active: false, onFoot: false, seat: null };
  readonly frustum = new Frustum();
  mode: PlayMode = 'walk';
  reducedMotion: boolean;
  invertSteering = false;
  /** Movement is frozen (walking through a door, server call in flight). */
  frozen = false;
  /** Player tapped another player (id) — offered on the context button for a while. */
  selectedPlayer: string | null = null;
  selectedAt = 0;
  /** Where the last taps landed on the ground or a wall (queued by the tap handler; the door walk-in consumes them). */
  tapPoints: { x: number; z: number }[] = [];
  /** Shared batch for traffic and other players' cars (set by the traffic layer once the kit has loaded). */
  vehicleBatch: VehicleBatch | null = null;
  /** m/s of speed lost in hard hits since the last heartbeat took them (crash damage, reported to the server). */
  bumps = 0;

  private avatar: AvatarHandle | null = null;
  private avatarClip: AvatarClip = 'idle';
  private carMeshes: CarMeshes | null = null;
  private readonly obstacles: TrafficObstacle[] = [
    { x: 0, z: 0, radius: 0.6, parked: false, active: true },
    { x: 0, z: 0, radius: 2.2, parked: true, active: false },
  ];
  private stepTimer = 0;
  private exitRequested = false;
  private stillFor = 0;
  private readonly subject: CameraSubject = { x: 0, y: 0, z: 0, heading: 0, speed: 0 };
  private events: PlayRuntimeEvents = { onStep: () => undefined, onExitedCar: () => undefined };

  constructor(options: PlayRuntimeOptions) {
    this.grid = options.colliders;
    this.reducedMotion = options.reducedMotion;
    this.controller = new PlayerController(options.colliders, options.x, options.z, options.heading);
    this.traffic = new TrafficSim(cityLaneGraph(), options.trafficCapacity, options.seed);
    this.rig.snapClear({ x: options.x, y: 0, z: options.z, heading: options.heading, speed: 0 }, options.colliders);
  }

  /** Swap the static colliders (the city plan changed: land bought, a house finished). */
  setColliders(colliders: ColliderGrid): void {
    if (colliders === this.grid) return;
    this.grid = colliders;
    this.controller.setColliders(colliders);
  }

  /** The static city colliders in use. */
  get colliders(): ColliderGrid {
    return this.grid;
  }

  // ----- Registration (from React) ----------------------------------------------------------------------------------

  registerAvatar(handle: AvatarHandle | null): void {
    this.avatar = handle;
    this.avatarClip = 'idle';
  }

  registerCar(meshes: CarMeshes | null): void {
    this.carMeshes = meshes;
  }

  // ----- Settings & wiring (methods, so React code never assigns into the runtime) ------------------------------

  setEvents(events: PlayRuntimeEvents): void {
    this.events = events;
  }

  setInvertSteering(invert: boolean): void {
    this.invertSteering = invert;
  }

  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  attachVehicleBatch(batch: VehicleBatch | null): void {
    this.vehicleBatch = batch;
  }

  /** A booked trip started: the camera follows the ride; your own car stays parked. */
  beginRide(onFoot: boolean, seat: RidePose['seat'], x: number, z: number, heading: number): void {
    if (this.mode === 'drive') this.controller.exitCar();
    this.mode = 'ride';
    const ride = this.ride;
    ride.active = true;
    ride.onFoot = onFoot;
    ride.seat = seat;
    ride.x = x;
    ride.z = z;
    ride.heading = heading;
    ride.speed = 0;
    this.rig.snap({ x, y: 0, z, heading, speed: 0 });
  }

  setRidePose(x: number, y: number, z: number, heading: number, speed: number): void {
    const ride = this.ride;
    ride.x = x;
    ride.y = y;
    ride.z = z;
    ride.heading = heading;
    ride.speed = speed;
  }

  /** The ride is over (or being torn down): back on foot where it ended. */
  endRide(): void {
    const ride = this.ride;
    ride.active = false;
    ride.seat = null;
    ride.onFoot = false;
    if (this.mode === 'ride') {
      this.mode = 'walk';
      this.controller.placeWalker(ride.x, ride.z, ride.heading);
    }
  }

  /** Put the player at a door (just stepped out), facing the street, with a clear camera. */
  placeAtDoor(x: number, z: number, heading: number): void {
    this.controller.placeWalker(x, z, heading);
    this.rig.snapClear({ x, y: 0, z, heading, speed: 0 }, this.colliders);
  }

  /** Get in the car if it's within reach. */
  enterCar(): boolean {
    if (this.mode !== 'walk' || !this.controller.enterCar()) return false;
    this.mode = 'drive';
    this.controller.driven = 0;
    this.exitRequested = false;
    return true;
  }

  /** Brake to a stop, then step out (`events.onExitedCar`). */
  requestExitCar(): void {
    if (this.mode === 'drive') this.exitRequested = true;
  }

  selectPlayer(id: string | null): void {
    this.selectedPlayer = id;
    this.selectedAt = performance.now();
  }

  // ----- Queries ----------------------------------------------------------------------------------------------------

  /** Is a world point roughly on screen (last frame's camera)? */
  visible(x: number, z: number, y = 1, radius = 3): boolean {
    sphere.center.set(x, y, z);
    sphere.radius = radius;
    return this.frustum.intersectsSphere(sphere);
  }

  readonly isVisible = (x: number, z: number): boolean => this.visible(x, z);

  get subjectX(): number {
    return this.mode === 'ride' ? this.ride.x : this.controller.x;
  }

  get subjectZ(): number {
    return this.mode === 'ride' ? this.ride.z : this.controller.z;
  }

  get subjectHeading(): number {
    return this.mode === 'ride' ? this.ride.heading : this.controller.heading;
  }

  get subjectSpeed(): number {
    return this.mode === 'ride' ? this.ride.speed : this.controller.speed;
  }

  // ----- Frame ------------------------------------------------------------------------------------------------------

  frame(camera: PerspectiveCamera, dt: number, now: number): void {
    const controller = this.controller;
    // Camera input.
    this.rig.applyInput(controls.lookX, controls.lookY, controls.zoom);
    controls.lookX = controls.lookY = controls.zoom = 0;

    // Traffic is solid for the player.
    controller.beginDynamic();
    const px = this.subjectX;
    const pz = this.subjectZ;
    for (const car of this.traffic.cars) {
      if (!car.active || Math.abs(car.x - px) > 30 || Math.abs(car.z - pz) > 30) continue;
      const half = car.kind === 'keke' ? 0.7 : 1.15;
      const radius = car.kind === 'keke' ? 0.85 : 1.25;
      const fx = Math.cos(car.heading) * half;
      const fz = Math.sin(car.heading) * half;
      controller.addDynamic(car.x + fx, car.z + fz, radius);
      controller.addDynamic(car.x - fx, car.z - fz, radius);
    }

    // Step the player.
    if (this.mode === 'walk') {
      moveAxes(axes);
      if (this.frozen) axes.x = axes.y = 0;
      this.rig.forward(fwd);
      // Right of the camera's forward: (-z, x).
      walkIntent.dirX = fwd.x * axes.y - fwd.z * axes.x;
      walkIntent.dirZ = fwd.z * axes.y + fwd.x * axes.x;
      walkIntent.run = controls.run;
      controller.stepWalk(walkIntent, dt);
      this.stepTimer += dt * controller.walker.speed;
      if (this.stepTimer > 1.15) {
        this.stepTimer = 0;
        this.events.onStep();
      }
    } else if (this.mode === 'drive') {
      driveAxes(intent, this.invertSteering);
      if (this.frozen || this.exitRequested) {
        intent.throttle = 0;
        intent.brake = Math.abs(controller.speed) > 0.5 ? 1 : 0;
        intent.steer = 0;
      } else if (controller.engineOff) {
        // No engine: it coasts to a stop, then you can only push it (walking pace, forwards or back).
        if (controller.speed > PUSH_SPEED) intent.throttle = 0;
        else intent.throttle = Math.min(intent.throttle, 0.12);
        if (controller.speed < -PUSH_SPEED || (controller.speed <= 0.3 && intent.brake > 0)) intent.brake = controller.speed < -PUSH_SPEED ? 0 : Math.min(intent.brake, 0.12);
      }
      controller.stepDrive(intent, dt);
      if (this.exitRequested && Math.abs(controller.speed) < 0.8) {
        this.exitRequested = false;
        if (controller.exitCar()) {
          this.mode = 'walk';
          this.events.onExitedCar();
        }
      }
      const impact = controller.car?.state.impact ?? 0;
      if (impact > 3) {
        this.rig.shake = Math.min(0.35, this.rig.shake + impact * 0.03);
        this.bumps = Math.min(200, this.bumps + impact);
      }
    }

    // The player (and their parked car) are obstacles for traffic.
    const me = this.obstacles[0] as TrafficObstacle;
    const parked = this.obstacles[1] as TrafficObstacle;
    me.x = this.subjectX;
    me.z = this.subjectZ;
    me.radius = this.mode === 'walk' ? 0.6 : 1.6;
    me.active = this.mode !== 'ride';
    // A player who has stopped in the road gets driven round rather than queued behind forever.
    this.stillFor = Math.abs(this.subjectSpeed) < 0.5 ? this.stillFor + dt : 0;
    me.parked = this.stillFor > 2.5;
    const car = controller.car;
    parked.active = this.mode === 'walk' && car !== null;
    if (car) {
      parked.x = car.state.x;
      parked.z = car.state.z;
    }
    this.traffic.update(dt, this.subjectX, this.subjectZ, this.obstacles, this.isVisible);

    // Camera.
    const cameraMode: CameraMode = this.mode;
    this.rig.setMode(cameraMode);
    const subject = this.subject;
    if (this.mode === 'ride') {
      subject.x = this.ride.x;
      subject.y = this.ride.y;
      subject.z = this.ride.z;
      subject.heading = this.ride.heading;
      subject.speed = this.ride.speed;
    } else {
      subject.x = controller.x;
      subject.y = controller.y;
      subject.z = controller.z;
      subject.heading = controller.heading;
      subject.speed = controller.speed;
    }
    this.rig.update(camera, subject, dt, (now - controls.lastLookAt) / 1000, this.colliders, this.reducedMotion);
    camera.updateMatrixWorld();
    projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(projScreen);

    publishLivePose(this.subjectX, this.subjectZ, this.subjectHeading, Math.abs(this.subjectSpeed));
    this.placeMeshes();
  }

  private playClip(clip: AvatarClip, timeScale: number): void {
    if (clip !== this.avatarClip) {
      this.avatarClip = clip;
      this.avatar?.play(clip, { fade: 0.22, stance: clip === 'sit' ? 'sit' : undefined });
    }
    this.avatar?.setTimeScale(timeScale);
  }

  private placeMeshes(): void {
    const controller = this.controller;
    const avatar = this.avatar?.object;
    if (avatar) {
      const ride = this.ride;
      const seated = this.mode === 'ride' && ride.seat !== null && !ride.onFoot;
      const walking = this.mode === 'walk' || (this.mode === 'ride' && ride.onFoot);
      avatar.visible = walking || seated;
      if (seated && ride.seat) {
        const fx = Math.cos(ride.heading);
        const fz = Math.sin(ride.heading);
        // Vehicle-local (right, up, forward) → world; right of travel is (-fz, fx).
        avatar.position.set(ride.x - fz * ride.seat.x + fx * ride.seat.z, ride.y + ride.seat.y, ride.z + fx * ride.seat.x + fz * ride.seat.z);
        avatar.rotation.y = yawFromHeading(ride.heading);
        this.playClip('sit', 1);
      } else if (walking) {
        const w = controller.walker;
        const x = this.mode === 'ride' ? ride.x : w.x;
        const z = this.mode === 'ride' ? ride.z : w.z;
        const y = this.mode === 'ride' ? ride.y : w.y;
        const heading = this.mode === 'ride' ? ride.heading : w.heading;
        const speed = this.mode === 'ride' ? ride.speed : w.speed;
        avatar.position.set(x, y, z);
        avatar.rotation.y = yawFromHeading(heading);
        const gait = gaitFor(speed, PLAYER_SCALE);
        this.playClip(gait.clip, gait.timeScale);
      }
    }
    const meshes = this.carMeshes;
    const car = controller.car;
    if (meshes) {
      meshes.root.visible = car !== null && this.mode !== 'ride';
      if (car) {
        const s = car.state;
        meshes.root.position.set(s.x, car.y, s.z);
        meshes.root.rotation.y = yawFromHeading(s.heading);
        for (const wheel of meshes.frontWheels) {
          wheel.rotation.y = -s.steer;
          wheel.rotation.x = car.spin;
        }
        for (const wheel of meshes.rearWheels) wheel.rotation.x = car.spin;
        if (meshes.body) {
          // A touch of body roll in corners and squat under acceleration.
          meshes.body.rotation.z = clamp(s.yawRate * s.speed * 0.0035, -0.045, 0.045);
        }
      }
    }
  }
}
