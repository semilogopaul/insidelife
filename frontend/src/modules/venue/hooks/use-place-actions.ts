'use client';

import { useMemo } from 'react';
import { ACTIONS, findVenue, homeLocationId, isHomeLocation, isStreetLocation, type ActionDefinition, type CharacterSnapshotDto, type VenueDefinition } from '@insidelife/shared';

export interface Place {
  /** `visit`: someone else's home you were invited to. */
  readonly kind: 'home' | 'visit' | 'venue';
  readonly name: string;
  readonly blurb: string;
  readonly venue: VenueDefinition | null;
}

/** Where the player is (if inside) and what they can do there. `hostName` names the host when at someone's place. */
export function usePlaceActions(snapshot: CharacterSnapshotDto | undefined, hostName: string | null = null): { place: Place | null; actions: readonly ActionDefinition[] } {
  return useMemo(() => {
    if (!snapshot || snapshot.travel) return { place: null, actions: [] };
    const locationId = snapshot.character.locationId;
    if (isStreetLocation(locationId)) return { place: null, actions: [] };
    const atHome = isHomeLocation(locationId) && locationId === homeLocationId(snapshot.character.id);
    const visiting = isHomeLocation(locationId) && !atHome;
    const venue = findVenue(locationId) ?? null;
    const place: Place = atHome
      ? { kind: 'home', name: snapshot.summary.home.label, blurb: 'Your place. Rest, eat, get ready.', venue: null }
      : visiting
        ? { kind: 'visit', name: hostName ? `${hostName}’s place` : 'A friend’s place', blurb: 'You’re a guest here. Make yourself at home (small small).', venue: null }
        : { kind: 'venue', name: venue?.name ?? 'Somewhere', blurb: venue?.blurb ?? '', venue };
    const actions = ACTIONS.filter((action) => {
      if ('system' in action && action.system) return false;
      const where = action.where as ActionDefinition['where'];
      if (where.anywhere) return true;
      if (atHome) return where.home === true;
      if (visiting) return where.visit === true;
      return venue !== null && (where.venueTypes ?? []).includes(venue.type);
    });
    return { place, actions };
  }, [snapshot, hostName]);
}
