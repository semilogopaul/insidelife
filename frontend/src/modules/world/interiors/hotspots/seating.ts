import { AVATAR_SEAT_HEIGHT, type AvatarClip } from '@/common/three/avatar';
import { FURNITURE_SCALE } from '../kit/furniture-kit';
import { FURNITURE_MANIFEST } from '../kit/kit-manifest';
import type { PropSpec } from '../props/prop-types';
import { forward, seat, stand } from '../templates/helpers';
import type { At, FurniturePlacement, InteriorTemplate, NpcSpot, Spot } from '../templates/types';
import { furnitureFootprint, propFootprint } from '../walk/colliders';
import { actionSpot, type ActionLike } from './action-spots';

/**
 * Seats are limited, and some are taken by NPCs, but nobody who comes to sit down is left standing.
 *
 * - The player always gets a seat for a sitting action: the authored one, else the seat of an NPC who gets up for
 *   them, else a new one the room adds.
 * - Other players present each get a spot (`template.guests`): the authored ones first, then the seats NPCs give up,
 *   then new seats the room adds (rows behind the existing ones, benches outdoors, a chair and desk at a computer),
 *   and as a last resort a place to stand. So any number of players can do the action.
 *
 * Pure: it returns a new template (the same id, so everything keyed by it keeps working) and never touches the input.
 */

/** Animations done sitting down. */
const SEATED: ReadonlySet<AvatarClip> = new Set<AvatarClip>(['sit', 'eat', 'read', 'type', 'drink']);

/** Most seats a room adds for other players; beyond this people stand around (or share). */
export const MAX_ADDED_SEATS = 24;

export interface SeatingDemand {
  /** What the player is doing (null: nothing that needs a seat). */
  readonly action?: ActionLike | null;
  /** Other players present in this room. */
  readonly others: number;
}

const feetOf = (spot: Spot): At => [spot.at[0], spot.at[spot.at.length - 1] as number];
const dist = (a: At, b: At): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const isSeat = (spot: Spot): boolean => spot.stance === 'sit';
const isStool = (piece: FurniturePlacement): boolean => piece.model.startsWith('stoolBar');

/** Seats that are really a place to sit (not the bed you lie on). */
const seatedNpcs = (template: InteriorTemplate): NpcSpot[] => template.npcs.filter((npc) => isSeat(npc));

/** Where a seat is: nearest to a point first. */
function nearest<T extends Spot>(spots: readonly T[], to: At): T | undefined {
  return [...spots].sort((a, b) => dist(feetOf(a), to) - dist(feetOf(b), to))[0];
}

/** The template with identities on its NPCs (so removing one never changes the others' faces). */
function withNpcIds(template: InteriorTemplate): InteriorTemplate {
  if (template.npcs.every((npc, index) => npc.id === index)) return template;
  return { ...template, npcs: template.npcs.map((npc, index) => ({ ...npc, id: npc.id ?? index })) };
}

// ---------------------------------------------------------------------------------------------------------------
// The player's seat
// ---------------------------------------------------------------------------------------------------------------

/** A seat at a bar stool piece, at stool height. */
function stoolSeat(piece: FurniturePlacement, animation: AvatarClip): Spot {
  const [, h] = FURNITURE_MANIFEST[piece.model].size;
  const top = (piece.y ?? 0) + h * FURNITURE_SCALE * (piece.scale ?? 1);
  return seat(piece.at, piece.rot ?? 0, animation, { y: Math.max(0, top - AVATAR_SEAT_HEIGHT) });
}

/**
 * Make sure the player has somewhere to sit for `animation`: `spot` is where the room's own rules put them. If that
 * isn't a seat, an NPC (or a spot kept for another player) gives theirs up, and failing that the room adds one.
 */
function seatForPlayer(template: InteriorTemplate, action: ActionLike): InteriorTemplate {
  const animation = action.animation;
  const spot = actionSpot(template, action);
  const where = feetOf(spot);
  if (isSeat(spot)) {
    // Never sit on someone: an NPC at that seat gets up.
    const taken = template.npcs.filter((npc) => dist(feetOf(npc), where) < 0.35);
    return taken.length === 0 ? template : { ...template, npcs: template.npcs.filter((npc) => !taken.includes(npc)) };
  }
  // A drink: a free stool at the bar, freed by whoever is on it if need be.
  if (animation === 'drink') {
    const stool = template.furniture.filter(isStool).sort((a, b) => Math.hypot(a.at[0], a.at[1]) - Math.hypot(b.at[0], b.at[1]))[0];
    if (stool) return claim(template, animation, stoolSeat(stool, animation));
  }
  // Someone's seat: an NPC gets up, else a spot kept for other players.
  const npcSeat = nearest(seatedNpcs(template), where);
  if (npcSeat) return claim(template, animation, { ...npcSeat, animation });
  const guestSeat = nearest(template.guests.filter(isSeat), where);
  if (guestSeat) return claim(template, animation, { ...guestSeat, animation });
  // No seat in the room at all: add one.
  const added = addSeats(template, 1, animation, where);
  const first = added.spots[0];
  if (!first) return template;
  return {
    ...template,
    furniture: [...template.furniture, ...added.furniture],
    props: [...template.props, ...added.props],
    player: { ...template.player, [animation]: first },
  };
}

