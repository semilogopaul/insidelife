import type { AvatarClip } from '@/common/three/avatar';
import type { PropSpec } from '../props/prop-types';
import type { InteriorTemplate } from '../templates/types';
import type { HomeLayout, LayoutRoom, PortalGeometry, PortalSpec } from './types';

/** How far into the room the trigger reaches from a door (m): a walker pushing against the door is inside it. */
const TRIGGER_DEPTH = 0.5;
/** Arrival distance from the portal edge (outside the trigger so you don't bounce straight back). */
const ARRIVAL_DEPTH = 0.9;
const DOOR_LABEL_Y = 2.3;

type StairsProp = Extract<PropSpec, { kind: 'stairs' }>;
type StairwellProp = Extract<PropSpec, { kind: 'stairwell' }>;

/** Heading (shared convention, (cos h, sin h) on x/z) pointing along a direction. */
const headingOf = (x: number, z: number): number => Math.atan2(z, x);

/** Axis-aligned rectangle around a centre, `along` the unit direction (dx, dz) and `across` it. */
function rectAround(
  cx: number,
  cz: number,
  dx: number,
  dz: number,
  along: number,
  across: number,
): PortalGeometry['trigger'] {
  const ex = Math.abs(dx) * along + Math.abs(dz) * across;
  const ez = Math.abs(dz) * along + Math.abs(dx) * across;
  return { minX: cx - ex / 2, maxX: cx + ex / 2, minZ: cz - ez / 2, maxZ: cz + ez / 2 };
}

/**
 * Room-space geometry of a portal whose opening edge is centred at (ex, ez), `width` wide, crossed by walking along
 * `inward` (unit). Pure.
 */
function edgePortal(
  spec: PortalSpec,
  kind: PortalGeometry['kind'],
  ex: number,
  ez: number,
  inward: readonly [number, number],
  width: number,
  labelY: number,
): PortalGeometry {
  const [ix, iz] = inward;
  // The trigger reaches a little past the edge (walls stop the walker before it) and TRIGGER_DEPTH into the room.
  const centreDepth = (TRIGGER_DEPTH - 0.2) / 2;
  const trigger = rectAround(
    ex - ix * centreDepth,
    ez - iz * centreDepth,
    ix,
    iz,
    TRIGGER_DEPTH + 0.2,
    Math.max(0.3, width - 0.1),
  );
  return {
    id: spec.id,
    to: spec.to,
    kind,
    trigger,
    inward,
    arrival: { x: ex - ix * ARRIVAL_DEPTH, z: ez - iz * ARRIVAL_DEPTH, heading: headingOf(-ix, -iz) },
    marker: { x: ex - ix * 0.36, z: ez - iz * 0.36, across: Math.max(0.6, width - 0.1), along: 0.6 },
    label: [ex - ix * 0.1, labelY, ez - iz * 0.1],
  };
}

/** Resolve a portal of a room to geometry (throws on a bad reference — layouts are authored data, checked by tests). */
export function portalGeometry(template: InteriorTemplate, spec: PortalSpec): PortalGeometry {
  const { width: W, depth: D } = template.room;
  const via = spec.via;
  if ('door' in via) {
    const door = template.room.doors?.[via.door];
    if (!door) throw new Error(`${template.id}: no door #${via.door} for portal ${spec.id}`);
    return door.wall === 'back'
      ? edgePortal(spec, 'door', door.at, -D / 2, [0, -1], door.width, DOOR_LABEL_Y)
      : edgePortal(spec, 'door', -W / 2, door.at, [-1, 0], door.width, DOOR_LABEL_Y);
  }
  if ('stairs' in via) {
    const stairs = template.props.filter((prop): prop is StairsProp => prop.kind === 'stairs')[via.stairs];
    if (!stairs) throw new Error(`${template.id}: no stairs #${via.stairs} for portal ${spec.id}`);
    // Steps climb along the prop's local +z: (sin r, cos r) in room space; the foot is half a depth back.
    const r = ((stairs.rot ?? 0) * Math.PI) / 180;
    const ax = Math.round(Math.sin(r) * 1e6) / 1e6;
    const az = Math.round(Math.cos(r) * 1e6) / 1e6;
    const [w, , d] = stairs.size;
    return edgePortal(
      spec,
      'stairs-up',
      stairs.at[0] - ax * (d / 2),
      stairs.at[1] - az * (d / 2),
      [ax, az],
      w,
      1.5,
    );
  }
  const well = template.props.filter((prop): prop is StairwellProp => prop.kind === 'stairwell')[
    via.stairwell
  ];
  if (!well) throw new Error(`${template.id}: no stairwell #${via.stairwell} for portal ${spec.id}`);
  // A stairwell goes down along its local -z; its open (top) end is the local +z edge.
  const r = ((well.rot ?? 0) * Math.PI) / 180;
  const nx = Math.round(Math.sin(r) * 1e6) / 1e6;
  const nz = Math.round(Math.cos(r) * 1e6) / 1e6;
  const [w, d] = well.size;
  return edgePortal(
    spec,
    'stairs-down',
    well.at[0] + nx * (d / 2),
    well.at[1] + nz * (d / 2),
    [-nx, -nz],
    w,
    1.4,
  );
}

