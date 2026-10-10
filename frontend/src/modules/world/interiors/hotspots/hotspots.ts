import type { ActionDefinition } from '@insidelife/shared';
import type { Interactable, InteractableOption } from '@/common/game/world-store';
import {
  MORE_HERE_ID,
  actionEffects,
  serviceInteractableId,
  serviceOpensLabel,
  type GoalHere,
  type PlaceObjectKind,
  type PlaceService,
} from '@/common/places';
import { findRoom, listedRoom } from '../layouts/geometry';
import type { HomeLayout } from '../layouts/types';
import type { At, InteriorTemplate } from '../templates/types';
import { actionAnchor, objectAnchor, serviceAnchor, type ActionAnchor } from './action-spots';
import { distanceToBox, objectAt, roomObjects, type Box3, type PlaceObject } from './objects';

/**
 * Hotspots: the things in a room you can use (the bar, the dance floor, the TV, the front desk), each with what the
 * place offers there — its actions, anchored where they happen, and its services. Tap one in 3D (or its floating
 * marker) for its card; walk up to it and the HUD context button offers its first thing, the rest as smaller buttons.
 * Actions with no object nearby get a hotspot of their own at their spot. Pure.
 */

export interface Hotspot {
  /** Stable id: `hotspot:<first action id>` (or `hotspot:service:<id>`). */
  readonly id: string;
  /** What it is ("Bar", "Dance floor", "Front desk") — or, for a bare spot, its first thing's name. */
  readonly kind: PlaceObjectKind;
  readonly name: string;
  /** Floor point (x, z) and height of the floating marker. */
  readonly at: At;
  readonly y: number;
  /** Tap box, and the floor area you stand within `reach` of to be offered it. */
  readonly box: Box3;
  readonly reach: number;
  /** More things like it that do the same (every pew, every treadmill, every table): tappable, no marker of their own. */
  readonly aliases: readonly Box3[];
  /** In catalog order (a goal's action first); the first is offered first. */
  readonly actions: readonly ActionDefinition[];
  /** Things found here that open a phone app or a panel (browse cars, see a doctor), after the actions. */
  readonly services: readonly PlaceService[];
}

/** Bare spots closer than this (m) are one hotspot. */
const MERGE_DISTANCE = 0.55;
/** A spot this close to a thing belongs to it (a bar stool's spot is the bar's). */
const OBJECT_REACH = 0.9;
/** Offer distance around a thing's box. */
const OBJECT_OFFER = 0.85;
/** The hotspot on offer stays on offer until you're this much past its reach (no flicker at the edge). */
const STICKINESS = 0.3;
/** Extra things to do at a spot shown under the main one (the card and the sheet list everything). */
export const MAX_MORE = 3;
/** On a phone: one more button above the context button, then "More here" (the HUD stays three buttons high). */
export const PHONE_MAX_MORE = 1;

const ID_PREFIX = 'hotspot:';

interface Draft {
  id: string;
  kind: PlaceObjectKind;
  name: string;
  at: At;
  y: number;
  box: Box3;
  reach: number;
  actions: ActionDefinition[];
  services: PlaceService[];
  object: PlaceObject | null;
  aliases: Box3[];
}

/** Things of these kinds do what a hotspot at the first kind does (all the pews are for the service). */
const ALIAS_KINDS: Readonly<Partial<Record<PlaceObjectKind, readonly PlaceObjectKind[]>>> = {
  mat: ['mat', 'gym-machine'],
  'gym-machine': ['gym-machine', 'mat'],
  pew: ['pew'],
  bed: ['bed'],
  table: ['table'],
  seats: ['seats'],
  stall: ['stall'],
  shelf: ['shelf'],
  sofa: ['sofa'],
  'salon-chair': ['salon-chair'],
  bench: ['bench'],
};

/** How specific an action is to this kind of place: a church's service before mingling (which works in 12 places). */
const breadth = (action: ActionDefinition): number =>
  action.where.venueTypes?.length ?? (action.where.home || action.where.visit ? 1 : 99);

/** A bare spot's box: a person-sized column around it. */
function spotBox(anchor: ActionAnchor): Box3 {
  const [x, z] = anchor.at;
  return {
    minX: x - 0.4,
    maxX: x + 0.4,
    minZ: z - 0.4,
    maxZ: z + 0.4,
    minY: 0,
    maxY: Math.max(1.2, anchor.y - 0.25),
  };
}

/** The thing a spot belongs to; a chair at a table or a desk is the table's or the desk's. */
function thingAt(objects: readonly PlaceObject[], at: At): PlaceObject | null {
  const found = objectAt(objects, at, OBJECT_REACH);
  if (found?.kind !== 'chair' && found?.kind !== 'seats') return found;
  return objectAt(objects, at, OBJECT_REACH, ['desk', 'table']) ?? found;
}

