import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CITIES,
  FLIGHT_CHANGE_FEE,
  INTERSTATE_BUS,
  MINUTES_PER_HOUR,
  flightWindows,
  type CharacterSnapshotDto,
  type FlightDto,
  type FlightsOverviewDto,
  type JobBoardDto,
  type RentalListingDto,
  type TravelActionResultDto,
} from '@insidelife/shared';
import { CITY_TRAVEL_PORT, type CityTravelPort } from '../src/common/ports/city-travel.port.js';
import { CharacterSession } from '../src/modules/simulation/character-session.service.js';
import { bootApp, type E2eApp } from './support/app.js';
import { drainCash, fund } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { createPlayer, key, ok, refused, type Player } from './support/players.js';

let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp();
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

/** Put the character inside a venue in a city (as if they had walked in), idle. */
async function placeIn(player: Player, locationId: string, cityId: 'lagos' | 'abuja'): Promise<void> {
  await e2e.dataSource.query(`UPDATE characters SET location_id = $1, city_id = $2, travel = NULL, activity = NULL WHERE id = $3`, [locationId, cityId, player.characterId]);
}

async function traveller(startAt = 'mmia-airport', city: 'lagos' | 'abuja' = 'lagos', money = 3_000_000): Promise<Player> {
  const player = await createPlayer(e2e, { age: 25 });
  if (money > 0) await fund(e2e, player, money);
  await placeIn(player, startAt, city);
  return player;
}

const overview = async (player: Player): Promise<FlightsOverviewDto> => ok<FlightsOverviewDto>(await player.get('/flights'));

/** The first flight leaving between `fromHours` and `toHours` from now. */
async function flightIn(player: Player, fromHours: number, toHours: number): Promise<FlightDto> {
  const { flights, now } = await overview(player);
  const flight = flights.find((candidate) => candidate.departAt - now >= fromHours * MINUTES_PER_HOUR && candidate.departAt - now <= toHours * MINUTES_PER_HOUR);
  if (!flight) throw new Error(`no flight between ${fromHours}h and ${toHours}h`);
  return flight;
}

const book = (player: Player, flight: FlightDto, extra: object = {}) =>
  player.post('/flights/bookings', { flightId: flight.id, cabin: 'economy', channel: 'app', ...extra });

const snapshot = (player: Player): Promise<CharacterSnapshotDto> => player.snapshot();

describe('flights: the timetable', () => {
  it('lists the real airlines’ flights out of the city you are in, with the airport and the coach', async () => {
    e2e.clock.at(10);
    const player = await traveller();
    const view = await overview(player);
    expect(view.cityId).toBe('lagos');
    expect(view.otherCityId).toBe('abuja');
    expect(view.atAirport).toBe(true);
    expect(view.airportVenueId).toBe('mmia-airport');
    expect(view.flights.length).toBeGreaterThanOrEqual(8);
    expect(new Set(view.flights.map((flight) => flight.airlineName))).toEqual(new Set(['Air Peace', 'Ibom Air', 'Arik Air', 'United Nigeria Airlines']));
    for (const flight of view.flights) {
      expect(flight.fromCity).toBe('lagos');
      expect(flight.toAirportVenueId).toBe('naia-airport');
      expect(flight.economyFare).toBeGreaterThanOrEqual(95_000);
      expect(flight.economyFare).toBeLessThanOrEqual(200_000);
    }
    expect(view.bus).toMatchObject({ toCity: 'abuja', stationVenueId: 'cms-motor-park', available: false });
    const search = ok<{ flights: FlightDto[] }>(await player.get('/flights/search?from=abuja&day=1'));
    expect(search.flights.length).toBeGreaterThanOrEqual(8);
    expect(search.flights.every((flight) => flight.fromCity === 'abuja')).toBe(true);
  });
});

