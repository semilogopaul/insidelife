import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DECOR_AIRCRAFT_ROOM_CAP,
  aircraftDecorTemplateId,
  aircraftLocationId,
  findDecorItem,
  type AircraftPurchaseResultDto,
  type AircraftSaleResultDto,
  type DecorAircraftDto,
  type DecorChangeDto,
  type DecorHomeDto,
  type DecorPurchaseResultDto,
  type DecorStateDto,
  type HousingActionResultDto,
  type RentalListingDto,
} from '@insidelife/shared';
import { CITY_TRAVEL_PORT, type CityTravelPort } from '../src/common/ports/city-travel.port.js';
import type { SimulationContext } from '../src/modules/simulation/simulation-context.js';
import { bootApp, type E2eApp } from './support/app.js';
import { fund, worldPrice } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { createPlayer, moveTo, ok, refused, type Player } from './support/players.js';

/** The multi-city port is not what is under test: a flight just puts the character in the other terminal. */
class FakeCityTravel implements CityTravelPort {
  relocateToCity(ctx: SimulationContext, airportVenueId: string): Promise<void> {
    ctx.character.locationId = airportVenueId;
    return Promise.resolve();
  }
}

let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp({ override: (builder) => builder.overrideProvider(CITY_TRAVEL_PORT).useValue(new FakeCityTravel()) });
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

const GAT = 'mmia-gat';
const GULFSTREAM = 'aircraft-long-range-jet';
const WEALTH = 400_000_000_000;

/** A player with a Gulfstream (cabin, cockpit, lavatory and suite) parked at the GAT. */
async function jetOwner(): Promise<{ readonly player: Player; readonly aircraftId: string }> {
  e2e.clock.at(10);
  const player = await createPlayer(e2e, { age: 25 });
  await fund(e2e, player, WEALTH);
  await moveTo(player, GAT);
  const bought = ok<AircraftPurchaseResultDto>(await player.post('/aircraft/purchases', { aircraftId: 'gulfstream-g650' }));
  return { player, aircraftId: bought.aircraft.id };
}

async function buy(player: Player, itemId: string, quantity = 1): Promise<DecorPurchaseResultDto> {
  const item = findDecorItem(itemId)!;
  return ok<DecorPurchaseResultDto>(await player.post('/decor/purchases', { itemId, variant: item.variants[0]!.id, quantity }));
}

const state = async (player: Player): Promise<DecorStateDto> => ok<DecorStateDto>(await player.get('/decor'));
const fit = (player: Player, aircraftId: string, pieceId: string, body: object) => player.put(`/decor/aircraft/${aircraftId}/pieces/${pieceId}/spot`, body);
const at = (roomId: string, x: number, z: number, extra: object = {}) => ({ templateId: GULFSTREAM, roomId, x, z, rot: 0, ...extra });

describe('cabin decor: buying cabin pieces', () => {
  it('charges the catalog price at the world index through the ledger, like any decor', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 5_000_000);
    const before = await player.cash();
    const bought = await buy(player, 'cabin-minibar');
    const price = worldPrice(findDecorItem('cabin-minibar')!.price, e2e.clock.now);
    expect(bought).toMatchObject({ unitPrice: price, total: price });
    expect(await player.cash()).toBe(before - price);
    const rows = await e2e.dataSource.query<Array<{ idempotency_key: string }>>(
      `SELECT idempotency_key FROM ledger_transactions WHERE character_id = $1 AND memo LIKE 'Home decor:%'`,
      [player.characterId],
    );
    expect(rows.map((row) => row.idempotency_key)).toEqual([`${player.characterId}:decor-buy:${bought.pieces[0]!.id}`]);
  });
});

