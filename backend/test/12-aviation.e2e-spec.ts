import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FERRY_DELIVERY_MINUTES,
  GAT_ROUTE_KM,
  MINUTES_PER_DAY,
  PILOT_TRAINING,
  aircraftFerryFee,
  aircraftLiveryFee,
  aircraftMonthlyCosts,
  economyAt,
  findAircraft,
  flightFuelCost,
  flightMinutes,
  type AircraftChangeResultDto,
  type AircraftFlightResultDto,
  type AircraftPurchaseResultDto,
  type AircraftReinstatementResultDto,
  type AircraftSaleResultDto,
  type HangarDto,
  type PilotTrainingStepResultDto,
} from '@insidelife/shared';
import { CITY_TRAVEL_PORT, type CityTravelPort, type PrivateFlightRequest } from '../src/common/ports/city-travel.port.js';
import type { SimulationContext } from '../src/modules/simulation/simulation-context.js';
import { bootApp, type E2eApp } from './support/app.js';
import { E2E_ENV } from './support/env.js';
import { burst, drainCash, fund, worldPrice } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { createPlayer, key, moveTo, ok, refused, type Player } from './support/players.js';

/** Stands in for the multi-city work: both terminals exist and a flight just puts the character in the other one. */
class FakeCityTravel implements CityTravelPort {
  readonly flights: PrivateFlightRequest[] = [];
  isAirportOpen(): boolean {
    return true;
  }
  flyToAirport(ctx: SimulationContext, flight: PrivateFlightRequest): Promise<void> {
    this.flights.push(flight);
    ctx.character.locationId = flight.toVenueId;
    return Promise.resolve();
  }
}

let e2e: E2eApp;
const cities = new FakeCityTravel();

