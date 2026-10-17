import { rngFor } from '../random/rng.js';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, toDateParts, type GameMinute } from '../time/calendar.js';
import { CITIES, CITY_IDS, type CityId } from './geography.js';

/**
 * Lagos ↔ Abuja by air (docs/MULTI_CITY.md): real airlines on a seeded daily timetable, booked in the Flights phone app
 * or at the airport counter, checked in at the airport before check-in closes, boarded at the gate, landed at the other
 * city's airport. Fares are real naira (prices are prices: no INCOME_MULTIPLIER). The timetable is pure: the server and
 * every client derive the same flights from the world seed, so a flight id is all a booking needs to store.
 *
 * Also here: the Lagos ↔ Abuja interstate bus, the slow cheap way (`INTERSTATE_BUS` in geography).
 */

export const AIRLINE_IDS = ['air-peace', 'ibom-air', 'arik-air', 'united-nigeria'] as const;
export type AirlineId = (typeof AIRLINE_IDS)[number];

export interface AirlineDefinition {
  readonly id: AirlineId;
  readonly name: string;
  /** Two-letter code on the flight number (P4 7101). */
  readonly code: string;
  readonly colors: readonly [primary: string, accent: string];
  /** Economy fare Lagos ↔ Abuja at an ordinary time (₦). */
  readonly economyBase: number;
  /** Daily departures each way: minute of day of the scheduled slot (jittered a little per day). */
  readonly slots: readonly number[];
}

const at = (hour: number, minute = 0): number => hour * MINUTES_PER_HOUR + minute;

export const AIRLINES: Readonly<Record<AirlineId, AirlineDefinition>> = {
  'air-peace': { id: 'air-peace', name: 'Air Peace', code: 'P4', colors: ['#0b6b3a', '#ffffff'], economyBase: 118_000, slots: [at(6, 30), at(10), at(14, 30), at(18, 30)] },
  'ibom-air': { id: 'ibom-air', name: 'Ibom Air', code: 'QI', colors: ['#1f4fa3', '#f2b705'], economyBase: 132_000, slots: [at(7, 45), at(17, 15)] },
  'arik-air': { id: 'arik-air', name: 'Arik Air', code: 'W3', colors: ['#c8102e', '#ffffff'], economyBase: 112_000, slots: [at(8, 15), at(12, 30), at(20)] },
  'united-nigeria': { id: 'united-nigeria', name: 'United Nigeria Airlines', code: 'UN', colors: ['#6a1b9a', '#ffffff'], economyBase: 105_000, slots: [at(9, 30), at(16)] },
};

export const FLIGHT_CABINS = ['economy', 'business'] as const;
export type FlightCabin = (typeof FLIGHT_CABINS)[number];
export const FLIGHT_CABIN_LABELS: Readonly<Record<FlightCabin, string>> = { economy: 'Economy', business: 'Business' };

/** Business costs about twice the economy fare. */
export const BUSINESS_FARE_FACTOR = 2.1;
/** Gate to gate, game minutes (the real Lagos ↔ Abuja flight is about 1h10). */
export const FLIGHT_MINUTES_RANGE = [66, 78] as const;
/** The timetable and fares are published this many days ahead. */
export const FLIGHT_BOOKING_HORIZON_DAYS = 14;

/** Check-in opens this long before departure… */
export const CHECK_IN_OPENS_BEFORE = 3 * MINUTES_PER_HOUR;
/** …and closes this long before it. Booking closes with it: a ticket bought later could never be checked in. */
export const CHECK_IN_CLOSES_BEFORE = 45;
/** The gate opens for boarding this long before departure… */
export const BOARDING_OPENS_BEFORE = 40;
/** …and closes this long before it. Not on board by then = missed the flight. */
export const GATE_CLOSES_BEFORE = 10;
/** A missed or changed flight costs this (₦) on top of any fare difference. */
export const FLIGHT_CHANGE_FEE = 25_000;

/** Where a booking was made. Same fares either way; the counter is walk-up, the app can book ahead from anywhere. */
export const FLIGHT_CHANNELS = ['app', 'counter'] as const;
export type FlightChannel = (typeof FLIGHT_CHANNELS)[number];

