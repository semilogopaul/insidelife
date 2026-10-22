import { describe, expect, it } from 'vitest';
import type { AircraftFlightOptionDto, ApronPlaneDto, FlightBookingDto, FlightDto, OwnedAircraftDto } from '@insidelife/shared';
import { gateStep, nextBooking } from '../flow/AviationOverlay';
import {
  airlinerLivery,
  apronPlaneOf,
  apronPlanes,
  chooseStand,
  cockpitRoom,
  flightKey,
  liveryOf,
  parkedHere,
  passengerPresence,
  resolveFlight,
  skyDuration,
  SKY_MAX_MS,
  SKY_MIN_MS,
  takeoffCheck,
} from '../flow/flight-plan';
import { layoutApron, MAX_OTHERS } from '../terminal/apron-layout';

const option = (over: Partial<AircraftFlightOptionDto> = {}): AircraftFlightOptionDto => ({ destination: 'naia-gat', km: 535, minutes: 120, fuelLitres: 900, fuelCost: 800_000, open: true, ...over });

const plane = (over: Partial<OwnedAircraftDto> = {}): OwnedAircraftDto => ({
  id: 'a1',
  aircraftId: 'phenom-300e',
  name: 'Embraer Phenom 300E',
  aircraftClass: 'light-jet',
  callName: 'AIR TOLU',
  registration: '5N-TOL',
  liveryBase: 'white',
  liveryAccent: 'green',
  purchasePrice: 15_000_000_000,
  value: 14_000_000_000,
  saleOffer: 12_000_000_000,
  acquiredAt: 0,
  parkedAt: 'mmia-gat',
  arrivesAt: null,
  airborne: false,
  grounded: false,
  arrears: 0,
  monthly: { hangar: 0, maintenance: 0, crew: 0, total: 0 },
  liveryFee: 0,
  nameFee: 0,
  registrationFee: 0,
  flyBlocker: null,
  flights: [option()],
  ...over,
});

const other = (over: Partial<ApronPlaneDto> = {}): ApronPlaneDto => ({
  id: 'o1',
  aircraftId: 'cessna-172',
  aircraftClass: 'piston-single',
  liveryBase: 'white',
  liveryAccent: 'green',
  callName: null,
  registration: '5N-ABC',
  ownerHandle: 'ada',
  relation: 'friend',
  ...over,
});

