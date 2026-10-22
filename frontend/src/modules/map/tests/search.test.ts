import { describe, expect, it } from 'vitest';
import { VENUES, cityOfVenue } from '@insidelife/shared';
import { CATEGORIES } from '../services/categories';
import { closedNote, distanceLabel, editDistance, normalizeText, scoreVenue, searchVenues } from '../services/search';

const lagos = { fromDistrict: 'yaba', cityId: 'lagos' } as const;
const names = (query: string, extra: Partial<Parameters<typeof searchVenues>[2]> = {}) => searchVenues(query, VENUES, { ...lagos, ...extra });
const venue = (id: string) => VENUES.find((v) => v.id === id)!;

describe('Map search matching', () => {
  it('ignores case, accents and punctuation', () => {
    expect(normalizeText('  Ìkéjà  City-Mall! ')).toBe('ikeja city mall');
    expect(names('IKEJA city mall').here[0]?.venue.id).toBe('ikeja-city-mall');
    expect(names('Ikéjà').here.length).toBeGreaterThan(0);
  });

  it('finds by name, by short id nickname, by district and by kind of place', () => {
    expect(names('unilag').here[0]?.venue.id).toBe('unilag');
    expect(names('hospital').here.map((r) => r.venue.id)).toEqual(expect.arrayContaining(['lasuth', 'luth']));
    expect(names('ikeja').here.some((r) => r.venue.districtId === 'ikeja')).toBe(true);
    expect(names('hotel').here.some((r) => r.venue.type === 'hotel')).toBe(true);
    expect(names('suya').here.some((r) => r.venue.id === 'ikeja-gra-lounge')).toBe(true);
    expect(names('eko').here.length).toBeGreaterThan(0);
  });

  it('finds a place by its city’s name, like the Hangar calls the terminals', () => {
    expect(names('Lagos General Aviation Terminal').here[0]?.venue.id).toBe('mmia-gat');
    expect(names('lagos airport').here.map((r) => r.venue.id)).toEqual(expect.arrayContaining(['mmia-airport', 'mmia-gat']));
    expect(names('abuja hotel').elsewhere.every((r) => r.cityId === 'abuja' && r.venue.type === 'hotel')).toBe(true);
    expect(names('abuja hotel').elsewhere.length).toBeGreaterThan(0);
    // From Abuja, the Lagos terminal is listed with the other city.
    expect(names('Lagos General Aviation Terminal', { fromDistrict: 'lugbe', cityId: 'abuja' }).elsewhere[0]?.venue.id).toBe('mmia-gat');
  });

  it('tolerates a typo', () => {
    expect(editDistance('hotle', 'hotel', 2)).toBe(1);
    expect(names('hospitl').here.some((r) => r.venue.type.startsWith('hospital'))).toBe(true);
    expect(names('shita amala').here[0]?.venue.id).toBe('shitta-amala');
    expect(names('qzxjv').here).toHaveLength(0);
  });

  it('ranks exact name, then starts-with, then word, then category and district', () => {
    const exact = scoreVenue('Ikeja City Mall', venue('ikeja-city-mall'));
    const starts = scoreVenue('ikeja city', venue('ikeja-city-mall'));
    const word = scoreVenue('mall', venue('ikeja-city-mall'));
    const district = scoreVenue('yaba', venue('unilag'));
    expect(exact).toBeGreaterThan(starts);
    expect(starts).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(district);
    const results = names('mall').here;
    for (let i = 1; i < results.length; i += 1) expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
  });

  it('puts the current city first and the other city in its own group', () => {
    const fromLagos = names('hotel');
    expect(fromLagos.here.every((r) => cityOfVenue(r.venue) === 'lagos')).toBe(true);
    expect(fromLagos.elsewhere.length).toBeGreaterThan(0);
    expect(fromLagos.elsewhere.every((r) => cityOfVenue(r.venue) === 'abuja')).toBe(true);
    const fromAbuja = searchVenues('hotel', VENUES, { fromDistrict: 'jabi', cityId: 'abuja' });
    expect(fromAbuja.here.every((r) => cityOfVenue(r.venue) === 'abuja')).toBe(true);
  });

  it('matches Abuja district names', () => {
    const jabi = searchVenues('jabi', VENUES, { fromDistrict: 'jabi', cityId: 'abuja' });
    expect(jabi.here.length).toBeGreaterThan(0);
  });

  it('combines with a category chip', () => {
    const health = CATEGORIES.find((c) => c.label === 'Health')!;
    const found = names('ikeja', { types: health.types }).here;
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((r) => health.types.includes(r.venue.type))).toBe(true);
  });

  it('measures distance and flags closed venues', () => {
    expect(distanceLabel('yaba', venue('unilag'))).toBe('Nearby');
    expect(distanceLabel('yaba', venue('ikeja-city-mall'))).toMatch(/km away$/);
    const fmt = (h: number) => `${h} AM`;
    expect(closedNote(venue('ikeja-city-mall'), 3, fmt)).toBe('Closed now · opens 9 AM');
    expect(closedNote(venue('ikeja-city-mall'), 12, fmt)).toBeNull();
    expect(closedNote(venue('unilag'), 3, fmt)).toBeNull();
  });
});
