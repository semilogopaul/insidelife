import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MINUTES_PER_DAY,
  RACE_DURATION_MINUTES,
  RACE_INVITE_MINUTES,
  aircraftLocationId,
  findAircraft,
  flightMinutes,
  flightWindows,
  GAT_ROUTE_KM,
  type AchievementsOverviewDto,
  type AircraftBoardingResultDto,
  type AircraftFlightResultDto,
  type AircraftPurchaseResultDto,
  type CharacterSnapshotDto,
  type DecorAircraftDto,
  type FlightDto,
  type FlightsOverviewDto,
  type HangarDto,
  type RaceDto,
  type RaceResultDto,
  type RacesOverviewDto,
  type TravelActionResultDto,
} from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { fund } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { createPlayer, key, moveTo, ok, refused, type Player } from './support/players.js';

/**
 * Boarding your own aircraft (location `aircraft:<id>`, the cabin, flying from aboard) and racing friends to the other
 * city: a private jet against an airliner seat, then back against the coach, with the arrival detected in the simulation's
 * trip-arrival hook, results, notifications and the winner's badge. Everything through the HTTP API.
 */
let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp();
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

const snapshot = (player: Player): Promise<CharacterSnapshotDto> => player.snapshot();
const hangar = async (player: Player): Promise<HangarDto> => ok<HangarDto>(await player.get('/aircraft'));
const races = async (player: Player): Promise<RacesOverviewDto> => ok<RacesOverviewDto>(await player.get('/races'));

async function pilot(funds = 40_000_000_000, at = 'mmia-gat'): Promise<Player> {
  e2e.clock.at(10);
  const player = await createPlayer(e2e, { age: 30 });
  await fund(e2e, player, funds);
  await moveTo(player, at);
  return player;
}

const buy = async (player: Player, aircraftId: string): Promise<AircraftPurchaseResultDto> => ok<AircraftPurchaseResultDto>(await player.post('/aircraft/purchases', { aircraftId }));

/** A passenger-to-be: in Lagos at the airport with enough for a ticket and the coach. */
async function traveller(at = 'mmia-airport'): Promise<Player> {
  const player = await createPlayer(e2e, { age: 25 });
  await fund(e2e, player, 3_000_000);
  await moveTo(player, at);
  return player;
}

/** Test setup: stand a player in a place of a city (the city is part of where you are). */
async function placeIn(player: Player, locationId: string, city: 'lagos' | 'abuja'): Promise<void> {
  await e2e.dataSource.query(`UPDATE characters SET location_id = $1, city_id = $2, travel = NULL, activity = NULL WHERE id = $3`, [locationId, city, player.characterId]);
}

async function befriend(a: Player, b: Player): Promise<void> {
  const pairKey = a.characterId < b.characterId ? `${a.characterId}:${b.characterId}` : `${b.characterId}:${a.characterId}`;
  await e2e.dataSource.query(`INSERT INTO social_friendships (pair_key, requester_id, addressee_id, status, accepted_at) VALUES ($1, $2, $3, 'accepted', now())`, [pairKey, a.characterId, b.characterId]);
}

const titles = async (player: Player): Promise<string[]> => {
  const rows = await e2e.dataSource.query<Array<{ title: string }>>(`SELECT title FROM notifications WHERE character_id = $1 ORDER BY created_at`, [player.characterId]);
  return rows.map((row) => row.title);
};

const challenge = async (from: Player, ...friends: Player[]): Promise<RaceDto> =>
  ok<RaceResultDto>(await from.post('/races', { friendIds: friends.map((friend) => friend.characterId), idempotencyKey: key() })).race;
const accept = async (player: Player, race: RaceDto): Promise<RaceDto> => ok<RaceResultDto>(await player.post(`/races/${race.id}/acceptance`)).race;

