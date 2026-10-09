import { Vector3, type Object3D, type PerspectiveCamera } from 'three';
import type { AvatarClip, AvatarHandle, AvatarStance } from '@/common/three/avatar';
import { controls, moveAxes } from '../../play/input/controls';
import { ColliderGrid } from '../../play/physics/collision';
import { angleDelta, clamp, wrapAngle, yawFromHeading } from '../../play/physics/math';
import { createWalker, stepWalker, type WalkWorld, type WalkerState } from '../../play/physics/walker';
import { gaitFor } from '../../play/runtime/play-runtime';
import { hotspotAt, type Hotspot } from '../hotspots/hotspots';
import { closestOnBox, rayHitsBox, type Box3 } from '../hotspots/objects';
import type { Arrival, PortalGeometry, Rect } from '../layouts/types';
import type { At, InteriorTemplate, Spot } from '../templates/types';
import {
  INTERIOR_WALKER_RADIUS,
  groundAt,
  roomBounds,
  roomColliders,
  roomPlatforms,
  type Platform,
} from './colliders';
import { hotspotLabelElements, portalLabelElements } from './home-view-store';
import { InteriorCamera, blocksView } from './interior-camera';
import { NavGrid, approachPoint } from './nav-grid';

/**
 * Walking around inside a home or a venue: the player's avatar on foot (the street's walker physics against the
 * room's walls and furniture), walking itself to an activity's spot when the server starts one (sleep → the bed,
 * drinks → a bar stool) and back up when it ends, through doors and stairs to other rooms, the close third-person
 * camera, and the hotspots (what's on offer where you stand, their floating markers). Mutable, allocation-free per
 * frame; React only feeds it rooms, activities and hotspots and reads it at a low rate.
 */

export interface RoomPhysics {
  readonly bounds: Rect;
  /** Everything the walker bumps into. */
  readonly grid: ColliderGrid;
  /** What the camera keeps clear of: walls and tall structures (stairs). Furniture is low enough to look over, and
   * someone in a shower cabin or a bunk would otherwise put the camera's focus inside a box. */
  readonly cameraGrid: ColliderGrid;
  readonly nav: NavGrid;
  /** Low platforms you step up onto (cinema tiers, a bandstand). */
  readonly platforms: readonly Platform[];
}

/** Height from which a structure blocks the walk camera. */
const CAMERA_SOLID = 2.2;

/** Colliders and the walkability grid of a (furnished) room with people standing at `people`. */
export function buildRoomPhysics(template: InteriorTemplate, people: readonly At[] = []): RoomPhysics {
  const bounds = roomBounds(template.room);
  const boxes = roomColliders(template, people);
  const grid = new ColliderGrid(boxes, 1);
  const cameraGrid = new ColliderGrid(
    boxes.filter((box) => box.height >= CAMERA_SOLID),
    1,
  );
  const nav = new NavGrid(bounds, (x, z) => !grid.overlaps(x, z, INTERIOR_WALKER_RADIUS + 0.04), 0.2);
  return { bounds, grid, cameraGrid, nav, platforms: roomPlatforms(template) };
}

export interface LoadedRoom {
  readonly roomId: string;
  readonly template: InteriorTemplate;
  readonly physics: RoomPhysics;
  readonly portals: readonly PortalGeometry[];
}

export type WalkPhase = 'free' | 'walking' | 'settling' | 'engaged' | 'rising';

export interface ActivityTarget {
  readonly animation: AvatarClip;
  /** Where it happens in this room, or null when it's in another room (walk out through `via`). */
  readonly spot: Spot | null;
  readonly via: PortalGeometry | null;
}

export interface HomeWalkEvents {
  /** The walker went through a portal: switch rooms. Return false if that can't happen right now. */
  onPortal(portal: PortalGeometry): boolean;
  onStep(): void;
  /** A hotspot's thing was tapped in 3D: open its card. */
  onPick?(hotspotId: string): void;
}