beforeAll(async () => {
  e2e = await bootApp({ override: (builder) => builder.overrideProvider(CITY_TRAVEL_PORT).useValue(cities) });
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

const GAT = 'mmia-gat';
const hangar = async (player: Player): Promise<HangarDto> => ok<HangarDto>(await player.get('/aircraft'));
const fuelPrice = (): number => economyAt(E2E_ENV.WORLD_SEED ?? '', e2e.clock.now).fuelPrice;

async function owner(funds: number, age = 25): Promise<Player> {
  e2e.clock.at(10);
  const player = await createPlayer(e2e, { age });
  await fund(e2e, player, funds);
  await moveTo(player, GAT);
  return player;
}

async function buyCessna(player: Player, extra: object = {}): Promise<AircraftPurchaseResultDto> {
  return ok<AircraftPurchaseResultDto>(await player.post('/aircraft/purchases', { aircraftId: 'cessna-172', ...extra }));
}

describe('aviation: catalogue and buying', () => {
  it('lists the eight aircraft at world prices and buys in person at the GAT sales desk, through the ledger', async () => {
    const player = await owner(400_000_000);
    const view = await hangar(player);
    expect(view.catalogue.map((entry) => entry.aircraft.id)).toEqual([
      'cessna-172', 'piper-seneca', 'king-air-350', 'pilatus-pc12', 'phenom-300e', 'challenger-350', 'gulfstream-g650', 'boeing-bbj',
    ]);
    expect(view.atGat).toBe(GAT);
    const cessna = view.catalogue[0]!;
    expect(cessna.price).toBe(worldPrice(200_000_000, e2e.clock.now));
    expect(cessna.buyHere).toBe(true);

    const before = await player.cash();
    const bought = await buyCessna(player);
    expect(bought).toMatchObject({ channel: 'in-person', price: cessna.price, ferryFee: 0 });
    expect(bought.aircraft).toMatchObject({ aircraftId: 'cessna-172', parkedAt: GAT, airborne: false, grounded: false, liveryBase: 'arctic-white', callName: null });
    expect(bought.aircraft.registration).toMatch(/^5N-[A-Z]{3}$/);
    expect(await player.cash()).toBe(before - cessna.price);

    const rows = await e2e.dataSource.query<Array<{ kind: string; idempotency_key: string }>>(
      `SELECT kind, idempotency_key FROM ledger_transactions WHERE character_id = $1 AND memo LIKE 'Cessna 172%'`,
      [player.characterId],
    );
    expect(rows).toEqual([{ kind: 'purchase', idempotency_key: `${player.characterId}:aircraft-purchase:${bought.aircraft.id}` }]);

    e2e.clock.advance(1);
    const snapshot = await player.snapshot();
    expect(snapshot.summary.netWorth).toBeGreaterThan(snapshot.wallet.balance + 0.95 * cessna.price);
  });

  it('three taps with one key buy once; refuses a broke buyer, a fifth aircraft and an unknown model', async () => {
    const player = await owner(2_000_000_000);
    const before = await player.cash();
    const tap = key();
    const results = await burst(3, () => player.post('/aircraft/purchases', { aircraftId: 'cessna-172', idempotencyKey: tap }));
    expect(results.map((result) => result.status)).toEqual([201, 201, 201]);
    expect(await player.cash()).toBe(before - worldPrice(200_000_000, e2e.clock.now));
    expect((await hangar(player)).mine).toHaveLength(1);

    refused(await player.post('/aircraft/purchases', { aircraftId: 'spitfire' }), 404, 'RESOURCE_NOT_FOUND');
    for (let index = 0; index < 3; index++) await buyCessna(player);
    refused(await player.post('/aircraft/purchases', { aircraftId: 'cessna-172' }), 422, 'HANGAR_FULL');

    const broke = await owner(10_000_000);
    const cash = await broke.cash();
    refused(await broke.post('/aircraft/purchases', { aircraftId: 'cessna-172' }), 422, 'INSUFFICIENT_FUNDS');
    expect(await broke.cash()).toBe(cash);
  });

  it('buys remotely with a ferry fee and a delivery after three game days, to either terminal', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e, { age: 25 });
    await fund(e2e, player, 600_000_000);
    const before = await player.cash();
    const bought = ok<AircraftPurchaseResultDto>(await player.post('/aircraft/purchases', { aircraftId: 'cessna-172', deliverTo: 'naia-gat' }));
    const ferry = worldPrice(aircraftFerryFee(findAircraft('cessna-172')!), e2e.clock.now);
    expect(bought.channel).toBe('delivery');
    expect(bought.ferryFee).toBe(ferry);
    expect(await player.cash()).toBe(before - bought.price - ferry);
    expect(bought.aircraft).toMatchObject({ parkedAt: 'naia-gat', airborne: true, arrivesAt: e2e.clock.now + FERRY_DELIVERY_MINUTES });
    refused(await player.post(`/aircraft/${bought.aircraft.id}/sale`, {}), 422, 'IN_THE_AIR');

    e2e.clock.advance(FERRY_DELIVERY_MINUTES + 5);
    expect((await hangar(player)).mine[0]).toMatchObject({ airborne: false, arrivesAt: null, parkedAt: 'naia-gat' });
  });
});

describe('aviation: make it yours', () => {
  it('validates, moderates and charges for livery, name and a globally unique registration', async () => {
    const player = await owner(1_000_000_000);
    const other = await owner(1_000_000_000);
    const first = await buyCessna(player, { registration: 'tol', name: 'Air Tolu', liveryBase: 'hot-pink', liveryAccent: 'arctic-white' });
    expect(first.aircraft).toMatchObject({ registration: '5N-TOL', callName: 'AIR TOLU', liveryBase: 'hot-pink' });
    refused(await other.post('/aircraft/purchases', { aircraftId: 'cessna-172', registration: '5n-tol' }), 422, 'REGISTRATION_TAKEN');
    refused(await other.post('/aircraft/purchases', { aircraftId: 'cessna-172', registration: 'sex' }), 422, 'BAD_REGISTRATION');
    refused(await other.post('/aircraft/purchases', { aircraftId: 'cessna-172', name: 'shit happens' }), 422, 'BAD_NAME');
    refused(await other.post('/aircraft/purchases', { aircraftId: 'cessna-172', liveryBase: 'chartreuse' }), 422, 'LIVERY_UNAVAILABLE');

    const second = await buyCessna(other);
    const id = second.aircraft.id;
    const before = await other.cash();
    const livery = ok<AircraftChangeResultDto>(await other.put(`/aircraft/${id}/livery`, { base: 'flamingo-pink', accent: 'jet-black' }));
    const liveryFee = worldPrice(aircraftLiveryFee(findAircraft('cessna-172')!), e2e.clock.now);
    expect(livery).toMatchObject({ fee: liveryFee });
    expect(livery.aircraft).toMatchObject({ liveryBase: 'flamingo-pink', liveryAccent: 'jet-black' });
    expect(await other.cash()).toBe(before - liveryFee);
    refused(await other.put(`/aircraft/${id}/livery`, { base: 'flamingo-pink', accent: 'jet-black' }), 422, 'NOTHING_TO_CHANGE');
    refused(await other.put(`/aircraft/${id}/livery`, { base: 'nope', accent: 'navy' }), 422, 'LIVERY_UNAVAILABLE');

    const named = ok<AircraftChangeResultDto>(await other.put(`/aircraft/${id}/name`, { name: 'Pink Panther' }));
    expect(named.aircraft.callName).toBe('PINK PANTHER');
    refused(await other.put(`/aircraft/${id}/name`, { name: 'This name is far too long' }), 422, 'BAD_NAME');
    refused(await other.put(`/aircraft/${id}/name`, { name: 'No-Dashes' }), 422, 'BAD_NAME');

    refused(await other.put(`/aircraft/${id}/registration`, { registration: 'TOL' }), 422, 'REGISTRATION_TAKEN');
    const cash = await other.cash();
    const renamed = ok<AircraftChangeResultDto>(await other.put(`/aircraft/${id}/registration`, { registration: 'pnk' }));
    expect(renamed.aircraft.registration).toBe('5N-PNK');
    expect(await other.cash()).toBe(cash - renamed.fee);
    expect(await e2e.dataSource.query(`SELECT 1 FROM aircraft WHERE registration = '5N-TOL'`)).toHaveLength(1);
  });
});

