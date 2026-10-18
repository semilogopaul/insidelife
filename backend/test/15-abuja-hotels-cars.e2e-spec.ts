import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CAR_CARRIER_MINUTES,
  HOTELS,
  MINUTES_PER_DAY,
  findHotel,
  type CharacterSnapshotDto,
  type HotelBookingResultDto,
  type HotelCheckoutResultDto,
  type HotelsDto,
  type VehiclePurchaseResultDto,
  type VehicleShipmentResultDto,
  type VehiclesDto,
} from '@insidelife/shared';
import type { TravelQuoteDto } from '../src/modules/life/movement.service.js';
import { bootApp, type E2eApp } from './support/app.js';
import { drainCash, fund, worldPrice } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS, postingsWithKey } from './support/ledger.js';
import { createPlayer, key, moveTo, ok, refused, type Player } from './support/players.js';

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

async function guestIn(locationId: string, cityId: 'lagos' | 'abuja', money = 5_000_000): Promise<Player> {
  const player = await createPlayer(e2e, { age: 25 });
  if (money > 0) await fund(e2e, player, money);
  await placeIn(player, locationId, cityId);
  return player;
}

const quotesTo = async (player: Player, destinationId: string): Promise<TravelQuoteDto[]> =>
  ok<TravelQuoteDto[]>(await player.get(`/characters/me/travel/quotes?destinationId=${destinationId}`));

describe('rides in Abuja', () => {
  it('has the green cab, the city bus and Bolt; no danfo, BRT or okada in town; Lagos keeps its modes', async () => {
    e2e.clock.at(13);
    const abuja = await guestIn('wuse-market', 'abuja');
    const quotes = await quotesTo(abuja, 'garki-buka');
    const byMode = new Map(quotes.map((quote) => [quote.mode, quote]));
    for (const mode of ['taxi', 'bus', 'bolt'] as const) expect(byMode.get(mode), mode).toMatchObject({ available: true });
    expect(byMode.has('danfo')).toBe(false);
    expect(byMode.has('brt')).toBe(false);
    expect(byMode.get('okada')).toMatchObject({ available: false });
    expect(byMode.get('keke')).toMatchObject({ available: false });
    expect(byMode.get('okada')?.reason).toMatch(/city centre/);
    expect(byMode.get('bus')!.fare).toBeLessThan(byMode.get('taxi')!.fare);
    expect(byMode.get('taxi')!.fare).toBeLessThan(byMode.get('bolt')!.fare);

    const lagos = await guestIn('ikeja-city-mall', 'lagos');
    const lagosModes = (await quotesTo(lagos, 'computer-village')).map((quote) => quote.mode);
    expect(lagosModes).toEqual(expect.arrayContaining(['danfo', 'brt', 'okada', 'keke', 'bolt']));
    expect(lagosModes).not.toContain('taxi');
    expect(lagosModes).not.toContain('bus');
  });

  it('charges the fare of the ride you book, and refuses a danfo that does not run in Abuja', async () => {
    e2e.clock.at(13);
    const player = await guestIn('wuse-market', 'abuja');
    const fare = (await quotesTo(player, 'garki-buka')).find((quote) => quote.mode === 'taxi')!.fare;
    refused(await player.post('/characters/me/travel', { destinationId: 'garki-buka', mode: 'danfo' }), 422, 'MODE_UNAVAILABLE');
    const before = await player.cash();
    ok<CharacterSnapshotDto>(await player.post('/characters/me/travel', { destinationId: 'garki-buka', mode: 'taxi' }));
    expect(await player.cash()).toBe(before - fare);
  });
});

