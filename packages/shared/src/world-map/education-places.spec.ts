import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../catalog/actions.js';
import { INSTITUTIONS } from '../catalog/education.js';
import { findVenue } from '../catalog/venues.js';
import { findRoute } from './routing.js';
import { venueEntrance, venueLot } from './world-map.js';

/** The Lagos campuses and where they really are (Akoka, Yaba, Ojo, Ajah). */
const LAGOS_CAMPUSES: Readonly<Record<string, string>> = { unilag: 'yaba', yabatech: 'yaba', lasu: 'ojo', 'pan-atlantic': 'ajah' };

describe('schools in the education catalog', () => {
  it('sits every institution at a campus venue', () => {
    for (const institution of INSTITUTIONS) {
      const venue = findVenue(institution.venueId);
      expect(venue, institution.id).toBeDefined();
      expect(venue?.type, institution.id).toBe('campus');
    }
  });

  it('puts the Lagos institutions in their real districts, on the map, reachable by road', () => {
    const from = venueEntrance('national-stadium')!.position;
    for (const [id, districtId] of Object.entries(LAGOS_CAMPUSES)) {
      const institution = INSTITUTIONS.find((entry) => entry.id === id);
      expect(institution, id).toBeDefined();
      const venue = findVenue(institution!.venueId)!;
      expect(venue.regionId, id).toBeUndefined();
      expect(venue.districtId, id).toBe(districtId);
      expect(venueLot(venue.id)?.districtId, id).toBe(districtId);
      expect(findRoute(from, venueEntrance(venue.id)!.position), id).not.toBeNull();
    }
  });

  it('leaves the other institutions in their own cities, reached by a bus or a flight', () => {
    for (const institution of INSTITUTIONS.filter((entry) => !(entry.id in LAGOS_CAMPUSES))) {
      expect(findVenue(institution.venueId)?.regionId, institution.id).toBeDefined();
    }
  });

  it('offers study actions at campuses', () => {
    expect(ACTIONS.some((action) => action.where.venueTypes?.includes('campus') && action.category === 'study')).toBe(true);
  });
});
