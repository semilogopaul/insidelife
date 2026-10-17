import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../time/calendar.js';
import {
  AIRLINES,
  AIRLINE_IDS,
  BUSINESS_FARE_FACTOR,
  CHECK_IN_CLOSES_BEFORE,
  FLIGHT_BOOKING_HORIZON_DAYS,
  FLIGHT_CHANGE_FEE,
  boardingPassSeat,
  findFlight,
  flightBookable,
  flightChangeCost,
  flightPhase,
  flightWindows,
  flightsBetween,
  flightsOnDay,
  otherCity,
} from './flights.js';
import { CITIES, INTERSTATE_BUS } from './geography.js';
import { findVenue } from './venues.js';

const SEED = 'test-world';
const DAY = 400;

describe('flight timetable', () => {
  it('has several flights a day each way, from the real airlines', () => {
    for (const city of ['lagos', 'abuja'] as const) {
      const flights = flightsOnDay(SEED, DAY, city);
      expect(flights.length).toBeGreaterThanOrEqual(8);
      expect(new Set(flights.map((flight) => flight.airlineId))).toEqual(new Set(AIRLINE_IDS));
      expect(AIRLINES['air-peace'].name).toBe('Air Peace');
      for (const flight of flights) {
        expect(flight.fromCity).toBe(city);
        expect(flight.toCity).toBe(otherCity(city));
        expect(flight.fromAirportVenueId).toBe(CITIES[city].airportVenueId);
        expect(findVenue(flight.toAirportVenueId)?.type).toBe('airport');
      }
    }
  });

  it('is deterministic per seed and day, and differs between days and seeds', () => {
    const a = flightsOnDay(SEED, DAY, 'lagos');
    expect(flightsOnDay(SEED, DAY, 'lagos')).toEqual(a);
    expect(flightsOnDay(SEED, DAY + 1, 'lagos')).not.toEqual(a);
    expect(flightsOnDay('another-world', DAY, 'lagos').map((flight) => flight.departAt)).not.toEqual(a.map((flight) => flight.departAt));
  });

  it('flies about an hour and ten, within the day’s hours, earliest first, with unique ids and numbers', () => {
    const flights = flightsOnDay(SEED, DAY, 'lagos');
    expect(flights.map((flight) => flight.departAt)).toEqual(flights.map((flight) => flight.departAt).toSorted((x, y) => x - y));
    expect(new Set(flights.map((flight) => flight.id)).size).toBe(flights.length);
    expect(new Set(flights.map((flight) => flight.number)).size).toBe(flights.length);
    for (const flight of flights) {
      const minutes = flight.arriveAt - flight.departAt;
      expect(minutes).toBeGreaterThanOrEqual(60);
      expect(minutes).toBeLessThanOrEqual(80);
      const minute = flight.departAt - DAY * MINUTES_PER_DAY;
      expect(minute).toBeGreaterThanOrEqual(6 * 60);
      expect(minute).toBeLessThan(21 * 60);
    }
  });

  it('prices economy around ₦100–180k and business at about twice that, in whole ₦500s', () => {
    for (let day = DAY; day < DAY + 90; day++) {
      for (const flight of flightsOnDay(SEED, day, 'abuja')) {
        expect(flight.economyFare).toBeGreaterThanOrEqual(95_000);
        expect(flight.economyFare).toBeLessThanOrEqual(200_000);
        expect(flight.economyFare % 500).toBe(0);
        expect(flight.businessFare / flight.economyFare).toBeGreaterThan(BUSINESS_FARE_FACTOR - 0.05);
        expect(flight.businessFare / flight.economyFare).toBeLessThan(BUSINESS_FARE_FACTOR + 0.05);
      }
    }
  });

  it('rebuilds any flight from its id, and rejects bad ids', () => {
    for (const flight of flightsOnDay(SEED, DAY, 'lagos')) expect(findFlight(SEED, flight.id)).toEqual(flight);
    for (const bad of ['', 'fl:1:lagos:air-peace', 'fl:x:lagos:air-peace:0', 'fl:1:kano:air-peace:0', 'fl:1:lagos:nope:0', 'fl:1:lagos:air-peace:9', 'xx:1:lagos:air-peace:0', 'fl:1:lagos:air-peace:0:extra']) {
      expect(findFlight(SEED, bad), bad).toBeNull();
    }
  });

  it('lists the flights between two moments', () => {
    const from = DAY * MINUTES_PER_DAY + 12 * 60;
    const list = flightsBetween(SEED, 'lagos', from, from + MINUTES_PER_DAY);
    expect(list.length).toBeGreaterThanOrEqual(8);
    for (const flight of list) {
      expect(flight.departAt).toBeGreaterThanOrEqual(from);
      expect(flight.departAt).toBeLessThan(from + MINUTES_PER_DAY);
    }
  });
});

