import type { ActionDefinition } from '@insidelife/shared';
import type { Interactable, InteractableOption } from '@/common/game/world-store';
import { MORE_HERE_ID, serviceInteractableId, type PlaceService } from '@/common/places';
import { findRoom } from '../layouts/geometry';
import type { HomeLayout } from '../layouts/types';
import type { At, InteriorTemplate } from '../templates/types';
import { actionAnchor, serviceAnchor, type ActionAnchor } from './action-spots';

/**
 * Hotspots: the place's actions anchored where they happen (the bar, the dance floor, the bed, the TV), each with a
 * floating marker. Walking up to one offers its action through the HUD context button. Actions anchored at (nearly)
 * the same place share one hotspot — the first is offered, the rest as smaller buttons. Pure.
 */

export interface Hotspot {
  /** Stable id: `hotspot:<first action id>` (or `hotspot:service:<id>`). */
  readonly id: string;
  /** Floor point (x, z) and marker height. */
  readonly at: At;
  readonly y: number;
  /** Offer radius (m) around `at`. */
  readonly reach: number;
  /** In catalog order; the first is offered first. */
  readonly actions: readonly ActionDefinition[];
  /** Phone-app services found here (browse cars, see a doctor), offered after the actions. */
  readonly services: readonly PlaceService[];
}

/** Anchors closer than this (m) are one hotspot. */
const MERGE_DISTANCE = 0.55;
/** The hotspot on offer stays on offer until you're this much past its reach (no flicker at the edge). */
const STICKINESS = 0.3;
/** Extra things to do at a spot shown under the main one (the sheet lists everything). */
export const MAX_MORE = 3;

const ID_PREFIX = 'hotspot:';

/**
 * Group a room's actions (and the place's phone-app services) into hotspots. `slots` is the unfurnished template
 * (where furniture slots are).
 */
export function buildHotspots(
  template: InteriorTemplate,
  actions: readonly ActionDefinition[],
  slots: InteriorTemplate = template,
  services: readonly PlaceService[] = [],
): Hotspot[] {
  type Draft = {
    id: string;
    at: At;
    y: number;
    reach: number;
    actions: ActionDefinition[];
    services: PlaceService[];
  };
  const hotspots: Draft[] = [];
  const join = (anchor: ActionAnchor, id: string): Draft => {
    const near = hotspots.find(
      (hotspot) => Math.hypot(hotspot.at[0] - anchor.at[0], hotspot.at[1] - anchor.at[1]) < MERGE_DISTANCE,
    );
    if (near) {
      near.y = Math.max(near.y, anchor.y);
      near.reach = Math.max(near.reach, anchor.reach);
      return near;
    }
    const draft: Draft = { id, at: anchor.at, y: anchor.y, reach: anchor.reach, actions: [], services: [] };
    hotspots.push(draft);
    return draft;
  };
  for (const action of actions)
    join(actionAnchor(template, action, slots), `${ID_PREFIX}${action.id}`).actions.push(action);
  for (const service of services)
    join(serviceAnchor(template, service), `${ID_PREFIX}service:${service.id}`).services.push(service);
  return hotspots;
}

/** What a hotspot's marker shows: its first action or service, and how many things it has in all. */
export function hotspotHeadline(hotspot: Hotspot): {
  readonly emoji: string;
  readonly label: string;
  readonly count: number;
} {
  const first = hotspot.actions[0] ?? hotspot.services[0];
  return {
    emoji: first?.emoji ?? '•',
    label: first?.label ?? '',
    count: hotspot.actions.length + hotspot.services.length,
  };
}

/** The room of a home where an action's hotspot goes: the room its activity happens in, else the front room. */
export function hotspotRoom(layout: HomeLayout, action: Pick<ActionDefinition, 'animation'>): string {
  const mapped = layout.activityRooms[action.animation];
  return mapped && findRoom(layout, mapped) ? mapped : layout.entry;
}

/**
 * The hotspot on offer for someone standing at (x, z): the one whose reach they're deepest inside (`current` keeps
 * its offer a little longer), or null.
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
    const score = reach - Math.hypot(hotspot.at[0] - x, hotspot.at[1] - z);
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
 * The HUD context button for a hotspot: its first action, the others as smaller buttons (each greyed out with its
 * reason when it can't be done now). More than fit: a last "More here" button opens the full list.
 */
export function hotspotInteractable(
  hotspot: Hotspot,
  status: (action: ActionDefinition) => ActionStatus,
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
  const service = (entry: PlaceService): InteractableOption => ({
    id: serviceInteractableId(entry.id),
    label: entry.label,
    emoji: entry.emoji,
  });
  const [first, ...rest] = [...hotspot.actions.map(option), ...hotspot.services.map(service)];
  if (!first) return null;
  const more = rest.slice(0, MAX_MORE);
  if (rest.length > MAX_MORE)
    more.push({ id: MORE_HERE_ID, label: `More here (${rest.length - MAX_MORE})`, emoji: '⋯' });
  return { ...first, kind: 'activity', more };
}