/** Check in and board the first flight that leaves between 6 and 14 game hours from now. */
async function takeALaterFlight(player: Player): Promise<FlightDto> {
  const { flights, now } = ok<FlightsOverviewDto>(await player.get('/flights'));
  const flight = flights.find((candidate) => candidate.departAt - now > 6 * 60 && candidate.departAt - now < 14 * 60)!;
  const booked = ok<TravelActionResultDto>(await player.post('/flights/bookings', { flightId: flight.id, cabin: 'economy', channel: 'app' })).overview.bookings[0]!;
  const w = flightWindows(flight);
  e2e.clock.advance(w.checkInOpensAt - e2e.clock.now + 2);
  ok(await player.post(`/flights/bookings/${booked.id}/check-in`));
  e2e.clock.advance(w.boardingOpensAt - e2e.clock.now + 2);
  ok(await player.post(`/flights/bookings/${booked.id}/board`));
  return flight;
}

describe('boarding your own aircraft', () => {
  it('puts you in the cabin (aircraft:<id>), shows your decor, flies from aboard and lands you at the other terminal', async () => {
    const other = await pilot(1_000_000_000);
    const player = await pilot();
    const jet = await buy(player, 'phenom-300e');
    const id = jet.aircraft.id;
    const minutes = flightMinutes(findAircraft('phenom-300e')!, GAT_ROUTE_KM);

    const aboard = ok<AircraftBoardingResultDto>(await player.post(`/aircraft/${id}/boarding`));
    expect(aboard).toMatchObject({ aboard: true, locationId: aircraftLocationId(id) });
    expect((await snapshot(player)).character.locationId).toBe(aircraftLocationId(id));
    // Boarding twice is fine; the Hangar still reads you as being at the terminal, and the cabin is yours to see.
    expect(ok<AircraftBoardingResultDto>(await player.post(`/aircraft/${id}/boarding`)).aboard).toBe(true);
    const view = await hangar(player);
    expect(view.atGat).toBe('mmia-gat');
    expect(view.mine[0]!.flyBlocker).toBeNull();
    expect(ok<DecorAircraftDto>(await player.get(`/decor/aircraft/${id}`))).toMatchObject({ aircraftId: id, ownerId: player.characterId });

    // Someone who is not aboard cannot see the cabin, and cannot board a plane that is not theirs.
    refused(await other.get(`/decor/aircraft/${id}`), 403);
    refused(await other.post(`/aircraft/${id}/boarding`), 404);

    // Fly from aboard: the trip starts at the aircraft, the landing puts you inside the Abuja terminal.
    const flown = ok<AircraftFlightResultDto>(await player.post(`/aircraft/${id}/flights`, { destination: 'naia-gat', idempotencyKey: key() }));
    expect(flown.minutes).toBe(minutes);
    const flying = await snapshot(player);
    expect(flying.travel).toMatchObject({ mode: 'flight', fromLocationId: aircraftLocationId(id), toLocationId: 'naia-gat' });
    // Still aboard in the air: boarding is a no-op, but you cannot step out until you land.
    expect(ok<AircraftBoardingResultDto>(await player.post(`/aircraft/${id}/boarding`)).aboard).toBe(true);
    refused(await player.delete(`/aircraft/${id}/boarding`), 422, 'IN_THE_AIR');
    e2e.clock.advance(minutes + 1);
    expect((await snapshot(player)).character).toMatchObject({ locationId: 'naia-gat', cityId: 'abuja' });

    // Parked in Abuja now: board there, step out onto the terminal floor (twice is fine), and it is no longer boardable from Lagos.
    ok(await player.post(`/aircraft/${id}/boarding`));
    expect(ok<AircraftBoardingResultDto>(await player.delete(`/aircraft/${id}/boarding`))).toMatchObject({ aboard: false, locationId: 'naia-gat' });
    expect(ok<AircraftBoardingResultDto>(await player.delete(`/aircraft/${id}/boarding`)).aboard).toBe(false);
    expect((await snapshot(player)).character.locationId).toBe('naia-gat');
    refused(await other.delete(`/aircraft/${id}/boarding`), 404);
  });

  it('wants you at the aircraft’s terminal, and puts you back on the floor when you sell it from aboard', async () => {
    const player = await pilot();
    const jet = await buy(player, 'cessna-172');
    const id = jet.aircraft.id;
    await moveTo(player, 'mmia-airport');
    refused(await player.post(`/aircraft/${id}/boarding`), 422, 'CANNOT_BOARD');
    await moveTo(player, 'mmia-gat');
    ok(await player.post(`/aircraft/${id}/boarding`));
    ok(await player.post(`/aircraft/${id}/sale`, { idempotencyKey: key() }));
    expect((await snapshot(player)).character.locationId).toBe('mmia-gat');
  });
});

