import { describe, expect, it } from 'vitest';
import { adSlotsInCity } from '../catalog/ad-inventory.js';
import { JOBS, JOB_DEGREE_PAY_THRESHOLD_NGN, JOB_MAX_MONTHLY_NGN, jobCityId, payNeedsDegree } from '../catalog/careers.js';
import { INSTITUTIONS } from '../catalog/education.js';
import { DISTRICTS } from '../catalog/geography.js';
import { HOUSING_TYPES, isHousingTypeAllowed, marketRent } from '../catalog/housing.js';
import { BILLBOARD_SLOTS } from '../catalog/promotions.js';
import { cityOfVenue, findVenue, venuesOfCity, type VenueType } from '../catalog/venues.js';
import { CITY_SCENERY_REACH } from './city-layout.js';
import { CITY_MAP, cityBounds, cityAt, venueLot } from './city-map.js';
import { findRoute } from './routing.js';
import { venueEntrance } from './world-map.js';

const abujaVenues = venuesOfCity('abuja');
const countOfType = (type: VenueType): number => abujaVenues.filter((venue) => venue.type === type).length;

describe('Abuja is a full city', () => {
  it('has about sixty places on top of the skeleton, in every district', () => {
    expect(abujaVenues.length).toBeGreaterThanOrEqual(60);
    for (const districtId of Object.keys(DISTRICTS).filter((id) => DISTRICTS[id as keyof typeof DISTRICTS].cityId === 'abuja')) {
      expect(abujaVenues.filter((venue) => venue.districtId === districtId).length, districtId).toBeGreaterThanOrEqual(3);
    }
  });

  it('names the places the owner listed, by their real names', () => {
    const named = [
      'Eagle Square',
      'Abuja National Mosque',
      'National Christian Centre',
      'Millennium Park',
      'Jabi Lake Mall',
      'Jabi Lake Park',
      'Ceddi Plaza',
      'Silverbird Galleria',
      'Wuse Market',
      'Garki International Market',
      'Banex Plaza',
      'Transcorp Hilton Abuja',
      'Federal Secretariat Complex',
      'NNPC Towers',
      'Central Bank of Nigeria Headquarters',
      'National Assembly Complex',
      'National Hospital Abuja',
      'Garki Hospital',
      'University of Abuja',
      'Baze University',
      'Nile University of Nigeria',
    ];
    const names = new Set(abujaVenues.map((venue) => venue.name));
    for (const name of named) expect(names.has(name), name).toBe(true);
  });

  it('covers every kind of place a city needs', () => {
    expect(countOfType('pharmacy')).toBeGreaterThanOrEqual(2);
    expect(countOfType('gym')).toBeGreaterThanOrEqual(2);
    expect(countOfType('church')).toBeGreaterThanOrEqual(2);
    expect(countOfType('mosque')).toBeGreaterThanOrEqual(2);
    expect(countOfType('bar') + countOfType('club')).toBeGreaterThanOrEqual(3);
    expect(countOfType('restaurant')).toBeGreaterThanOrEqual(2);
    expect(countOfType('buka')).toBeGreaterThanOrEqual(3);
    expect(countOfType('cinema')).toBeGreaterThanOrEqual(1);
    expect(countOfType('salon')).toBeGreaterThanOrEqual(2);
    expect(countOfType('car-dealer')).toBeGreaterThanOrEqual(2);
    expect(countOfType('estate-agency')).toBeGreaterThanOrEqual(1);
    expect(countOfType('cbt-centre')).toBeGreaterThanOrEqual(1);
    expect(countOfType('campus')).toBeGreaterThanOrEqual(3);
    expect(countOfType('hospital-public')).toBeGreaterThanOrEqual(5);
    expect(countOfType('government')).toBeGreaterThanOrEqual(8);
    expect(countOfType('market')).toBeGreaterThanOrEqual(4);
  });

  it('gives every venue its own lot on the Abuja map, in its own district, with a door on a road', () => {
    const cells = new Set<string>();
    for (const venue of abujaVenues) {
      const lot = venueLot(venue.id);
      expect(lot, venue.id).not.toBeNull();
      if (!lot) continue;
      expect(lot.kind, venue.id).toBe('venue');
      expect(lot.districtId, venue.id).toBe(venue.districtId);
      expect(cityOfVenue(venue), venue.id).toBe('abuja');
      expect(cityAt(lot.entrance?.position ?? { x: 0, z: 0 }), venue.id).toBe('abuja');
      expect(venueEntrance(venue.id), venue.id).not.toBeNull();
      const [c0, r0, c1, r1] = lot.cells;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const key = `${c}:${r}`;
          expect(cells.has(key), `${venue.id} overlaps another lot at ${key}`).toBe(false);
          cells.add(key);
        }
      }
    }
  });

  it('is joined by road: every place can be driven to from the airport', () => {
    const from = venueEntrance('naia-airport')?.position;
    expect(from).toBeDefined();
    if (!from) return;
    for (const venue of abujaVenues) {
      const entrance = venueEntrance(venue.id)?.position;
      expect(entrance, venue.id).toBeDefined();
      if (entrance) expect(findRoute(from, entrance), venue.id).not.toBeNull();
    }
  });

  it('puts Aso Rock on the map as a landmark and nothing of Abuja in Lagos', () => {
    const rock = CITY_MAP.lots.find((lot) => lot.id === 'landmark:aso-rock');
    expect(rock).toBeDefined();
    expect(DISTRICTS[rock?.districtId ?? 'ikeja'].cityId).toBe('abuja');
    const abuja = cityBounds('abuja');
    for (const lot of CITY_MAP.lots) {
      if (DISTRICTS[lot.districtId].cityId !== 'abuja') continue;
      expect(lot.footprint.minX, lot.id).toBeGreaterThanOrEqual(abuja.minX - 1);
      expect(lot.footprint.maxZ, lot.id).toBeLessThanOrEqual(abuja.maxZ + 1);
    }
  });

  it('keeps the two cities far enough apart that neither is ever visible from the other', () => {
    // The client draws 385 m at most (fog far 370 on high quality); each city's scenery reaches a little beyond its grid.
    const lagos = cityBounds('lagos');
    const abuja = cityBounds('abuja');
    const gapX = Math.max(0, abuja.minX - CITY_SCENERY_REACH.abuja - (lagos.maxX + CITY_SCENERY_REACH.lagos));
    const gapZ = Math.max(0, abuja.minZ - CITY_SCENERY_REACH.abuja - (lagos.maxZ + CITY_SCENERY_REACH.lagos));
    expect(Math.hypot(gapX, gapZ)).toBeGreaterThan(385 + 50);
  });
});