describe('cabin decor: fitting pieces in a plane', () => {
  it('fits secured pieces in the cabin, sits small ones on the minibar and moves them together', async () => {
    const { player, aircraftId } = await jetOwner();
    await fund(e2e, player, 5_000_000);
    const rug = (await buy(player, 'cabin-rug')).pieces[0]!;
    const bar = (await buy(player, 'cabin-minibar')).pieces[0]!;
    const lamp = (await buy(player, 'cabin-lamp')).pieces[0]!;

    const rugged = ok<DecorChangeDto>(await fit(player, aircraftId, rug.id, at('cabin', 0.123, 0.456, { rot: 30 })));
    expect(rugged.pieces[0]).toMatchObject({ aircraftId, spot: { templateId: GULFSTREAM, roomId: 'cabin', x: 0.12, z: 0.46, y: 0, rot: 30 } });
    ok(await fit(player, aircraftId, bar.id, at('cabin', 2, 0.8)));
    const lit = ok<DecorChangeDto>(await fit(player, aircraftId, lamp.id, at('cabin', 2, 0.8, { onId: bar.id })));
    expect(lit.pieces[0]!.spot).toMatchObject({ onId: bar.id, y: 0.95 });

    // Move the bar: the lamp goes with it.
    const moved = ok<DecorChangeDto>(await fit(player, aircraftId, bar.id, at('cabin', 4, 0.8)));
    expect(moved.pieces.map((piece) => piece.id).toSorted()).toEqual([bar.id, lamp.id].toSorted());
    const mine = (await state(player)).pieces;
    expect(mine.find((piece) => piece.id === lamp.id)).toMatchObject({ aircraftId, spot: { onId: bar.id, y: 0.95 } });
    expect(Math.hypot(mine.find((piece) => piece.id === lamp.id)!.spot!.x - 4, mine.find((piece) => piece.id === lamp.id)!.spot!.z - 0.8)).toBeLessThan(0.1);

    // Putting the bar back takes the lamp along, and a plane piece is an inventory piece again.
    const away = ok<DecorChangeDto>(await player.delete(`/decor/pieces/${bar.id}/spot`));
    expect(away.pieces.map((piece) => piece.spot)).toEqual([null, null]);
    expect(away.pieces.some((piece) => piece.aircraftId)).toBe(false);
    expect((await state(player)).pieces.filter((piece) => piece.spot).map((piece) => piece.itemId)).toEqual(['cabin-rug']);
  });

  it('refuses what is not secured for flight, beds outside a suite and floor pieces on the flight deck', async () => {
    const { player, aircraftId } = await jetOwner();
    await fund(e2e, player, 20_000_000);
    const tank = (await buy(player, 'aquarium-nano')).pieces[0]!;
    const bed = (await buy(player, 'bed-divan-queen')).pieces[0]!;
    const rug = (await buy(player, 'rug-persian')).pieces[0]!;
    const print = (await buy(player, 'cabin-print')).pieces[0]!;

    refused(await fit(player, aircraftId, tank.id, at('cabin', 0, 0)), 422, 'CANT_PLACE_THERE');
    refused(await fit(player, aircraftId, bed.id, at('cabin', 0, 0)), 422, 'CANT_PLACE_THERE');
    ok(await fit(player, aircraftId, bed.id, at('suite', 0, 0)));
    refused(await fit(player, aircraftId, rug.id, at('cockpit', 0, 0)), 422, 'CANT_PLACE_THERE');
    ok(await fit(player, aircraftId, rug.id, at('cabin', 0, 0.5)));
    ok(await fit(player, aircraftId, print.id, at('cockpit', 0, 0, { y: 0.9, wall: 'back' })));
    // Geometry still applies: through the wall and across the cabin door.
    const second = (await buy(player, 'cabin-bench')).pieces[0]!;
    refused(await fit(player, aircraftId, second.id, at('cabin', 9, 0)), 422, 'CANT_PLACE_THERE');
    refused(await fit(player, aircraftId, second.id, at('cabin', -7.6, -1.1)), 422, 'CANT_PLACE_THERE');
    ok(await fit(player, aircraftId, second.id, at('cabin', -2, 0.8)));
  });

  it('validates the template and room against the aircraft, and caps each room', async () => {
    const { player, aircraftId } = await jetOwner();
    await fund(e2e, player, 20_000_000);
    const prints = (await buy(player, 'cabin-print', 4)).pieces;
    refused(await fit(player, aircraftId, prints[0]!.id, { ...at('cabin', 0, 0, { y: 1.1, wall: 'back' }), templateId: 'aircraft-light-jet' }), 422, 'NO_SUCH_ROOM');
    refused(await fit(player, aircraftId, prints[0]!.id, { ...at('cabin', 0, 0, { y: 1.1, wall: 'back' }), templateId: 'home-flat' }), 422, 'NO_SUCH_ROOM');
    refused(await fit(player, aircraftId, prints[0]!.id, at('galley', 0, 0, { y: 1.1, wall: 'back' })), 422, 'NO_SUCH_ROOM');
    refused(await fit(player, aircraftId, prints[0]!.id, at('cabin', 0, 0, { wall: 'sideways' })), 400);

    expect(DECOR_AIRCRAFT_ROOM_CAP.cockpit).toBe(3);
    for (const [index, x] of [-1.3, -0.5, 0.2].entries()) ok(await fit(player, aircraftId, prints[index]!.id, at('cockpit', x, 0, { y: 0.9, wall: 'back' })));
    refused(await fit(player, aircraftId, prints[3]!.id, at('cockpit', -0.9, 0, { y: 0.9, wall: 'back' })), 422, 'ROOM_FULL');
    // Moving one that is already there is fine in a full room; another room still has space.
    ok(await fit(player, aircraftId, prints[0]!.id, at('cockpit', -1.2, 0, { y: 1, wall: 'back' })));
    ok(await fit(player, aircraftId, prints[3]!.id, at('cabin', 0, 0, { y: 1.45, wall: 'back' })));
  });

  it('is for the owner of that aircraft only', async () => {
    const { player, aircraftId } = await jetOwner();
    await fund(e2e, player, 5_000_000);
    const rug = (await buy(player, 'cabin-rug')).pieces[0]!;
    const stranger = await createPlayer(e2e);
    await fund(e2e, stranger, 5_000_000);
    const theirs = (await buy(stranger, 'cabin-rug')).pieces[0]!;
    refused(await fit(stranger, aircraftId, rug.id, at('cabin', 0, 0.8)), 404, 'RESOURCE_NOT_FOUND');
    refused(await fit(stranger, aircraftId, theirs.id, at('cabin', 0, 0.8)), 404, 'RESOURCE_NOT_FOUND');
    refused(await fit(player, '00000000-0000-4000-8000-000000000000', rug.id, at('cabin', 0, 0.8)), 404, 'RESOURCE_NOT_FOUND');
    refused(await fit(player, aircraftId, theirs.id, at('cabin', 0, 0.8)), 404, 'RESOURCE_NOT_FOUND');
    expect((await state(stranger)).pieces.every((piece) => piece.spot === null)).toBe(true);
  });

  it('moves a piece between a home and a plane, one place at a time', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e, { age: 25 });
    await fund(e2e, player, WEALTH);
    const listing = ok<RentalListingDto[]>(await player.get('/housing/listings')).find(
      (candidate) => candidate.affordable && candidate.annualRent > candidate.marketRent * 0.9 && candidate.annualRent >= 200_000,
    )!;
    expect(ok<HousingActionResultDto>(await player.post('/housing/leases', { listingId: listing.id })).outcome).toBe('moved-in');
    await moveTo(player, GAT);
    const aircraftId = ok<AircraftPurchaseResultDto>(await player.post('/aircraft/purchases', { aircraftId: 'gulfstream-g650' })).aircraft.id;
    const rug = (await buy(player, 'cabin-rug')).pieces[0]!;
    const home = { templateId: 'home-flat', roomId: 'living', x: 0, z: 0, rot: 0 };

    ok(await fit(player, aircraftId, rug.id, at('cabin', 0, 0.8)));
    expect(ok<DecorHomeDto>(await player.get(`/decor/homes/${player.characterId}`)).placed).toEqual([]);
    // Fitted in the plane, it goes to the home when placed there: no longer in the plane.
    const inHome = ok<DecorChangeDto>(await player.put(`/decor/pieces/${rug.id}/spot`, home));
    expect(inHome.pieces[0]).toMatchObject({ spot: { templateId: 'home-flat', roomId: 'living' } });
    expect(inHome.pieces[0]!.aircraftId).toBeUndefined();
    expect(ok<DecorHomeDto>(await player.get(`/decor/homes/${player.characterId}`)).placed.map((piece) => piece.itemId)).toEqual(['cabin-rug']);
    expect(ok<DecorAircraftDto>(await player.get(`/decor/aircraft/${aircraftId}`)).placed).toEqual([]);
    // And back into the plane.
    ok(await fit(player, aircraftId, rug.id, at('cabin', 0, 0.8)));
    expect(ok<DecorHomeDto>(await player.get(`/decor/homes/${player.characterId}`)).placed).toEqual([]);
    expect(ok<DecorAircraftDto>(await player.get(`/decor/aircraft/${aircraftId}`)).placed.map((piece) => piece.id)).toEqual([rug.id]);
    // A piece with something on it that goes to another place leaves what was on it in the inventory.
    const bar = (await buy(player, 'cabin-minibar')).pieces[0]!;
    const lamp = (await buy(player, 'cabin-lamp')).pieces[0]!;
    ok(await fit(player, aircraftId, bar.id, at('cabin', 3, 0.8)));
    ok(await fit(player, aircraftId, lamp.id, at('cabin', 3, 0.8, { onId: bar.id })));
    const left = ok<DecorChangeDto>(await player.put(`/decor/pieces/${bar.id}/spot`, { ...home, x: -2, z: -2.2 }));
    expect(left.pieces.map((piece) => [piece.itemId, piece.spot === null])).toEqual(expect.arrayContaining([['cabin-lamp', true]]));
  });
});

