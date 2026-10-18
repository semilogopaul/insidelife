import { describe, expect, it } from 'vitest';
import { ACTIONS } from './actions.js';
import { HOTELS, HOTEL_AMENITIES, HOTEL_CHECKOUT_HOUR, HOTEL_ROOM_ACTION_IDS, HOTEL_TIER_INFO, findHotel, hotelOffers, hotelVenue, hotelsInCity, stayCheckoutAt } from './hotels.js';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, startOfDay } from '../time/calendar.js';
import { VENUES, findVenue } from './venues.js';
import { venueEntrance, venueLot } from '../world-map/world-map.js';

describe('hotels', () => {
  it('are real hotels: every `hotel` venue has a definition, and every definition a hotel venue with a lot and a door', () => {
    const venues = VENUES.filter((venue) => venue.type === 'hotel').map((venue) => venue.id);
    expect([...venues].sort()).toEqual(HOTELS.map((hotel) => hotel.venueId).sort());
    for (const hotel of HOTELS) {
      expect(hotelVenue(hotel).type).toBe('hotel');
      expect(venueLot(hotel.venueId), hotel.venueId).not.toBeNull();
      expect(venueEntrance(hotel.venueId), hotel.venueId).not.toBeNull();
    }
  });

  it('keeps the real names the owner asked for in Lagos and Abuja', () => {
    const names = (city: 'lagos' | 'abuja') => hotelsInCity(city).map((hotel) => hotelVenue(hotel).name);
    expect(names('lagos')).toEqual(
      expect.arrayContaining(['Eko Hotel & Suites', 'Federal Palace Hotel', 'The Wheatbaker', 'Radisson Blu Anchorage Ikeja', 'The Lagos Continental Hotel', 'Four Points by Sheraton Lekki']),
    );
    expect(names('abuja')).toEqual(expect.arrayContaining(['Transcorp Hilton Abuja', 'Sheraton Abuja Hotel']));
    expect(hotelsInCity('abuja').length).toBeGreaterThanOrEqual(3);
  });

  it('prices by tier: standard < upscale < luxury, and the best bed goes with the best room', () => {
    const rate = (tier: string): number[] => HOTELS.filter((hotel) => hotel.tier === tier).map((hotel) => hotel.nightlyRate);
    expect(Math.max(...rate('standard'))).toBeLessThan(Math.min(...rate('upscale')));
    expect(Math.max(...rate('upscale'))).toBeLessThan(Math.min(...rate('luxury')));
    expect(HOTEL_TIER_INFO.standard.bedQuality).toBeLessThan(HOTEL_TIER_INFO.upscale.bedQuality);
    expect(HOTEL_TIER_INFO.upscale.bedQuality).toBeLessThan(HOTEL_TIER_INFO.luxury.bedQuality);
  });

  it('offers a bar, restaurant, pool or gym only where the hotel has one', () => {
    expect(hotelOffers('eko-hotel', 'pool')).toBe(true);
    expect(hotelOffers('chelsea-hotel-abuja', 'pool')).toBe(false);
    expect(hotelOffers('fraser-suites-abuja', 'bar')).toBe(false);
    expect(hotelOffers('wuse-market', 'bar')).toBe(false);
    for (const hotel of HOTELS) expect(hotel.amenities.every((amenity) => HOTEL_AMENITIES.includes(amenity))).toBe(true);
    const amenityActions = ACTIONS.filter((action) => 'amenity' in action && action.amenity !== undefined);
    expect(amenityActions.map((action) => action.id).sort()).toEqual(['hotel-bar', 'hotel-gym', 'hotel-pool', 'hotel-restaurant']);
    for (const action of amenityActions) expect(action.where.venueTypes).toEqual(['hotel']);
  });

  it('lets a guest do only room things (a bed and a shower) in the room', () => {
    expect([...HOTEL_ROOM_ACTION_IDS].sort()).toEqual(['nap', 'shower', 'sleep']);
    for (const id of HOTEL_ROOM_ACTION_IDS) expect((ACTIONS.find((action) => action.id === id)?.where as { readonly home?: boolean }).home).toBe(true);
  });

  it('checks out at noon: the night you book is the first one', () => {
    const day = startOfDay(60 * MINUTES_PER_DAY);
    const noon = HOTEL_CHECKOUT_HOUR * MINUTES_PER_HOUR;
    expect(stayCheckoutAt(day + 15 * MINUTES_PER_HOUR, 1)).toBe(day + MINUTES_PER_DAY + noon);
    expect(stayCheckoutAt(day + 2 * MINUTES_PER_HOUR, 1)).toBe(day + noon);
    expect(stayCheckoutAt(day + 15 * MINUTES_PER_HOUR, 3)).toBe(day + 3 * MINUTES_PER_DAY + noon);
    expect(stayCheckoutAt(day + noon, 1)).toBe(day + MINUTES_PER_DAY + noon);
  });

  it('knows its hotels by venue id only', () => {
    expect(findHotel('eko-hotel')?.tier).toBe('luxury');
    expect(findHotel('yaba-market')).toBeUndefined();
    expect(findVenue('transcorp-hilton')?.type).toBe('hotel');
  });
});