describe('liveries', () => {
  it('turns the server palette ids and the painted name into the 3D livery', () => {
    const livery = liveryOf(plane());
    expect(livery).toMatchObject({ name: 'AIR TOLU', registration: '5N-TOL' });
    expect(livery.base).toMatch(/^#[0-9a-f]{6}$/i);
    expect(livery.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(liveryOf(plane({ callName: null })).name).toBe('');
  });

  it('survives an unknown palette id (white and green)', () => {
    expect(liveryOf(plane({ liveryBase: 'nope', liveryAccent: 'nope' })).base).toMatch(/^#/);
  });

  it('paints an airliner in the airline’s colour with its name on the fuselage', () => {
    const livery = airlinerLivery({ colors: ['#0b6b3a', '#ffffff'], airlineName: 'Air Peace' });
    expect(livery).toMatchObject({ accent: '#0b6b3a', name: 'AIR PEACE' });
  });
});

describe('your stand and the apron', () => {
  it('lists your planes standing at this terminal, not those in the air or elsewhere', () => {
    const mine = [plane({ id: 'a' }), plane({ id: 'b', airborne: true }), plane({ id: 'c', parkedAt: 'naia-gat' })];
    expect(parkedHere(mine, 'mmia-gat').map((entry) => entry.id)).toEqual(['a']);
    expect(parkedHere(mine, null)).toEqual([]);
  });

  it('puts the plane you chose on the stand, else the first that can fly', () => {
    const grounded = plane({ id: 'g', flyBlocker: 'Grounded' });
    const ready = plane({ id: 'r' });
    expect(chooseStand([grounded, ready], null).own?.id).toBe('r');
    expect(chooseStand([grounded, ready], 'g').own?.id).toBe('g');
    expect(chooseStand([grounded, ready], 'gone').own?.id).toBe('r');
    expect(chooseStand([grounded, ready], null).spare.map((entry) => entry.id)).toEqual(['g']);
    expect(chooseStand([], null)).toEqual({ own: null, spare: [] });
  });

  it('draws yours on the stand, your spares and then friends’ planes, never more than six others, the rest hangared', () => {
    const friends = Array.from({ length: 5 }, (_, index) => other({ id: `f${index}` }));
    const split = chooseStand([plane({ id: 'a' }), plane({ id: 'b' })], null);
    const placed = apronPlanes(split, friends);
    expect(placed.own?.id).toBe('a');
    expect(placed.others.map((entry) => entry.id)).toEqual(['b', 'f0', 'f1', 'f2', 'f3', 'f4']);
    const layout = layoutApron(placed.own, placed.others);
    expect(layout.own).not.toBeNull();
    expect(layout.others.length).toBeLessThanOrEqual(MAX_OTHERS);
    expect(layout.others.length + layout.hangared).toBe(placed.others.length);
    expect(apronPlaneOf(other()).cls).toBe('piston-single');
  });
});

describe('taking off', () => {
  it('asks the licence-flown turboprop for the cockpit seat, and lets a jet’s crew fly from the cabin', () => {
    const turboprop = plane({ aircraftId: 'king-air-350', aircraftClass: 'turboprop' });
    expect(cockpitRoom('turboprop')).toBe('cockpit');
    expect(takeoffCheck(turboprop, option(), 'cabin')).toEqual({ allowed: false, reason: 'Take the pilot’s seat in the cockpit' });
    expect(takeoffCheck(turboprop, option(), 'cockpit')).toEqual({ allowed: true, reason: null });
    expect(takeoffCheck(plane(), option(), 'cabin')).toEqual({ allowed: true, reason: null });
  });

  it('a one-room piston plane is flown from its only room', () => {
    expect(cockpitRoom('piston-single')).toBeNull();
    const cessna = plane({ aircraftId: 'cessna-172', aircraftClass: 'piston-single' });
    expect(takeoffCheck(cessna, option(), 'cabin').allowed).toBe(true);
  });

  it('shows the server’s reason first (no licence, grounded, out of range) and refuses a terminal that is not open', () => {
    expect(takeoffCheck(plane({ flyBlocker: 'You need a Private Pilot Licence' }), option(), 'cabin')).toEqual({ allowed: false, reason: 'You need a Private Pilot Licence' });
    expect(takeoffCheck(plane(), option({ open: false }), 'cabin').allowed).toBe(false);
  });
});

const flight = (over: Partial<FlightDto> = {}): FlightDto => ({
  id: 'fl:1:lagos:air-peace:0',
  airlineId: 'air-peace',
  airlineName: 'Air Peace',
  airlineCode: 'P4',
  colors: ['#0b6b3a', '#ffffff'],
  number: 'P4 7001',
  fromCity: 'lagos',
  toCity: 'abuja',
  fromAirportVenueId: 'mmia-airport',
  toAirportVenueId: 'naia-airport',
  departAt: 1000,
  arriveAt: 1070,
  economyFare: 118_000,
  businessFare: 248_000,
  phase: 'check-in',
  bookable: true,
  ...over,
});

const booking = (over: Partial<FlightBookingDto> = {}): FlightBookingDto => ({
  id: 'b1',
  status: 'booked',
  cabin: 'economy',
  fare: 118_000,
  channel: 'app',
  seat: '12A',
  gate: 'B3',
  bookedAt: 0,
  flight: flight(),
  checkInOpensAt: 820,
  checkInClosesAt: 955,
  boardingOpensAt: 960,
  gateClosesAt: 990,
  changedFrom: null,
  nextStep: '',
  canCheckIn: false,
  canBoard: false,
  changeFee: null,
  ...over,
});

describe('which flight you are on', () => {
  it('is the boarded booking that lands when your trip does, else your plane in the air', () => {
    const boarded = booking({ status: 'boarded' });
    expect(resolveFlight([boarded], [], 1070)).toMatchObject({ kind: 'commercial', cls: 'airliner-jet' });
    expect(resolveFlight([boarded], [plane({ airborne: true, arrivesAt: 1070 })], 1070)?.kind).toBe('commercial');
    const flying = resolveFlight([booking()], [plane({ airborne: true, arrivesAt: 1200 })], 1200);
    expect(flying).toMatchObject({ kind: 'private', cls: 'light-jet' });
    expect(resolveFlight([booking()], [plane()], 1200)).toBeNull();
    expect(resolveFlight(undefined, undefined, 1)).toBeNull();
  });

  it('keys a flight by when and where it went, so each flight can be skipped on its own', () => {
    expect(flightKey({ departAt: 5, toLocationId: 'naia-gat' })).toBe('5:naia-gat');
  });
});

describe('the sky sequence', () => {
  it('plays for the rest of the flight, within bounds, and not at all when it is nearly over', () => {
    expect(skyDuration(SKY_MIN_MS - 1)).toBe(0);
    expect(skyDuration(SKY_MIN_MS)).toBe(SKY_MIN_MS);
    expect(skyDuration(40_000)).toBe(40_000);
    expect(skyDuration(10 * 60_000)).toBe(SKY_MAX_MS);
  });
});

describe('passengers', () => {
  it('are drawn like any other player present in the cabin', () => {
    const [first] = passengerPresence([{ id: 'p1', handle: 'ada', firstName: 'Ada', gender: 'female', appearance: {} as never, outfit: {} }], 'mmia-airport');
    expect(first).toMatchObject({ characterId: 'p1', handle: 'ada', locationId: 'mmia-airport', activity: null });
  });
});

describe('the gate card', () => {
  it('shows the booking you can act on, else the soonest live one, else a missed one to change', () => {
    const soon = booking({ id: 'soon', flight: flight({ departAt: 100 }) });
    const later = booking({ id: 'later', flight: flight({ departAt: 900 }), canBoard: true, status: 'checked-in' });
    expect(nextBooking([soon, later], 'mmia-airport')?.id).toBe('later');
    expect(nextBooking([later, soon].map((entry) => ({ ...entry, canBoard: false })), 'mmia-airport')?.id).toBe('soon');
    const missed = booking({ id: 'm', status: 'missed' });
    expect(nextBooking([missed], 'mmia-airport')?.id).toBe('m');
    expect(nextBooking([soon], 'naia-airport')).toBeNull();
    expect(nextBooking([booking({ status: 'flown' })], 'mmia-airport')).toBeNull();
  });

  it('stays tucked away only until check-in or boarding opens, or the flight is missed', () => {
    const waiting = booking({ id: 'b', status: 'checked-in', canCheckIn: false, canBoard: false });
    expect(gateStep({ ...waiting })).toBe(gateStep(waiting));
    expect(gateStep({ ...waiting, canBoard: true })).not.toBe(gateStep(waiting));
    expect(gateStep({ ...waiting, status: 'booked', canCheckIn: true })).not.toBe(gateStep(waiting));
    expect(gateStep({ ...waiting, status: 'missed' })).not.toBe(gateStep(waiting));
    expect(gateStep({ ...waiting, id: 'other' })).not.toBe(gateStep(waiting));
  });
});