describe('cabin decor: who sees the cabin', () => {
  it('shows it to the owner and to whoever is aboard, and to nobody else', async () => {
    const { player, aircraftId } = await jetOwner();
    await fund(e2e, player, 5_000_000);
    const rug = (await buy(player, 'cabin-rug')).pieces[0]!;
    ok(await fit(player, aircraftId, rug.id, at('cabin', 0, 0.8)));

    const mine = ok<DecorAircraftDto>(await player.get(`/decor/aircraft/${aircraftId}`));
    expect(mine).toMatchObject({ aircraftId, aircraftClass: 'long-range-jet', ownerId: player.characterId });
    expect(mine.placed).toEqual([{ id: rug.id, itemId: 'cabin-rug', variant: findDecorItem('cabin-rug')!.variants[0]!.id, spot: expect.objectContaining({ templateId: GULFSTREAM, roomId: 'cabin' }) }]);

    const passenger = await createPlayer(e2e);
    refused(await passenger.get(`/decor/aircraft/${aircraftId}`), 403, 'FORBIDDEN');
    await moveTo(passenger, aircraftLocationId(aircraftId));
    expect(ok<DecorAircraftDto>(await passenger.get(`/decor/aircraft/${aircraftId}`)).placed.map((piece) => piece.itemId)).toEqual(['cabin-rug']);
    await moveTo(passenger, GAT);
    refused(await passenger.get(`/decor/aircraft/${aircraftId}`), 403, 'FORBIDDEN');
    refused(await passenger.get('/decor/aircraft/00000000-0000-4000-8000-000000000000'), 404, 'RESOURCE_NOT_FOUND');
    expect(aircraftDecorTemplateId('long-range-jet')).toBe(GULFSTREAM);
  });
});

