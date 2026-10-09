import type { PlaceObjectKind, PlaceService } from '@/common/places';
import { AVATAR_CLIPS, AVATAR_SEAT_HEIGHT, type AvatarClip } from '@/common/three/avatar';
import { FURNITURE_SCALE } from '../kit/furniture-kit';
import { FURNITURE_MANIFEST } from '../kit/kit-manifest';
import type { PropSpec } from '../props/prop-types';
import { forward, seat, stand } from '../templates/helpers';
import type { At, FurniturePlacement, HomeSlot, InteriorTemplate, Spot } from '../templates/types';
import { furnitureFootprint, propFootprint } from '../walk/colliders';
import { distanceToBox, roomObjects, type PlaceObject } from './objects';

/**
 * Where an action happens in a room, generically: by its animation first (what the template authored for it), then by
 * what the room has (a free bar stool for a drink, the counter for shopping, the dance floor for cheering), then by
 * its category, then the room's default spot. And what it's "at" for the floating marker: the thing you use (the TV
 * for Watch, the laptop for Learn to code) when the room has it, else the spot itself. Pure.
 */

/** What the resolver needs to know about an action (an `ActionDefinition` fits; animations alone work too). */
export interface ActionLike {
  readonly animation: AvatarClip;
  readonly category?: string;
  readonly requires?: { readonly itemTag?: string };
}

/** Somewhere to find a spot: an authored player spot by animation, or something derived from the room. */
type SpotSource = AvatarClip | 'default' | 'bar' | 'counter' | 'shop' | 'floor';

/** After the action's own animation: related authored spots and room features, most specific first. */
const ANIMATION_FALLBACKS: Readonly<Partial<Record<AvatarClip, readonly SpotSource[]>>> = {
  drink: ['bar', 'counter', 'sit', 'talk', 'eat'],
  eat: ['sit', 'counter'],
  read: ['sit', 'type'],
  type: ['sit', 'read'],
  phone: ['sit', 'idle'],
  talk: ['idle', 'sit'],
  drive: ['sit'],
  wave: ['idle'],
  cheer: ['dance', 'floor', 'idle'],
  dance: ['floor', 'idle'],
  exercise: ['idle'],
  pray: ['idle'],
  cook: ['counter', 'idle'],
  shower: ['idle'],
  sleep: ['sit'],
  walk: ['shop', 'idle'],
  idle: ['shop'],
  jog: ['walk', 'idle'],
  run: ['walk', 'idle'],
};

/** When the animation finds nothing: where that kind of action usually happens. Unknown categories sit or talk. */
const CATEGORY_FALLBACKS: Readonly<Record<string, readonly SpotSource[]>> = {
  food: ['eat', 'sit', 'counter'],
  social: ['talk', 'sit', 'dance'],
  fun: ['sit', 'dance'],
  fitness: ['exercise'],
  spiritual: ['pray', 'sit'],
  study: ['read', 'type', 'sit'],
  work: ['type', 'phone', 'sit'],
  hygiene: ['shower'],
  rest: ['sleep', 'sit'],
};
const UNKNOWN_CATEGORY: readonly SpotSource[] = ['sit', 'talk'];

/** Someone else is here (an NPC, or a spot kept for other players). */
const OCCUPIED_RADIUS = 0.35;
/** Customers stand this far in front of a counter's edge. */
const COUNTER_GAP = 0.38;

const footOf = (spot: Spot): At => [spot.at[0], spot.at[spot.at.length - 1] as number];

/** Where other people sit or stand in a room (NPCs and the spots kept for other players). */
export function occupiedFeet(template: InteriorTemplate): At[] {
  return [...template.npcs.map(footOf), ...template.guests.map(footOf)];
}

const isTaken = (point: At, occupied: readonly At[]): boolean =>
  occupied.some(([x, z]) => Math.hypot(x - point[0], z - point[1]) < OCCUPIED_RADIUS);

type BarCounter = Extract<PropSpec, { kind: 'bar-counter' }>;

const isStool = (piece: FurniturePlacement): boolean => piece.model.startsWith('stoolBar');

/** Height (m) of a kit piece's top as placed. */
export function pieceTop(piece: FurniturePlacement): number {
  return (piece.y ?? 0) + FURNITURE_MANIFEST[piece.model].size[1] * FURNITURE_SCALE * (piece.scale ?? 1);
}

/**
 * A free bar stool (near a counter when there is one), sitting at stool height facing the way the stool is set —
 * templates turn stools to the bar, the dance floor or the TV. The free stool nearest the middle of the room wins.
 */