interface Pose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const SETTLE_SECONDS = 0.45;
const RISE_SECONDS = 0.35;
/** Give up walking somewhere after this long (stuck): snap instead. */
const WALK_TIMEOUT = 9;
const PORTAL_PUSH = 0.35;
const LABEL_RANGE = 5.5;
/** Hotspot markers fade out to this opacity across the room (walk camera); the one on offer is fully opaque. */
const MARKER_FAR_OPACITY = 0.5;
const MARKER_RANGE = 9;

const axes = { x: 0, y: 0 };
const fwd = { x: 0, z: 0 };
const intent = { dirX: 0, dirZ: 0, run: false };
const projected = new Vector3();
const ray = new Vector3();

/** Heading (shared convention) of something facing `rot` degrees (0 faces +Z). */
export const headingFromRot = (rot: number): number => Math.PI / 2 - (rot * Math.PI) / 180;

const inside = (x: number, z: number, rect: Rect, grow = 0): boolean =>
  x >= rect.minX - grow && x <= rect.maxX + grow && z >= rect.minZ - grow && z <= rect.maxZ + grow;

/** Avatar pose for a spot (room space). */
function spotPose(spot: Spot): Pose {
  const y = spot.at.length === 3 ? spot.at[1] : 0;
  return {
    x: spot.at[0],
    y,
    z: spot.at[spot.at.length - 1] as number,
    yaw: ((spot.rot ?? 0) * Math.PI) / 180,
  };
}

function sameSpot(a: Spot | null, b: Spot | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.animation === b.animation &&
    a.stance === b.stance &&
    (a.rot ?? 0) === (b.rot ?? 0) &&
    a.at.length === b.at.length &&
    a.at.every((value, i) => value === b.at[i])
  );
}

function sameActivity(a: ActivityTarget | null, b: ActivityTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.animation === b.animation && sameSpot(a.spot, b.spot) && a.via?.id === b.via?.id;
}

/** A point just in front of a portal, inside its trigger: walk here to go through. */
export function portalApproach(portal: PortalGeometry): At {
  return [portal.arrival.x + portal.inward[0] * 0.62, portal.arrival.z + portal.inward[1] * 0.62];
}

const ease = (t: number): number => t * t * (3 - 2 * t);

export class HomeWalkRuntime {
  readonly walker: WalkerState = createWalker(0, 0, Math.PI / 2, 0);
  readonly camera = new InteriorCamera();
  cameraMode: 'walk' | 'overview' = 'walk';
  phase: WalkPhase = 'free';
  roomId: string | null = null;
  /** Rendered avatar pose (room space). */
  readonly pose: Pose = { x: 0, y: 0, z: 0, yaw: 0 };

  private physics: RoomPhysics | null = null;
  private template: InteriorTemplate | null = null;
  private portals: readonly PortalGeometry[] = [];
  private loadedSeq = -1;
  private pendingSnap = false;
  private locked = 0;
  private cooldown = 0;
  private activity: ActivityTarget | null = null;
  private approach: At | null = null;
  private path: At[] = [];
  private goal: 'spot' | 'portal' | 'point' | null = null;
  private goalPortal: PortalGeometry | null = null;
  private walkTime = 0;
  private readonly from: Pose = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly to: Pose = { x: 0, y: 0, z: 0, yaw: 0 };
  private blend = 0;
  private avatar: AvatarHandle | null = null;
  private clip: AvatarClip | null = null;
  private stance: AvatarStance | undefined = undefined;
  private stepTimer = 0;
  private nudged = 0;
  private nudge = false;
  private events: HomeWalkEvents = { onPortal: () => false, onStep: () => undefined };
  /** The hotspot under the mouse (walk camera), the one hovered in the overview, and the one whose card is open. */
  hovered: string | null = null;
  private externalHover: string | null = null;
  private hitBox: Box3 | null = null;
  private hoverBox: Box3 | null = null;
  private selectedId: string | null = null;
  /** Edges box drawn around the hovered or chosen thing. */
  private highlight: Object3D | null = null;
  private hotspots: readonly Hotspot[] = [];
  /** Markers hidden and nothing offered (something you chose is running). */
  private hotspotsHidden = false;
  /** A marker you tapped: offered while you walk to it. */
  private picked: string | null = null;
  /** The hotspot on offer where you stand (id), read by React at a low rate. */
  offered: string | null = null;
  private readonly world: WalkWorld = {
    surfaceAt: () => 'ground',
    groundHeightAt: (x, z) => this.groundAt(x, z),
    resolve: (p) => {
      this.physics?.grid.resolveCircle(p, INTERIOR_WALKER_RADIUS);
    },
  };

