import { describe, expect, it } from 'vitest';
import { CITY_MAP, venueEntrance, venueLot } from '../world-map/world-map.js';
import { ACTIONS, type ActionDefinition } from './actions.js';
import { FEATURED_PLACES, featuredHeadline, liveFeaturedPlaces } from './onboarding.js';
import { ACHIEVEMENTS, LIFE_GOALS, type ProgressionCondition } from './progression.js';
import { findVenue, isVenueOpen } from './venues.js';

const actionsAt = (type: string): ActionDefinition[] => (ACTIONS as readonly ActionDefinition[]).filter((action) => action.where.venueTypes?.includes(type as never));
const leaves = (condition: ProgressionCondition): ProgressionCondition[] => (condition.kind === 'all' || condition.kind === 'any' ? condition.of.flatMap(leaves) : [condition]);

describe('OBO Mansion, AIR OBO and Dangote Refinery', () => {
  it('are public places: OBO Mansion and its jet in Ikoyi, the refinery in Epe & Ibeju-Lekki, open by day', () => {
    expect(findVenue('obo-mansion')).toMatchObject({ name: 'OBO Mansion', type: 'mansion', districtId: 'ikoyi' });
    expect(findVenue('air-obo')).toMatchObject({ name: 'AIR OBO', type: 'private-jet', districtId: 'ikoyi' });
    expect(findVenue('dangote-refinery')).toMatchObject({ name: 'Dangote Refinery', type: 'refinery', districtId: 'epe' });
    for (const id of ['obo-mansion', 'air-obo', 'dangote-refinery']) {
      const venue = findVenue(id)!;
      expect(venue.minStatus, id).toBeUndefined();
      expect(isVenueOpen(venue, 11), id).toBe(true);
      expect(isVenueOpen(venue, 3), id).toBe(false);
    }
  });

  it('turns the "now live" prompt on with their ids', () => {
    expect(liveFeaturedPlaces().map((place) => place.venueId)).toEqual(['obo-mansion', 'dangote-refinery']);
    expect(featuredHeadline(liveFeaturedPlaces(FEATURED_PLACES))).toBe('OBO Mansion and Dangote Refinery are now live!');
  });

  it('parks the jet beside the mansion: two lots of one estate, both gates on the same bend', () => {
    const mansion = venueLot('obo-mansion')!;
    const jet = venueLot('air-obo')!;
    expect(mansion.archetype).toBe('mansion');
    expect(jet.archetype).toBe('jet-pad');
    // Side by side: the jet's pad runs along the mansion grounds' north edge.
    expect(jet.footprint.maxZ).toBe(mansion.footprint.minZ);
    expect(jet.footprint.maxX).toBe(mansion.footprint.maxX);
    const a = venueEntrance('obo-mansion')!;
    const b = venueEntrance('air-obo')!;
    // Both gates face the four-lane bend: about a road half-width apart.
    expect(Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z)).toBeLessThan(14);
    // The estate is the biggest private lot in Ikoyi.
    const area = (lot: typeof mansion): number => (lot.footprint.maxX - lot.footprint.minX) * (lot.footprint.maxZ - lot.footprint.minZ);
    for (const lot of CITY_MAP.lots) if (lot.districtId === 'ikoyi' && lot.kind === 'home') expect(area(lot)).toBeLessThan(area(mansion) / 8);
  });

  it('puts the refinery works on the lagoon shore behind its visitor centre', () => {
    const centre = venueLot('dangote-refinery')!;
    const works = CITY_MAP.lots.find((lot) => lot.id === 'landmark:dangote-works')!;
    expect(works.footprint.maxX).toBe(centre.footprint.minX);
    expect((works.footprint.maxX - works.footprint.minX) * (works.footprint.maxZ - works.footprint.minZ)).toBeGreaterThanOrEqual(3_000);
  });

  it('offers things to do at each, mostly free, with a toilet on the jet and a little engineering at the refinery', () => {
    const mansion = actionsAt('mansion');
    const jet = actionsAt('private-jet');
    const refinery = actionsAt('refinery');
    expect(mansion.map((action) => action.id)).toEqual(expect.arrayContaining(['obo-movie', 'obo-vip-screening', 'obo-fifa', 'obo-snooker', 'obo-arcade', 'obo-listen', 'obo-record', 'obo-chef-table']));
    expect(jet.map((action) => action.id)).toEqual(expect.arrayContaining(['air-obo-captain', 'air-obo-selfie', 'air-obo-toilet']));
    expect(refinery.map((action) => action.id)).toEqual(expect.arrayContaining(['refinery-tour', 'refinery-learn', 'refinery-gift-shop']));
    for (const list of [mansion, jet, refinery]) {
      expect(list.filter((action) => action.cost === 0).length).toBeGreaterThanOrEqual(list.length / 2);
      for (const action of list) expect(action.requires?.itemTag, action.id).toBeUndefined();
    }
    expect(Math.max(...mansion.map((action) => action.cost))).toBe(25_000);
    const toilet = jet.find((action) => action.id === 'air-obo-toilet')!;
    expect(toilet.category).toBe('hygiene');
    expect(toilet.drift.hygiene?.rate).toBeGreaterThan(0);
    expect(refinery.find((action) => action.id === 'refinery-learn')?.skillXpPerHour?.engineering).toBeGreaterThan(0);
  });

  it('adds challenges that complete from arriving or from the actions there', () => {
    const byId = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id as string, achievement]));
    const keys = (id: string): string[] => leaves(byId.get(id)!.condition).map((leaf) => (leaf.kind === 'counter' ? leaf.key : leaf.kind));
    expect(keys('inside-obo-mansion')).toEqual(['venue:obo-mansion']);
    expect(keys('movie-night-at-obos')).toEqual(['action:obo-movie', 'action:obo-vip-screening']);
    expect(keys('winner-stays-on')).toEqual(['action:obo-fifa']);
    expect(keys('captain-on-deck')).toEqual(['action:air-obo-selfie']);
    expect(keys('peed-on-a-private-jet')).toEqual(['action:air-obo-toilet']);
    expect(keys('where-petrol-comes-from')).toEqual(['action:refinery-tour']);
    expect(keys('e-choke')).toEqual(expect.arrayContaining(['action:obo-fifa', 'action:obo-record', 'action:air-obo-selfie']));
    const goals = new Map(LIFE_GOALS.map((goal) => [goal.id as string, goal]));
    expect(goals.get('visit-obo-mansion')).toMatchObject({ optional: true, targetVenueTypes: ['mansion'], condition: { kind: 'counter', key: 'venue-type:mansion', atLeast: 1 } });
    expect(goals.get('tour-dangote-refinery')).toMatchObject({ optional: true, suggestedActionId: 'refinery-tour', condition: { kind: 'counter', key: 'action:refinery-tour', atLeast: 1 } });
  });
});
