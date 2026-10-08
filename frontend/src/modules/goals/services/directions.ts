import {
  VENUES,
  districtBounds,
  homeEntrance,
  isHomeLocation,
  isVenueOpen,
  streetDistrict,
  straightDistance,
  venueEntrance,
  type DistrictId,
  type VenueDefinition,
  type VenueType,
  type WorldPoint,
} from '@insidelife/shared';

const LAGOS_VENUES: readonly VenueDefinition[] = (VENUES as readonly VenueDefinition[]).filter((venue) => !venue.regionId || venue.regionId === 'lagos');

export interface NearestVenue {
  readonly venue: VenueDefinition;
  /** Straight-line metres in the world (for ordering only). */
  readonly distance: number;
  readonly open: boolean;
}

/**
 * The nearest Lagos venue of any of `types` to `from`: open places first, then closest, then id (deterministic).
 * Returns null when no venue matches.
 */
export function nearestVenueOfTypes(types: readonly VenueType[], from: WorldPoint, hour: number): NearestVenue | null {
  let best: NearestVenue | null = null;
  for (const venue of LAGOS_VENUES) {
    if (!types.includes(venue.type)) continue;
    const door = venueEntrance(venue.id);
    if (!door) continue;
    const candidate: NearestVenue = { venue, distance: straightDistance(from, door.position), open: isVenueOpen(venue, hour) };
    if (
      !best ||
      Number(candidate.open) > Number(best.open) ||
      (candidate.open === best.open && (candidate.distance < best.distance || (candidate.distance === best.distance && venue.id < best.venue.id)))
    ) {
      best = candidate;
    }
  }
  return best;
}

/** Where the player is on the map: live position when outside, otherwise the door of where they are. */
export function playerPoint(input: {
  readonly live: WorldPoint | null;
  readonly locationId: string;
  readonly characterId: string;
  readonly homeDistrictId: DistrictId;
}): WorldPoint {
  if (input.live) return input.live;
  if (isHomeLocation(input.locationId)) return homeEntrance(input.characterId, input.homeDistrictId).position;
  const street = streetDistrict(input.locationId);
  if (street) return districtBounds(street).centre;
  return venueEntrance(input.locationId)?.position ?? homeEntrance(input.characterId, input.homeDistrictId).position;
}
