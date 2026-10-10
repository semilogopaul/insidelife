import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { controls, resetControls } from '../../play/input/controls';
import { HOME_LAYOUTS } from '../layouts/catalog';
import { findRoom, portalGeometry } from '../layouts/geometry';
import { FURNITURE_SCALE } from '../kit/furniture-kit';
import { FURNITURE_MANIFEST } from '../kit/kit-manifest';
import { bed, place, seat, stand } from '../templates/helpers';
import type { InteriorTemplate } from '../templates/types';
import { INTERIOR_WALKER_RADIUS, furnitureFootprint, propFootprint, roomColliders } from '../walk/colliders';
import { useHomeView, FADE_HOLD_MS, FADE_IN_MS } from '../walk/home-view-store';
import { HomeWalkRuntime, buildRoomPhysics, headingFromRot } from '../walk/home-walk-runtime';
import { OPEN_ARC, blocksView, clampYaw, framingScale, walkFov } from '../walk/interior-camera';
import { NavGrid, approachPoint } from '../walk/nav-grid';

describe('collision footprints', () => {
  it('sizes kit furniture by the manifest × kit scale × placement scale, turning with the piece', () => {
    const [w, , d] = FURNITURE_MANIFEST.bedDouble.size;
    const straight = furnitureFootprint(place('bedDouble', [1, 2], 0));
    expect(straight && straight.maxX - straight.minX).toBeCloseTo(w * FURNITURE_SCALE);
    expect(straight && straight.maxZ - straight.minZ).toBeCloseTo(d * FURNITURE_SCALE);
    const turned = furnitureFootprint(place('bedDouble', [1, 2], 90, { scale: 1.2 }));
    expect(turned && turned.maxX - turned.minX).toBeCloseTo(d * FURNITURE_SCALE * 1.2);
    expect(turned && turned.maxZ - turned.minZ).toBeCloseTo(w * FURNITURE_SCALE * 1.2);
    expect(turned?.minX).toBeCloseTo(1 - (d * FURNITURE_SCALE * 1.2) / 2);
  });

  it('lets you walk over rugs and ignores things on tables or walls; palms are only their trunk', () => {
    expect(furnitureFootprint(place('rugRectangle', [0, 0]))).toBeNull();
    expect(furnitureFootprint(place('laptop', [0, 0], 0, { y: 0.57 }))).toBeNull();
    expect(furnitureFootprint(place('kitchenCabinetUpper', [0, 0], 0, { y: 1.4 }))).toBeNull();
    const palm = furnitureFootprint(place('tree_palmShort', [0, 0], 0, { scale: 0.7 }));
    expect(palm && palm.maxX - palm.minX).toBeLessThan(0.5);
  });

  it('blocks on props that stand on the floor, not on wall signs or flat mats', () => {
    expect(
      propFootprint({
        kind: 'sign',
        at: [0, 0],
        wall: true,
        size: [1, 0.5],
        lines: ['X'],
        bg: '#000',
        fg: '#fff',
      }),
    ).toBeNull();
    expect(propFootprint({ kind: 'mat', at: [0, 0], size: [1, 2], color: '#000' })).toBeNull();
    const stairs = propFootprint({
      kind: 'stairs',
      at: [0, 0],
      rot: -90,
      size: [1.1, 3.0, 3.6],
      color: '#fff',
    });
    expect(stairs && stairs.maxX - stairs.minX).toBeCloseTo(3.6);
    expect(stairs?.height).toBeCloseTo(3.0);
    const well = propFootprint({ kind: 'stairwell', at: [0, 0], size: [1, 2.4], color: '#fff' });
    expect(well?.maxZ).toBeCloseTo(1.2);
  });

  it('walls the back and left, and fences the open cutaway edges at floor height', () => {
    const boxes = roomColliders({ ...TEST_ROOM, furniture: [], props: [] });
    expect(boxes).toHaveLength(4);
    expect(boxes.filter((box) => box.height === 0)).toHaveLength(2);
    expect(
      boxes.some((box) => box.maxZ === -TEST_ROOM.room.depth / 2 && box.height === TEST_ROOM.room.height),
    ).toBe(true);
  });
});