export interface FlightDefinition {
  /** `fl:<dayIndex>:<fromCity>:<airlineId>:<slot>`; stable for ever. */
  readonly id: string;
  readonly airlineId: AirlineId;
  /** `P4 7102`. */
  readonly number: string;
  readonly fromCity: CityId;
  readonly toCity: CityId;
  readonly fromAirportVenueId: string;
  readonly toAirportVenueId: string;
  readonly departAt: GameMinute;
  readonly arriveAt: GameMinute;
  readonly economyFare: number;
  readonly businessFare: number;
}

export function flightId(dayIndex: number, fromCity: CityId, airlineId: AirlineId, slot: number): string {
  return `fl:${dayIndex}:${fromCity}:${airlineId}:${slot}`;
}

/** Cities one flies between (the other city). */
export function otherCity(city: CityId): CityId {
  return city === 'lagos' ? 'abuja' : 'lagos';
}

const roundFare = (fare: number): number => Math.round(fare / 500) * 500;

/** Seasonal and weekday pressure on fares: Detty December and Friday/Sunday travel cost more. */
export function fareDemandFactor(dayIndex: number, hour: number): number {
  const parts = toDateParts(dayIndex * MINUTES_PER_DAY);
  let factor = 1;
  if (parts.month === 12) factor *= 1.18;
  if (parts.weekday === 4 || parts.weekday === 6) factor *= 1.07;
  if ((hour >= 6 && hour < 9) || (hour >= 17 && hour < 20)) factor *= 1.06;
  return factor;
}

function buildFlight(seed: string, dayIndex: number, fromCity: CityId, airline: AirlineDefinition, slot: number): FlightDefinition {
  const rng = rngFor(seed, 'flight', dayIndex, fromCity, airline.id, slot);
  const scheduled = airline.slots[slot] as number;
  const jitter = Math.round(rng.int(-15, 15) / 5) * 5;
  const departAt = dayIndex * MINUTES_PER_DAY + scheduled + jitter;
  const duration = rng.int(FLIGHT_MINUTES_RANGE[0], FLIGHT_MINUTES_RANGE[1]);
  const hour = Math.floor((scheduled + jitter) / MINUTES_PER_HOUR);
  const economyFare = roundFare(airline.economyBase * (1 + rng.float(-0.06, 0.06)) * fareDemandFactor(dayIndex, hour));
  const toCity = otherCity(fromCity);
  // Flight numbers: 7000s Lagos → Abuja, 7100s the way back; two digits for the day's rotation.
  const number = `${airline.code} ${(fromCity === 'lagos' ? 7000 : 7100) + AIRLINE_IDS.indexOf(airline.id) * 20 + slot * 2 + 1}`;
  return {
    id: flightId(dayIndex, fromCity, airline.id, slot),
    airlineId: airline.id,
    number,
    fromCity,
    toCity,
    fromAirportVenueId: CITIES[fromCity].airportVenueId,
    toAirportVenueId: CITIES[toCity].airportVenueId,
    departAt,
    arriveAt: departAt + duration,
    economyFare,
    businessFare: roundFare(economyFare * BUSINESS_FARE_FACTOR),
  };
}

/** Every flight leaving `fromCity` on a game day, earliest first. */
export function flightsOnDay(seed: string, dayIndex: number, fromCity: CityId): FlightDefinition[] {
  const out: FlightDefinition[] = [];
  for (const id of AIRLINE_IDS) {
    const airline = AIRLINES[id];
    airline.slots.forEach((_, slot) => out.push(buildFlight(seed, dayIndex, fromCity, airline, slot)));
  }
  return out.toSorted((a, b) => a.departAt - b.departAt);
}

/** Flights leaving `fromCity` with a departure in [from, until), earliest first. */
export function flightsBetween(seed: string, fromCity: CityId, from: GameMinute, until: GameMinute): FlightDefinition[] {
  const out: FlightDefinition[] = [];
  const first = Math.floor((from - MINUTES_PER_HOUR) / MINUTES_PER_DAY);
  const last = Math.floor(until / MINUTES_PER_DAY);
  for (let day = first; day <= last; day++) {
    for (const flight of flightsOnDay(seed, day, fromCity)) if (flight.departAt >= from && flight.departAt < until) out.push(flight);
  }
  return out;
}

