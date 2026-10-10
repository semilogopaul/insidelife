import { findVenue, isHomeLocation, type DistrictId, type VenueDefinition, type VisitDto } from '@insidelife/shared';

/** Where the Map can take you: a venue, your own home, or the home of someone expecting you (an accepted invite). */
export type MapTarget =
  | { readonly kind: 'venue'; readonly venue: VenueDefinition }
  | { readonly kind: 'home' }
  | {
      readonly kind: 'visit';
      /** `home:<hostId>`: the GPS, the quotes and the ride all take it. */
      readonly locationId: string;
      readonly name: string;
      /** "Family room (face-me-I-face-you), Ikorodu". */
      readonly detail: string | null;
      readonly districtId: DistrictId | null;
    };

export function visitTarget(visit: VisitDto): MapTarget {
  return {
    kind: 'visit',
    locationId: visit.home.locationId,
    name: `${visit.host.firstName}’s place`,
    detail: visit.home.label,
    districtId: visit.home.districtId,
  };
}

/** Homes you're expected at and not in yet (accepted invites), for the Map's list. */
export function expectedVisits(incoming: readonly VisitDto[] | undefined, here: string | null): readonly MapTarget[] {
  return (incoming ?? [])
    .filter((visit) => visit.role === 'guest' && visit.status === 'accepted' && visit.home.locationId !== here)
    .map(visitTarget);
}

/**
 * A Map destination from an id or a deep link (`openPhone('map', param)`): a venue id, `home` (yours), or
 * `home:<id>` — yours, or a host's (named from the invite when there is one).
 */
export function targetFromParam(param: string | null, ownHomeId: string | null, incoming: readonly VisitDto[] | undefined): MapTarget | null {
  if (!param) return null;
  if (param === 'home' || param === ownHomeId) return { kind: 'home' };
  if (isHomeLocation(param)) {
    const visit = incoming?.find((candidate) => candidate.role === 'guest' && candidate.home.locationId === param);
    return visit ? visitTarget(visit) : { kind: 'visit', locationId: param, name: 'A friend’s place', detail: null, districtId: null };
  }
  const venue = findVenue(param);
  return venue ? { kind: 'venue', venue } : null;
}

/** The id the GPS, quotes and bookings use (null for your home until the snapshot has loaded). */
export function targetLocationId(target: MapTarget, ownHomeId: string | null): string | null {
  if (target.kind === 'venue') return target.venue.id;
  if (target.kind === 'home') return ownHomeId;
  return target.locationId;
}

export function targetName(target: MapTarget): string {
  if (target.kind === 'venue') return target.venue.name;
  if (target.kind === 'home') return 'Home';
  return target.name;
}