  setEvents(events: HomeWalkEvents): void {
    this.events = events;
  }

  registerAvatar(handle: AvatarHandle | null): void {
    this.avatar = handle;
    this.clip = null;
  }

  setCameraMode(mode: 'walk' | 'overview'): void {
    if (mode === this.cameraMode) return;
    this.cameraMode = mode;
    controls.hover = null;
    this.hovered = null;
    if (mode === 'walk') this.camera.reset();
  }

  /** The thing hovered in the overview (pointer events there) and the hotspot whose card is open. */
  setFocus(hover: string | null, selected: string | null): void {
    this.externalHover = hover;
    this.selectedId = selected;
  }

  registerHighlight(object: Object3D | null): void {
    this.highlight = object;
  }

  /**
   * The hotspot whose thing (or one like it) a ray from the camera hits first (`grow` widens every box: fingers are
   * big). The box it hit is kept for the highlight.
   */
  private hotspotUnder(origin: Vector3, direction: Vector3, grow: number): Hotspot | null {
    if (this.hotspotsHidden) return null;
    let best: Hotspot | null = null;
    let bestT = Number.POSITIVE_INFINITY;
    for (const hotspot of this.hotspots) {
      for (let i = -1; i < hotspot.aliases.length; i++) {
        const box = i < 0 ? hotspot.box : (hotspot.aliases[i] as Box3);
        const t = rayHitsBox(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, box, grow);
        if (t !== null && t < bestT) {
          best = hotspot;
          bestT = t;
          this.hitBox = box;
        }
      }
    }
    return best;
  }

  /** Hover (walk camera, mouse) and the highlight box round the hovered or chosen thing. */
  private updateFocus(camera: PerspectiveCamera): void {
    const hover = this.cameraMode === 'walk' ? controls.hover : null;
    if (hover) {
      projected.set(hover.x, hover.y, 0.5).unproject(camera);
      ray.copy(projected).sub(camera.position).normalize();
      this.hovered = this.hotspotUnder(camera.position, ray, 0.08)?.id ?? null;
      if (this.hovered) this.hoverBox = this.hitBox;
    } else this.hovered = null;
    const highlight = this.highlight;
    if (!highlight) return;
    const id = this.hovered ?? this.externalHover ?? this.selectedId;
    const target =
      id && !this.hotspotsHidden ? this.hotspots.find((hotspot) => hotspot.id === id) : undefined;
    if (!target) {
      if (highlight.visible) highlight.visible = false;
      return;
    }
    const b = this.hovered === target.id && this.hoverBox ? this.hoverBox : target.box;
    highlight.visible = true;
    highlight.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
    highlight.scale.set(b.maxX - b.minX + 0.08, b.maxY - b.minY + 0.06, b.maxZ - b.minZ + 0.08);
  }

  /** True once after the player tried to walk during an activity (the UI explains why nothing happens). */
  takeNudge(): boolean {
    const nudge = this.nudge;
    this.nudge = false;
    return nudge;
  }

  get busy(): boolean {
    return this.activity !== null;
  }

  // ----- Hotspots ---------------------------------------------------------------------------------------------------

  /** The room's hotspots; `hidden` while something you chose is running (nothing is offered then). */
  setHotspots(hotspots: readonly Hotspot[], hidden: boolean): void {
    this.hotspots = hotspots;
    this.hotspotsHidden = hidden;
    if (hidden || (this.picked && !hotspots.some((hotspot) => hotspot.id === this.picked)))
      this.picked = null;
  }