describe('flights: booking, check-in, boarding, landing', () => {
  it('books in the app (ledger charge, once), checks in at the airport inside the window, boards and lands in Abuja', async () => {
    e2e.clock.at(10);
    const player = await traveller();
    const flight = await flightIn(player, 6, 14);
    const before = await player.cash();

    const booked = ok<TravelActionResultDto>(await book(player, flight)).overview.bookings[0]!;
    expect(booked).toMatchObject({ status: 'booked', fare: flight.economyFare, cabin: 'economy', channel: 'app' });
    expect(booked.flight.id).toBe(flight.id);
    expect(booked.seat).toMatch(/^\d+[A-F]$/);
    expect(await player.cash()).toBe(before - flight.economyFare);

    // A second tap on the same flight is the same booking: nothing more is charged.
    const again = ok<TravelActionResultDto>(await book(player, flight));
    expect(again.overview.bookings).toHaveLength(1);
    expect(await player.cash()).toBe(before - flight.economyFare);
    const rows = await e2e.dataSource.query<Array<{ idempotency_key: string; kind: string }>>(
      `SELECT idempotency_key, kind FROM ledger_transactions WHERE character_id = $1 AND memo LIKE '%to Abuja%'`,
      [player.characterId],
    );
    expect(rows).toEqual([{ idempotency_key: `${player.characterId}:flight:book:${flight.id}`, kind: 'transport' }]);

    // Too early for check-in; then inside the window.
    refused(await player.post(`/flights/bookings/${booked.id}/check-in`), 422, 'TOO_EARLY');
    const w = flightWindows(flight);
    e2e.clock.advance(w.checkInOpensAt - e2e.clock.now + 5);
    const checkedIn = ok<TravelActionResultDto>(await player.post(`/flights/bookings/${booked.id}/check-in`)).overview.bookings[0]!;
    expect(checkedIn.status).toBe('checked-in');

    // The gate isn't open yet; the player waits airside, then boards.
    refused(await player.post(`/flights/bookings/${booked.id}/board`), 422, 'GATE_NOT_OPEN');
    e2e.clock.advance(w.boardingOpensAt - e2e.clock.now + 2);
    const boarded = ok<TravelActionResultDto>(await player.post(`/flights/bookings/${booked.id}/board`));
    expect(boarded.overview.bookings[0]!.status).toBe('boarded');
    expect(boarded.snapshot.travel).toMatchObject({ mode: 'flight', toLocationId: 'naia-airport', arriveAt: flight.arriveAt });
    // The flight is a timeline segment of its own, with no road ride in it.
    const segment = boarded.snapshot.timeline.find((entry) => entry.kind === 'flight');
    expect(segment).toBeDefined();
    expect(segment!.label).toMatch(/Abuja|air/i);

    // In the air nobody can book a ride or step outside.
    refused(await player.post('/characters/me/exits'), 422);

    e2e.clock.advance(flight.arriveAt - e2e.clock.now + 1);
    const landed = await snapshot(player);
    expect(landed.travel).toBeNull();
    expect(landed.character.locationId).toBe('naia-airport');
    expect(landed.character.cityId).toBe('abuja');
    expect((await overview(player)).bookings.find((entry) => entry.id === booked.id)?.status).toBe('flown');
    expect(await e2e.dataSource.query(`SELECT city_id FROM characters WHERE id = $1`, [player.characterId])).toEqual([{ city_id: 'abuja' }]);
    // Now flights, listings and the airport are Abuja's.
    const home = await overview(player);
    expect(home).toMatchObject({ cityId: 'abuja', airportVenueId: 'naia-airport', atAirport: true });
  });

  it('refuses to check in away from the airport, and a ticket bought after check-in closed', async () => {
    e2e.clock.at(10);
    const player = await traveller('cms-motor-park');
    const flight = await flightIn(player, 5, 12);
    const booked = ok<TravelActionResultDto>(await book(player, flight)).overview.bookings[0]!;
    e2e.clock.advance(flightWindows(flight).checkInOpensAt - e2e.clock.now + 1);
    refused(await player.post(`/flights/bookings/${booked.id}/check-in`), 422, 'NOT_AT_AIRPORT');

    e2e.clock.advance(flightWindows(flight).checkInClosesAt - e2e.clock.now + 1);
    refused(await book(player, flight, { channel: 'app' }), 422, 'FLIGHT_CLOSED');
  });

  it('sells walk-up tickets at the airport counter only, already checked in once check-in is open', async () => {
    e2e.clock.at(10);
    const away = await traveller('ikeja-city-mall');
    const flight = await flightIn(away, 2, 8);
    refused(await book(away, flight, { channel: 'counter' }), 422, 'NOT_AT_AIRPORT');

    const player = await traveller();
    const early = await flightIn(player, 5, 9);
    const result = ok<TravelActionResultDto>(await book(player, early, { channel: 'counter', cabin: 'business' }));
    expect(result.overview.bookings[0]).toMatchObject({ channel: 'counter', cabin: 'business', fare: early.businessFare, status: 'booked' });
    // Inside the check-in window a walk-up sale comes with the boarding pass already checked in.
    e2e.clock.advance(flightWindows(early).checkInOpensAt - e2e.clock.now + 1);
    const late = await flightIn(player, 1, 4);
    const walkUp = ok<TravelActionResultDto>(await book(player, late, { channel: 'counter' })).overview.bookings.find((entry) => entry.flight.id === late.id)!;
    expect(walkUp.status).toBe('checked-in');
  });

  it('turns a missed flight into a change: the fee plus any increase, once, then the new flight works', async () => {
    e2e.clock.at(10);
    const player = await traveller();
    const first = await flightIn(player, 3, 9);
    const booked = ok<TravelActionResultDto>(await book(player, first)).overview.bookings[0]!;
    const w = flightWindows(first);
    // Sit through the gate closing without boarding.
    e2e.clock.advance(w.gateClosesAt - e2e.clock.now + 5);
    const view = await overview(player);
    expect(view.bookings.find((entry) => entry.id === booked.id)).toMatchObject({ status: 'missed', changeFee: FLIGHT_CHANGE_FEE });
    refused(await player.post(`/flights/bookings/${booked.id}/check-in`), 422, 'FLIGHT_MISSED');
    refused(await player.post(`/flights/bookings/${booked.id}/board`), 422, 'FLIGHT_MISSED');

    const next = view.flights.find((flight) => flight.departAt - view.now > 3 * MINUTES_PER_HOUR && flight.id !== first.id)!;
    const before = await player.cash();
    const change = ok<TravelActionResultDto>(await player.post(`/flights/bookings/${booked.id}/change`, { flightId: next.id }));
    const cost = FLIGHT_CHANGE_FEE + Math.max(0, next.economyFare - booked.fare);
    expect(await player.cash()).toBe(before - cost);
    const fresh = change.overview.bookings.find((entry) => entry.flight.id === next.id)!;
    expect(fresh).toMatchObject({ status: 'booked', changedFrom: booked.id, fare: next.economyFare });
    expect(change.overview.bookings.find((entry) => entry.id === booked.id)).toBeUndefined();

    // Changing the same missed booking again is refused, and charges nothing.
    refused(await player.post(`/flights/bookings/${booked.id}/change`, { flightId: next.id }), 422, 'NOT_CHANGEABLE');
    expect(await player.cash()).toBe(before - cost);
    const fees = await e2e.dataSource.query<Array<{ idempotency_key: string }>>(
      `SELECT idempotency_key FROM ledger_transactions WHERE character_id = $1 AND memo LIKE 'Change %'`,
      [player.characterId],
    );
    expect(fees).toEqual([{ idempotency_key: `${player.characterId}:flight:change:${first.id}:${next.id}` }]);
  });

  it('cannot afford a seat it cannot pay for: nothing is booked', async () => {
    e2e.clock.at(10);
    const player = await traveller('mmia-airport', 'lagos', 0);
    await drainCash(e2e, player);
    await fund(e2e, player, 10_000);
    const flight = await flightIn(player, 4, 12);
    const response = await book(player, flight);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await overview(player)).bookings).toHaveLength(0);
  });
});