describe('a car belongs to the city it is parked in', () => {
  async function ownerWithCar(): Promise<{ player: Player; car: VehiclePurchaseResultDto }> {
    e2e.clock.at(10);
    const player = await createPlayer(e2e, { age: 25 });
    await fund(e2e, player, 8_000_000);
    await moveTo(player, 'berger-car-market');
    const car = ok<VehiclePurchaseResultDto>(await player.post('/vehicles/purchases', { vehicleId: 'toyota-corolla-2003-taxi' }));
    return { player, car };
  }

  it('ships to the other city with a car carrier: a ledger fee once, off the road for two days, then parked there', async () => {
    const { player, car } = await ownerWithCar();
    const garage = (): Promise<VehiclesDto> => player.get('/vehicles').then((response) => ok<VehiclesDto>(response));
    expect((await garage()).mine[0]).toMatchObject({ cityId: 'lagos', drivable: true });

    const before = await player.cash();
    const tap = key();
    const shipped = ok<VehicleShipmentResultDto>(await player.post(`/vehicles/${car.vehicle.id}/shipments`, { idempotencyKey: tap }));
    const fee = worldPrice(650_000, e2e.clock.now);
    expect(shipped).toMatchObject({ toCityId: 'abuja', fee, arrivesAt: e2e.clock.now + CAR_CARRIER_MINUTES });
    expect(await player.cash()).toBe(before - fee);
    // Pressing it again with the same key charges nothing and answers the same.
    const again = ok<VehicleShipmentResultDto>(await player.post(`/vehicles/${car.vehicle.id}/shipments`, { idempotencyKey: tap }));
    expect(again.arrivesAt).toBe(shipped.arrivesAt);
    expect(await player.cash()).toBe(before - fee);
    expect(await postingsWithKey(e2e.dataSource, `${player.characterId}:vehicle-ship:${car.vehicle.id}:`)).toHaveLength(1);
    expect((await garage()).mine[0]).toMatchObject({ status: 'in-transit', shippingTo: 'abuja', drivable: false, canDrive: false });
    refused(await player.post(`/vehicles/${car.vehicle.id}/shipments`, { idempotencyKey: key() }), 422, 'NOT_DELIVERED');

    // A minute short of two days it is still on the road; at the minute it is parked in Abuja (not by midnight: by the clock).
    e2e.clock.advance(CAR_CARRIER_MINUTES - 1);
    expect((await garage()).mine[0]).toMatchObject({ status: 'in-transit' });
    e2e.clock.advance(2);
    expect((await garage()).mine[0]).toMatchObject({ status: 'owned', cityId: 'abuja', shippingTo: null, drivable: false });
    const arrived = await e2e.dataSource.query<Array<{ title: string }>>(`SELECT title FROM notifications WHERE character_id = $1 AND title LIKE '%car has arrived%'`, [player.characterId]);
    expect(arrived).toHaveLength(1);

    // In Lagos the car is not here: no "drive my car", no car spawned near you. In Abuja it is.
    const quotes = await quotesTo(player, 'ikeja-city-mall');
    expect(quotes.find((quote) => quote.mode === 'car')).toMatchObject({ available: false, reason: 'Your car is parked in Abuja' });
    await placeIn(player, 'wuse-market', 'abuja');
    expect((await garage()).mine[0]).toMatchObject({ cityId: 'abuja', drivable: true });
    expect((await quotesTo(player, 'garki-buka')).find((quote) => quote.mode === 'car')).toMatchObject({ available: true });
  });
});