  /** A marker was tapped: walk up to it, offering it on the way. False when you can't walk right now. */
  goToHotspot(id: string): boolean {
    const hotspot = this.hotspots.find((candidate) => candidate.id === id);
    const physics = this.physics;
    if (
      !hotspot ||
      !physics ||
      this.hotspotsHidden ||
      this.activity ||
      this.locked > 0 ||
      (this.phase !== 'free' && this.phase !== 'walking')
    )
      return false;
    this.picked = id;
    this.offered = id;
    const near = hotspotAt([hotspot], this.walker.x, this.walker.z);
    if (near) return true;
    // The free floor beside the thing, on your side of it (a bar is 5 m long: walk to the near end).
    const [cx, cz] = closestOnBox(hotspot.box, this.walker.x, this.walker.z);
    const target = physics.nav.nearestFree(cx, cz, hotspot.reach + 0.6) ?? [hotspot.at[0], hotspot.at[1]];
    this.walkTo(target, 'point');
    return true;
  }

  private updateOffer(): void {
    const engaged = this.phase === 'settling' || this.phase === 'engaged' || this.phase === 'rising';
    if (this.hotspotsHidden || this.activity || engaged) {
      this.offered = null;
      this.picked = null;
      return;
    }
    if (this.picked && this.phase === 'walking' && this.goal === 'point') {
      this.offered = this.picked;
      return;
    }
    this.picked = null;
    this.offered = hotspotAt(this.hotspots, this.walker.x, this.walker.z, this.offered)?.id ?? null;
  }

  // ----- Rooms ------------------------------------------------------------------------------------------------------

  /**
   * A room is on screen. With a new `seq` (or a different room) the player is placed by `arrival`; otherwise only the
   * colliders are refreshed (someone came in, furniture changed).
   */
  loadRoom(room: LoadedRoom, arrival: Arrival, seq: number): void {
    const placing = seq !== this.loadedSeq || room.roomId !== this.roomId;
    this.roomId = room.roomId;
    this.template = room.template;
    this.physics = room.physics;
    this.portals = room.portals;
    if (!placing) return;
    this.loadedSeq = seq;
    this.locked = 0;
    this.cooldown = 0.6;
    this.clearGoal();
    this.pendingSnap = arrival.kind === 'spot';
    const start = this.arrivalPoint(arrival);
    this.placeWalker(start[0], start[1], start[2]);
    this.phase = 'free';
    // The activity is re-applied for this room right after (React effect order).
    this.activity = null;
    this.camera.snap();
  }

  private arrivalPoint(arrival: Arrival): readonly [number, number, number] {
    let point: { readonly x: number; readonly z: number; readonly heading: number } | undefined;
    if (arrival.kind === 'portal')
      point = this.portals.find((portal) => portal.id === arrival.portal)?.arrival;
    else if (arrival.kind === 'enter')
      point = (this.portals.find((portal) => portal.to === null) ?? this.portals[0])?.arrival;
    if (!point) {
      const spot = this.template?.player.default;
      point = spot
        ? { x: spot.at[0], z: spot.at[spot.at.length - 1] as number, heading: headingFromRot(spot.rot ?? 0) }
        : { x: 0, z: 0, heading: Math.PI / 2 };
    }
    const free = this.physics?.nav.nearestFree(point.x, point.z, 2.5) ?? [point.x, point.z];
    return [free[0], free[1], point.heading];
  }

  private groundAt(x: number, z: number): number {
    return this.physics ? groundAt(this.physics.platforms, x, z) : 0;
  }

  /** Put the walker somewhere (dev hook, arrivals). */
  placeWalker(x: number, z: number, heading: number): void {
    const w = this.walker;
    w.x = x;
    w.z = z;
    w.y = this.groundAt(x, z);
    w.heading = heading;
    w.vx = w.vz = w.speed = 0;
    this.pose.x = x;
    this.pose.y = w.y;
    this.pose.z = z;
    this.pose.yaw = yawFromHeading(heading);
  }

  // ----- Activities -------------------------------------------------------------------------------------------------

