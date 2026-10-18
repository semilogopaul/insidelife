import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FURNITURE_SELL_BACK_RATE,
  findDecorItem,
  furnitureDecorId,
  type DecorArrangeResultDto,
  type DecorChangeDto,
  type DecorPieceDto,
  type DecorReplaceResultDto,
  type DecorSellResultDto,
  type DecorStateDto,
  type HousingActionResultDto,
  type InventoryDto,
  type RentalListingDto,
  type ShopPurchaseResultDto,
} from '@insidelife/shared';
import { FurniturePieces1791870000000 } from '../src/database/migrations/1791870000000-FurniturePieces.js';
import { bootApp, type E2eApp } from './support/app.js';
import { burst, fund, worldPrice } from './support/game.js';
import { ledgerViolations, NO_VIOLATIONS, postingsWithKey } from './support/ledger.js';
import { createPlayer, key, ok, refused, type Player } from './support/players.js';

let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp();
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

const WEALTH = 900_000_000;

/** A player living in a rented place of the given kind (the family house until then). */
async function tenant(type: RentalListingDto['type']): Promise<Player> {
  e2e.clock.at(10);
  const player = await createPlayer(e2e);
  await fund(e2e, player, WEALTH);
  const listing = ok<RentalListingDto[]>(await player.get(`/housing/listings?type=${type}`)).find((candidate) => candidate.type === type && candidate.annualRent > candidate.marketRent * 0.9);
  if (!listing) throw new Error(`no ${type} on the market`);
  expect(ok<HousingActionResultDto>(await player.post('/housing/leases', { listingId: listing.id })).outcome).toBe('moved-in');
  return player;
}

const state = async (player: Player): Promise<DecorStateDto> => ok<DecorStateDto>(await player.get('/decor'));
const inventory = async (player: Player): Promise<InventoryDto> => ok<InventoryDto>(await player.get('/inventory'));
const bedQuality = async (player: Player): Promise<number> => (await inventory(player)).home.bedQuality;
const buy = async (player: Player, itemId: string, roomId?: string): Promise<ShopPurchaseResultDto> =>
  ok<ShopPurchaseResultDto>(await player.post('/shop/purchases', { itemId, ...(roomId ? { roomId } : {}) }));
const pieceOf = (mine: DecorStateDto, itemId: string): DecorPieceDto[] => mine.pieces.filter((piece) => piece.itemId === furnitureDecorId(itemId));