/** A 6 × 5 test room with a bed at the back and a sofa on the left. */
const TEST_ROOM: InteriorTemplate = {
  id: 'test-room',
  label: 'Test',
  room: {
    width: 6,
    depth: 5,
    height: 2.6,
    floor: 'tiles',
    floorColor: '#ccc',
    wall: { style: 'paint', color: '#eee' },
    doors: [{ wall: 'back', at: 2.2, width: 0.9 }],
  },
  furniture: [place('bedDouble', [-1.5, -1.6]), place('loungeSofa', [-2.6, 1.0], 90)],
  props: [],
  player: {
    default: stand([1, 1], 30),
    sleep: bed([-1.5, -1.6]),
    sit: seat([-2.5, 1.0], 90),
    cook: stand([1.5, -1.5], 180, 'cook'),
  },
  npcs: [],
  guests: [stand([2, 1.5], 200, 'talk')],
  lighting: { mood: 'home' },
};

describe('navigation grid', () => {
  const physics = buildRoomPhysics(TEST_ROOM);

  it('marks furniture and walls solid, open floor walkable', () => {
    expect(physics.nav.isFreeAt(1, 1)).toBe(true);
    expect(physics.nav.isFreeAt(-1.5, -1.6)).toBe(false);
    expect(physics.nav.isFreeAt(0, -2.45)).toBe(false);
    expect(physics.nav.isFreeAt(2.95, 0)).toBe(false);
  });

  it('finds a path round the bed, every leg clear', () => {
    const path = physics.nav.findPath([1.5, -2.0], [-2.3, -0.3]);
    expect(path).not.toBeNull();
    let from: readonly [number, number] = [1.5, -2.0];
    for (const point of path ?? []) {
      expect(physics.nav.clear(from[0], from[1], point[0], point[1])).toBe(true);
      from = point;
    }
    const end = path?.[path.length - 1];
    expect(Math.hypot((end?.[0] ?? 0) + 2.3, (end?.[1] ?? 0) + 0.3)).toBeLessThan(0.3);
  });

  it('returns null when the goal is sealed off', () => {
    const sealed = new NavGrid({ minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, (x) => x < 0.8 || x > 1.2);
    // The wall at x≈1 splits the grid: nothing walkable crosses it.
    expect(sealed.findPath([0.3, 1], [1.7, 1])).toBeNull();
  });

  it('approaches a bed from its foot and a seat from the front; a standing spot is its own approach', () => {
    const sleep = approachPoint(physics.nav, TEST_ROOM.player.sleep ?? stand([0, 0], 0));
    expect(sleep?.[1]).toBeGreaterThan(-0.75);
    expect(Math.abs((sleep?.[0] ?? 0) + 1.5)).toBeLessThan(0.3);
    const sit = approachPoint(physics.nav, TEST_ROOM.player.sit ?? stand([0, 0], 0));
    expect(sit?.[0]).toBeGreaterThan(-2.3);
    expect(approachPoint(physics.nav, TEST_ROOM.player.cook ?? stand([0, 0], 0))).toEqual([1.5, -1.5]);
  });
});

describe('interior camera', () => {
  it('keeps the camera on the open (front/right) side of the dollhouse', () => {
    const inArc = (yaw: number): boolean => {
      const offset = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
      return offset >= OPEN_ARC[0] - 1e-9 && offset <= OPEN_ARC[1] + 1e-9;
    };
    for (let yaw = -Math.PI; yaw <= Math.PI; yaw += 0.1)
      expect(inArc(clampYaw(yaw)), `yaw ${yaw.toFixed(2)}`).toBe(true);
    // Already fine: unchanged. Looking from behind the back wall: pulled round to the nearest open side.
    const ok = -Math.PI * 0.75;
    expect(clampYaw(ok)).toBeCloseTo(ok);
    // Camera behind the back wall (looking +z): swung to the nearer open side, the right.
    expect(clampYaw(Math.PI / 2)).toBeCloseTo(OPEN_ARC[0] + Math.PI);
  });

  it('frames a portrait phone wider than a laptop', () => {
    expect(walkFov(390 / 844)).toBeGreaterThan(walkFov(16 / 9));
    expect(framingScale(390 / 844)).toBeGreaterThan(framingScale(16 / 9));
    expect(framingScale(16 / 9)).toBe(1);
  });

  it('keeps clear of walls but sees over furniture, even from inside a shower cabin', () => {
    const master = findRoom(HOME_LAYOUTS['home-mansion'], 'master');
    if (!master) throw new Error('master suite');
    const physics = buildRoomPhysics(master.template);
    const shower = master.template.player.shower?.at ?? [0, 0];
    const [x, z] = [shower[0], shower[shower.length - 1] ?? 0];
    // Up and out towards the open front-right: the walker's grid says "inside the cabin", the camera's doesn't care.
    const dir = [0.45, 0.75, 0.48] as const;
    const length = Math.hypot(...dir);
    expect(physics.grid.raycast(x, 1.2, z, dir[0] / length, dir[1] / length, dir[2] / length, 6)).toBe(0);
    expect(physics.cameraGrid.raycast(x, 1.2, z, dir[0] / length, dir[1] / length, dir[2] / length, 6)).toBe(6);
    // Looking back through the back wall is blocked.
    expect(physics.cameraGrid.raycast(0, 1.2, 0, 0, 0.3, -0.95, 10)).toBeLessThan(4);
  });

  it('hides someone standing between the camera and the player', () => {
    expect(blocksView(1, 1, 1, 0, 2, 0, 3, 1, 3)).toBe(false);
    expect(blocksView(1.5, 1.5, 1.5, 0, 2, 0, 3, 1, 3)).toBe(true);
    expect(blocksView(-1, 1, -1, 0, 2, 0, 3, 1, 3)).toBe(false);
  });
});

describe('walking runtime', () => {
  afterEach(() => resetControls());

  const mansion = HOME_LAYOUTS['home-mansion'];
  const load = (roomId: string) => {
    const room = findRoom(mansion, roomId);
    if (!room) throw new Error(roomId);
    const portals = room.portals.map((spec) => portalGeometry(room.template, spec));
    return { roomId, template: room.template, physics: buildRoomPhysics(room.template), portals };
  };
  const run = (runtime: HomeWalkRuntime, seconds: number): void => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    for (let t = 0; t < seconds; t += 1 / 30) runtime.frame(camera, 1 / 30, t * 1000, 800, 600);
  };

  it('comes in at the front door, facing into the room', () => {
    const runtime = new HomeWalkRuntime();
    const living = load('living');
    runtime.loadRoom(living, { kind: 'enter' }, 1);
    const front = living.portals.find((portal) => portal.to === null);
    expect(runtime.walker.x).toBeCloseTo(front?.arrival.x ?? NaN, 0);
    expect(runtime.walker.heading).toBeCloseTo(0);
  });

  it('walks to the bed when sleep starts, lies down, and gets up when it ends', () => {
    const runtime = new HomeWalkRuntime();
    const master = load('master');
    runtime.loadRoom(master, { kind: 'portal', portal: 'cinema' }, 1);
    const spot = master.template.player.sleep ?? null;
    runtime.setActivity({ animation: 'sleep', spot, via: null });
    expect(runtime.phase).toBe('walking');
    run(runtime, 8);
    expect(runtime.phase).toBe('engaged');
    expect(runtime.pose.y).toBeCloseTo(spot?.at[1] ?? NaN);
    expect(runtime.pose.x).toBeCloseTo(spot?.at[0] ?? NaN);
    // Pushing the stick mid-activity does nothing (the server says you're asleep).
    controls.forward = true;
    run(runtime, 1);
    expect(runtime.phase).toBe('engaged');
    controls.forward = false;
    runtime.setActivity(null);
    expect(runtime.phase).toBe('rising');
    run(runtime, 1);
    expect(runtime.phase).toBe('free');
    expect(runtime.pose.y).toBe(0);
    expect(master.physics.nav.isFreeAt(runtime.walker.x, runtime.walker.z)).toBe(true);
  });

  it('snaps straight into the spot when the room opens on an activity', () => {
    const runtime = new HomeWalkRuntime();
    const kitchen = load('kitchen');
    runtime.loadRoom(kitchen, { kind: 'spot' }, 1);
    runtime.setActivity({ animation: 'cook', spot: kitchen.template.player.cook ?? null, via: null });
    expect(runtime.phase).toBe('engaged');
  });

  it('heads out through the door towards an activity in another room', () => {
    const runtime = new HomeWalkRuntime();
    const onPortal = vi.fn(() => true);
    runtime.setEvents({ onPortal, onStep: () => undefined });
    const kitchen = load('kitchen');
    runtime.loadRoom(kitchen, { kind: 'spot' }, 1);
    const door = kitchen.portals.find((portal) => portal.id === 'living') ?? null;
    runtime.setActivity({ animation: 'sleep', spot: null, via: door });
    run(runtime, 10);
    expect(onPortal).toHaveBeenCalledWith(door);
  });

  it('goes through a door you walk into, not one you merely brush past', () => {
    const runtime = new HomeWalkRuntime();
    const onPortal = vi.fn(() => true);
    runtime.setEvents({ onPortal, onStep: () => undefined });
    runtime.setCameraMode('overview');
    const kitchen = load('kitchen');
    const door = kitchen.portals[0];
    if (!door) throw new Error('kitchen door');
    runtime.loadRoom(kitchen, { kind: 'portal', portal: door.id }, 1);
    // Standing in front of the door facing away: nothing.
    run(runtime, 1);
    expect(onPortal).not.toHaveBeenCalled();
    // Walk into it (the overview camera's forward is world −z/−x-ish; place and push along `inward` directly).
    runtime.placeWalker(door.arrival.x, door.arrival.z, Math.atan2(door.inward[1], door.inward[0]));
    runtime.walker.vx = door.inward[0] * 1.5;
    runtime.walker.vz = door.inward[1] * 1.5;
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(door.arrival.x - door.inward[0] * 5, 5, door.arrival.z - door.inward[1] * 5);
    camera.lookAt(door.arrival.x, 0, door.arrival.z);
    controls.forward = true;
    for (let i = 0; i < 60 && onPortal.mock.calls.length === 0; i++)
      runtime.frame(camera, 1 / 30, 2000 + i * 33, 800, 600);
    expect(onPortal).toHaveBeenCalledWith(door);
  });

  it('leaves by the front door only after a short push into it, never straight after coming in', () => {
    const runtime = new HomeWalkRuntime();
    const onPortal = vi.fn(() => true);
    runtime.setEvents({ onPortal, onStep: () => undefined });
    runtime.setCameraMode('overview');
    const living = load('living');
    const front = living.portals.find((portal) => portal.to === null);
    if (!front) throw new Error('front door');
    runtime.loadRoom(living, { kind: 'enter' }, 1);
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(front.arrival.x - front.inward[0] * 5, 5, front.arrival.z - front.inward[1] * 5);
    camera.lookAt(front.arrival.x, 0, front.arrival.z);
    const push = (from: number, frames: number): void => {
      controls.forward = true;
      for (let i = 0; i < frames; i++) {
        runtime.walker.vx = front.inward[0] * 1.5;
        runtime.walker.vz = front.inward[1] * 1.5;
        runtime.frame(camera, 1 / 30, from + i * 33, 800, 600);
      }
      controls.forward = false;
    };
    // Arrived beside the door and pushing at it: inert until you step away from it first.
    runtime.placeWalker(front.arrival.x, front.arrival.z, Math.atan2(front.inward[1], front.inward[0]));
    push(1000, 40);
    expect(onPortal).not.toHaveBeenCalled();
    // Step away (into the room), then walk back into the door: not on the first frames, but within about half a second.
    runtime.placeWalker(front.arrival.x - front.inward[0] * 3, front.arrival.z - front.inward[1] * 3, 0);
    run(runtime, 0.3);
    runtime.placeWalker(front.arrival.x, front.arrival.z, Math.atan2(front.inward[1], front.inward[0]));
    push(4000, 5);
    expect(onPortal).not.toHaveBeenCalled();
    push(4200, 30);
    expect(onPortal).toHaveBeenCalledWith(front);
  });

  it('stays out of the furniture while walking freely', () => {
    const runtime = new HomeWalkRuntime();
    const living = load('living');
    runtime.loadRoom(living, { kind: 'enter' }, 1);
    controls.right = true;
    controls.forward = true;
    run(runtime, 6);
    const grid = living.physics.grid;
    expect(grid.overlaps(runtime.walker.x, runtime.walker.z, INTERIOR_WALKER_RADIUS - 0.03)).toBe(false);
  });

  it('converts a spot rotation to a walker heading', () => {
    expect(headingFromRot(0)).toBeCloseTo(Math.PI / 2);
    expect(headingFromRot(90)).toBeCloseTo(0);
  });
});