  /** What the player is doing (from the server), or null when they're free to walk. Idempotent. */
  setActivity(next: ActivityTarget | null): void {
    if (sameActivity(this.activity, next)) return;
    this.activity = next;
    if (!next) {
      this.pendingSnap = false;
      if (this.phase === 'engaged' || this.phase === 'settling') this.rise();
      else if (this.phase === 'walking' && this.goal !== 'point') this.stop();
      return;
    }
    const seated = this.phase === 'engaged' || this.phase === 'settling';
    if (next.spot) {
      const target = spotPose(next.spot);
      const physics = this.physics;
      const approach = physics ? approachPoint(physics.nav, next.spot) : null;
      if (this.pendingSnap || !physics) {
        this.pendingSnap = false;
        this.approach = approach;
        if (approach) this.placeWalker(approach[0], approach[1], headingFromRot(next.spot.rot ?? 0));
        this.engage(target);
        return;
      }
      // Already sitting there (e.g. watching TV → playing games on the same sofa): just change the pose.
      if (seated && Math.hypot(target.x - this.to.x, target.z - this.to.z) < 0.05) {
        this.engage(target);
        return;
      }
      if (seated) this.standUp();
      this.approach = approach;
      this.walkTo(approach ?? [target.x, target.z], 'spot');
      return;
    }
    this.pendingSnap = false;
    if (seated) this.standUp();
    if (next.via) this.walkTo(portalApproach(next.via), 'portal', next.via);
  }

  private engage(target: Pose): void {
    this.clearGoal();
    this.to.x = target.x;
    this.to.y = target.y;
    this.to.z = target.z;
    this.to.yaw = target.yaw;
    Object.assign(this.pose, target);
    this.phase = 'engaged';
    this.camera.frameFront(target.yaw);
  }

  private settleInto(target: Pose): void {
    this.clearGoal();
    Object.assign(this.from, this.pose);
    Object.assign(this.to, target);
    this.blend = 0;
    this.phase = 'settling';
  }

  /** Get up from the spot back to where you walked in from. */
  private rise(): void {
    const back = this.approach ??
      this.physics?.nav.nearestFree(this.pose.x, this.pose.z, 2.5) ?? [this.pose.x, this.pose.z];
    Object.assign(this.from, this.pose);
    const w = this.walker;
    w.x = back[0];
    w.z = back[1];
    w.y = this.groundAt(back[0], back[1]);
    w.heading = Math.PI / 2 - this.pose.yaw;
    w.vx = w.vz = w.speed = 0;
    this.to.x = back[0];
    this.to.y = w.y;
    this.to.z = back[1];
    this.to.yaw = this.pose.yaw;
    this.blend = 0;
    this.phase = 'rising';
  }

  /** Instantly on your feet at the approach point (switching activity). */
  private standUp(): void {
    const back = this.approach ?? [this.walker.x, this.walker.z];
    this.placeWalker(back[0], back[1], Math.PI / 2 - this.pose.yaw);
    this.phase = 'free';
  }

  private stop(): void {
    this.clearGoal();
    this.phase = 'free';
  }

  private clearGoal(): void {
    this.path = [];
    this.goal = null;
    this.goalPortal = null;
    this.walkTime = 0;
  }

  private walkTo(target: At, goal: 'spot' | 'portal' | 'point', portal: PortalGeometry | null = null): void {
    const path = this.physics?.nav.findPath([this.walker.x, this.walker.z], target) ?? null;
    if (!path) {
      this.giveUp(goal, portal);
      return;
    }
    this.path = path;
    this.goal = goal;
    this.goalPortal = portal;
    this.walkTime = 0;
    this.phase = 'walking';
  }

  /** Couldn't walk there: snap into the spot, or go through the door anyway (the room change fades). */
  private giveUp(goal: 'spot' | 'portal' | 'point', portal: PortalGeometry | null): void {
    const spot = this.activity?.spot;
    if (goal === 'spot' && spot) this.settleInto(spotPose(spot));
    else if (goal === 'portal' && portal) this.goThrough(portal);
    else this.stop();
  }

  private goThrough(portal: PortalGeometry): void {
    this.clearGoal();
    this.phase = 'free';
    this.locked = 2.5;
    this.walker.vx = this.walker.vz = 0;
    if (!this.events.onPortal(portal)) this.locked = 0;
  }