/** Parse and rebuild a flight from its id (null for a malformed id or a day outside the calendar). */
export function findFlight(seed: string, id: string): FlightDefinition | null {
  const [prefix, day, city, airlineId, slot, ...rest] = id.split(':');
  if (prefix !== 'fl' || rest.length > 0 || day === undefined || city === undefined || airlineId === undefined || slot === undefined) return null;
  if (!/^\d+$/.test(day) || !/^\d+$/.test(slot)) return null;
  if (!(CITY_IDS as readonly string[]).includes(city) || !(AIRLINE_IDS as readonly string[]).includes(airlineId)) return null;
  const airline = AIRLINES[airlineId as AirlineId];
  if (Number(slot) >= airline.slots.length) return null;
  return buildFlight(seed, Number(day), city as CityId, airline, Number(slot));
}

export function flightFare(flight: Pick<FlightDefinition, 'economyFare' | 'businessFare'>, cabin: FlightCabin): number {
  return cabin === 'business' ? flight.businessFare : flight.economyFare;
}

/** The moments that matter for a flight. */
export interface FlightWindows {
  readonly checkInOpensAt: GameMinute;
  readonly checkInClosesAt: GameMinute;
  readonly boardingOpensAt: GameMinute;
  readonly gateClosesAt: GameMinute;
}

export function flightWindows(flight: Pick<FlightDefinition, 'departAt'>): FlightWindows {
  return {
    checkInOpensAt: flight.departAt - CHECK_IN_OPENS_BEFORE,
    checkInClosesAt: flight.departAt - CHECK_IN_CLOSES_BEFORE,
    boardingOpensAt: flight.departAt - BOARDING_OPENS_BEFORE,
    gateClosesAt: flight.departAt - GATE_CLOSES_BEFORE,
  };
}

/** Where a flight is at `now`, before any booking: can you still buy a seat, is the gate open, has it left. */
export type FlightPhase = 'scheduled' | 'check-in' | 'boarding' | 'gate-closed' | 'departed' | 'landed';

export function flightPhase(flight: Pick<FlightDefinition, 'departAt' | 'arriveAt'>, now: GameMinute): FlightPhase {
  const w = flightWindows(flight);
  if (now >= flight.arriveAt) return 'landed';
  if (now >= flight.departAt) return 'departed';
  if (now >= w.gateClosesAt) return 'gate-closed';
  if (now >= w.boardingOpensAt) return 'boarding';
  if (now >= w.checkInOpensAt) return 'check-in';
  return 'scheduled';
}

/** A seat can be bought until check-in closes. */
export function flightBookable(flight: Pick<FlightDefinition, 'departAt'>, now: GameMinute): boolean {
  return now < flightWindows(flight).checkInClosesAt && flight.departAt - now <= FLIGHT_BOOKING_HORIZON_DAYS * MINUTES_PER_DAY;
}

/** A seeded seat and gate for a booking (the same on every client). */
export function boardingPassSeat(bookingKey: string, cabin: FlightCabin): { readonly seat: string; readonly gate: string } {
  const rng = rngFor('boarding-pass', bookingKey);
  const row = cabin === 'business' ? rng.int(1, 4) : rng.int(5, 32);
  const letter = (cabin === 'business' ? ['A', 'C', 'D', 'F'] : ['A', 'B', 'C', 'D', 'E', 'F'])[rng.int(0, cabin === 'business' ? 3 : 5)] as string;
  return { seat: `${row}${letter}`, gate: `${rng.pick(['A', 'B'])}${rng.int(1, 8)}` };
}

/**
 * The fare for changing to another flight: the change fee, plus any difference when the new fare is higher (a cheaper
 * flight is not refunded, as on a real ticket).
 */
export function flightChangeCost(oldFare: number, newFare: number): number {
  return FLIGHT_CHANGE_FEE + Math.max(0, newFare - oldFare);
}