describe('the interstate coach', () => {
  it('leaves from the motor park, costs far less than a flight and takes about ten hours', async () => {
    e2e.clock.at(10);
    const player = await traveller('cms-motor-park');
    const view = await overview(player);
    expect(view.bus).toMatchObject({ available: true, toCity: 'abuja', stationVenueId: 'cms-motor-park' });
    expect(view.bus.minutes).toBeGreaterThanOrEqual(INTERSTATE_BUS.hours * MINUTES_PER_HOUR);
    expect(view.bus.fare).toBeLessThan(view.flights[0]!.economyFare / 2);

    const before = await player.cash();
    const result = ok<TravelActionResultDto>(await player.post('/travel/bus', { toCity: 'abuja' }));
    expect(result.snapshot.travel).toMatchObject({ mode: 'coach', toLocationId: 'utako-motor-park', fare: view.bus.fare });
    expect(await player.cash()).toBe(before - view.bus.fare);
    expect(result.snapshot.timeline.some((entry) => entry.kind === 'flight' && /coach/i.test(entry.label))).toBe(true);

    e2e.clock.advance(view.bus.minutes + 1);
    const landed = await snapshot(player);
    expect(landed.character).toMatchObject({ locationId: 'utako-motor-park', cityId: 'abuja' });
    expect(CITIES.abuja.busStationVenueId).toBe('utako-motor-park');
  });

  it('only runs from the station and to the other city', async () => {
    e2e.clock.at(10);
    const player = await traveller('ikeja-city-mall');
    refused(await player.post('/travel/bus', { toCity: 'abuja' }), 422, 'NOT_AT_STATION');
    const there = await traveller('cms-motor-park');
    refused(await there.post('/travel/bus', { toCity: 'lagos' }), 422, 'SAME_CITY');
  });
});