  // ----- Frame ------------------------------------------------------------------------------------------------------

  /**
   * One frame: input, walking/activity, the avatar, the camera and the door labels. `people` is the group of other
   * people's avatars: those blocking the walk camera's view are hidden.
   */
  frame(
    camera: PerspectiveCamera,
    dt: number,
    now: number,
    width: number,
    height: number,
    people: Object3D | null = null,
  ): void {
    if (!this.physics) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.locked = Math.max(0, this.locked - dt);
    if (this.cameraMode === 'walk') {
      this.camera.applyInput(controls.lookX, controls.lookY, controls.zoom);
      this.handleTap(camera);
    }
    controls.lookX = controls.lookY = controls.zoom = 0;
    controls.taps.length = 0;

    moveAxes(axes);
    const steering = Math.hypot(axes.x, axes.y) > 0.15;
    if (this.locked > 0) axes.x = axes.y = 0;
    // A walk you asked for (tap) gives way to the stick; one the game started (an activity) doesn't.
    if (this.phase === 'walking' && steering && this.locked <= 0 && (this.goal === 'point' || !this.activity))
      this.stop();

    switch (this.phase) {
      case 'free':
        this.stepFree(camera, dt);
        break;
      case 'walking':
        this.stepPath(dt);
        break;
      case 'settling':
      case 'rising':
        this.stepBlend(dt);
        break;
      case 'engaged':
        break;
    }
    if (this.activity && steering && this.locked <= 0 && this.phase !== 'free') {
      this.nudged += dt;
      if (this.nudged > 0.6) {
        this.nudge = true;
        this.nudged = -6;
      }
    } else if (this.nudged > 0) this.nudged = 0;
    else this.nudged = Math.min(0, this.nudged + dt);

    if (this.phase === 'free' || this.phase === 'walking') {
      const w = this.walker;
      this.pose.x = w.x;
      this.pose.y = w.y;
      this.pose.z = w.z;
      this.pose.yaw = yawFromHeading(w.heading);
      this.stepTimer += dt * w.speed;
      if (this.stepTimer > 0.95) {
        this.stepTimer = 0;
        this.events.onStep();
      }
    }
    this.placeAvatar();

    if (this.cameraMode === 'walk') {
      const moving = this.phase === 'free' || this.phase === 'walking';
      this.camera.update(
        camera,
        {
          x: this.pose.x,
          y: this.pose.y * 0.5,
          z: this.pose.z,
          heading: this.walker.heading,
          speed: moving ? this.walker.speed : 0,
        },
        dt,
        (now - controls.lastLookAt) / 1000,
        this.physics.cameraGrid,
        width / Math.max(1, height),
      );
    }
    this.updateOffer();
    this.updateFocus(camera);
    this.hideOccluders(camera, people);
    this.placeLabels(camera, width, height);
    this.placeMarkers(camera, width, height, now);
  }

  /** Hide anyone standing between the walk camera and the player (or right in front of the lens). */
  private hideOccluders(camera: PerspectiveCamera, people: Object3D | null): void {
    if (!people) return;
    const focus = this.camera.focus;
    const c = camera.position;
    for (const child of people.children) {
      if (child.type !== 'Group') continue;
      const p = child.position;
      const hide =
        this.cameraMode === 'walk' &&
        (blocksView(p.x, p.y + 0.6, p.z, c.x, c.y, c.z, focus.x, focus.y, focus.z) ||
          blocksView(p.x, p.y + 1.05, p.z, c.x, c.y, c.z, focus.x, focus.y, focus.z));
      if (child.visible === hide) child.visible = !hide;
    }
  }

  /** Show everyone again (leaving the walk). */
  showEveryone(people: Object3D | null): void {
    for (const child of people?.children ?? []) child.visible = true;
  }

  private cameraForward(camera: PerspectiveCamera): void {
    if (this.cameraMode === 'walk') {
      this.camera.forward(fwd);
      return;
    }
    camera.getWorldDirection(ray);
    const length = Math.hypot(ray.x, ray.z) || 1;
    fwd.x = ray.x / length;
    fwd.z = ray.z / length;
  }

