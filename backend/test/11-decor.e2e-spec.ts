import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DECOR_HOME_ROOMS,
  DECOR_MAX_PER_ROOM,
  findDecorItem,
  placeInHome,
  recolourPrice,
  type DecorChangeDto,
  type DecorHomeDto,
  type DecorPieceDto,
  type DecorPurchaseResultDto,
  type DecorRecolourResultDto,
  type DecorStateDto,
  type HousingActionResultDto,
  type RentalListingDto,
} from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { burst, fund, worldPrice } from './support/game.js';
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

const TEMPLATE = 'home-flat';
const ROOM = 'living';
const floor = (x: number, z: number, rot = 0) => ({ templateId: TEMPLATE, roomId: ROOM, x, z, rot });

const master = (x: number, z: number) => ({ templateId: 'home-mansion', roomId: 'master', x, z, rot: 0 });

async function renter(): Promise<Player> {
  e2e.clock.at(10);
  const player = await createPlayer(e2e);
  await fund(e2e, player, 60_000_000);
  const listing = ok<RentalListingDto[]>(await player.get('/housing/listings')).find(
    (candidate) => candidate.affordable && candidate.annualRent > candidate.marketRent * 0.9 && candidate.annualRent >= 200_000,
  )!;
  expect(ok<HousingActionResultDto>(await player.post('/housing/leases', { listingId: listing.id })).outcome).toBe('moved-in');
  return player;
}

async function buy(player: Player, itemId: string, variant?: string, quantity = 1): Promise<DecorPurchaseResultDto> {
  const item = findDecorItem(itemId)!;
  return ok<DecorPurchaseResultDto>(await player.post('/decor/purchases', { itemId, variant: variant ?? item.variants[0]!.id, quantity }));
}

/** Furniture (the starter mattress…) is pieces too; these tests are about the Decor store's. */
const isDecor = (piece: DecorPieceDto): boolean => !findDecorItem(piece.itemId)?.shopItemId;
const state = async (player: Player): Promise<DecorStateDto> => {
  const full = ok<DecorStateDto>(await player.get('/decor'));
  return { ...full, pieces: full.pieces.filter(isDecor) };
};
const spot = (player: Player, pieceId: string, body: object) => player.put(`/decor/pieces/${pieceId}/spot`, body);

describe('decor: buying', () => {
  it('charges the catalog price at the world index through the ledger, and the piece is in the inventory at once', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 10_000_000);
    const before = await player.cash();
    const bought = await buy(player, 'rug-ankara', 'royal');
    const price = worldPrice(findDecorItem('rug-ankara')!.price, e2e.clock.now);
    expect(bought).toMatchObject({ unitPrice: price, total: price, balance: before - price });
    expect(await player.cash()).toBe(before - price);
    const mine = await state(player);
    expect(mine.pieces).toEqual([{ id: bought.pieces[0]!.id, itemId: 'rug-ankara', variant: 'royal', spot: null, recolours: 0 }]);
    expect(mine.prices['rug-ankara']).toBe(price);

    const rows = await e2e.dataSource.query<Array<{ kind: string; idempotency_key: string }>>(
      `SELECT kind, idempotency_key FROM ledger_transactions WHERE character_id = $1 AND memo LIKE 'Home decor:%'`,
      [player.characterId],
    );
    expect(rows.map((row) => [row.kind, row.idempotency_key])).toEqual([['purchase', `${player.characterId}:decor-buy:${bought.pieces[0]!.id}`]]);
  });

  it('buys several at once, refuses bad variants, items and quantities, and checks the money first', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 5_000_000);
    const before = await player.cash();
    const three = await buy(player, 'cushions-scatter', 'ivory', 3);
    const each = worldPrice(findDecorItem('cushions-scatter')!.price, e2e.clock.now);
    expect(three.pieces).toHaveLength(3);
    expect(await player.cash()).toBe(before - 3 * each);
    refused(await player.post('/decor/purchases', { itemId: 'cushions-scatter', variant: 'chartreuse' }), 422, 'NO_SUCH_VARIANT');
    refused(await player.post('/decor/purchases', { itemId: 'sofa-of-gold', variant: 'x' }), 404, 'RESOURCE_NOT_FOUND');
    refused(await player.post('/decor/purchases', { itemId: 'cushions-scatter', variant: 'ivory', quantity: 7 }), 400);
    const broke = await createPlayer(e2e);
    const cash = await broke.cash();
    const rich = findDecorItem('bed-royal-gold')!;
    if (cash < rich.price) refused(await broke.post('/decor/purchases', { itemId: rich.id, variant: 'cream' }), 422, 'INSUFFICIENT_FUNDS');
    expect(await broke.cash()).toBe(cash);
  });

  it('three taps with one key buy once', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 5_000_000);
    const before = await player.cash();
    const tap = key();
    const results = await burst(3, () => player.post('/decor/purchases', { itemId: 'plant-snake', variant: 'white', idempotencyKey: tap }));
    expect(results.map((result) => result.status)).toEqual([201, 201, 201]);
    const price = worldPrice(findDecorItem('plant-snake')!.price, e2e.clock.now);
    expect(await player.cash()).toBe(before - price);
    expect((await state(player)).pieces).toHaveLength(1);
    refused(await player.post('/decor/purchases', { itemId: 'plant-snake', variant: 'black', idempotencyKey: tap }), 422, 'IDEMPOTENCY_KEY_REUSED');
  });
});