export function barStoolSpot(template: InteriorTemplate, animation: AvatarClip = 'drink'): Spot | null {
  const occupied = occupiedFeet(template);
  const counters = template.props.filter((prop): prop is BarCounter => prop.kind === 'bar-counter');
  const nearCounter = (piece: FurniturePlacement): boolean =>
    counters.length === 0 ||
    counters.some(
      (counter) =>
        Math.hypot(counter.at[0] - piece.at[0], counter.at[1] - piece.at[1]) < 1.2 + counter.length / 2,
    );
  const stools = template.furniture.filter(
    (piece) => isStool(piece) && nearCounter(piece) && !isTaken(piece.at, occupied),
  );
  if (stools.length === 0) return null;
  const best = stools.reduce((a, b) => (Math.hypot(b.at[0], b.at[1]) < Math.hypot(a.at[0], a.at[1]) ? b : a));
  return seat(best.at, best.rot ?? 0, animation, { y: Math.max(0, pieceTop(best) - AVATAR_SEAT_HEIGHT) });
}

/** Counter-like props, and how deep each is (front edge distance from its centre along its local +z). */
function counterDepth(prop: PropSpec): number | null {
  switch (prop.kind) {
    case 'bar-counter':
      return 0.3;
    case 'stall':
      return 0.42;
    case 'shelf':
      return prop.items === 'bottles' ? null : prop.size[2] / 2;
    default:
      return null;
  }
}

function counterLength(prop: PropSpec): number {
  if (prop.kind === 'bar-counter') return prop.length;
  if (prop.kind === 'shelf') return prop.size[0];
  return 1.4;
}

/**
 * Standing at the customer side of a counter (bar counters, market stalls, shop shelves — all face their local +z),
 * facing it, at the first free place along it (not where someone stands, not inside furniture). `kinds` sets which
 * counters to try first.
 */
export function counterSpot(
  template: InteriorTemplate,
  kinds: readonly PropSpec['kind'][],
  animation: AvatarClip = 'idle',
): Spot | null {
  const occupied = occupiedFeet(template);
  const solid = [...template.furniture.map(furnitureFootprint), ...template.props.map(propFootprint)].filter(
    (box) => box !== null,
  );
  const blocked = ([x, z]: At): boolean =>
    solid.some(
      (box) => x > box.minX - 0.18 && x < box.maxX + 0.18 && z > box.minZ - 0.18 && z < box.maxZ + 0.18,
    );
  const { width, depth } = template.room;
  const inside = ([x, z]: At): boolean => Math.abs(x) < width / 2 - 0.3 && Math.abs(z) < depth / 2 - 0.3;
  for (const kind of kinds) {
    for (const prop of template.props) {
      if (prop.kind !== kind || (prop.y ?? 0) > 0.3) continue;
      const front = counterDepth(prop);
      if (front === null) continue;
      const rot = prop.rot ?? 0;
      const half = counterLength(prop) / 2 - 0.3;
      const centre = forward(prop.at, rot, front + COUNTER_GAP);
      const r = (rot * Math.PI) / 180;
      for (const along of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
        if (Math.abs(along) > Math.max(0, half)) continue;
        // Local +x of the prop in room space: (cos r, −sin r).
        const point: At = [centre[0] + Math.cos(r) * along, centre[1] - Math.sin(r) * along];
        if (inside(point) && !isTaken(point, occupied) && !blocked(point))
          return stand(point, rot + 180, animation);
      }
    }
  }
  return null;
}

/** The lit dance floor's middle (clubs). */
function floorSpot(template: InteriorTemplate, animation: AvatarClip): Spot | null {
  const floor = template.extras?.clubLights;
  return floor ? stand(floor.at, 20, animation) : null;
}

const isFullBody = (animation: AvatarClip): boolean => AVATAR_CLIPS[animation].kind === 'full';

function fromSource(template: InteriorTemplate, source: SpotSource, animation: AvatarClip): Spot | null {
  switch (source) {
    case 'bar':
      return barStoolSpot(template, animation);
    case 'counter':
      return counterSpot(template, ['bar-counter', 'stall', 'shelf'], animation);
    case 'shop':
      return counterSpot(template, ['shelf', 'stall', 'bar-counter'], animation);
    case 'floor':
      return floorSpot(template, animation);
    default: {
      const spot = template.player[source];
      if (!spot) return null;
      // Dancing or working out on a sofa reads wrong: full-body clips skip seated spots.
      if (spot.stance === 'sit' && isFullBody(animation)) return null;
      return spot.animation === animation ? spot : { ...spot, animation };
    }
  }
}

/** The chain of places to try for an action, most specific first, ending at the room's default. */
export function spotSources(action: ActionLike): readonly SpotSource[] {
  const category = action.category ? (CATEGORY_FALLBACKS[action.category] ?? UNKNOWN_CATEGORY) : [];
  return [action.animation, ...(ANIMATION_FALLBACKS[action.animation] ?? []), ...category, 'default'];
}

/** Where the player does `action` in this room. Always returns a spot (the room's default, else its centre). */
export function actionSpot(template: InteriorTemplate, action: ActionLike): Spot {
  for (const source of spotSources(action)) {
    const spot = fromSource(template, source, action.animation);
    if (spot) return spot;
  }
  return { at: [0, 0], animation: action.animation };
}