describe('aviation: selling', () => {
  it('pays a depreciated broker offer (88-95% of value) and removes the aircraft', async () => {
    const player = await owner(500_000_000);
    const bought = await buyCessna(player);
    const before = await player.cash();
    const sale = ok<AircraftSaleResultDto>(await player.post(`/aircraft/${bought.aircraft.id}/sale`, {}));
    expect(sale.amount).toBeGreaterThanOrEqual(0.87 * bought.price);
    expect(sale.amount).toBeLessThanOrEqual(0.96 * bought.price);
    expect(await player.cash()).toBe(before + sale.amount);
    expect((await hangar(player)).mine).toHaveLength(0);
  });
});

describe('aviation: flying', () => {
  it('needs the licence for a Cessna but not for a jet; charges fuel by distance and moves the aircraft and the pilot', async () => {
    const player = await owner(30_000_000_000);
    const cessna = await buyCessna(player);
    refused(await player.post(`/aircraft/${cessna.aircraft.id}/flights`, { destination: 'naia-gat' }), 422, 'CANNOT_FLY');
    expect(cessna.aircraft.flyBlocker).toMatch(/Private Pilot Licence/);

    const jet = ok<AircraftPurchaseResultDto>(await player.post('/aircraft/purchases', { aircraftId: 'phenom-300e' }));
    expect(jet.aircraft.flyBlocker).toBeNull();
    refused(await player.post(`/aircraft/${jet.aircraft.id}/flights`, { destination: 'mmia-gat' }), 422, 'NO_SUCH_TERMINAL');

    const phenom = findAircraft('phenom-300e')!;
    const fuel = flightFuelCost(phenom, GAT_ROUTE_KM, fuelPrice());
    const minutes = flightMinutes(phenom, GAT_ROUTE_KM);
    const before = await player.cash();
    const flown = ok<AircraftFlightResultDto>(await player.post(`/aircraft/${jet.aircraft.id}/flights`, { destination: 'naia-gat', idempotencyKey: key() }));
    expect(flown).toMatchObject({ fuelCost: fuel, minutes, arrivesAt: e2e.clock.now + minutes });
    expect(flown.aircraft).toMatchObject({ parkedAt: 'naia-gat', airborne: true });
    expect(await player.cash()).toBe(before - fuel);
    expect(cities.flights.at(-1)).toMatchObject({ fromVenueId: 'mmia-gat', toVenueId: 'naia-gat', durationMinutes: minutes });
    expect((await player.character()).location_id).toBe('naia-gat');

    const ledger = await e2e.dataSource.query<Array<{ kind: string; idempotency_key: string }>>(
      `SELECT kind, idempotency_key FROM ledger_transactions WHERE character_id = $1 AND memo LIKE 'Fuel Jet A-1%'`,
      [player.characterId],
    );
    expect(ledger).toEqual([{ kind: 'transport', idempotency_key: `${player.characterId}:aircraft-fuel:${jet.aircraft.id}:${e2e.clock.now}` }]);

    // Still in the air: cannot fly again. Once landed, the pilot is at Abuja's terminal and the jet can come home.
    refused(await player.post(`/aircraft/${jet.aircraft.id}/flights`, { destination: 'mmia-gat' }), 422, 'CANNOT_FLY');
    e2e.clock.advance(minutes + 1);
    const home = ok<AircraftFlightResultDto>(await player.post(`/aircraft/${jet.aircraft.id}/flights`, { destination: 'mmia-gat' }));
    expect(home.aircraft.parkedAt).toBe('mmia-gat');
  });

  it('refuses when you are not at the aircraft’s terminal', async () => {
    const player = await owner(30_000_000_000);
    const jet = ok<AircraftPurchaseResultDto>(await player.post('/aircraft/purchases', { aircraftId: 'phenom-300e' }));
    await moveTo(player, 'mmia-airport');
    refused(await player.post(`/aircraft/${jet.aircraft.id}/flights`, { destination: 'naia-gat' }), 422, 'CANNOT_FLY');
    expect((await hangar(player)).mine[0]!.flyBlocker).toMatch(/another terminal/);
  });
});