describe('Abuja jobs', () => {
  const abujaJobs = JOBS.filter((job) => jobCityId(job) === 'abuja');

  it('has employers in the civil service, embassies, oil, banking, hospitality, healthcare and tech', () => {
    const employers = abujaJobs.map((job) => job.employer).join(' | ');
    expect(abujaJobs.length).toBeGreaterThanOrEqual(14);
    for (const expected of ['Civil Service', 'U.S. Embassy', 'British High Commission', 'National Assembly', 'Petroleum', 'Central Bank', 'Guaranty Trust', 'Hilton', 'Sheraton', 'Galaxy Backbone', 'Garki Hospital', 'University of Abuja']) {
      expect(employers, expected).toContain(expected);
    }
  });

  it('works at venues in Abuja that exist', () => {
    for (const job of abujaJobs) {
      const venue = findVenue(job.workplaceId);
      expect(venue, job.id).toBeDefined();
      expect(cityOfVenue(venue!), job.id).toBe('abuja');
    }
  });

  it('keeps to the careers rules: nothing above ₦10m a month, a degree for ₦3m and over', () => {
    for (const job of abujaJobs) {
      job.levels.forEach((level, index) => {
        expect(level.pay, `${job.id} ${level.title}`).toBeLessThanOrEqual(JOB_MAX_MONTHLY_NGN);
        if (payNeedsDegree(job.currency, level.pay) && !job.degreeExempt) {
          const education = index === 0 ? job.requirements.education : level.education ?? job.requirements.education;
          expect(['hnd', 'bachelors', 'masters', 'phd'], `${job.id} ${level.title} pays ${level.pay} (≥ ${JOB_DEGREE_PAY_THRESHOLD_NGN})`).toContain(education);
        }
      });
    }
  });
});

describe('Abuja homes', () => {
  it('puts mansions in Maitama and Asokoro only, with the rent order the districts deserve', () => {
    expect(isHousingTypeAllowed('maitama', 'mansion')).toBe(true);
    expect(isHousingTypeAllowed('asokoro', 'mansion')).toBe(true);
    for (const district of ['gwarinpa', 'kubwa', 'lugbe', 'garki', 'wuse', 'jabi', 'abuja-cbd'] as const) expect(isHousingTypeAllowed(district, 'mansion'), district).toBe(false);
    expect(isHousingTypeAllowed('maitama', 'face-me')).toBe(false);
    expect(isHousingTypeAllowed('kubwa', 'face-me')).toBe(true);
    for (const type of Object.keys(HOUSING_TYPES) as Array<keyof typeof HOUSING_TYPES>) {
      expect(marketRent('asokoro', type), type).toBeGreaterThan(marketRent('gwarinpa', type));
      expect(marketRent('maitama', type), type).toBeGreaterThan(marketRent('gwarinpa', type));
      expect(marketRent('gwarinpa', type), type).toBeGreaterThan(marketRent('kubwa', type));
      expect(marketRent('kubwa', type), type).toBeGreaterThanOrEqual(marketRent('lugbe', type));
    }
  });
});

describe('Abuja schools and ads', () => {
  it('seats the University of Abuja, Baze and Nile in their districts', () => {
    const expected: Readonly<Record<string, string>> = { 'university-of-abuja': 'lugbe', 'baze-university': 'jabi', 'nile-university': 'jabi' };
    for (const [id, districtId] of Object.entries(expected)) {
      const institution = INSTITUTIONS.find((entry) => entry.id === id);
      expect(institution, id).toBeDefined();
      expect(findVenue(institution!.venueId)?.districtId, id).toBe(districtId);
      expect(institution!.courses.length, id).toBeGreaterThanOrEqual(8);
    }
  });

  it('has premium billboard sites in Abuja that are in the Abuja ad catalog and not Lagos’s', () => {
    const abujaSlots = BILLBOARD_SLOTS.filter((slot) => slot.districtId && DISTRICTS[slot.districtId].cityId === 'abuja');
    expect(abujaSlots.length).toBeGreaterThanOrEqual(4);
    const inAbuja = new Set(adSlotsInCity('abuja').map((slot) => slot.id));
    const inLagos = new Set(adSlotsInCity('lagos').map((slot) => slot.id));
    for (const slot of abujaSlots) {
      expect(inAbuja.has(slot.id), slot.id).toBe(true);
      expect(inLagos.has(slot.id), slot.id).toBe(false);
      const board = CITY_MAP.billboards.find((entry) => entry.slotId === slot.id);
      expect(board, slot.id).toBeDefined();
      if (board) expect(cityAt(board.position), slot.id).toBe('abuja');
    }
  });
});
