'use client';

import { useMemo } from 'react';
import { ACTIONS, findVenue, homeLocationId, isHomeLocation, isStreetLocation, type ActionDefinition, type CharacterSnapshotDto, type VenueDefinition } from '@insidelife/shared';

export interface Place {
  readonly kind: 'home' | 'venue';
  readonly name: string;
  readonly blurb: string;
  readonly venue: VenueDefinition | null;
}

/** Where the player is (if inside) and what they can do there. */
export function usePlaceActions(snapshot: CharacterSnapshotDto | undefined): { place: Place | null; actions: readonly ActionDefinition[] } {
  return useMemo(() => {
    if (!snapshot || snapshot.travel) return { place: null, actions: [] };
    const locationId = snapshot.character.locationId;
    if (isStreetLocation(locationId)) return { place: null, actions: [] };
    const atHome = isHomeLocation(locationId) && locationId === homeLocationId(snapshot.character.id);
    const venue = findVenue(locationId) ?? null;
    const place: Place = atHome
      ? { kind: 'home', name: snapshot.summary.home.label, blurb: 'Your place. Rest, eat, get ready.', venue: null }
      : { kind: 'venue', name: venue?.name ?? 'Somewhere', blurb: venue?.blurb ?? '', venue };
    const actions = ACTIONS.filter((action) => {
      if ('system' in action && action.system) return false;
      const where = action.where as ActionDefinition['where'];
      if (where.anywhere) return true;
      if (atHome) return where.home === true;
      return venue !== null && (where.venueTypes ?? []).includes(venue.type);
    });
    return { place, actions };
  }, [snapshot]);
}