export function findRoom(layout: HomeLayout, id: string | null | undefined): LayoutRoom | undefined {
  return id ? layout.rooms.find((room) => room.id === id) : undefined;
}

/** Room an activity happens in: the layout's mapping, else the room you're in (or the entry). */
export function roomForActivity(layout: HomeLayout, animation: AvatarClip, current?: string | null): string {
  const mapped = layout.activityRooms[animation];
  if (mapped && findRoom(layout, mapped)) return mapped;
  return findRoom(layout, current)?.id ?? layout.entry;
}

/** Animations that leave the player free to walk (no activity spot). */
export function isFreeAnimation(animation: AvatarClip): boolean {
  return animation === 'idle' || animation === 'walk' || animation === 'jog' || animation === 'run';
}

/** Where someone else present (a host, a guest) is shown: the room their activity belongs to, else the entry room. */
export function roomForPerson(layout: HomeLayout, animation: AvatarClip | null): string {
  if (!animation || isFreeAnimation(animation)) return layout.entry;
  return roomForActivity(layout, animation, layout.entry);
}

/**
 * The first portal to take from `from` towards `to` (breadth-first over the room graph), or null when already there
 * or unreachable.
 */
export function nextPortalTowards(layout: HomeLayout, from: string, to: string): PortalSpec | null {
  if (from === to) return null;
  const firstStep = new Map<string, PortalSpec>();
  const queue: string[] = [from];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const roomId = queue.shift() as string;
    const room = findRoom(layout, roomId);
    if (!room) continue;
    for (const portal of room.portals) {
      const next = portal.to?.room;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      firstStep.set(next, roomId === from ? portal : (firstStep.get(roomId) as PortalSpec));
      if (next === to) return firstStep.get(next) ?? null;
      queue.push(next);
    }
  }
  return null;
}

/**
 * Where you'd come into `to` walking from `from`: the portal of `to` on the last leg of the shortest route, else its
 * first inner door. Used when jumping straight to a room from the rooms menu.
 */
export function arrivalPortal(layout: HomeLayout, from: string | null, to: string): string | null {
  const target = findRoom(layout, to);
  if (!target) return null;
  const previous = new Map<string, string>();
  const queue: string[] = from ? [from] : [];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const roomId = queue.shift() as string;
    if (roomId === to) break;
    for (const portal of findRoom(layout, roomId)?.portals ?? []) {
      const next = portal.to?.room;
      if (!next || seen.has(next)) continue;
      seen.add(next);
      previous.set(next, roomId);
      queue.push(next);
    }
  }
  const before = previous.get(to);
  const portal =
    (before ? target.portals.find((candidate) => candidate.to?.room === before) : undefined) ??
    target.portals.find((candidate) => candidate.to !== null) ??
    target.portals[0];
  return portal?.id ?? null;
}

/** Label for a portal: the room it leads to, with "Upstairs"/"Downstairs" when it changes floor. */
export function portalLabel(layout: HomeLayout, room: LayoutRoom, spec: PortalSpec): string {
  if (!spec.to) return 'Front door';
  const target = findRoom(layout, spec.to.room);
  if (!target) return '';
  if (target.level > room.level) return `Upstairs · ${target.label}`;
  if (target.level < room.level) return `Downstairs · ${target.label}`;
  return target.label;
}

/** "Ground floor" / "Upstairs" for a level. */
export function levelLabel(level: number): string {
  return level <= 0 ? 'Ground floor' : level === 1 ? 'Upstairs' : `Floor ${level}`;
}
