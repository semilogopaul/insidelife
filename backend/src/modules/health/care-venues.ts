import {
  cityOfDistrict,
  cityOfVenue,
  VENUES,
  districtDistance,
  findVenue,
  isCareFacility,
  isVenueOpen,
  toDateParts,
  type CareFacilityType,
  type DistrictId,
  type GameMinute,
  type VenueDefinition,
} from '@insidelife/shared';

export interface CareVenue {
  readonly venue: VenueDefinition;
  readonly facility: CareFacilityType;
}

/** The pharmacy or hospital at a location, if it is one. */
export function careVenueAt(locationId: string): CareVenue | null {
  const venue = findVenue(locationId);
  if (!venue || !isCareFacility(venue.type)) return null;
  return { venue, facility: venue.type };
}

export function isCareVenueOpen(venue: VenueDefinition, t: GameMinute): boolean {
  return isVenueOpen(venue, toDateParts(t).hour);
}

/** Closest venue of a facility type to a district, in the district's own city (null if the city has none). */
export function nearestCareVenue(facility: CareFacilityType, districtId: DistrictId): VenueDefinition | null {
  let best: VenueDefinition | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const city = cityOfDistrict(districtId);
  for (const venue of VENUES) {
    if (venue.type !== facility || cityOfVenue(venue) !== city) continue;
    const distance = districtDistance(districtId, venue.districtId);
    if (distance < bestDistance) {
      best = venue;
      bestDistance = distance;
    }
  }
  return best;
}