/** Move the entry with `id` to the front of `list`. */
function toFront<T extends { readonly id: string }>(list: T[], id: string | null): void {
  const index = id ? list.findIndex((entry) => entry.id === id) : -1;
  if (index > 0) list.unshift(...list.splice(index, 1));
}

/**
 * Group a room's actions (and the place's services) into hotspots by the thing they're at. `slots` is the
 * unfurnished template (where furniture slots are); with a `goal`, what advances it comes first at its hotspot.
 */
export function buildHotspots(
  template: InteriorTemplate,
  actions: readonly ActionDefinition[],
  slots: InteriorTemplate = template,
  services: readonly PlaceService[] = [],
  goal: GoalHere | null = null,
): Hotspot[] {
  const objects = roomObjects(template);
  const drafts: Draft[] = [];
  const join = (anchor: ActionAnchor, object: PlaceObject | null, id: string, name: string): Draft => {
    const existing = object
      ? drafts.find((draft) => draft.object === object)
      : drafts.find(
          (draft) =>
            draft.object === null &&
            Math.hypot(draft.at[0] - anchor.at[0], draft.at[1] - anchor.at[1]) < MERGE_DISTANCE,
        );
    if (existing) {
      if (!object) existing.y = Math.max(existing.y, anchor.y);
      return existing;
    }
    const placed = object ? objectAnchor(object) : anchor;
    const draft: Draft = {
      id,
      kind: object?.kind ?? 'spot',
      name: object?.name ?? name,
      at: placed.at,
      y: placed.y,
      box: object?.box ?? spotBox(anchor),
      reach: object ? OBJECT_OFFER : anchor.reach - 0.4,
      actions: [],
      services: [],
      object,
      aliases: [],
    };
    drafts.push(draft);
    return draft;
  };
  for (const action of actions) {
    const anchor = actionAnchor(template, action, slots);
    join(anchor, thingAt(objects, anchor.at), `${ID_PREFIX}${action.id}`, action.label).actions.push(action);
  }
  for (const service of services) {
    const anchor = serviceAnchor(template, service, objects);
    const draft = join(
      anchor,
      thingAt(objects, anchor.at),
      `${ID_PREFIX}service:${service.id}`,
      service.label,
    );
    draft.services.push(service);
  }
  // Every other pew, treadmill or table does what the one with the marker does.
  const owned = new Set(drafts.map((draft) => draft.object).filter((object) => object !== null));
  for (const object of objects) {
    if (owned.has(object)) continue;
    const draft = drafts.find(
      (candidate) => candidate.object && ALIAS_KINDS[candidate.kind]?.includes(object.kind),
    );
    if (!draft) continue;
    draft.aliases.push(object.box);
    owned.add(object);
  }
  for (const draft of drafts) draft.actions.sort((a, b) => breadth(a) - breadth(b));
  if (goal) {
    for (const draft of drafts) {
      toFront(draft.actions, goal.actionId);
      toFront(draft.services, goal.serviceId);
    }
  }
  return drafts.map((draft): Hotspot => ({
    id: draft.id,
    kind: draft.kind,
    name: draft.name,
    at: draft.at,
    y: draft.y,
    box: draft.box,
    reach: draft.reach,
    aliases: draft.aliases,
    actions: draft.actions,
    services: draft.services,
  }));
}

/** Does this hotspot hold what advances the goal? */
export function holdsGoal(hotspot: Hotspot, goal: GoalHere | null): boolean {
  if (!goal) return false;
  return (
    (goal.actionId !== null && hotspot.actions.some((action) => action.id === goal.actionId)) ||
    (goal.serviceId !== null && hotspot.services.some((service) => service.id === goal.serviceId))
  );
}

/**
 * The room of a place where an action's hotspot goes: the room that lists it, else the room its activity happens in,
 * else the front room.
 */
export function hotspotRoom(layout: HomeLayout, action: Pick<ActionDefinition, 'animation'> & { readonly id?: string }): string {
  const listed = listedRoom(layout, action.id);
  if (listed) return listed;
  const mapped = layout.activityRooms[action.animation];
  return mapped && findRoom(layout, mapped) ? mapped : layout.entry;
}

/**
 * The hotspot on offer for someone standing at (x, z): the one whose thing they're closest to within its reach
 * (`current` keeps its offer a little longer), or null.
 */
export function hotspotAt(
  hotspots: readonly Hotspot[],
  x: number,
  z: number,
  current: string | null = null,
): Hotspot | null {
  let best: Hotspot | null = null;
  let bestScore = 0;
  for (const hotspot of hotspots) {
    const reach = hotspot.reach + (hotspot.id === current ? STICKINESS : 0);
    let distance = distanceToBox(hotspot.box, x, z);
    for (const alias of hotspot.aliases) distance = Math.min(distance, distanceToBox(alias, x, z));
    const score = reach - distance;
    if (score > bestScore) {
      best = hotspot;
      bestScore = score;
    }
  }
  return best;
}