describe('check-in, boarding and booking windows', () => {
  const flight = flightsOnDay(SEED, DAY, 'lagos')[3]!;
  const w = flightWindows(flight);

  it('closes check-in 45 minutes before departure, and booking with it', () => {
    expect(flight.departAt - w.checkInClosesAt).toBe(CHECK_IN_CLOSES_BEFORE);
    expect(flightBookable(flight, w.checkInClosesAt - 1)).toBe(true);
    expect(flightBookable(flight, w.checkInClosesAt)).toBe(false);
    expect(flightBookable(flight, flight.departAt - FLIGHT_BOOKING_HORIZON_DAYS * MINUTES_PER_DAY - 1)).toBe(false);
    expect(flightBookable(flight, flight.departAt - 3 * MINUTES_PER_DAY)).toBe(true);
  });

  it('walks through the phases of a flight', () => {
    expect(flightPhase(flight, w.checkInOpensAt - 1)).toBe('scheduled');
    expect(flightPhase(flight, w.checkInOpensAt)).toBe('check-in');
    expect(flightPhase(flight, w.boardingOpensAt)).toBe('boarding');
    expect(flightPhase(flight, w.gateClosesAt)).toBe('gate-closed');
    expect(flightPhase(flight, flight.departAt)).toBe('departed');
    expect(flightPhase(flight, flight.arriveAt)).toBe('landed');
    // Check-in closes before the gate opens: there is a gap to wait airside.
    expect(w.checkInClosesAt).toBeLessThan(w.boardingOpensAt);
  });

  it('charges the change fee plus any increase, with no refund when the new flight is cheaper', () => {
    expect(flightChangeCost(120_000, 120_000)).toBe(FLIGHT_CHANGE_FEE);
    expect(flightChangeCost(120_000, 150_000)).toBe(FLIGHT_CHANGE_FEE + 30_000);
    expect(flightChangeCost(150_000, 100_000)).toBe(FLIGHT_CHANGE_FEE);
  });

  it('gives a booking a stable seat and gate', () => {
    expect(boardingPassSeat('abc', 'economy')).toEqual(boardingPassSeat('abc', 'economy'));
    expect(boardingPassSeat('abc', 'business').seat).toMatch(/^[1-4][ACDF]$/);
    expect(boardingPassSeat('abc', 'economy').seat).toMatch(/^([5-9]|[12][0-9]|3[0-2])[A-F]$/);
  });
});

describe('interstate bus', () => {
  it('is the slow cheap option: ~10 game hours for far less than a flight', () => {
    expect(INTERSTATE_BUS.hours).toBe(10);
    expect(INTERSTATE_BUS.fare).toBeLessThan(AIRLINES['united-nigeria'].economyBase / 2);
    expect(findVenue(CITIES.lagos.busStationVenueId)?.type).toBe('motor-park');
    expect(findVenue(CITIES.abuja.busStationVenueId)?.type).toBe('motor-park');
  });
});