describe('aviation: month-end bills', () => {
  it('charges hangar and maintenance through the ledger, and crew for jets', async () => {
    const player = await owner(60_000_000_000);
    const jet = ok<AircraftPurchaseResultDto>(await player.post('/aircraft/purchases', { aircraftId: 'phenom-300e' }));
    const expected = aircraftMonthlyCosts(findAircraft('phenom-300e')!, jet.price, 1);
    expect(expected.crew).toBeGreaterThan(0);
    e2e.clock.advance(30 * MINUTES_PER_DAY);
    await hangar(player);
    const rows = await e2e.dataSource.query<Array<{ memo: string; kind: string; idempotency_key: string }>>(
      `SELECT memo, kind, idempotency_key FROM ledger_transactions WHERE character_id = $1 AND idempotency_key LIKE $2 ORDER BY memo`,
      [player.characterId, `${player.characterId}:aircraft-month:${jet.aircraft.id}:%`],
    );
    expect(rows.map((row) => row.memo.split(':')[0])).toEqual(['Aircraft maintenance', 'Flight crew salaries', 'Hangar fee']);
    expect((await hangar(player)).mine[0]).toMatchObject({ grounded: false, arrears: 0 });
  });

  it('grounds an aircraft whose bills go unpaid, and reinstates it once the arrears are paid', async () => {
    const player = await owner(500_000_000);
    const cessna = await buyCessna(player);
    await drainCash(e2e, player);
    e2e.clock.advance(30 * MINUTES_PER_DAY);
    const view = await hangar(player);
    const plane = view.mine[0]!;
    expect(plane.grounded).toBe(true);
    expect(plane.arrears).toBeGreaterThan(0);
    await moveTo(player, GAT);
    refused(await player.post(`/aircraft/${cessna.aircraft.id}/flights`, { destination: 'naia-gat' }), 422, 'CANNOT_FLY');
    refused(await player.post(`/aircraft/${cessna.aircraft.id}/reinstatement`, {}), 422, 'INSUFFICIENT_FUNDS');

    await fund(e2e, player, 50_000_000);
    const before = await player.cash();
    const reinstated = ok<AircraftReinstatementResultDto>(await player.post(`/aircraft/${cessna.aircraft.id}/reinstatement`, {}));
    expect(reinstated.paid).toBe(plane.arrears);
    expect(reinstated.aircraft).toMatchObject({ grounded: false, arrears: 0 });
    expect(await player.cash()).toBe(before - plane.arrears);
    refused(await player.post(`/aircraft/${cessna.aircraft.id}/reinstatement`, {}), 422, 'NOT_GROUNDED');
  });
});

