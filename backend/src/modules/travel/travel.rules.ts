import {
  AIRLINES,
  CITIES,
  FLIGHT_CHANGE_FEE,
  findVenue,
  flightPhase,
  flightWindows,
  formatClock12,
  rngFor,
  formatNaira,
  type FlightBookingDto,
  type FlightBookingStatus,
  type FlightDefinition,
  type FlightDto,
  type GameMinute,
} from '@insidelife/shared';
import type { FlightBookingEntity } from './entities/flight-booking.entity.js';

/** Pure rules of a flight booking: where it stands at a given moment, and what the player can do next. */

/** A live booking that reaches the gate's closing without being boarded is a missed flight, whether or not anyone noticed. */
export function effectiveStatus(booking: Pick<FlightBookingEntity, 'status' | 'departAt'>, now: GameMinute): FlightBookingStatus {
  if ((booking.status === 'booked' || booking.status === 'checked-in') && now >= flightWindows(booking).gateClosesAt) return 'missed';
  return booking.status;
}

export function toFlightDto(flight: FlightDefinition, now: GameMinute): FlightDto {
  const airline = AIRLINES[flight.airlineId];
  const w = flightWindows(flight);
  return {
    id: flight.id,
    airlineId: flight.airlineId,
    airlineName: airline.name,
    airlineCode: airline.code,
    colors: airline.colors,
    number: flight.number,
    fromCity: flight.fromCity,
    toCity: flight.toCity,
    fromAirportVenueId: flight.fromAirportVenueId,
    toAirportVenueId: flight.toAirportVenueId,
    departAt: flight.departAt,
    arriveAt: flight.arriveAt,
    economyFare: flight.economyFare,
    businessFare: flight.businessFare,
    phase: flightPhase(flight, now),
    bookable: now < w.checkInClosesAt,
  };
}

const airportName = (venueId: string): string => findVenue(venueId)?.name ?? 'the airport';

export function toBookingDto(booking: FlightBookingEntity, flight: FlightDefinition, now: GameMinute, atDepartureAirport: boolean): FlightBookingDto {
  const status = effectiveStatus(booking, now);
  const w = flightWindows(flight);
  const canCheckIn = status === 'booked' && atDepartureAirport && now >= w.checkInOpensAt && now < w.checkInClosesAt;
  const canBoard = status === 'checked-in' && atDepartureAirport && now >= w.boardingOpensAt && now < w.gateClosesAt;
  return {
    id: booking.id,
    status,
    cabin: booking.cabin,
    fare: booking.fare,
    channel: booking.channel,
    seat: booking.seat,
    gate: booking.gate,
    bookedAt: booking.bookedAt,
    flight: toFlightDto(flight, now),
    checkInOpensAt: w.checkInOpensAt,
    checkInClosesAt: w.checkInClosesAt,
    boardingOpensAt: w.boardingOpensAt,
    gateClosesAt: w.gateClosesAt,
    changedFrom: booking.changedFrom,
    nextStep: nextStep(status, flight, now, atDepartureAirport, booking.gate),
    canCheckIn,
    canBoard,
    changeFee: status === 'missed' || ((status === 'booked' || status === 'checked-in') && now < w.checkInClosesAt) ? FLIGHT_CHANGE_FEE : null,
  };
}

// ----- Reminders ---------------------------------------------------------------------------------------------------

/** Bit flags on `FlightBookingEntity.notified`: each reminder is sent once. */
export const REMINDER = { CHECK_IN_CLOSING: 1, GATE_CHANGE: 2, BOARDING: 4 } as const;
export type ReminderKind = keyof typeof REMINDER;

/** "Check-in closes in 30 min": the warning goes out this long before check-in closes. */
export const CHECK_IN_WARNING_MINUTES = 30;
/** A gate change is announced this long before boarding opens. */
export const GATE_CHANGE_NOTICE_MINUTES = 20;
/** About one booking in five has its gate changed. */
export const GATE_CHANGE_CHANCE = 0.2;
/** A reminder whose moment passed longer ago than this (an offline catch-up) is marked sent without a notification. */
export const REMINDER_STALE_MINUTES = 40;

const GATES: readonly string[] = ['A', 'B'].flatMap((letter) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `${letter}${n}`));

/** The gate a booking is moved to, or null when its gate stays (seeded by the booking id: the same on every retry). */
export function changedGate(bookingId: string, gate: string): string | null {
  const rng = rngFor('gate-change', bookingId);
  if (rng.next() >= GATE_CHANGE_CHANCE) return null;
  return rng.pick(GATES.filter((candidate) => candidate !== gate));
}

export interface DueReminder {
  readonly kind: ReminderKind;
  /** The moment it was due (the notification's game minute). */
  readonly dueAt: GameMinute;
  /** Long past: mark it sent but say nothing. */
  readonly stale: boolean;
}

/**
 * Reminders a live booking owes the player at `now`, oldest first. Check-in closing only matters before checking in;
 * boarding only once checked in (the gate-change notice applies to both). None once the gate has closed.
 */
export function dueReminders(booking: Pick<FlightBookingEntity, 'id' | 'status' | 'departAt' | 'notified'>, now: GameMinute): DueReminder[] {
  if (booking.status !== 'booked' && booking.status !== 'checked-in') return [];
  const w = flightWindows(booking);
  if (now >= w.gateClosesAt) return [];
  const out: DueReminder[] = [];
  const consider = (kind: ReminderKind, dueAt: GameMinute, applies: boolean): void => {
    if (!applies || booking.notified & REMINDER[kind] || now < dueAt) return;
    out.push({ kind, dueAt, stale: now - dueAt > REMINDER_STALE_MINUTES });
  };
  consider('CHECK_IN_CLOSING', w.checkInClosesAt - CHECK_IN_WARNING_MINUTES, booking.status === 'booked' && now >= w.checkInOpensAt);
  consider('GATE_CHANGE', w.boardingOpensAt - GATE_CHANGE_NOTICE_MINUTES, true);
  consider('BOARDING', w.boardingOpensAt, booking.status === 'checked-in');
  return out.toSorted((a, b) => a.dueAt - b.dueAt);
}

/** What happens next, in words ("Check in at Murtala Muhammed Airport before 9:00 AM"). */
export function nextStep(status: FlightBookingStatus, flight: FlightDefinition, now: GameMinute, atAirport: boolean, gate: string): string {
  const w = flightWindows(flight);
  const from = airportName(flight.fromAirportVenueId);
  const to = CITIES[flight.toCity].name;
  switch (status) {
    case 'booked':
      if (!atAirport) return `Be at ${from} and check in before ${formatClock12(w.checkInClosesAt)}.`;
      if (now < w.checkInOpensAt) return `Check-in opens at ${formatClock12(w.checkInOpensAt)}.`;
      return `Check in now: it closes at ${formatClock12(w.checkInClosesAt)}.`;
    case 'checked-in':
      if (now < w.boardingOpensAt) return `Wait airside. Gate ${gate} opens at ${formatClock12(w.boardingOpensAt)}.`;
      return `Board at gate ${gate} before ${formatClock12(w.gateClosesAt)}.`;
    case 'boarded':
      return `On board to ${to}. Landing at ${formatClock12(flight.arriveAt)}.`;
    case 'flown':
      return `Landed in ${to}.`;
    case 'missed':
      return `You missed it. Change to another flight for ${formatNaira(FLIGHT_CHANGE_FEE)}.`;
    case 'changed':
      return 'Changed to another flight.';
    case 'cancelled':
      return 'Cancelled.';
  }
}
