'use client';

import { useMemo } from 'react';
import {
  ACTIONS,
  findVenue,
  formatNaira,
  homeLocationId,
  isHomeLocation,
  isInterruptibleAction,
  isStreetLocation,
  type ActionDefinition,
  type CharacterSnapshotDto,
  type VenueDefinition,
  type VenueType,
} from '@insidelife/shared';

/**
 * What the player can do where they are: the place (own home, a friend's place, a venue) and the actions the shared
 * catalog allows there. Used by the venue sheet ("Things to do here") and by the world's hotspots, so both always
 * offer the same things at the same prices. Pure apart from the memo hook.
 */

export interface Place {
  /** `visit`: someone else's home you were invited to. */
  readonly kind: 'home' | 'visit' | 'venue';
  readonly name: string;
  readonly blurb: string;
  readonly venue: VenueDefinition | null;
}

/** Where an action list is for: your home, a friend's home, or a venue of a type. */
export type PlaceKind =
  | { readonly kind: 'home' }
  | { readonly kind: 'visit' }
  | { readonly kind: 'venue'; readonly venueType: VenueType | null };

/** Actions listed at a kind of place (never the engine-managed ones). */
export function actionsAt(place: PlaceKind): readonly ActionDefinition[] {
  return ACTIONS.filter((candidate) => {
    const action = candidate as ActionDefinition;
    if (action.system) return false;
    const where = action.where;
    if (where.anywhere) return true;
    if (place.kind === 'home') return where.home === true;
    if (place.kind === 'visit') return where.visit === true;
    return place.venueType !== null && (where.venueTypes ?? []).includes(place.venueType);
  });
}

/** Actions that belong to the place itself (not the "do it anywhere" ones like scrolling or calling family). */
export function isPlaceAction(action: ActionDefinition): boolean {
  return action.where.anywhere !== true;
}

/** Where the player is (if inside) and what they can do there. `hostName` names the host at someone's place. */
export function placeActions(
  snapshot: CharacterSnapshotDto | undefined,
  hostName: string | null = null,
): { readonly place: Place | null; readonly actions: readonly ActionDefinition[] } {
  if (!snapshot || snapshot.travel) return { place: null, actions: [] };
  const locationId = snapshot.character.locationId;
  if (isStreetLocation(locationId)) return { place: null, actions: [] };
  const atHome = isHomeLocation(locationId) && locationId === homeLocationId(snapshot.character.id);
  const visiting = isHomeLocation(locationId) && !atHome;
  const venue = findVenue(locationId) ?? null;
  const place: Place = atHome
    ? {
        kind: 'home',
        name: snapshot.summary.home.label,
        blurb: 'Your place. Rest, eat, get ready.',
        venue: null,
      }
    : visiting
      ? {
          kind: 'visit',
          name: hostName ? `${hostName}’s place` : 'A friend’s place',
          blurb: 'You’re a guest here. Make yourself at home (small small).',
          venue: null,
        }
      : { kind: 'venue', name: venue?.name ?? 'Somewhere', blurb: venue?.blurb ?? '', venue };
  const actions = actionsAt(
    place.kind === 'venue' ? { kind: 'venue', venueType: venue?.type ?? null } : { kind: place.kind },
  );
  return { place, actions };
}

/** Memoised `placeActions`. */
export function usePlaceActions(
  snapshot: CharacterSnapshotDto | undefined,
  hostName: string | null = null,
): { readonly place: Place | null; readonly actions: readonly ActionDefinition[] } {
  return useMemo(() => placeActions(snapshot, hostName), [snapshot, hostName]);
}

/** Something the player chose is running: starting another action waits (hanging around never blocks). */
export function isBusy(snapshot: CharacterSnapshotDto | undefined): boolean {
  const first = snapshot?.timeline[0];
  return first?.kind === 'action' && first.explicit && !isInterruptibleAction(first.actionId);
}

/** What one run costs now (₦, the world price index applied). */
export function actionPrice(action: ActionDefinition, priceIndex: number): number {
  return Math.round(action.cost * priceIndex);
}

/** Short price note for buttons: "₦18,000", "from your kitchen", or "" when free. */
export function actionPriceNote(
  action: ActionDefinition,
  priceIndex: number,
  pantryMeals = 0,
  format: (amount: number) => string = formatNaira,
): string {
  if (action.usesPantry && pantryMeals > 0) return 'from your kitchen';
  return action.cost > 0 ? format(actionPrice(action, priceIndex)) : '';
}
