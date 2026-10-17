import {
  GAT_NAMES,
  findAircraft,
  findLiveryColour,
  aircraftNeedsLicence,
  type AircraftFlightOptionDto,
  type ApronPlaneDto,
  type FlightBookingDto,
  type FlightPassengerDto,
  type GatId,
  type OwnedAircraftDto,
  type PresencePlayerDto,
} from '@insidelife/shared';
import { DEFAULT_LIVERY, type AircraftClass, type AircraftLivery } from '../contract';
import { aircraftLayoutFor } from '../cabin/cabin-layouts';
import type { ApronPlane } from '../terminal/apron-layout';

/** Pure decisions of the private and commercial flying flows (what is on the apron, who can fly from where, what is flying). */

const hexOf = (id: string, fallback: string): string => findLiveryColour(id)?.hex ?? fallback;

/** The paint of a plane from the server's palette ids, name and registration. */
export function liveryOf(plane: { readonly liveryBase: string; readonly liveryAccent: string; readonly callName: string | null; readonly registration: string }): AircraftLivery {
  return {
    base: hexOf(plane.liveryBase, DEFAULT_LIVERY.base),
    accent: hexOf(plane.liveryAccent, DEFAULT_LIVERY.accent),
    name: plane.callName ?? '',
    registration: plane.registration,
  };
}

/** A parked plane (yours or another player's) as the apron draws it. */
export function apronPlaneOf(plane: OwnedAircraftDto | ApronPlaneDto): ApronPlane {
  return { id: plane.id, cls: plane.aircraftClass, livery: liveryOf(plane) };
}

/** A commercial airliner in an airline's colours: white fuselage, the airline's primary colour on tail and cheatline. */
export function airlinerLivery(airline: { readonly colors: readonly [string, string]; readonly airlineName: string }, registration = '5N-NGA'): AircraftLivery {
  return { base: '#f4f2ec', accent: airline.colors[0], name: airline.airlineName.toUpperCase().slice(0, 16), registration };
}

/** Planes of yours that are standing on this terminal's apron (not in the air, not on a ferry flight). */
export function parkedHere(mine: readonly OwnedAircraftDto[], gat: GatId | null): readonly OwnedAircraftDto[] {
  if (!gat) return [];
  return mine.filter((plane) => plane.parkedAt === gat && !plane.airborne);
}

export interface ApronSplit {
  /** The plane on your stand (the one you chose, else the first that can fly, else the first). */
  readonly own: OwnedAircraftDto | null;
  /** Your other planes here: drawn beside the others, not boardable until you pick them. */
  readonly spare: readonly OwnedAircraftDto[];
}

/** Which of your planes stands on your stand; `chosenId` is the one you picked (kept while it is still here). */
export function chooseStand(parked: readonly OwnedAircraftDto[], chosenId: string | null): ApronSplit {
  if (parked.length === 0) return { own: null, spare: [] };
  const own = parked.find((plane) => plane.id === chosenId) ?? parked.find((plane) => plane.flyBlocker === null) ?? (parked[0] as OwnedAircraftDto);
  return { own, spare: parked.filter((plane) => plane.id !== own.id) };
}

/** Everything the apron needs: yours on your stand, then your spare planes, then other players' (friends first as sent). */
export function apronPlanes(split: ApronSplit, others: readonly ApronPlaneDto[]): { readonly own: ApronPlane | null; readonly others: readonly ApronPlane[] } {
  return {
    own: split.own ? apronPlaneOf(split.own) : null,
    others: [...split.spare.map(apronPlaneOf), ...others.map(apronPlaneOf)],
  };
}

/** The room of a class's layout where the pilot sits, when it has a cockpit of its own (turboprops and jets). */
export function cockpitRoom(cls: AircraftClass): string | null {
  return aircraftLayoutFor(cls).rooms.some((room) => room.id === 'cockpit') ? 'cockpit' : null;
}

export interface TakeoffCheck {
  readonly allowed: boolean;
  /** Why not (the server's reason, or "take the pilot's seat"), null when allowed. */
  readonly reason: string | null;
}

/**
 * Whether you can fly from where you stand in the plane: the server says if the plane may fly at all (licence, bills, the
 * range…). A plane you fly yourself (propeller, turboprop: licence) is flown from the cockpit when it has one; a jet's crew
 * flies it, so the cabin will do.
 */
export function takeoffCheck(plane: OwnedAircraftDto, option: AircraftFlightOptionDto, roomId: string | null): TakeoffCheck {
  if (plane.flyBlocker) return { allowed: false, reason: plane.flyBlocker };
  if (!option.open) return { allowed: false, reason: `${GAT_NAMES[option.destination]} isn’t open yet` };
  const def = findAircraft(plane.aircraftId);
  const seat = def && aircraftNeedsLicence(def) ? cockpitRoom(plane.aircraftClass) : null;
  if (seat && roomId !== seat) return { allowed: false, reason: 'Take the pilot’s seat in the cockpit' };
  return { allowed: true, reason: null };
}

/** The other city's name for a destination terminal ("Abuja" for naia-gat). */
export function gatCity(gat: GatId): string {
  return gat === 'naia-gat' ? 'Abuja' : 'Lagos';
}

/** What is flying: your own plane, or the airliner you booked a seat on. */
export type FlightKind =
  | { readonly kind: 'private'; readonly aircraft: OwnedAircraftDto; readonly cls: AircraftClass; readonly livery: AircraftLivery }
  | { readonly kind: 'commercial'; readonly booking: FlightBookingDto; readonly cls: 'airliner-jet'; readonly livery: AircraftLivery };

/** Which flight the character is on: a boarded booking (commercial), else the plane of theirs that is in the air. */
export function resolveFlight(
  bookings: readonly FlightBookingDto[] | undefined,
  mine: readonly OwnedAircraftDto[] | undefined,
  arriveAt: number,
): FlightKind | null {
  const booking = bookings?.find((entry) => entry.status === 'boarded' && entry.flight.arriveAt === arriveAt);
  if (booking) return { kind: 'commercial', booking, cls: 'airliner-jet', livery: airlinerLivery(booking.flight) };
  const aircraft = mine?.find((plane) => plane.airborne && plane.arrivesAt === arriveAt);
  if (aircraft) return { kind: 'private', aircraft, cls: aircraft.aircraftClass, livery: liveryOf(aircraft) };
  return null;
}

/** Fellow passengers drawn like any other player present, at `locationId`. */
export function passengerPresence(passengers: readonly FlightPassengerDto[], locationId: string): readonly PresencePlayerDto[] {
  return passengers.map((passenger) => ({
    characterId: passenger.id,
    handle: passenger.handle,
    firstName: passenger.firstName,
    gender: passenger.gender,
    appearance: passenger.appearance,
    outfit: passenger.outfit,
    locationId,
    activity: null,
    status: 0,
  }));
}

/** The shortest and longest the sky sequence plays, however long the flight is. */
export const SKY_MIN_MS = 6_000;
export const SKY_MAX_MS = 75_000;

/** How long to play the sky for a flight that lands in `remainingMs`, or 0 when there is too little left to bother. */
export function skyDuration(remainingMs: number): number {
  if (remainingMs < SKY_MIN_MS) return 0;
  return Math.min(SKY_MAX_MS, remainingMs);
}

/** A flight's identity on the client (its sky sequence is skipped per flight). */
export const flightKey = (travel: { readonly departAt: number; readonly toLocationId: string }): string => `${travel.departAt}:${travel.toLocationId}`;