describe('aviation: Private Pilot Licence', () => {
  async function trainingDay(player: Player): Promise<PilotTrainingStepResultDto> {
    await hangar(player); // settle the time that has passed (it may send you home) before walking in
    await moveTo(player, GAT);
    const step = ok<PilotTrainingStepResultDto>(await player.post('/aircraft/pilot-training/lessons', {}));
    e2e.clock.advance(PILOT_TRAINING.lessonMinutes + 1);
    await hangar(player);
    return step;
  }

  it('enrol, a lesson a day, the check-ride and then the licence flies a Cessna', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e, { age: 22 });
    await fund(e2e, player, 600_000_000);

    refused(await player.post('/aircraft/pilot-training/enrolment', {}), 422, 'WRONG_PLACE');
    await moveTo(player, GAT);
    const young = await createPlayer(e2e, { age: 17 });
    await fund(e2e, young, 100_000_000);
    await moveTo(young, GAT);
    refused(await young.post('/aircraft/pilot-training/enrolment', {}), 422, 'TOO_YOUNG');
    refused(await player.post('/aircraft/pilot-training/lessons', {}), 422, 'NOT_ENROLLED');

    const before = await player.cash();
    const enrolled = ok<PilotTrainingStepResultDto>(await player.post('/aircraft/pilot-training/enrolment', {}));
    expect(enrolled.fee).toBe(worldPrice(PILOT_TRAINING.enrolFee, e2e.clock.now));
    expect(await player.cash()).toBe(before - enrolled.fee);
    expect(enrolled.training).toMatchObject({ enrolled: true, lessons: 0, licence: false });
    refused(await player.post('/aircraft/pilot-training/enrolment', {}), 422, 'ALREADY_ENROLLED');
    refused(await player.post('/aircraft/pilot-training/check-rides', {}), 422, 'NOT_READY');

    // One lesson: a fee, a timed action, and one lesson a day.
    const cash = await player.cash();
    const first = ok<PilotTrainingStepResultDto>(await player.post('/aircraft/pilot-training/lessons', {}));
    expect(first.training.inProgress).toBe('lesson');
    expect(await player.cash()).toBe(cash - first.fee);
    refused(await player.post('/aircraft/pilot-training/lessons', {}), 422, 'BUSY');
    e2e.clock.advance(PILOT_TRAINING.lessonMinutes + 1);
    await hangar(player);
    await moveTo(player, GAT);
    refused(await player.post('/aircraft/pilot-training/lessons', {}), 422, 'ONE_A_DAY');
    expect((await hangar(player)).training).toMatchObject({ lessons: 1, inProgress: null });

    // The rest, a day apart.
    for (let lesson = 2; lesson <= PILOT_TRAINING.lessonsRequired; lesson++) {
      e2e.clock.pastMidnight(60);
      await trainingDay(player);
    }
    const ready = (await hangar(player)).training;
    expect(ready.lessons).toBe(PILOT_TRAINING.lessonsRequired);

    // Check-rides until one is passed (each attempt is paid once, with its own ledger key).
    let attempts = 0;
    while (!(await hangar(player)).training.licence) {
      attempts += 1;
      expect(attempts).toBeLessThan(15);
      const state = (await hangar(player)).training;
      await moveTo(player, GAT);
      if (state.lessons < PILOT_TRAINING.lessonsRequired) {
        e2e.clock.pastMidnight(60);
        await trainingDay(player);
        continue;
      }
      ok<PilotTrainingStepResultDto>(await player.post('/aircraft/pilot-training/check-rides', {}));
      e2e.clock.advance(PILOT_TRAINING.checkRideMinutes + 1);
    }
    const keys = await e2e.dataSource.query<Array<{ idempotency_key: string }>>(
      `SELECT idempotency_key FROM ledger_transactions WHERE character_id = $1 AND idempotency_key LIKE $2 ORDER BY idempotency_key`,
      [player.characterId, `${player.characterId}:ppl-checkride:%`],
    );
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(new Set(keys.map((row) => row.idempotency_key)).size).toBe(keys.length);
    await moveTo(player, GAT);
    refused(await player.post('/aircraft/pilot-training/enrolment', {}), 422, 'ALREADY_LICENSED');

    // The licence is on the character: a Cessna is theirs to fly.
    await moveTo(player, GAT);
    const cessna = await buyCessna(player);
    expect(cessna.aircraft.flyBlocker).toBeNull();
    const flown = ok<AircraftFlightResultDto>(await player.post(`/aircraft/${cessna.aircraft.id}/flights`, { destination: 'naia-gat' }));
    expect(flown.fuelCost).toBe(flightFuelCost(findAircraft('cessna-172')!, GAT_ROUTE_KM, fuelPrice()));
  }, 120_000);
});