describe('home view store', () => {
  afterEach(() => {
    vi.useRealTimers();
    useHomeView.getState().leaveHouse('test');
  });

  it('dips to dark, swaps the room under cover, then lifts', () => {
    vi.useFakeTimers();
    const mansion = HOME_LAYOUTS['home-mansion'];
    useHomeView.getState().enterHouse('test', mansion, 'living', { kind: 'enter' });
    const seq = useHomeView.getState().arrivalSeq;
    expect(useHomeView.getState().go('kitchen', { kind: 'portal', portal: 'living' })).toBe(true);
    expect(useHomeView.getState().fading).toBe(true);
    // A second request while fading is refused.
    expect(useHomeView.getState().go('master', { kind: 'enter' })).toBe(false);
    expect(useHomeView.getState().roomId).toBe('living');
    vi.advanceTimersByTime(FADE_IN_MS);
    expect(useHomeView.getState().roomId).toBe('kitchen');
    expect(useHomeView.getState().arrivalSeq).toBe(seq + 1);
    vi.advanceTimersByTime(FADE_HOLD_MS);
    expect(useHomeView.getState().fading).toBe(false);
  });

  it('travels from the rooms menu, arriving by the door you would have used', () => {
    vi.useFakeTimers();
    useHomeView.getState().enterHouse('test', HOME_LAYOUTS['home-mansion'], 'kitchen', { kind: 'enter' });
    expect(useHomeView.getState().travel('master')).toBe(true);
    vi.advanceTimersByTime(FADE_IN_MS + FADE_HOLD_MS);
    expect(useHomeView.getState().roomId).toBe('master');
    expect(useHomeView.getState().arrival).toEqual({ kind: 'portal', portal: 'cinema' });
    expect(useHomeView.getState().travel('master')).toBe(false);
  });

  it('remembers the camera choice and forgets the house on leaving', () => {
    useHomeView.getState().enterHouse('test', HOME_LAYOUTS['home-flat'], 'living', { kind: 'enter' });
    useHomeView.getState().setCamera('overview');
    expect(useHomeView.getState().camera).toBe('overview');
    useHomeView.getState().toggleCamera();
    expect(useHomeView.getState().camera).toBe('walk');
    useHomeView.getState().leaveHouse('someone-else');
    expect(useHomeView.getState().house).toBe('test');
    useHomeView.getState().leaveHouse('test');
    expect(useHomeView.getState().house).toBeNull();
  });
});