// ---------------------------------------------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------------------------------------------

/** Where an action's floating marker goes and how close you must be for it to be offered. */
export interface ActionAnchor {
  /** Floor point (x, z). */
  readonly at: At;
  /** Marker height (m). */
  readonly y: number;
  /** Offer radius (m) around `at`. */
  readonly reach: number;
}

/** Item tags (action requirements) that are a piece of home furniture; consoles sit by the TV when they have no slot. */
const TAG_SLOTS: Readonly<Record<string, readonly HomeSlot[]>> = {
  tv: ['tv'],
  console: ['console', 'tv'],
  laptop: ['laptop'],
  books: ['books'],
};

const SPOT_REACH = 1.15;

/** Marker height over a spot: above the head standing, lower seated, lying down or kneeling. */
function markerHeight(spot: Spot, animation: AvatarClip): number {
  const base = spot.at.length === 3 ? spot.at[1] : 0;
  if (animation === 'sleep') return base + 0.85;
  if (spot.stance === 'sit') return base + 1.45;
  if (spot.stance === 'kneel') return base + 1.3;
  return base + 1.75;
}

/** Anchor at the spot itself. */
export function spotAnchor(spot: Spot, animation: AvatarClip = spot.animation): ActionAnchor {
  return { at: footOf(spot), y: markerHeight(spot, animation), reach: SPOT_REACH };
}

/**
 * Anchor for an action: the furniture it needs (its slot in `slots`, the unfurnished template, as long as the
 * furnished `template` still has that kind of thing there — your TV, not just the cabinet), else its spot.
 */
export function actionAnchor(
  template: InteriorTemplate,
  action: ActionLike,
  slots: InteriorTemplate = template,
): ActionAnchor {
  const spot = actionSpot(template, action);
  const tag = action.requires?.itemTag;
  for (const slot of tag ? (TAG_SLOTS[tag] ?? []) : []) {
    const piece = slots.furniture.find((candidate) => candidate.slot === slot);
    if (!piece || !hasLike(template, piece)) continue;
    const [w, , d] = FURNITURE_MANIFEST[piece.model].size;
    const size = Math.max(w, d) * FURNITURE_SCALE * (piece.scale ?? 1);
    return { at: piece.at, y: pieceTop(piece) + 0.38, reach: SPOT_REACH + size / 2 };
  }
  return spotAnchor(spot, action.animation);
}

/** Kit model family: `televisionModern` and `televisionVintage` are both TVs. */
const family = (model: string): string => model.replace(/[A-Z].*$/, '');

/** Does the room have the same kind of thing at about the same place (whichever one you bought)? */
function hasLike(template: InteriorTemplate, piece: FurniturePlacement): boolean {
  const kind = family(piece.model);
  return template.furniture.some(
    (candidate) =>
      family(candidate.model) === kind &&
      Math.hypot(candidate.at[0] - piece.at[0], candidate.at[1] - piece.at[1]) < 0.6,
  );
}

/**
 * Where a place service is found (it opens a phone app or a panel): a particular kind of object when it names one (the
 * DJ booth), the first car on show, the staffed desk or counter (front desk, doctor, agent, pharmacist — whoever has
 * staff beside it), the counter; else wherever you'd talk to someone.
 */
export function serviceAnchor(
  template: InteriorTemplate,
  service: Pick<PlaceService, 'at'>,
  objects: readonly PlaceObject[] = roomObjects(template),
): ActionAnchor {
  const where = service.at;
  const staff = template.npcs.map(footOf);
  const staffDistance = (object: PlaceObject): number =>
    staff.reduce((best, [x, z]) => Math.min(best, distanceToBox(object.box, x, z)), Number.POSITIVE_INFINITY);
  const pick = (kinds: readonly PlaceObjectKind[]): PlaceObject | undefined =>
    objects
      .filter((object) => kinds.includes(object.kind))
      .sort((a, b) => staffDistance(a) - staffDistance(b))[0];
  const object =
    typeof where === 'object'
      ? pick([where.object])
      : where === 'cars'
        ? pick(['car'])
        : where === 'desk'
          ? pick(['desk', 'counter', 'bar'])
          : pick(['counter', 'bar', 'stall', 'shelf']);
  if (object) return objectAnchor(object);
  const counter = where === 'counter' ? counterSpot(template, ['bar-counter', 'stall', 'shelf']) : null;
  const spot = counter ?? actionSpot(template, { animation: 'talk', category: 'service' });
  return spotAnchor(spot, spot.animation);
}

/** Anchor over an object: its middle, the marker just above it. */
export function objectAnchor(object: PlaceObject): ActionAnchor {
  const { box } = object;
  return {
    at: [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2],
    y: Math.max(box.maxY + 0.45, 1.25),
    reach: SPOT_REACH,
  };
}
