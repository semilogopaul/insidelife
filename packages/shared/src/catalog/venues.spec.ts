import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../time/calendar.js';
import { closedOnArrival, findVenue, type VenueDefinition } from './venues.js';

const at = (hour: number, minute = 0): number => 40 * MINUTES_PER_DAY + hour * 60 + minute;

describe('closedOnArrival', () => {
  const carMart = findVenue('berger-car-market') as VenueDefinition;

  it('names the opening hour when a ride lands after closing time (Berger Car Mart, 8–18)', () => {
    expect(carMart.hours).toEqual([8, 18]);
    expect(closedOnArrival(carMart, at(19, 58))).toBe(8);
    expect(closedOnArrival(carMart, at(2, 10))).toBe(8);
  });

  it('is open during opening hours, and a short wait at the door doesn’t count as closed', () => {
    expect(closedOnArrival(carMart, at(12))).toBeNull();
    expect(closedOnArrival(carMart, at(7, 40))).toBeNull();
    expect(closedOnArrival(carMart, at(7, 0))).toBe(8);
  });

  it('handles late-night hours past midnight and always-open places', () => {
    const lounge = { ...carMart, hours: [20, 28] } as VenueDefinition;
    expect(closedOnArrival(lounge, at(1))).toBeNull();
    expect(closedOnArrival(lounge, at(5))).toBe(20);
    expect(closedOnArrival({ ...carMart, hours: undefined } as VenueDefinition, at(3))).toBeNull();
  });
});