describe('furniture is pieces: a bought bed stands in the room at once, and it is the bed you sleep in', () => {
  it('puts a bought bed in the bedroom, offers to replace the old one, and sleeping uses the new bed', async () => {
    const player = await tenant('two-bed');
    // The starter mattress came with the player and stands in the bedroom at the spot the template had for it.
    const start = await state(player);
    expect(start.home).toMatchObject({ scope: 'full', templateId: 'home-flat' });
    const [mattress] = pieceOf(start, 'bed-foam-mattress');
    // At the spot the template had for the bed (nudged off the wall: a mattress is longer than the template's bed).
    expect(mattress?.spot).toMatchObject({ templateId: 'home-flat', roomId: 'bedroom' });
    expect(Math.hypot(mattress!.spot!.x + 0.6, mattress!.spot!.z + 1.45)).toBeLessThan(0.3);
    expect(await bedQuality(player)).toBeCloseTo(0.35);

    const before = await player.cash();
    const bought = await buy(player, 'bed-spring');
    const price = worldPrice(findDecorItem(furnitureDecorId('bed-spring'))!.price, e2e.clock.now);
    // Visible at once: in the bedroom of this home, with the older bed offered for replacing.
    const bed = bought.furniture!.pieces[0]!;
    expect(bed.spot).toMatchObject({ templateId: 'home-flat', roomId: 'bedroom' });
    expect(bought.furniture!.replaces.map((piece) => piece.id)).toEqual([mattress!.id]);
    expect(bought.furniture!.sellBacks[mattress!.id]).toBeGreaterThan(0);
    expect(await player.cash()).toBe(before - bought.order.total);
    expect(bought.order.unitPrice).toBe(price);
    // The best bed in the home sets how well you sleep.
    expect(await bedQuality(player)).toBeCloseTo(0.55);

    // Replace: the new bed takes the old one's place and the old one is sold back at 40%.
    const cash = await player.cash();
    const offer = (await state(player)).sellBacks[mattress!.id]!;
    const replaced = ok<DecorReplaceResultDto>(await player.post(`/decor/pieces/${bed.id}/replace`, { oldId: mattress!.id, mode: 'sell' }));
    expect(replaced).toMatchObject({ amount: offer, soldId: mattress!.id, balance: cash + offer });
    expect(replaced.pieces.find((piece) => piece.id === bed.id)?.spot).toMatchObject({ roomId: 'bedroom', x: mattress!.spot!.x, z: mattress!.spot!.z });
    const shelf = worldPrice(findDecorItem(furnitureDecorId('bed-foam-mattress'))!.price, e2e.clock.now);
    expect(offer).toBeLessThanOrEqual(Math.round(shelf * FURNITURE_SELL_BACK_RATE));
    expect(offer).toBeGreaterThan(Math.round(shelf * FURNITURE_SELL_BACK_RATE * 0.5));
    const after = await state(player);
    expect(pieceOf(after, 'bed-foam-mattress')).toHaveLength(0);
    expect((await inventory(player)).items.map((item) => item.itemId)).not.toContain('bed-foam-mattress');
    // The refund went through the ledger once, under a key made from the piece.
    const rows = await postingsWithKey(e2e.dataSource, `${player.characterId}:furniture-sell:${mattress!.id}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'refund' });
    expect(await bedQuality(player)).toBeCloseTo(0.55);
  });

  it('counts only the beds that stand in the home: a bed in storage does not sleep you', async () => {
    const player = await tenant('two-bed');
    await buy(player, 'bed-spring');
    const king = (await buy(player, 'bed-orthopedic')).furniture!.pieces[0]!;
    expect(await bedQuality(player)).toBeCloseTo(0.8);
    ok<DecorChangeDto>(await player.delete(`/decor/pieces/${king.id}/spot`));
    expect(await bedQuality(player)).toBeCloseTo(0.55);
    const back = ok<DecorChangeDto>(await player.put(`/decor/pieces/${king.id}/spot`, { templateId: 'home-flat', roomId: 'bedroom', x: 1.2, z: 0.3, rot: 90 }));
    expect(back.pieces[0]!.spot).toMatchObject({ roomId: 'bedroom' });
    expect(await bedQuality(player)).toBeCloseTo(0.8);
    // Beds go in bedrooms, not in the kitchen or the bathroom.
    refused(await player.put(`/decor/pieces/${king.id}/spot`, { templateId: 'home-flat', roomId: 'bathroom', x: 0, z: 0, rot: 0 }), 422, 'WRONG_ROOM');
    refused(await player.put(`/decor/pieces/${king.id}/spot`, { templateId: 'home-flat', roomId: 'kitchen', x: 0, z: 0, rot: 0 }), 422, 'WRONG_ROOM');
    // …and not through the built-in fittings.
    refused(await player.put(`/decor/pieces/${king.id}/spot`, { templateId: 'home-flat', roomId: 'bedroom', x: -4, z: 0, rot: 0 }), 422, 'CANT_PLACE_THERE');
  });

  it('stores the old bed on request: it stays yours but stops counting', async () => {
    const player = await tenant('two-bed');
    const [mattress] = pieceOf(await state(player), 'bed-foam-mattress');
    const bed = (await buy(player, 'bed-spring')).furniture!.pieces[0]!;
    const result = ok<DecorReplaceResultDto>(await player.post(`/decor/pieces/${bed.id}/replace`, { oldId: mattress!.id, mode: 'store' }));
    expect(result.soldId).toBeNull();
    expect(result.amount).toBe(0);
    const mine = await state(player);
    expect(mine.pieces.find((piece) => piece.id === mattress!.id)?.spot).toBeNull();
    expect(mine.pieces.find((piece) => piece.id === bed.id)?.spot).toMatchObject({ roomId: 'bedroom' });
    expect((await inventory(player)).items.map((item) => item.itemId)).toContain('bed-foam-mattress');
  });
});

describe('every piece has a function, in the right room', () => {
  it('puts the table to eat at in the mansion kitchen, the sofa in the parlour and the bed in the master suite', async () => {
    const player = await tenant('mansion');
    expect((await state(player)).home.templateId).toBe('home-mansion');
    const table = (await buy(player, 'dining-set')).furniture!.pieces[0]!;
    const sofa = (await buy(player, 'sofa-leather')).furniture!.pieces[0]!;
    const bed = (await buy(player, 'bed-super-king')).furniture!.pieces[0]!;
    const tv = (await buy(player, 'tv-75')).furniture!.pieces[0]!;
    expect(table.spot?.roomId).toBe('kitchen');
    expect(sofa.spot?.roomId).toBe('living');
    expect(bed.spot?.roomId).toBe('master');
    expect(tv.spot?.roomId).toBe('living');
    const mine = await state(player);
    // Eat at home goes to the kitchen table — never the living room — and the best bed is the super king.
    expect(mine.furnishing.eat).toMatchObject({ pieceId: table.id, roomId: 'kitchen' });
    expect(mine.furnishing.sit).toMatchObject({ pieceId: sofa.id, roomId: 'living' });
    expect(mine.furnishing.sleep).toMatchObject({ pieceId: bed.id, roomId: 'master', quality: 1 });
    expect(mine.furnishing.tv?.roomId).toBe('living');
    expect(mine.bedQuality).toBe(1);

    // You may put the table in the parlour if you like (it is a dining table there too), but a bed in the kitchen is no bed.
    ok<DecorChangeDto>(await player.put(`/decor/pieces/${table.id}/spot`, { templateId: 'home-mansion', roomId: 'living', x: 1.5, z: 2, rot: 0 }));
    expect((await state(player)).furnishing.eat?.roomId).toBe('living');
    ok<DecorChangeDto>(await player.put(`/decor/pieces/${table.id}/spot`, { templateId: 'home-mansion', roomId: 'kitchen', x: 2.4, z: 1.4, rot: 0 }));
    expect((await state(player)).furnishing.eat?.roomId).toBe('kitchen');
    refused(await player.put(`/decor/pieces/${bed.id}/spot`, { templateId: 'home-mansion', roomId: 'kitchen', x: 2.4, z: 1.4, rot: 0 }), 422, 'WRONG_ROOM');
    refused(await player.put(`/decor/pieces/${table.id}/spot`, { templateId: 'home-mansion', roomId: 'master', x: 0, z: 0, rot: 0 }), 422, 'WRONG_ROOM');
  });

  it('says what is missing when the home has no bed or no table', async () => {
    const player = await tenant('mansion');
    // Sell the starter mattress: no bed in the whole home.
    const [mattress] = pieceOf(await state(player), 'bed-foam-mattress');
    ok<DecorSellResultDto>(await player.post(`/decor/pieces/${mattress!.id}/sell`, { idempotencyKey: key() }));
    const mine = await state(player);
    expect(mine.furnishing.sleep).toBeNull();
    expect(mine.furnishing.eat).toBeNull();
    expect(mine.bedQuality).toBeCloseTo(0.2);
  });
});

describe('selling back', () => {
  it('pays 40% of the shelf price (less for wear) through the ledger once, however many times you tap', async () => {
    const player = await tenant('two-bed');
    const tv = (await buy(player, 'tv-55')).furniture!.pieces[0]!;
    expect((await inventory(player)).tags).toContain('tv');
    const cash = await player.cash();
    const offer = (await state(player)).sellBacks[tv.id]!;
    const shelf = worldPrice(findDecorItem(furnitureDecorId('tv-55'))!.price, e2e.clock.now);
    expect(offer).toBeLessThanOrEqual(Math.round(shelf * FURNITURE_SELL_BACK_RATE));
    const tap = key();
    const results = await burst(3, () => player.post(`/decor/pieces/${tv.id}/sell`, { idempotencyKey: tap }));
    expect(results.map((result) => result.status)).toEqual([201, 201, 201]);
    expect(await player.cash()).toBe(cash + offer);
    expect(ok<DecorSellResultDto>(results[0]!).amount).toBe(offer);
    expect((await postingsWithKey(e2e.dataSource, `${player.characterId}:furniture-sell:${tv.id}`)).length).toBe(1);
    // The TV is gone from the home and from your things; nothing to watch on.
    expect((await inventory(player)).tags).not.toContain('tv');
    expect(pieceOf(await state(player), 'tv-55')).toHaveLength(0);
    refused(await player.post(`/decor/pieces/${tv.id}/sell`, { idempotencyKey: key() }), 404, 'RESOURCE_NOT_FOUND');
  });

  it('sells decor too, at 40% of what was paid, and keeps a stack of two TVs in step with its pieces', async () => {
    const player = await tenant('two-bed');
    const rug = ok<{ pieces: DecorPieceDto[]; total: number }>(await player.post('/decor/purchases', { itemId: 'rug-shaggy', variant: 'ivory' }));
    const sold = ok<DecorSellResultDto>(await player.post(`/decor/pieces/${rug.pieces[0]!.id}/sell`, { idempotencyKey: key() }));
    expect(sold.amount).toBe(Math.round(rug.total * FURNITURE_SELL_BACK_RATE));

    const two = ok<ShopPurchaseResultDto>(await player.post('/shop/purchases', { itemId: 'tv-32', quantity: 2 }));
    expect(two.furniture!.pieces).toHaveLength(2);
    expect(pieceOf(await state(player), 'tv-32')).toHaveLength(2);
    ok<DecorSellResultDto>(await player.post(`/decor/pieces/${two.furniture!.pieces[0]!.id}/sell`, { idempotencyKey: key() }));
    expect(pieceOf(await state(player), 'tv-32')).toHaveLength(1);
    expect((await inventory(player)).items.find((item) => item.itemId === 'tv-32')?.quantity).toBe(1);
    // Selling the stack the old way takes its pieces with it.
    const stack = (await inventory(player)).items.find((item) => item.itemId === 'tv-32')!;
    ok(await player.post(`/inventory/${stack.id}/sale`, { quantity: 1 }));
    expect(pieceOf(await state(player), 'tv-32')).toHaveLength(0);
  });
});

describe('the family house keeps its own furniture', () => {
  it('stores your big furniture for a place of your own, still counts it for sleep, and takes small pieces', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 50_000_000);
    expect((await state(player)).home).toMatchObject({ scope: 'small', ownership: 'family' });
    const bed = (await buy(player, 'bed-spring')).furniture!.pieces[0]!;
    expect(bed.spot).toBeNull();
    // Their furniture stays: yours is for a place of your own… but the bed still improves your sleep.
    expect(await bedQuality(player)).toBeCloseTo(0.55);
    const home = (await state(player)).home;
    refused(await player.put(`/decor/pieces/${bed.id}/spot`, { templateId: home.templateId, roomId: 'room', x: 0, z: 0, rot: 0 }), 422, 'FAMILY_FURNITURE');
    const arranged = ok<DecorArrangeResultDto>(await player.post('/decor/arrange', {}));
    expect(arranged.pieces.every((piece) => piece.spot === null || !findDecorItem(piece.itemId)?.fn)).toBe(true);
  });
});

describe('moving across: nothing a player owned is lost', () => {
  it('turns every unit of a furniture stack into a piece and settles them where the template had them when a place is rented', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, WEALTH);
    // A player from before furniture became pieces: stacks in their things, no pieces at all.
    await e2e.dataSource.query('DELETE FROM decor_pieces WHERE character_id = $1 AND inventory_item_id IS NOT NULL', [player.characterId]);
    const insert = (itemId: string, quantity: number): Promise<unknown> =>
      e2e.dataSource.query(
        `INSERT INTO inventory_items (character_id, item_id, kind, quantity, condition, condition_at, acquired_at, source, unit_price)
         VALUES ($1, $2, 'item', $3, 100, 0, 0, 'store', 0)`,
        [player.characterId, itemId, quantity],
      );
    await insert('bed-spring', 1);
    await insert('tv-55', 2);
    await insert('sofa-leather', 1);
    await FurniturePieces1791870000000.backfill(e2e.dataSource.createQueryRunner());
    const rows = await e2e.dataSource.query<Array<{ item_id: string; settled: boolean; template_id: string | null }>>(
      'SELECT item_id, settled, template_id FROM decor_pieces WHERE character_id = $1 AND inventory_item_id IS NOT NULL ORDER BY item_id',
      [player.characterId],
    );
    expect(rows.map((row) => row.item_id)).toEqual(['home-bed-foam-mattress', 'home-bed-spring', 'home-sofa-leather', 'home-tv-55', 'home-tv-55']);
    expect(rows.every((row) => !row.settled && row.template_id === null)).toBe(true);
    // Running it again adds nothing (one piece per unit).
    await FurniturePieces1791870000000.backfill(e2e.dataSource.createQueryRunner());
    expect((await e2e.dataSource.query('SELECT count(*)::int AS n FROM decor_pieces WHERE character_id = $1 AND inventory_item_id IS NOT NULL', [player.characterId]))[0].n).toBe(5);

    // Still in the family house: nothing can stand there yet, nothing is lost, and sleep still counts the best bed.
    const family = await state(player);
    expect(family.pieces.filter((piece) => findDecorItem(piece.itemId)?.shopItemId)).toHaveLength(5);
    expect(await bedQuality(player)).toBeCloseTo(0.55);

    // Rent a flat: everything is put where the template had it.
    const listing = ok<RentalListingDto[]>(await player.get('/housing/listings?type=two-bed')).find((candidate) => candidate.type === 'two-bed' && candidate.annualRent > candidate.marketRent * 0.9)!;
    expect(ok<HousingActionResultDto>(await player.post('/housing/leases', { listingId: listing.id })).outcome).toBe('moved-in');
    const flat = await state(player);
    const spring = pieceOf(flat, 'bed-spring')[0]!;
    expect(spring.spot).toMatchObject({ templateId: 'home-flat', roomId: 'bedroom' });
    expect(Math.hypot(spring.spot!.x + 0.6, spring.spot!.z + 1.45)).toBeLessThan(0.3);
    const sofa = pieceOf(flat, 'sofa-leather')[0]!;
    expect(sofa.spot).toMatchObject({ roomId: 'living' });
    expect(Math.hypot(sofa.spot!.x + 2.97, sofa.spot!.z + 0.9)).toBeLessThan(0.6);
    const tvs = pieceOf(flat, 'tv-55');
    expect(tvs).toHaveLength(2);
    expect(tvs[0]!.spot).toMatchObject({ roomId: 'living' });
    expect(Math.hypot(tvs[0]!.spot!.x + 0.42, tvs[0]!.spot!.z + 0.9)).toBeLessThan(0.6);
    // The second TV finds room too (or waits in storage): it is never lost.
    expect(tvs).toHaveLength(2);
    expect(await bedQuality(player)).toBeCloseTo(0.55);
    // Their things are all still there.
    expect((await inventory(player)).items.map((item) => `${item.itemId}×${item.quantity}`).toSorted()).toEqual(
      expect.arrayContaining(['bed-spring×1', 'sofa-leather×1', 'tv-55×2']),
    );
  });

  it('keeps decor pieces and cabin pieces exactly where they stood', async () => {
    const player = await tenant('two-bed');
    const rug = ok<{ pieces: DecorPieceDto[] }>(await player.post('/decor/purchases', { itemId: 'rug-ankara', variant: 'royal' })).pieces[0]!;
    ok<DecorChangeDto>(await player.put(`/decor/pieces/${rug.id}/spot`, { templateId: 'home-flat', roomId: 'living', x: 0.5, z: 0.4, rot: 30 }));
    await buy(player, 'sofa-fabric');
    await buy(player, 'tv-32');
    const mine = await state(player);
    expect(mine.pieces.find((piece) => piece.id === rug.id)?.spot).toMatchObject({ roomId: 'living', x: 0.5, z: 0.4, rot: 30 });
  });

  it('arranges stored furniture on request', async () => {
    const player = await tenant('mansion');
    const table = (await buy(player, 'dining-set')).furniture!.pieces[0]!;
    ok<DecorChangeDto>(await player.delete(`/decor/pieces/${table.id}/spot`));
    expect(pieceOf(await state(player), 'dining-set')[0]!.spot).toBeNull();
    const arranged = ok<DecorArrangeResultDto>(await player.post('/decor/arrange', {}));
    expect(arranged.left).toBe(0);
    expect(pieceOf(await state(player), 'dining-set')[0]!.spot).toMatchObject({ roomId: 'kitchen' });
  });
});