describe('cabin decor: selling the aircraft', () => {
  it('returns every piece to the owner’s inventory', async () => {
    const { player, aircraftId } = await jetOwner();
    await fund(e2e, player, 20_000_000);
    const rug = (await buy(player, 'cabin-rug')).pieces[0]!;
    const bar = (await buy(player, 'cabin-minibar')).pieces[0]!;
    const lamp = (await buy(player, 'cabin-lamp')).pieces[0]!;
    const bed = (await buy(player, 'bed-divan-queen')).pieces[0]!;
    ok(await fit(player, aircraftId, rug.id, at('cabin', 0, 0.8)));
    ok(await fit(player, aircraftId, bar.id, at('cabin', 3, 0.8)));
    ok(await fit(player, aircraftId, lamp.id, at('cabin', 3, 0.8, { onId: bar.id })));
    ok(await fit(player, aircraftId, bed.id, at('suite', 0, 0)));
    expect((await state(player)).pieces.filter((piece) => piece.aircraftId === aircraftId)).toHaveLength(4);

    const sale = ok<AircraftSaleResultDto>(await player.post(`/aircraft/${aircraftId}/sale`, {}));
    expect(sale.amount).toBeGreaterThan(0);

    const after = await state(player);
    expect(after.pieces).toHaveLength(4);
    for (const piece of after.pieces) {
      expect(piece.spot, piece.itemId).toBeNull();
      expect(piece.aircraftId, piece.itemId).toBeUndefined();
    }
    const rows = await e2e.dataSource.query<Array<{ aircraft_id: string | null; template_id: string | null; room_id: string | null; on_id: string | null }>>(
      `SELECT aircraft_id, template_id, room_id, on_id FROM decor_pieces WHERE character_id = $1`,
      [player.characterId],
    );
    expect(rows.every((row) => row.aircraft_id === null && row.template_id === null && row.room_id === null && row.on_id === null)).toBe(true);
    refused(await player.get(`/decor/aircraft/${aircraftId}`), 404, 'RESOURCE_NOT_FOUND');
    // They are theirs to use again, in a plane or a home.
    const next = ok<AircraftPurchaseResultDto>(await player.post('/aircraft/purchases', { aircraftId: 'gulfstream-g650' }));
    ok(await fit(player, next.aircraft.id, rug.id, at('cabin', 0, 0.8)));
  });
});
