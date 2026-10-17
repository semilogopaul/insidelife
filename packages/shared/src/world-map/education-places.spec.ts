import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../catalog/actions.js';
import { INSTITUTIONS } from '../catalog/education.js';
import { DISTRICTS } from '../catalog/geography.js';
import { findVenue } from '../catalog/venues.js';
import { findRoute } from './routing.js';
import { venueEntrance, venueLot } from './world-map.js';

/** The Lagos campuses and where they really are (Akoka, Yaba, Ojo, Ikorodu, Ayobo (Alimosho side, mapped to Mushin), Ilara-Epe, Ajah). */
const LAGOS_CAMPUSES: Readonly<Record<string, string>> = {
  unilag: 'yaba',
  yabatech: 'yaba',
  'fce-akoka': 'yaba',
  lasu: 'ojo',
  ekounimed: 'ojo',
  lasustech: 'ikorodu',
  caleb: 'ikorodu',
  anchor: 'mushin',
  augustine: 'epe',
  'pan-atlantic': 'ajah',
};

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
      expect(DISTRICTS[venue.districtId].cityId, id).toBe('lagos');
      expect(venue.districtId, id).toBe(districtId);
      expect(venueLot(venue.id)?.districtId, id).toBe(districtId);
      expect(findRoute(from, venueEntrance(venue.id)!.position), id).not.toBeNull();
    }
  });

  it('has no school outside Lagos', () => {
    expect(INSTITUTIONS.map((entry) => entry.id).sort()).toEqual(Object.keys(LAGOS_CAMPUSES).sort());
    for (const institution of INSTITUTIONS) expect(DISTRICTS[findVenue(institution.venueId)!.districtId].cityId, institution.id).toBe('lagos');
  });

  it('offers study actions at campuses', () => {
    expect(ACTIONS.some((action) => 'venueTypes' in action.where && (action.where.venueTypes as readonly string[]).includes('campus') && action.category === 'study')).toBe(true);
  });
});