describe('race a friend to Abuja', () => {
  it('runs a private jet against an airliner seat, and back against the coach', async () => {
    e2e.clock.at(10);
    const a = await pilot();
    const jet = await buy(a, 'phenom-300e');
    const b = await traveller();
    await befriend(a, b);
    const jetMinutes = flightMinutes(findAircraft('phenom-300e')!, GAT_ROUTE_KM);

    // The Race tab knows who can be challenged.
    const before = await races(a);
    expect(before).toMatchObject({ active: null, canChallenge: true, cityId: 'lagos', toCity: 'abuja', maxRacers: 4 });
    expect(before.friends).toEqual([expect.objectContaining({ characterId: b.characterId, available: true, reason: null })]);

    // A challenges B; the clock starts when B accepts.
    const idempotencyKey = key();
    const first = ok<RaceResultDto>(await a.post('/races', { friendIds: [b.characterId], idempotencyKey }));
    const again = ok<RaceResultDto>(await a.post('/races', { friendIds: [b.characterId], idempotencyKey }));
    expect(again.race.id).toBe(first.race.id);
    expect(first.race).toMatchObject({ status: 'pending', fromCity: 'lagos', toCity: 'abuja', startedAt: null });
    expect(await titles(b)).toContain('Race to Abuja?');
    const invitation = (await races(b)).invitations[0]!;
    expect(invitation.id).toBe(first.race.id);

    const startedAt = e2e.clock.now;
    const running = await accept(b, invitation);
    expect(running).toMatchObject({ status: 'running', startedAt, decided: false });
    expect((await races(a)).active?.status).toBe('running');
    expect(await titles(a)).toContain('Race to Abuja: go!');

    // One race at a time, and no stakes: nobody paid anything for it.
    refused(await a.post('/races', { friendIds: [b.characterId] }), 422, 'CANNOT_CHALLENGE');

    // A boards the jet and flies; B books an airliner seat and sits through the timetable.
    ok(await a.post(`/aircraft/${jet.aircraft.id}/boarding`));
    ok(await a.post(`/aircraft/${jet.aircraft.id}/flights`, { destination: 'naia-gat', idempotencyKey: key() }));
    const flight = await takeALaterFlight(b);
    expect(flight.arriveAt).toBeGreaterThan(startedAt + jetMinutes);

    // Land everybody (B settles first on purpose: A's landing is earlier but not recorded yet).
    e2e.clock.advance(flight.arriveAt - e2e.clock.now + 5);
    const seenByB = (await races(b)).recent[0] ?? (await races(b)).active!;
    expect(seenByB.racers.find((racer) => racer.isYou)).toMatchObject({ status: 'finished', how: 'commercial', finishedAt: flight.arriveAt });
    const seenByA = (await races(a)).recent[0]!;
    expect(seenByA).toMatchObject({ id: first.race.id, status: 'finished', decided: true });
    const [mineA, mineB] = [seenByA.racers.find((racer) => racer.isYou)!, seenByA.racers.find((racer) => !racer.isYou)!];
    expect(mineA).toMatchObject({ place: 1, winner: true, how: 'private', elapsedMinutes: jetMinutes });
    expect(mineA.howLabel).toContain('Phenom');
    expect(mineB).toMatchObject({ place: 2, winner: false, how: 'commercial', finishedAt: flight.arriveAt, elapsedMinutes: flight.arriveAt - startedAt });
    expect(mineB.howLabel).toContain(flight.number);
    expect((await races(a)).active).toBeNull();
    expect((await races(b)).active).toBeNull();

    // Notified: the winner and the other racer.
    expect(await titles(a)).toContain('You won the race to Abuja!');
    expect((await titles(b)).some((title) => /won the race to Abuja|you came second/.test(title))).toBe(true);
    // The winner's badge arrives with the next day end; the runner-up gets none.
    e2e.clock.advance(MINUTES_PER_DAY + 5);
    await snapshot(a);
    await snapshot(b);
    e2e.clock.advance(MINUTES_PER_DAY + 5);
    await snapshot(a);
    await snapshot(b);
    const badge = async (player: Player): Promise<boolean | undefined> =>
      ok<AchievementsOverviewDto>(await player.get('/progression/achievements')).achievements.find((entry) => entry.id === 'race-to-abuja')?.unlocked;
    expect(await badge(a)).toBe(true);
    expect(await badge(b)).toBe(false);

    // And back: B challenges A in Abuja. A flies the jet home, B takes the interstate coach.
    expect((await snapshot(a)).character).toMatchObject({ cityId: 'abuja', locationId: 'naia-gat' });
    await placeIn(b, 'utako-motor-park', 'abuja');
    await fund(e2e, b, 100_000);
    const back = await challenge(b, a);
    expect(back).toMatchObject({ fromCity: 'abuja', toCity: 'lagos' });
    const backStart = e2e.clock.now;
    await accept(a, back);
    ok(await a.post(`/aircraft/${jet.aircraft.id}/boarding`));
    ok(await a.post(`/aircraft/${jet.aircraft.id}/flights`, { destination: 'mmia-gat', idempotencyKey: key() }));
    ok(await b.post('/travel/bus', { toCity: 'lagos', idempotencyKey: key() }));
    e2e.clock.advance(12 * 60);
    await races(b); // the coach lands first in the books, the jet's landing is still unrecorded
    await races(a);
    const after = (await races(b)).recent[0]!;
    expect(after).toMatchObject({ id: back.id, status: 'finished', decided: true });
    const coach = after.racers.find((racer) => racer.isYou)!;
    expect(coach).toMatchObject({ place: 2, winner: false, how: 'coach' });
    expect(coach.elapsedMinutes).toBeGreaterThan(9 * 60);
    expect(after.racers.find((racer) => !racer.isYou)).toMatchObject({ place: 1, winner: true, how: 'private', elapsedMinutes: jetMinutes });
    expect(after.startedAt).toBe(backStart);
  });

  it('ends a race nobody can finish, and a lone finisher wins at once', async () => {
    e2e.clock.at(10);
    const c = await pilot(40_000_000_000);
    const jet = await buy(c, 'phenom-300e');
    const d = await traveller();
    await befriend(c, d);
    const race = await accept(d, await challenge(c, d));
    ok(await c.post(`/aircraft/${jet.aircraft.id}/boarding`));
    ok(await c.post(`/aircraft/${jet.aircraft.id}/flights`, { destination: 'naia-gat', idempotencyKey: key() }));
    e2e.clock.advance(race.expiresAt - e2e.clock.now + 5);

    // C's landing is on the books but C has not settled yet: the race waits a little for that trip before it ends.
    expect((await races(d)).active?.status).toBe('running');
    // C settles: landed long ago, nobody else on the way, so C won at once. D never left: the race is over for both.
    expect((await races(c)).recent[0]).toMatchObject({ id: race.id, decided: true });
    const forD = (await races(d)).recent[0]!;
    expect(forD).toMatchObject({ id: race.id, status: 'expired', decided: true });
    expect(forD.racers.find((racer) => racer.isYou)).toMatchObject({ status: 'accepted', place: null, finishedAt: null });
    expect(forD.racers.find((racer) => !racer.isYou)).toMatchObject({ place: 1, winner: true, how: 'private' });
    expect((await races(d)).active).toBeNull();
    expect((await races(d)).canChallenge).toBe(true);
  });

  it('checks the rules: friends only, one city, up to four racers, one race at a time', async () => {
    e2e.clock.at(10);
    const e = await traveller();
    const f = await traveller();
    const g = await traveller();
    const stranger = await traveller();
    await befriend(e, f);
    await befriend(e, g);

    refused(await e.post('/races', { friendIds: [stranger.characterId] }), 422, 'NOT_A_FRIEND');
    refused(await e.post('/races', { friendIds: [e.characterId] }), 422);
    refused(await e.post('/races', { friendIds: [] }), 400);
    refused(await e.post('/races', { friendIds: [f.characterId, g.characterId, stranger.characterId, e.characterId] }), 400);
    await placeIn(f, 'naia-airport', 'abuja');
    refused(await e.post('/races', { friendIds: [f.characterId] }), 422, 'FRIEND_UNAVAILABLE');
    const listed = (await races(e)).friends;
    expect(listed.find((friend) => friend.characterId === f.characterId)).toMatchObject({ available: false, cityId: 'abuja' });
    await placeIn(f, 'mmia-airport', 'lagos');

    // Three racers; one answer pending, the clock waits for everyone.
    const trio = await challenge(e, f, g);
    expect(trio.racers).toHaveLength(3);
    const h = await traveller();
    await befriend(h, f);
    const second = await challenge(h, f);
    expect((await accept(f, trio)).status).toBe('pending');
    refused(await e.post('/races', { friendIds: [g.characterId] }), 422, 'CANNOT_CHALLENGE');

    // The last friend has to be in the starting city to accept; the others too when the clock would start.
    await placeIn(g, 'naia-airport', 'abuja');
    refused(await g.post(`/races/${trio.id}/acceptance`), 422, 'WRONG_CITY');
    await placeIn(g, 'mmia-airport', 'lagos');
    await placeIn(f, 'naia-airport', 'abuja');
    refused(await g.post(`/races/${trio.id}/acceptance`), 422, 'RACER_NOT_HERE');
    expect((await races(g)).invitations).toHaveLength(1);
    await placeIn(f, 'mmia-airport', 'lagos');
    expect((await accept(g, trio)).status).toBe('running');

    // A running race cannot be called off, and being in one stops you accepting another.
    refused(await e.post(`/races/${trio.id}/cancellation`), 422, 'RACE_CLOSED');
    refused(await f.post(`/races/${second.id}/acceptance`), 422, 'ALREADY_RACING');
    // A stranger to a race sees nothing of it.
    refused(await stranger.post(`/races/${trio.id}/acceptance`), 404);
    expect((await races(stranger)).recent).toEqual([]);
  });

  it('lets friends say no or the challenger call it off, and lapses an unanswered challenge', async () => {
    e2e.clock.at(10);
    const i = await traveller();
    const j = await traveller();
    const k = await traveller();
    await befriend(i, j);
    await befriend(i, k);

    // Two racers and one says no: called off, everybody is free.
    const duel = await challenge(i, j);
    const declined = ok<RaceResultDto>(await j.post(`/races/${duel.id}/decline`));
    expect(declined.race.status).toBe('cancelled');
    expect((await titles(i)).includes('Race called off')).toBe(true);
    expect((await races(i)).canChallenge).toBe(true);

    // Three racers: one says no, the other accepts and the race starts without the one who left.
    const trio = await challenge(i, j, k);
    ok(await j.post(`/races/${trio.id}/decline`));
    const started = await accept(k, trio);
    expect(started).toMatchObject({ status: 'running' });
    expect(started.racers.map((racer) => racer.handle).toSorted()).toEqual([i.handle, k.handle].toSorted());

    // The challenger can call off a race that has not started.
    const l = await traveller();
    const m = await traveller();
    await befriend(l, m);
    const off = await challenge(l, m);
    expect(ok<RaceResultDto>(await l.post(`/races/${off.id}/cancellation`)).race.status).toBe('cancelled');
    refused(await m.post(`/races/${off.id}/acceptance`), 422, 'RACE_CLOSED');
    refused(await l.post(`/races/${off.id}/decline`), 422);

    // An unanswered challenge lapses after a couple of days.
    const lapsing = await challenge(l, m);
    e2e.clock.advance(RACE_INVITE_MINUTES + 5);
    expect((await races(m)).invitations).toEqual([]);
    refused(await m.post(`/races/${lapsing.id}/acceptance`), 422, 'RACE_CLOSED');
    expect((await races(l)).canChallenge).toBe(true);

    // A started race with nobody travelling ends after its days: no winner, everybody free.
    const n = await traveller();
    const o = await traveller();
    await befriend(n, o);
    const idle = await accept(o, await challenge(n, o));
    e2e.clock.advance(RACE_DURATION_MINUTES + 5);
    const over = (await races(n)).recent.find((entry) => entry.id === idle.id)!;
    expect(over).toMatchObject({ status: 'expired', decided: false });
    expect(over.racers.every((racer) => racer.place === null && !racer.winner)).toBe(true);
    expect((await races(n)).canChallenge).toBe(true);
    expect((await races(o)).canChallenge).toBe(true);
  });
});