  private stepFree(camera: PerspectiveCamera, dt: number): void {
    this.cameraForward(camera);
    // Right of the camera's forward: (-z, x).
    intent.dirX = fwd.x * axes.y - fwd.z * axes.x;
    intent.dirZ = fwd.z * axes.y + fwd.x * axes.x;
    intent.run = controls.run;
    stepWalker(this.walker, intent, dt, this.world);
    if (this.cooldown > 0 || this.locked > 0) return;
    const w = this.walker;
    for (const portal of this.portals) {
      if (!portal.to || !inside(w.x, w.z, portal.trigger)) continue;
      if (w.vx * portal.inward[0] + w.vz * portal.inward[1] > PORTAL_PUSH) {
        this.goThrough(portal);
        return;
      }
    }
  }

  private stepPath(dt: number): void {
    const w = this.walker;
    if (this.goal === 'portal' && this.goalPortal && inside(w.x, w.z, this.goalPortal.trigger)) {
      this.goThrough(this.goalPortal);
      return;
    }
    this.walkTime += dt;
    if (this.walkTime > WALK_TIMEOUT) {
      this.giveUp(this.goal ?? 'point', this.goalPortal);
      return;
    }
    let next = this.path[0];
    while (next) {
      const last = this.path.length === 1;
      const d = Math.hypot(next[0] - w.x, next[1] - w.z);
      if (d > (last ? 0.1 : 0.28)) break;
      this.path.shift();
      next = this.path[0];
    }
    if (!next) {
      this.arrive();
      return;
    }
    const dx = next[0] - w.x;
    const dz = next[1] - w.z;
    const d = Math.hypot(dx, dz) || 1;
    const scale = this.path.length === 1 ? clamp(d / 0.6, 0.35, 1) : 1;
    intent.dirX = (dx / d) * scale;
    intent.dirZ = (dz / d) * scale;
    intent.run = false;
    stepWalker(w, intent, dt, this.world);
  }

  private arrive(): void {
    const goal = this.goal;
    const portal = this.goalPortal;
    if (goal === 'spot' && this.activity?.spot) this.settleInto(spotPose(this.activity.spot));
    else if (goal === 'portal' && portal) this.goThrough(portal);
    else this.stop();
  }

  private stepBlend(dt: number): void {
    const seconds = this.phase === 'settling' ? SETTLE_SECONDS : RISE_SECONDS;
    this.blend = Math.min(1, this.blend + dt / seconds);
    const t = ease(this.blend);
    this.pose.x = this.from.x + (this.to.x - this.from.x) * t;
    this.pose.y = this.from.y + (this.to.y - this.from.y) * t;
    this.pose.z = this.from.z + (this.to.z - this.from.z) * t;
    this.pose.yaw = wrapAngle(this.from.yaw + angleDelta(this.from.yaw, this.to.yaw) * Math.min(1, t * 1.6));
    if (this.blend >= 1) {
      if (this.phase === 'settling') this.camera.frameFront(this.to.yaw);
      this.phase = this.phase === 'settling' ? 'engaged' : 'free';
    }
  }

  private placeAvatar(): void {
    const avatar = this.avatar;
    const object = avatar?.object;
    if (!avatar || !object) return;
    object.position.set(this.pose.x, this.pose.y, this.pose.z);
    object.rotation.y = this.pose.yaw;
    const activity = this.activity;
    if ((this.phase === 'settling' || this.phase === 'engaged') && activity) {
      this.play(activity.animation, activity.spot?.stance, 1);
      return;
    }
    if (this.phase === 'rising') {
      this.play('idle', undefined, 1);
      return;
    }
    const gait = gaitFor(this.walker.speed, 1);
    this.play(gait.clip, undefined, gait.timeScale);
  }

  private play(clip: AvatarClip, stance: AvatarStance | undefined, timeScale: number): void {
    const avatar = this.avatar;
    if (!avatar) return;
    if (clip !== this.clip || stance !== this.stance) {
      this.clip = clip;
      this.stance = stance;
      avatar.play(clip, { fade: 0.28, stance });
    }
    avatar.setTimeScale(timeScale);
  }

