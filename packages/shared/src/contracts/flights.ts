import type { CharacterSnapshotDto } from './core.js';
import type { Appearance, Gender, Outfit } from '../catalog/appearance.js';
import type { AirlineId, FlightCabin, FlightChannel, FlightPhase } from '../catalog/flights.js';
import type { CityId } from '../catalog/geography.js';
import type { GameMinute } from '../time/calendar.js';

/** Flights and the interstate bus between Lagos and Abuja (docs/MULTI_CITY.md). */

export interface FlightDto {
  readonly id: string;
  readonly airlineId: AirlineId;
  readonly airlineName: string;
  readonly airlineCode: string;
  readonly colors: readonly [primary: string, accent: string];
  /** `P4 7002`. */
  readonly number: string;
  readonly fromCity: CityId;
  readonly toCity: CityId;
  readonly fromAirportVenueId: string;
  readonly toAirportVenueId: string;
  readonly departAt: GameMinute;
  readonly arriveAt: GameMinute;
  readonly economyFare: number;
  readonly businessFare: number;
  /** Where the flight is for the viewer right now (before any booking). */
  readonly phase: FlightPhase;
  /** A seat can still be bought (check-in hasn't closed). */
  readonly bookable: boolean;
}

export const FLIGHT_BOOKING_STATUSES = ['booked', 'checked-in', 'boarded', 'flown', 'missed', 'changed', 'cancelled'] as const;
export type FlightBookingStatus = (typeof FLIGHT_BOOKING_STATUSES)[number];

export interface FlightBookingDto {
  readonly id: string;
  readonly status: FlightBookingStatus;
  readonly cabin: FlightCabin;
  /** What was paid for the seat (₦; a change adds its fee to the booking it creates). */
  readonly fare: number;
  readonly channel: FlightChannel;
  readonly seat: string;
  readonly gate: string;
  readonly bookedAt: GameMinute;
  readonly flight: FlightDto;
  readonly checkInOpensAt: GameMinute;
  readonly checkInClosesAt: GameMinute;
  readonly boardingOpensAt: GameMinute;
  readonly gateClosesAt: GameMinute;
  /** Set when the booking was made by changing a missed or earlier one. */
  readonly changedFrom: string | null;
  /** What happens next, in plain words ("Check in at MMIA before 14:45"). */
  readonly nextStep: string;
  /** Can be checked in at this moment (at the departure airport, window open). */
  readonly canCheckIn: boolean;
  /** Can board at this moment (checked in, at the airport, gate open). */
  readonly canBoard: boolean;
  /** A missed flight can be changed for this fee plus any fare difference. */
  readonly changeFee: number | null;
}

export interface InterstateBusDto {
  readonly toCity: CityId;
  readonly fare: number;
  readonly minutes: number;
  /** Where the coach leaves from in the city you are in. */
  readonly stationVenueId: string;
  readonly available: boolean;
  readonly reason?: string;
}

export interface FlightsOverviewDto {
  /** The city you are in (flights shown leave from here). */
  readonly cityId: CityId;
  readonly otherCityId: CityId;
  readonly airportVenueId: string;
  /** Whether you are at this city's airport right now (check-in, boarding and the counter need it). */
  readonly atAirport: boolean;
  /** Flights leaving your city, earliest first (the next two days). */
  readonly flights: readonly FlightDto[];
  /** Your open and recent bookings, newest first. */
  readonly bookings: readonly FlightBookingDto[];
  readonly bus: InterstateBusDto;
  readonly changeFee: number;
  readonly now: GameMinute;
}

/** What every flights and bus action answers with: the updated app state and the character's new snapshot. */
export interface TravelActionResultDto {
  readonly overview: FlightsOverviewDto;
  readonly snapshot: CharacterSnapshotDto;
}

/** `GET /v1/flights/search?day=<dayOffset>&from=<cityId>` */
export interface FlightSearchDto {
  readonly cityId: CityId;
  readonly day: number;
  readonly flights: readonly FlightDto[];
}

/** `POST /v1/flights/bookings` */
export interface BookFlightRequest {
  readonly flightId: string;
  readonly cabin: FlightCabin;
  readonly channel: FlightChannel;
  /** A retry with the same key gets the first result back instead of buying twice. */
  readonly idempotencyKey?: string;
}

/** `POST /v1/flights/bookings/:id/change` */
export interface ChangeFlightRequest {
  readonly flightId: string;
  readonly idempotencyKey?: string;
}

/** Another passenger on your flight (drawn in the cabin). Only the public look and handle. */
export interface FlightPassengerDto {
  readonly id: string;
  readonly handle: string;
  readonly firstName: string;
  readonly gender: Gender;
  readonly appearance: Appearance;
  readonly outfit: Outfit;
}

/** `GET /v1/flights/:flightId/passengers`: the others aboard the flight you are on (blocked players left out). */
export interface FlightPassengersDto {
  readonly flightId: string;
  readonly total: number;
  readonly passengers: readonly FlightPassengerDto[];
}

/** The most fellow passengers drawn in a cabin. */
export const FLIGHT_PASSENGERS_MAX = 11;

/** `POST /v1/travel/bus` */
export interface BookBusRequest {
  readonly toCity: CityId;
  readonly idempotencyKey?: string;
}