describe('decor: placing', () => {
  it('keeps the family house as it is: only small pieces of your own go in it', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 5_000_000);
    const rug = (await buy(player, 'rug-shaggy')).pieces[0]!;
    const plant = (await buy(player, 'plant-snake')).pieces[0]!;
    const home = (await state(player)).home;
    expect(home).toMatchObject({ eligible: true, scope: 'small' });
    const rooms = DECOR_HOME_ROOMS[home.templateId as keyof typeof DECOR_HOME_ROOMS] as Record<string, unknown>;
    const roomId = Object.keys(rooms)[0]!;
    // A rug or a bed is not small; the family's furniture stays where it is.
    refused(await spot(player, rug.id, { templateId: home.templateId, roomId, x: 0, z: 0, rot: 0 }), 422, 'FAMILY_FURNITURE');
    const hit = placeInHome(home.templateId, Object.keys(rooms), findDecorItem('plant-snake')!, () => [], { provided: true })!;
    expect(hit).not.toBeNull();
    ok(await spot(player, plant.id, { templateId: home.templateId, roomId: hit.roomId, x: hit.pose.x, z: hit.pose.z, rot: hit.pose.rot }));
  });

  it('puts a piece in a room, validates it and shows it to the owner', async () => {
    const player = await renter();
    const rug = (await buy(player, 'rug-persian', 'indigo')).pieces[0]!;
    const table = (await buy(player, 'table-coffee-marble')).pieces[0]!;
    const sofaTable = (await buy(player, 'table-console')).pieces[0]!;
    expect((await state(player)).home.eligible).toBe(true);

    const placed = ok<DecorChangeDto>(await spot(player, rug.id, floor(0.123, 0.456, 30)));
    expect(placed.pieces[0]!.spot).toEqual({ templateId: TEMPLATE, roomId: ROOM, x: 0.12, z: 0.46, y: 0, rot: 30, wall: null, onId: null });

    // Walls, doors, overlaps, the room, the rotation step and unknown rooms.
    refused(await spot(player, table.id, floor(3.2, 0)), 422, 'CANT_PLACE_THERE');
    refused(await spot(player, table.id, floor(2.4, -2.2)), 422, 'CANT_PLACE_THERE');
    refused(await spot(player, table.id, floor(0, 0, 10)), 422, 'CANT_PLACE_THERE');
    refused(await spot(player, table.id, { templateId: 'club', roomId: 'room', x: 0, z: 0, rot: 0 }), 422, 'NO_SUCH_ROOM');
    refused(await spot(player, table.id, { templateId: TEMPLATE, roomId: 'attic', x: 0, z: 0, rot: 0 }), 422, 'NO_SUCH_ROOM');
    refused(await spot(player, table.id, { ...floor(0, 0), x: 'far' }), 400);
    ok(await spot(player, table.id, floor(-1.5, 0.5)));
    refused(await spot(player, sofaTable.id, floor(-1.4, 0.6)), 422, 'CANT_PLACE_THERE');
    ok(await spot(player, sofaTable.id, floor(-2.2, -2.5)));

    const mine = await state(player);
    expect(mine.pieces.filter((piece) => piece.spot)).toHaveLength(3);
    const home = ok<DecorHomeDto>(await player.get(`/decor/homes/${player.characterId}`));
    expect(home.placed.filter((piece) => !findDecorItem(piece.itemId)?.shopItemId).map((piece) => piece.itemId).toSorted()).toEqual(['rug-persian', 'table-coffee-marble', 'table-console']);
    expect(home.placed.find((piece) => piece.itemId === 'rug-persian')).toMatchObject({ variant: 'indigo', spot: { x: 0.12 } });
  });

  it('hangs wall pieces on the wall and sits tabletop pieces on a surface, which move together', async () => {
    const player = await renter();
    const print = (await buy(player, 'art-print-framed', 'zuma')).pieces[0]!;
    const consoleTable = (await buy(player, 'table-console')).pieces[0]!;
    const vase = (await buy(player, 'flowers-vase', 'lilies')).pieces[0]!;

    const hung = ok<DecorChangeDto>(await spot(player, print.id, { ...floor(-2.4, 9), y: 1.2, wall: 'back' }));
    expect(hung.pieces[0]!.spot).toMatchObject({ x: -2.4, z: -2.7, y: 1.2, rot: 0, wall: 'back' });
    refused(await spot(player, print.id, { ...floor(1.05, 0), y: 1.2, wall: 'back' }), 422, 'CANT_PLACE_THERE');
    refused(await spot(player, print.id, { ...floor(0, 0), y: 1.2 }), 422, 'CANT_PLACE_THERE');

    ok(await spot(player, consoleTable.id, floor(-2.2, -2.5)));
    refused(await spot(player, vase.id, floor(-2.2, -2.5)), 422, 'CANT_PLACE_THERE');
    const onTable = ok<DecorChangeDto>(await spot(player, vase.id, { ...floor(-2.2, -2.5), onId: consoleTable.id }));
    expect(onTable.pieces[0]!.spot).toMatchObject({ onId: consoleTable.id, y: 0.8 });

    // Move the table: the vase goes with it.
    const moved = ok<DecorChangeDto>(await spot(player, consoleTable.id, floor(1, 1.5, 90)));
    expect(moved.pieces.map((piece) => piece.id).toSorted()).toEqual([consoleTable.id, vase.id].toSorted());
    const after = (await state(player)).pieces;
    const vaseSpot = after.find((piece) => piece.id === vase.id)!.spot!;
    expect(vaseSpot).toMatchObject({ onId: consoleTable.id, y: 0.8, rot: 90 });
    expect(Math.hypot(vaseSpot.x - 1, vaseSpot.z - 1.5)).toBeLessThan(0.1);

    // Putting the table away takes the vase along.
    const away = ok<DecorChangeDto>(await player.delete(`/decor/pieces/${consoleTable.id}/spot`));
    expect(away.pieces.map((piece: DecorPieceDto) => piece.spot)).toEqual([null, null]);
    expect((await state(player)).pieces.filter((piece) => piece.spot).map((piece) => piece.itemId)).toEqual(['art-print-framed']);
  });

  it('caps a room and keeps pieces to their owner', async () => {
    const player = await renter();
    const stranger = await createPlayer(e2e);
    const rugs = [...(await buy(player, 'rug-raffia-round', 'ivory', 6)).pieces, ...(await buy(player, 'rug-raffia-round', 'ivory', 6)).pieces];
    const plants = [...(await buy(player, 'plant-snake', 'white', 6)).pieces, ...(await buy(player, 'plant-snake', 'white', 6)).pieces, ...(await buy(player, 'plant-snake', 'white', 1)).pieces];
    // Twelve rugs in a grid, and a plant standing on each (rugs lie under things).
    for (let index = 0; index < 12; index++) {
      const x = -2.7 + (index % 4) * 1.8;
      const z = -1.8 + Math.floor(index / 4) * 1.8;
      ok(await spot(player, rugs[index]!.id, master(x, z)));
      ok(await spot(player, plants[index]!.id, master(x, z)));
    }
    expect(DECOR_MAX_PER_ROOM).toBe(24);
    refused(await spot(player, plants[12]!.id, master(-0.9, -0.9)), 422, 'ROOM_FULL');
    // Moving a placed one inside the full room is fine; another room still has space.
    ok(await spot(player, plants[0]!.id, master(-2.5, -1.6)));
    ok(await spot(player, plants[12]!.id, floor(0, 0)));

    refused(await stranger.put(`/decor/pieces/${rugs[0]!.id}/spot`).send(floor(0, 0)), 404, 'RESOURCE_NOT_FOUND');
    refused(await stranger.delete(`/decor/pieces/${rugs[0]!.id}/spot`), 404, 'RESOURCE_NOT_FOUND');
    refused(await stranger.post(`/decor/pieces/${rugs[0]!.id}/recolour`, { variant: 'gold' }), 404, 'RESOURCE_NOT_FOUND');
    refused(await stranger.get(`/decor/homes/${player.characterId}`), 403, 'FORBIDDEN');
  });
});