  /**
   * A tap on a thing (the bar, a bed, the front desk) opens its card; on the floor it walks there; on a door marker,
   * through the door. Walking only when you're free.
   */
  private handleTap(camera: PerspectiveCamera): void {
    const tap = controls.taps[controls.taps.length - 1];
    if (!tap) return;
    projected.set(tap.x, tap.y, 0.5).unproject(camera);
    ray.copy(projected).sub(camera.position).normalize();
    const thing = this.hotspotUnder(camera.position, ray, 0.22);
    if (thing) {
      this.events.onPick?.(thing.id);
      return;
    }
    if (this.locked > 0 || this.activity || (this.phase !== 'free' && this.phase !== 'walking')) return;
    if (ray.y > -0.02) return;
    const t = -camera.position.y / ray.y;
    const x = camera.position.x + ray.x * t;
    const z = camera.position.z + ray.z * t;
    for (const portal of this.portals) {
      if (portal.to && inside(x, z, portal.trigger, 0.45)) {
        this.walkTo(portalApproach(portal), 'portal', portal);
        return;
      }
    }
    const bounds = this.physics?.bounds;
    if (bounds && inside(x, z, bounds)) this.walkTo([x, z], 'point');
  }

  /** Hotspot markers float over their spots, bobbing gently; hidden while you're busy or off screen. */
  private placeMarkers(camera: PerspectiveCamera, width: number, height: number, now: number): void {
    const t = now / 1000;
    for (let i = 0; i < this.hotspots.length; i++) {
      const hotspot = this.hotspots[i] as Hotspot;
      const element = hotspotLabelElements.get(hotspot.id);
      if (!element) continue;
      projected
        .set(hotspot.at[0], hotspot.y + Math.sin(t * 2.1 + i * 1.7) * 0.045, hotspot.at[1])
        .project(camera);
      const visible =
        !this.hotspotsHidden &&
        projected.z < 1 &&
        Math.abs(projected.x) < 1.05 &&
        Math.abs(projected.y) < 1.05;
      const visibility = visible ? 'visible' : 'hidden';
      if (element.style.visibility !== visibility) element.style.visibility = visibility;
      if (!visible) continue;
      const distance = Math.hypot(hotspot.at[0] - this.pose.x, hotspot.at[1] - this.pose.z);
      const opacity =
        hotspot.id === this.offered
          ? 1
          : this.cameraMode === 'walk'
            ? clamp(1.25 - distance / MARKER_RANGE, MARKER_FAR_OPACITY, 0.92)
            : 0.9;
      const sx = (projected.x * 0.5 + 0.5) * width;
      const sy = (-projected.y * 0.5 + 0.5) * height;
      element.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      element.style.opacity = opacity.toFixed(2);
      // Its name tag goes on the side with room (the right edge has the camera and rooms buttons).
      const side = sx > width * 0.55 ? 'left' : 'right';
      if (element.dataset.side !== side) element.dataset.side = side;
    }
  }

  private placeLabels(camera: PerspectiveCamera, width: number, height: number): void {
    for (const portal of this.portals) {
      const element = portalLabelElements.get(portal.id);
      if (!element) continue;
      const [lx, ly, lz] = portal.label;
      const distance = Math.hypot(lx - this.pose.x, lz - this.pose.z);
      const fade = this.cameraMode === 'walk' ? clamp(1.6 - distance / LABEL_RANGE, 0, 1) : 0.9;
      projected.set(lx, ly, lz).project(camera);
      if (fade <= 0.02 || projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
        element.style.opacity = '0';
        continue;
      }
      // Keep the whole label on screen (its width is layout-cached; only transforms change per frame).
      const half = element.offsetWidth / 2 + 8;
      const sx = clamp((projected.x * 0.5 + 0.5) * width, half, Math.max(half, width - half));
      const sy = Math.max(element.offsetHeight + 8, (-projected.y * 0.5 + 0.5) * height);
      element.style.transform = `translate(-50%, -100%) translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      element.style.opacity = fade.toFixed(2);
    }
  }
}