/** The player takes `seat` for `animation`: whoever was there (NPC or guest spot) is gone, and the spot is theirs. */
function claim(template: InteriorTemplate, animation: AvatarClip, seatSpot: Spot): InteriorTemplate {
  const at = feetOf(seatSpot);
  return {
    ...template,
    npcs: template.npcs.filter((npc) => dist(feetOf(npc), at) >= 0.35),
    guests: template.guests.filter((guest) => dist(feetOf(guest), at) >= 0.35),
    player: { ...template.player, [animation]: seatSpot },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// New seats
// ---------------------------------------------------------------------------------------------------------------

interface Added {
  readonly furniture: FurniturePlacement[];
  readonly props: PropSpec[];
  readonly spots: Spot[];
}

type SeatKit = 'station' | 'desk' | 'bench' | 'plastic' | 'chair';

/** What the room adds: a chair and desk with a computer where people work on one, benches outdoors, chairs elsewhere. */
function kitFor(template: InteriorTemplate): SeatKit {
  switch (template.id) {
    case 'cbt-centre':
    case 'office':
      return 'station';
    case 'campus':
    case 'school':
      return 'desk';
    case 'park':
    case 'motor-park':
      return 'bench';
    case 'beach':
    case 'market':
      return 'plastic';
    default:
      return template.room.outdoor ? 'bench' : 'chair';
  }
}

/** Space a new seat (and its desk) needs in front of it. */
const AHEAD: Readonly<Record<SeatKit, number>> = { station: 0.95, desk: 0.8, bench: 0.5, plastic: 0.5, chair: 0.5 };
/** Spacing of the search grid (m): rows of seats this far apart. */
const GRID: readonly [number, number] = [0.85, 1.05];

function doorClearZones(template: InteriorTemplate): At[] {
  const { width: W, depth: D } = template.room;
  return (template.room.doors ?? []).map((door): At => (door.wall === 'back' ? [door.at, -D / 2 + 0.9] : [-W / 2 + 0.9, door.at]));
}

/**
 * Add up to `count` seats in free floor, in rows behind the existing seats (the ones nearest the room's seating), facing
 * as their neighbours do (or towards the middle of the room). Never on furniture, people, doors or the player's spots.
 */
function addSeats(template: InteriorTemplate, count: number, animation: AvatarClip, near: At): Added {
  const kit = kitFor(template);
  const added: Added = { furniture: [], props: [], spots: [] };
  if (count <= 0) return added;
  const { width: W, depth: D } = template.room;
  const solid = [...template.furniture.map(furnitureFootprint), ...template.props.map(propFootprint)].filter((box) => box !== null);
  const blocked = ([x, z]: At, margin: number): boolean => solid.some((box) => x > box.minX - margin && x < box.maxX + margin && z > box.minZ - margin && z < box.maxZ + margin);
  const people: At[] = [...template.npcs, ...template.guests, ...Object.values(template.player).filter((spot): spot is Spot => spot !== undefined)].map(feetOf);
  const doors = doorClearZones(template);
  const existing = [...template.npcs, ...template.guests, ...Object.values(template.player).filter((spot): spot is Spot => spot !== undefined)].filter(isSeat);
  const anchor: At = existing.length > 0 ? [existing.reduce((sum, spot) => sum + spot.at[0], 0) / existing.length, existing.reduce((sum, spot) => sum + (spot.at[spot.at.length - 1] as number), 0) / existing.length] : near;

  const margin = 0.55;
  const candidates: Array<{ at: At; rot: number }> = [];
  for (let x = -W / 2 + margin; x <= W / 2 - margin + 1e-6; x += GRID[0]) {
    for (let z = -D / 2 + margin; z <= D / 2 - margin + 1e-6; z += GRID[1]) {
      const at: At = [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
      const facing = nearest(
        existing.filter((spot) => dist(feetOf(spot), at) < 3.5),
        at,
      );
      const rot = facing?.rot ?? (Math.atan2(-at[0], -at[1]) * 180) / Math.PI;
      const front = forward(at, rot, AHEAD[kit]);
      if (blocked(at, 0.3) || blocked(front, 0.18) || blocked(forward(at, rot, AHEAD[kit] / 2), 0.2)) continue;
      if (people.some((p) => dist(p, at) < 0.75 || dist(p, front) < 0.4)) continue;
      if (doors.some((door) => dist(door, at) < 1.3 || dist(door, front) < 1.0)) continue;
      candidates.push({ at, rot });
    }
  }
  candidates.sort((a, b) => dist(a.at, anchor) - dist(b.at, anchor) || a.at[1] - b.at[1] || a.at[0] - b.at[0]);
  const chosen: Array<{ at: At; rot: number }> = [];
  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    // The seats added so far, and their desks, take room too.
    const front = forward(candidate.at, candidate.rot, AHEAD[kit]);
    if (chosen.some((other) => dist(other.at, candidate.at) < 0.8 || dist(forward(other.at, other.rot, AHEAD[kit]), candidate.at) < 0.55 || dist(forward(other.at, other.rot, AHEAD[kit]), front) < 0.5)) continue;
    chosen.push(candidate);
  }
  const workSpot = kit === 'station';
  for (const { at, rot } of chosen) {
    const spot = seat(at, rot, animation === 'drink' ? 'sit' : animation, { props: workSpot ? false : undefined });
    added.spots.push(spot);
    switch (kit) {
      case 'station': {
        // As the CBT rows are laid out: the chair, the desk a step in front of it, the screen at the far side.
        added.furniture.push(
          { model: 'chairDesk', at, rot },
          { model: 'desk', at: forward(at, rot, 0.57), rot: rot + 180, scale: 0.8, palette: { wood: '#eceff1' } },
          { model: 'computerScreen', at: forward(at, rot, 0.7), rot: rot + 180, y: 0.46 },
          { model: 'computerKeyboard', at: forward(at, rot, 0.4), rot: rot + 180, y: 0.46 },
        );
        break;
      }
      case 'desk':
        added.furniture.push({ model: 'chairDesk', at, rot }, { model: 'desk', at: forward(at, rot, 0.57), rot: rot + 180, scale: 0.8 });
        break;
      case 'bench':
        added.furniture.push({ model: 'bench', at, rot });
        break;
      case 'plastic':
        added.props.push({ kind: 'plastic-chair', at, rot, color: added.spots.length % 2 ? '#c0392b' : '#ecebe6' });
        break;
      case 'chair':
        added.furniture.push({ model: 'chair', at, rot });
        break;
    }
  }
  return added;
}

/** Free floor of a room: not in furniture (with `margin` to spare), not at a door. */
function floorTester(template: InteriorTemplate): (at: At, margin: number) => boolean {
  const solid = [...template.furniture.map(furnitureFootprint), ...template.props.map(propFootprint)].filter((box) => box !== null);
  const doors = doorClearZones(template);
  return ([x, z], margin) => !solid.some((box) => x > box.minX - margin && x < box.maxX + margin && z > box.minZ - margin && z < box.maxZ + margin) && !doors.some((door) => dist(door, [x, z]) < 1.0);
}

/**
 * Somewhere to stand when the room has no seat or floor left for more: free floor, then (a real crowd) sharing it.
 * Always inside the room.
 */
function standingSpots(template: InteriorTemplate, count: number, taken: readonly At[]): Spot[] {
  const free = floorTester(template);
  const { width: W, depth: D } = template.room;
  const open: At[] = [];
  for (let x = -W / 2 + 0.5; x <= W / 2 - 0.5 + 1e-6; x += 0.6) {
    for (let z = -D / 2 + 0.5; z <= D / 2 - 0.5 + 1e-6; z += 0.6) {
      const at: At = [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
      if (free(at, 0.25) && !taken.some((t) => dist(t, at) < 0.45)) open.push(at);
    }
  }
  open.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  const spots: Spot[] = [];
  for (let i = 0; i < count; i++) {
    const at = open[i % Math.max(1, open.length)] ?? ([0, 0] as At);
    spots.push(stand(at, (Math.atan2(-at[0], -at[1]) * 180) / Math.PI, 'talk'));
  }
  return spots;
}

// ---------------------------------------------------------------------------------------------------------------
// Everyone
// ---------------------------------------------------------------------------------------------------------------

/**
 * The room as it is with the player (doing `action`) and `others` other players in it: each has a spot to sit or
 * stand, and the player's seat is theirs alone. Returns the same template when nothing needs changing.
 */
export function withSeating(input: InteriorTemplate, demand: SeatingDemand): InteriorTemplate {
  let template = input;
  const action = demand.action ?? null;
  if (action && SEATED.has(action.animation)) {
    template = withNpcIds(template);
    template = seatForPlayer(template, action);
  }
  const missing = demand.others - template.guests.length;
  if (missing <= 0) return template;

  template = withNpcIds(template);
  // NPCs sitting down give their seats to players first (the last ones first: the first NPCs are the room's regulars).
  const giving = seatedNpcs(template).slice(-missing);
  let guests: Spot[] = [...template.guests, ...giving.map((npc): Spot => ({ at: npc.at, rot: npc.rot, animation: npc.animation, stance: npc.stance, props: npc.props }))];
  const npcs = template.npcs.filter((npc) => !giving.includes(npc));
  let furniture = template.furniture;
  let props = template.props;
  if (guests.length < demand.others) {
    const next: InteriorTemplate = { ...template, npcs, guests };
    const need = Math.min(demand.others - guests.length, MAX_ADDED_SEATS);
    const added = addSeats(next, need, 'sit', [0, 0]);
    guests = [...guests, ...added.spots];
    furniture = [...furniture, ...added.furniture];
    props = [...props, ...added.props];
    if (guests.length < demand.others) guests = [...guests, ...standingSpots({ ...template, furniture, props }, demand.others - guests.length, [...guests, ...npcs, ...Object.values(template.player).filter((spot): spot is Spot => spot !== undefined)].map(feetOf))];
  }
  return { ...template, npcs, guests, furniture, props };
}