describe('hotels', () => {
  const HILTON = 'transcorp-hilton';

  it('lists real hotels in both cities with a rate by tier', async () => {
    e2e.clock.at(15);
    const player = await guestIn(HILTON, 'abuja');
    const view = ok<HotelsDto>(await player.get('/hotels'));
    expect(view.hotels.map((hotel) => hotel.venueId).sort()).toEqual(HOTELS.map((hotel) => hotel.venueId).sort());
    expect(view.hotels[0]!.cityId).toBe('abuja');
    expect(view.hotels.find((hotel) => hotel.venueId === HILTON)).toMatchObject({ here: true, tier: 'luxury', nightlyRate: worldPrice(findHotel(HILTON)!.nightlyRate, e2e.clock.now) });
    expect(view.hotels.find((hotel) => hotel.venueId === 'chelsea-hotel-abuja')!.nightlyRate).toBeLessThan(view.hotels.find((hotel) => hotel.venueId === HILTON)!.nightlyRate);
    expect(view.stay).toBeNull();
  });

  it('books nights at reception through the ledger once, and the room is a temporary home in the HUD until checkout', async () => {
    e2e.clock.at(15);
    const player = await guestIn(HILTON, 'abuja');
    const before = await player.cash();
    const tap = key();
    const booked = ok<HotelBookingResultDto>(await player.post('/hotels/stays', { venueId: HILTON, nights: 2, idempotencyKey: tap }));
    const rate = worldPrice(findHotel(HILTON)!.nightlyRate, e2e.clock.now);
    expect(booked).toMatchObject({ nights: 2, price: rate * 2, extended: false });
    expect(await player.cash()).toBe(before - rate * 2);
    ok<HotelBookingResultDto>(await player.post('/hotels/stays', { venueId: HILTON, nights: 2, idempotencyKey: tap }));
    expect(await player.cash()).toBe(before - rate * 2);
    expect(await postingsWithKey(e2e.dataSource, `${player.characterId}:hotel-stay:`)).toHaveLength(1);

    const snapshot = await player.snapshot();
    expect(snapshot.summary.stay).toMatchObject({ venueId: HILTON, cityId: 'abuja', checkoutAt: booked.stay.checkoutAt });
    expect(booked.stay.checkoutAt - e2e.clock.now).toBeGreaterThan(MINUTES_PER_DAY);

    // Extending adds nights at the same hotel (its own ledger key); a second hotel is refused while you hold a room.
    const extended = ok<HotelBookingResultDto>(await player.post('/hotels/stays', { venueId: HILTON, nights: 1, idempotencyKey: key() }));
    expect(extended).toMatchObject({ extended: true, nights: 1 });
    expect(extended.stay.checkoutAt).toBe(booked.stay.checkoutAt + MINUTES_PER_DAY);
    expect(await postingsWithKey(e2e.dataSource, `${player.characterId}:hotel-stay:`)).toHaveLength(2);
    await placeIn(player, 'sheraton-abuja', 'abuja');
    refused(await player.post('/hotels/stays', { venueId: 'sheraton-abuja', nights: 1, idempotencyKey: key() }), 422, 'ALREADY_STAYING');
  });

  it('only books where you stand, with money, for a sane number of nights', async () => {
    e2e.clock.at(15);
    const player = await guestIn('wuse-market', 'abuja');
    refused(await player.post('/hotels/stays', { venueId: HILTON, nights: 1, idempotencyKey: key() }), 422, 'NOT_AT_RECEPTION');
    await placeIn(player, HILTON, 'abuja');
    refused(await player.post('/hotels/stays', { venueId: HILTON, nights: 0, idempotencyKey: key() }), 400);
    refused(await player.post('/hotels/stays', { venueId: HILTON, nights: 99, idempotencyKey: key() }), 400);
    const poor = await guestIn(HILTON, 'abuja', 0);
    await drainCash(e2e, poor);
    const cash = await poor.cash();
    refused(await poor.post('/hotels/stays', { venueId: HILTON, nights: 1, idempotencyKey: key() }), 422, 'INSUFFICIENT_FUNDS');
    expect(await poor.cash()).toBe(cash);
  });

  it('lets a guest sleep in their room (real sleep away from home) and use the hotel’s facilities; a visitor or a hotel without them cannot', async () => {
    e2e.clock.at(22);
    const guest = await guestIn(HILTON, 'abuja');
    refused(await guest.post('/characters/me/actions', { actionId: 'sleep', durationMinutes: 180 }), 422, 'WRONG_PLACE');
    ok<HotelBookingResultDto>(await guest.post('/hotels/stays', { venueId: HILTON, nights: 1, idempotencyKey: key() }));
    refused(await guest.post('/characters/me/actions', { actionId: 'cook' }), 422, 'WRONG_PLACE');
    ok<CharacterSnapshotDto>(await guest.post('/characters/me/actions', { actionId: 'sleep', durationMinutes: 180 }));
    const sleeping = await guest.snapshot();
    expect(sleeping.timeline[0]).toMatchObject({ kind: 'action', actionId: 'sleep', locationId: HILTON });
    ok<CharacterSnapshotDto>(await guest.delete('/characters/me/actions/current'));

    // The pool and the bar are the hotel's; a standard hotel with no pool or gym doesn't have them.
    e2e.clock.at(14);
    const swimmer = await guestIn(HILTON, 'abuja');
    ok<CharacterSnapshotDto>(await swimmer.post('/characters/me/actions', { actionId: 'hotel-pool', durationMinutes: 60 }));
    const budget = await guestIn('chelsea-hotel-abuja', 'abuja');
    refused(await budget.post('/characters/me/actions', { actionId: 'hotel-pool', durationMinutes: 60 }), 422, 'WRONG_PLACE');
    refused(await budget.post('/characters/me/actions', { actionId: 'hotel-gym', durationMinutes: 45 }), 422, 'WRONG_PLACE');
    ok<CharacterSnapshotDto>(await budget.post('/characters/me/actions', { actionId: 'hotel-bar', durationMinutes: 60 }));
  });

  it('checks you out at noon on its own, or when you ask (no refund), and tells you', async () => {
    e2e.clock.at(15);
    const player = await guestIn(HILTON, 'abuja');
    const booked = ok<HotelBookingResultDto>(await player.post('/hotels/stays', { venueId: HILTON, nights: 1, idempotencyKey: key() }));
    e2e.clock.advance(booked.stay.checkoutAt - e2e.clock.now + 5);
    expect((await player.snapshot()).summary.stay).toBeNull();
    expect(ok<HotelsDto>(await player.get('/hotels')).stay).toBeNull();
    const told = await e2e.dataSource.query<Array<{ title: string }>>(`SELECT title FROM notifications WHERE character_id = $1 AND title LIKE '%Checkout time%'`, [player.characterId]);
    expect(told).toHaveLength(1);
    refused(await player.post('/hotels/stay/checkout', { idempotencyKey: key() }), 422, 'NO_STAY');

    e2e.clock.at(15);
    await placeIn(player, HILTON, 'abuja');
    ok<HotelBookingResultDto>(await player.post('/hotels/stays', { venueId: HILTON, nights: 3, idempotencyKey: key() }));
    const cash = await player.cash();
    const out = ok<HotelCheckoutResultDto>(await player.post('/hotels/stay/checkout', { idempotencyKey: key() }));
    expect(out.stay.status).toBe('ended');
    expect(await player.cash()).toBe(cash);
    expect((await player.snapshot()).summary.stay).toBeNull();
  });
});