/** The context-button id for doing an action at a hotspot. */
export const hotspotActionId = (actionId: string): string => `${ID_PREFIX}${actionId}`;

/** The action a context-button id starts, if it's a hotspot's. */
export function actionOfInteractable(interactableId: string): string | null {
  return interactableId.startsWith(ID_PREFIX) ? interactableId.slice(ID_PREFIX.length) : null;
}

/** "Drinks at the lounge · ₦18,000" (`note` is the price note, "" when free). */
export function actionButtonLabel(action: Pick<ActionDefinition, 'label'>, note: string): string {
  return note ? `${action.label} · ${note}` : action.label;
}

/** What a button needs to know about an action here: its price note and, when it can't be done now, why. */
export interface ActionStatus {
  readonly priceNote: string;
  readonly reason: string | null;
}

/**
 * The HUD context button for a hotspot: its first thing, the others as smaller buttons (each greyed out with its
 * reason when it can't be done now). More than fit: a last "More here" button opens the full list.
 */
export function hotspotInteractable(
  hotspot: Hotspot,
  status: (entry: ActionDefinition | PlaceService) => ActionStatus,
  maxMore = MAX_MORE,
): Interactable | null {
  const option = (action: ActionDefinition): InteractableOption => {
    const { priceNote, reason } = status(action);
    return {
      id: hotspotActionId(action.id),
      label: actionButtonLabel(action, priceNote),
      emoji: action.emoji,
      ...(reason ? { disabled: reason } : {}),
    };
  };
  const service = (entry: PlaceService): InteractableOption => {
    const { reason } = status(entry);
    return {
      id: serviceInteractableId(entry.id),
      label: entry.label,
      emoji: entry.emoji,
      ...(reason ? { disabled: reason } : {}),
    };
  };
  const [first, ...rest] = [...hotspot.actions.map(option), ...hotspot.services.map(service)];
  if (!first) return null;
  // "More here" takes the last place when the rest don't all fit.
  const fits = rest.length <= maxMore + 1 ? rest.length : maxMore;
  const more = rest.slice(0, fits);
  if (rest.length > fits) more.push({ id: MORE_HERE_ID, label: `More here (${rest.length - fits})`, emoji: '⋯' });
  return { ...first, kind: 'activity', more };
}

/** One thing on a hotspot's card: what it is, what it costs, how long, what it does — or why not now. */
export interface HotspotEntryCard {
  /** Interactable id (choosing it emits `interact` with this). */
  readonly id: string;
  readonly emoji: string;
  readonly label: string;
  readonly blurb: string;
  readonly priceNote: string;
  /** Minutes you can choose (actions); empty for services. */
  readonly durations: readonly number[];
  readonly effects: readonly string[];
  readonly disabled: string | null;
  /** Services: what the button says ("Open Motors"). */
  readonly opens: string | null;
  /** It's what your life goal needs here. */
  readonly goal: boolean;
}

/** A hotspot as its marker and card show it. */
export interface HotspotCard {
  readonly id: string;
  readonly name: string;
  readonly emoji: string;
  /** Its first thing ("Drinks at the lounge") and how many things in all. */
  readonly label: string;
  readonly count: number;
  /** The goal it advances ("Eat at a buka"), if any. */
  readonly goal: string | null;
  readonly entries: readonly HotspotEntryCard[];
}

/** The card for a hotspot (its marker shows the first entry's emoji). */
export function hotspotCard(
  hotspot: Hotspot,
  status: (entry: ActionDefinition | PlaceService) => ActionStatus,
  goal: GoalHere | null = null,
): HotspotCard {
  const entries: HotspotEntryCard[] = [
    ...hotspot.actions.map((action): HotspotEntryCard => {
      const { priceNote, reason } = status(action);
      return {
        id: hotspotActionId(action.id),
        emoji: action.emoji,
        label: action.label,
        blurb: action.blurb,
        priceNote,
        durations: action.durations,
        effects: actionEffects(action),
        disabled: reason,
        opens: null,
        goal: goal?.actionId === action.id,
      };
    }),
    ...hotspot.services.map((service): HotspotEntryCard => ({
      id: serviceInteractableId(service.id),
      emoji: service.emoji,
      label: service.label,
      blurb: service.blurb,
      priceNote: '',
      durations: [],
      effects: [],
      disabled: status(service).reason,
      opens: serviceOpensLabel(service),
      goal: goal?.serviceId === service.id,
    })),
  ];
  const first = entries[0];
  return {
    id: hotspot.id,
    name: hotspot.name,
    emoji: first?.emoji ?? '•',
    label: first?.label ?? hotspot.name,
    count: entries.length,
    goal: holdsGoal(hotspot, goal) ? (goal?.title ?? null) : null,
    entries,
  };
}