describe('one city at a time', () => {
  it('has no rides, quotes or GPS across the cities: “fly or take the bus”', async () => {
    e2e.clock.at(10);
    const player = await traveller('ikeja-city-mall');
    const quotes = ok<Array<{ available: boolean; reason?: string }>>(await player.get('/characters/me/travel/quotes?destinationId=wuse-market'));
    expect(quotes.length).toBeGreaterThan(0);
    for (const quote of quotes) expect(quote).toMatchObject({ available: false, reason: expect.stringMatching(/fly or take the bus/i) });
    refused(await player.post('/characters/me/travel', { destinationId: 'wuse-market', mode: 'bolt' }), 422, 'OTHER_CITY');
  });

  it('shows each city its own housing, land and jobs, and keeps the other city’s for when you are there', async () => {
    e2e.clock.at(10);
    const player = await traveller('ikeja-city-mall');
    const lagos = ok<RentalListingDto[]>(await player.get('/housing/listings'));
    expect(lagos.length).toBeGreaterThan(0);
    expect(lagos.every((listing) => !['maitama', 'asokoro', 'wuse', 'garki', 'jabi', 'gwarinpa', 'kubwa', 'lugbe', 'abuja-cbd'].includes(listing.districtId))).toBe(true);
    const abuja = ok<RentalListingDto[]>(await player.get('/housing/listings?cityId=abuja'));
    expect(abuja.length).toBeGreaterThan(0);
    expect(abuja.every((listing) => ['maitama', 'asokoro', 'wuse', 'garki', 'jabi', 'gwarinpa', 'kubwa', 'lugbe', 'abuja-cbd'].includes(listing.districtId))).toBe(true);

    // Browse the other city's flats, but you can only sign where you are.
    refused(await player.post('/housing/leases', { listingId: abuja[0]!.id }), 422, 'OTHER_CITY');

    const jobsHere = ok<JobBoardDto>(await player.get('/jobs'));
    expect(jobsHere.cityId).toBe('lagos');
    const jobsThere = ok<JobBoardDto>(await player.get('/jobs?cityId=abuja'));
    expect(jobsThere.jobs.some((job) => job.id === 'wuse-market-trader')).toBe(true);
    expect(jobsHere.jobs.some((job) => job.id === 'wuse-market-trader')).toBe(false);
    refused(await player.post('/jobs/wuse-market-trader/applications'), 422, 'OTHER_CITY');
  });

  it('lets someone living in Abuja rent and take a job there once they are there', async () => {
    e2e.clock.at(10);
    const player = await traveller('naia-airport', 'abuja', 60_000_000);
    const listings = ok<RentalListingDto[]>(await player.get('/housing/listings'));
    expect(listings.length).toBeGreaterThan(0);
    const listing = listings.find((candidate) => candidate.affordable && candidate.annualRent > candidate.marketRent * 0.9)!;
    const lease = ok<{ outcome: string }>(await player.post('/housing/leases', { listingId: listing.id }));
    expect(lease.outcome).toBe('moved-in');
    const mine = await snapshot(player);
    expect(mine.character.cityId).toBe('abuja');
    expect(['maitama', 'asokoro', 'wuse', 'garki', 'jabi', 'gwarinpa', 'kubwa', 'lugbe', 'abuja-cbd']).toContain(mine.character.homeDistrictId);

    const job = ok<JobBoardDto>(await player.get('/jobs')).jobs.find((entry) => entry.id === 'wuse-market-trader')!;
    expect(job).toBeDefined();
    expect(job.eligible).toBe(true);
    ok(await player.post('/jobs/wuse-market-trader/applications'));
  });
});