describe('decor: recolouring', () => {
  it('re-finishes a piece for a share of its price, once per tap', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 5_000_000);
    const piece = (await buy(player, 'bed-divan-queen', 'cream')).pieces[0]!;
    const before = await player.cash();
    const price = worldPrice(recolourPrice(findDecorItem('bed-divan-queen')!.price), e2e.clock.now);
    const tap = key();
    const result = ok<DecorRecolourResultDto>(await player.post(`/decor/pieces/${piece.id}/recolour`, { variant: 'navy', idempotencyKey: tap }));
    expect(result).toMatchObject({ price, piece: { variant: 'navy', recolours: 1 } });
    expect(await player.cash()).toBe(before - price);
    ok(await player.post(`/decor/pieces/${piece.id}/recolour`, { variant: 'navy', idempotencyKey: tap }));
    expect(await player.cash()).toBe(before - price);
    refused(await player.post(`/decor/pieces/${piece.id}/recolour`, { variant: 'navy' }), 422, 'NOTHING_TO_CHANGE');
    refused(await player.post(`/decor/pieces/${piece.id}/recolour`, { variant: 'mauve' }), 422, 'NO_SUCH_VARIANT');
    // A second change gets its own ledger line.
    ok(await player.post(`/decor/pieces/${piece.id}/recolour`, { variant: 'cream' }));
    expect(await player.cash()).toBe(before - 2 * price);
  });
});
