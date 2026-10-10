import { VENUES, VENUE_TYPES, findVenue } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { serviceAvailability } from './availability';
import { actionsAt, isPlaceAction } from './place-actions';
import { servicesAt } from './services';

describe('every kind of place offers something to do', () => {
  it('has at least one place action or phone-app service for every venue type', () => {
    for (const venueType of VENUE_TYPES.filter((type) => type !== 'home')) {
      const place = { kind: 'venue', venueType } as const;
      const entries = actionsAt(place).filter(isPlaceAction).length + servicesAt(place).length;
      expect(entries, venueType).toBeGreaterThan(0);
    }
  });

  it('every venue in the catalog resolves to a type with something to do', () => {
    for (const venue of VENUES) {
      const place = { kind: 'venue', venueType: venue.type } as const;
      const entries = actionsAt(place).filter(isPlaceAction).length + servicesAt(place).length;
      expect(entries, venue.id).toBeGreaterThan(0);
    }
  });

  it('Berger Car Mart offers “Browse cars for sale” in Motors, greyed out with its hours when closed', () => {
    const berger = findVenue('berger-car-market');
    expect(berger?.type).toBe('car-dealer');
    const [browse] = servicesAt({ kind: 'venue', venueType: 'car-dealer' });
    expect(browse).toMatchObject({ label: 'Browse cars for sale', opens: { app: 'motors', param: 'dealer' } });
    if (!browse || !berger) throw new Error('missing');
    expect(serviceAvailability(browse, { venue: berger, hour: 12 })).toMatchObject({ available: true, reason: null });
    expect(serviceAvailability(browse, { venue: berger, hour: 22 })).toMatchObject({
      available: false,
      reason: 'Closed now · opens 8 AM',
    });
  });
});