describe('relocateToCity (what private flights will call)', () => {
  it('puts the character in flight to the other city’s General Aviation Terminal and lands them there', async () => {
    e2e.clock.at(10);
    const player = await traveller('mmia-gat');
    const port = e2e.get<CityTravelPort>(CITY_TRAVEL_PORT);
    const arriveAt = e2e.clock.now + 90;
    await e2e.get(CharacterSession).run({ characterId: player.characterId }, (ctx) => port.relocateToCity(ctx, 'naia-gat', arriveAt, `private:${key()}`));
    const inAir = await snapshot(player);
    expect(inAir.travel).toMatchObject({ mode: 'flight', toLocationId: 'naia-gat', arriveAt });
    expect(inAir.timeline.some((entry) => entry.kind === 'flight')).toBe(true);

    e2e.clock.advance(91);
    const landed = await snapshot(player);
    expect(landed.character).toMatchObject({ locationId: 'naia-gat', cityId: 'abuja' });

    // Already in Abuja: can't "relocate" to Abuja again, and only airports qualify.
    await expect(e2e.get(CharacterSession).run({ characterId: player.characterId }, (ctx) => port.relocateToCity(ctx, 'naia-airport', e2e.clock.now + 10))).rejects.toMatchObject({ errorCode: 'SAME_CITY' });
    await expect(e2e.get(CharacterSession).run({ characterId: player.characterId }, (ctx) => port.relocateToCity(ctx, 'wuse-market', e2e.clock.now + 10))).rejects.toMatchObject({ errorCode: 'RESOURCE_NOT_FOUND' });
  });

  it('lands at once when the arrival is not in the future', async () => {
    e2e.clock.at(10);
    const player = await traveller('naia-gat', 'abuja');
    const port = e2e.get<CityTravelPort>(CITY_TRAVEL_PORT);
    await e2e.get(CharacterSession).run({ characterId: player.characterId }, (ctx) => port.relocateToCity(ctx, 'mmia-gat', ctx.time));
    expect((await snapshot(player)).character).toMatchObject({ locationId: 'mmia-gat', cityId: 'lagos' });
  });
});
