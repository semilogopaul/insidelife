import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  decorQuote,
  exteriorQuote,
  economyAt,
  findAction,
  findProduct,
  NO_DECOR,
  type BuyHouseResultDto,
  type HealthViewDto,
  type HouseListingDto,
  type HousingActionResultDto,
  type InventoryDto,
  type LandOfferDto,
  type OwnedPropertyMarkerDto,
  type RentalListingDto,
  type ShopPurchaseResultDto,
  type TreatmentQuoteDto,
  type VehiclePurchaseResultDto,
  type VehiclesDto,
} from '@insidelife/shared';
import { bootApp, type E2eApp } from './support/app.js';
import { E2E_ENV } from './support/env.js';
import { burst, fund, worldPrice } from './support/game.js';
import { cashFlowsByKind, ledgerViolations, NO_VIOLATIONS } from './support/ledger.js';
import { createPlayer, goHome, moveTo, ok, refused, type Player } from './support/players.js';

let e2e: E2eApp;

beforeAll(async () => {
  e2e = await bootApp();
});

afterAll(async () => {
  if (e2e) expect(await ledgerViolations(e2e.dataSource)).toEqual(NO_VIOLATIONS);
  await e2e?.close();
});

const priceIndex = (): number => economyAt(E2E_ENV.WORLD_SEED!, e2e.clock.now).priceIndex;
const statuses = (responses: ReadonlyArray<{ status: number }>): number[] => responses.map((response) => response.status).toSorted();

async function buy(player: Player, itemId: string): Promise<ShopPurchaseResultDto> {
  return ok<ShopPurchaseResultDto>(await player.post('/shop/purchases', { itemId }));
}

describe('furniture and appliances: money leaves, the item is in the house', () => {
  it('buying in the shop charges the catalog price × the world index, and the 3D home gets the item', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await moveTo(player, 'yaba-market');
    const sofa = findProduct('sofa-fabric')!;
    const before = await player.cash();
    const bought = await buy(player, 'sofa-fabric');
    const price = worldPrice(sofa.def.price, e2e.clock.now);
    expect(bought.order).toMatchObject({ channel: 'in-store', status: 'delivered', total: price, deliveryFee: 0 });
    expect(await player.cash()).toBe(before - price);
    expect(bought.balance).toBe(before - price);

    await moveTo(player, 'mushin-market');
    const cooker = findProduct('cooker-gas')!;
    await buy(player, 'cooker-gas');
    expect(await player.cash()).toBe(before - price - worldPrice(cooker.def.price, e2e.clock.now));

    const inventory = ok<InventoryDto>(await player.get('/inventory'));
    expect(inventory.items.map((item) => item.itemId)).toEqual(expect.arrayContaining(['sofa-fabric', 'cooker-gas']));
    const snapshot = await player.snapshot();
    expect(snapshot.summary.homeItems).toEqual(expect.arrayContaining(['sofa-fabric', 'cooker-gas']));
    expect(snapshot.wallet.balance).toBe(await player.cash());
  });

  it('an online order costs 10% delivery and lands in the home after the dispatch rider comes at day end', async () => {
    e2e.clock.at(11);
    const player = await createPlayer(e2e);
    await goHome(player);
    const microwave = findProduct('microwave')!;
    const before = await player.cash();
    const bought = await buy(player, 'microwave');
    const price = worldPrice(microwave.def.price, e2e.clock.now);
    const deliveryFee = Math.round((price * 0.1) / 50) * 50;
    expect(bought.order).toMatchObject({ channel: 'online', status: 'pending', unitPrice: price, deliveryFee, total: price + deliveryFee });
    expect(await player.cash()).toBe(before - bought.order.total);
    expect((await player.snapshot()).summary.homeItems).not.toContain('microwave');

    e2e.clock.pastMidnight();
    expect((await player.snapshot()).summary.homeItems).toContain('microwave');
    const flows = await cashFlowsByKind(e2e.dataSource, player.characterId);
    expect(flows.fee).toBe(-bought.order.deliveryFee);
  });

  it('a double-submitted purchase of a one-per-home item charges and delivers exactly once', async () => {
    e2e.clock.at(12);
    const player = await createPlayer(e2e);
    await moveTo(player, 'yaba-market');
    const before = await player.cash();
    const results = await burst(6, () => player.post('/shop/purchases', { itemId: 'desk-study' }));
    expect(statuses(results)).toEqual([201, 422, 422, 422, 422, 422]);
    expect(results.filter((response) => response.status === 422).every((response) => response.body.errorCode === 'TOO_MANY')).toBe(true);
    const price = worldPrice(findProduct('desk-study')!.def.price, e2e.clock.now);
    expect(await player.cash()).toBe(before - price);
    const inventory = ok<InventoryDto>(await player.get('/inventory'));
    expect(inventory.items.filter((item) => item.itemId === 'desk-study').map((item) => item.quantity)).toEqual([1]);
  });

  it('refuses what the wallet can’t pay for, charging nothing and leaving no order', async () => {
    e2e.clock.at(13);
    const player = await createPlayer(e2e);
    await moveTo(player, 'lekki-mall');
    const before = await player.cash();
    refused(await player.post('/shop/purchases', { itemId: 'sofa-italian' }), 422, 'INSUFFICIENT_FUNDS');
    expect(await player.cash()).toBe(before);
    const orders = await e2e.dataSource.query<unknown[]>(`SELECT 1 FROM shop_orders WHERE character_id = $1`, [player.characterId]);
    expect(orders).toHaveLength(0);
  });
});

describe('a car', () => {
  it('buying at the dealer charges the price and puts the car in the garage, ready to drive', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await moveTo(player, 'berger-car-market');
    const view = ok<VehiclesDto>(await player.get('/vehicles'));
    expect(view.atDealer).toBe('berger-car-market');
    const offer = view.catalogue.find((entry) => entry.vehicle.id === 'toyota-corolla-2003-taxi')!;
    expect(offer.price).toBe(worldPrice(3_200_000, e2e.clock.now));
    const before = await player.cash();
    const mineBefore = view.mine.length;

    const bought = ok<VehiclePurchaseResultDto>(await player.post('/vehicles/purchases', { vehicleId: 'toyota-corolla-2003-taxi' }));
    expect(bought).toMatchObject({ channel: 'in-person', price: offer.price, paintFee: 0, deliveryFee: 0 });
    expect(await player.cash()).toBe(before - offer.price);
    const garage = ok<VehiclesDto>(await player.get('/vehicles')).mine;
    expect(garage).toHaveLength(mineBefore + 1);
    expect(garage.find((car) => car.id === bought.vehicle.id)).toMatchObject({ status: 'owned', vehicleId: 'toyota-corolla-2003-taxi' });

    // The snapshot counts it: net worth is the cash left plus what the car is worth today.
    const snapshot = await player.snapshot();
    expect(snapshot.wallet.balance).toBe(before - offer.price);
    expect(snapshot.summary.netWorth).toBeGreaterThan(snapshot.wallet.balance + 0.95 * offer.price);
  });
});

describe('homes: renting, land, ready-built houses and makeovers', () => {
  it('renting charges the year upfront with agency, legal, caution and inspection, and moves the player in', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    const listings = ok<RentalListingDto[]>(await player.get('/housing/listings'));
    // A fair-priced listing (no "too sweet" scam risk) the player can afford.
    const listing = listings.find((candidate) => candidate.affordable && candidate.annualRent > candidate.marketRent * 0.9 && candidate.annualRent >= 200_000)!;
    expect(listing).toBeDefined();
    expect(listing.upfront.agency).toBe(Math.round(listing.annualRent * 0.1));
    expect(listing.upfront.legal).toBe(Math.round(listing.annualRent * 0.1));
    expect(listing.upfront.caution).toBe(Math.round(listing.annualRent * 0.1));
    const before = await player.cash();

    const signed = ok<HousingActionResultDto>(await player.post('/housing/leases', { listingId: listing.id }));
    expect(signed.outcome).toBe('moved-in');
    expect(await player.cash()).toBe(before - listing.upfront.total);
    const snapshot = await player.snapshot();
    expect(snapshot.summary.home).toMatchObject({ ownership: 'rented', districtId: listing.districtId });
    refused(await player.post('/housing/leases', { listingId: listing.id }), 422, 'ALREADY_RENTED');
    expect(await player.cash()).toBe(before - listing.upfront.total);

    // Repaint and re-floor the rented flat: charged what the shared quote says (what the app shows).
    const decor = { paint: 'sage', floor: 'ceramic' } as const;
    const quote = decorQuote(listing.bedrooms, NO_DECOR, decor, priceIndex());
    const beforeDecor = await player.cash();
    ok(await player.post('/housing/makeovers', decor));
    expect(await player.cash()).toBe(beforeDecor - quote.total);
    expect((await player.snapshot()).summary.home.decor).toEqual(decor);
  });

  it('buying land charges price plus fees and shows the plot on the map', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 400_000_000);
    const offers = ok<LandOfferDto[]>(await player.get('/housing/land?districtId=epe'));
    const offer = offers.toSorted((a, b) => a.totalPerPlot - b.totalPerPlot)[0]!;
    const before = await player.cash();
    ok(await player.post('/housing/land', { districtId: offer.districtId, title: offer.title, plots: 1 }));
    expect(await player.cash()).toBe(before - offer.totalPerPlot);
    const properties = (await player.snapshot()).summary.properties;
    expect(properties).toEqual([expect.objectContaining({ districtId: 'epe', stage: 'land' })]);
  });

  it('a double-submitted land purchase hands out one plot for one payment (a repeat in the same game minute is refused)', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 400_000_000);
    const offer = ok<LandOfferDto[]>(await player.get('/housing/land?districtId=epe')).toSorted((a, b) => a.totalPerPlot - b.totalPerPlot)[0]!;
    const before = await player.cash();
    const results = await burst(3, () => player.post('/housing/land', { districtId: offer.districtId, title: offer.title, plots: 1 }));
    expect(statuses(results)).toEqual([201, 422, 422]);
    expect(results.filter((response) => response.status === 422).every((response) => response.body.errorCode === 'TOO_SOON')).toBe(true);
    expect((await player.snapshot()).summary.properties.filter((property) => property.stage === 'land')).toHaveLength(1);
    expect(await player.cash()).toBe(before - offer.totalPerPlot);

    // A minute later a second plot is a new purchase, paid in full.
    e2e.clock.advance(1);
    ok(await player.post('/housing/land', { districtId: offer.districtId, title: offer.title, plots: 1 }));
    expect((await player.snapshot()).summary.properties.filter((property) => property.stage === 'land')).toHaveLength(2);
    expect(await player.cash()).toBe(before - 2 * offer.totalPerPlot);
  });

  it('buying a ready-built house charges the listing total; it can be bought once, moved into and restyled', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 400_000_000);
    const listing = ok<HouseListingDto[]>(await player.get('/housing/houses')).toSorted((a, b) => a.total - b.total)[0]!;
    const before = await player.cash();
    const bought = ok<BuyHouseResultDto>(await player.post('/housing/houses', { listingId: listing.id }));
    expect(await player.cash()).toBe(before - listing.total);
    refused(await player.post('/housing/houses', { listingId: listing.id }), 409, 'HOUSE_ALREADY_BOUGHT');
    expect(await player.cash()).toBe(before - listing.total);

    const marker = (await player.snapshot()).summary.properties.find((property) => property.id === bought.propertyId);
    expect(marker).toMatchObject({ stage: 'built', blueprintId: listing.blueprintId, districtId: listing.districtId });

    ok(await player.post('/housing/moves', { to: bought.propertyId }));
    expect((await player.snapshot()).summary.home.ownership).toBe('owned');

    const exterior = { paint: 'terracotta', gate: 'green' } as const;
    const current = marker!.exterior;
    const quote = exteriorQuote(listing.blueprintId, current, exterior, priceIndex());
    const beforeRestyle = await player.cash();
    ok(await player.post(`/housing/properties/${bought.propertyId}/makeovers`, exterior));
    expect(await player.cash()).toBe(beforeRestyle - quote.total);
    const restyled = (await player.snapshot()).summary.properties.find((property) => property.id === bought.propertyId)!;
    expect(restyled.exterior).toMatchObject(exterior);
  });

  it('a second makeover inside the same game minute is refused, never free; a minute later it is paid', async () => {
    e2e.clock.at(10);
    const player = await createPlayer(e2e);
    await fund(e2e, player, 400_000_000);
    const listing = ok<HouseListingDto[]>(await player.get('/housing/houses')).toSorted((a, b) => a.total - b.total)[0]!;
    const bought = ok<BuyHouseResultDto>(await player.post('/housing/houses', { listingId: listing.id }));
    ok(await player.post('/housing/moves', { to: bought.propertyId }));

    const before = await player.cash();
    ok(await player.post('/housing/makeovers', { paint: 'sky' }));
    refused(await player.post('/housing/makeovers', { floor: 'marble' }), 422, 'TOO_SOON');
    const paintCost = decorQuote(listing.bedrooms, NO_DECOR, { paint: 'sky' }, priceIndex()).total;
    expect((await player.snapshot()).summary.home.decor).toEqual({ paint: 'sky', floor: null });
    expect(await player.cash()).toBe(before - paintCost);

    e2e.clock.advance(1);
    ok(await player.post('/housing/makeovers', { floor: 'marble' }));
    const floorCost = decorQuote(listing.bedrooms, { paint: 'sky', floor: null }, { floor: 'marble' }, priceIndex()).total;
    expect((await player.snapshot()).summary.home.decor).toEqual({ paint: 'sky', floor: 'marble' });
    expect(await player.cash()).toBe(before - paintCost - floorCost);

    const marker = (): Promise<OwnedPropertyMarkerDto> => player.snapshot().then((snapshot) => snapshot.summary.properties.find((property) => property.id === bought.propertyId)!);
    const exterior = (await marker()).exterior;
    const restyleBefore = await player.cash();
    ok(await player.post(`/housing/properties/${bought.propertyId}/makeovers`, { roof: 'charcoal' }));
    refused(await player.post(`/housing/properties/${bought.propertyId}/makeovers`, { gate: 'white' }), 422, 'TOO_SOON');
    expect((await marker()).exterior).toMatchObject({ roof: 'charcoal', gate: exterior.gate });
    expect(await player.cash()).toBe(restyleBefore - exteriorQuote(listing.blueprintId, exterior, { roof: 'charcoal' }, priceIndex()).total);
  });
});

describe('venue actions', () => {
  it('charge the catalog price × the world index once at the start; a restart is never free', async () => {
    e2e.clock.at(12);
    const player = await createPlayer(e2e);
    await moveTo(player, 'shitta-amala');
    const action = findAction('eat-buka')!;
    const price = worldPrice(action.cost, e2e.clock.now);
    const before = await player.cash();

    const results = await burst(4, () => player.post('/characters/me/actions', { actionId: 'eat-buka' }));
    expect(results.filter((response) => response.status === 201)).toHaveLength(1);
    expect(results.filter((response) => response.status === 422).map((response) => response.body.errorCode).toSorted()).toEqual(['BUSY', 'BUSY', 'BUSY']);
    expect(await player.cash()).toBe(before - price);
    expect((await player.character()).activity).toMatchObject({ actionId: 'eat-buka', cost: price });

    // Cancel and start again in the same game minute: refused, not free.
    ok(await player.delete('/characters/me/actions/current'));
    refused(await player.post('/characters/me/actions', { actionId: 'eat-buka' }), 422, 'TOO_SOON');
    expect(await player.cash()).toBe(before - price);

    // A minute later it's a new meal at today's price.
    e2e.clock.advance(1);
    ok(await player.post('/characters/me/actions', { actionId: 'eat-buka' }));
    expect(await player.cash()).toBe(before - price - worldPrice(action.cost, e2e.clock.now));
  });

  it('refuses a closed venue and charges nothing', async () => {
    e2e.clock.at(23);
    const player = await createPlayer(e2e);
    await moveTo(player, 'shitta-amala');
    const before = await player.cash();
    refused(await player.post('/characters/me/actions', { actionId: 'eat-buka' }), 422, 'CLOSED');
    expect(await player.cash()).toBe(before);
  });
});

async function sickPlayer(): Promise<{ player: Player; conditionId: string }> {
  const player = await createPlayer(e2e, { age: 24 });
  const [row] = await e2e.dataSource.query<Array<{ id: string }>>(
    `INSERT INTO health_conditions (character_id, condition_id, severity, status, onset_at, diagnosed, source)
     VALUES ($1, 'malaria', 'mild', 'active', $2, true, 'e2e') RETURNING id`,
    [player.characterId, e2e.clock.now - 60],
  );
  await moveTo(player, 'surulere-clinic');
  return { player, conditionId: row!.id };
}

async function quoteFor(player: Player, conditionId: string): Promise<TreatmentQuoteDto> {
  const view = ok<HealthViewDto>(await player.get('/health'));
  const condition = view.conditions.find((candidate) => candidate.id === conditionId)!;
  return condition.quotes.find((quote) => quote.facility === 'hospital-private')!;
}

describe('health care', () => {


  it('treatment charges the quoted price once; an injection costs 60% more; double-submits are refused', async () => {
    e2e.clock.at(10);
    const tablets = await sickPlayer();
    const quote = await quoteFor(tablets.player, tablets.conditionId);
    expect(quote.injection?.price).toBe(Math.round(quote.price * 1.6));

    const before = await tablets.player.cash();
    const results = await burst(3, () => tablets.player.post('/health/treatments', { conditionId: tablets.conditionId, method: 'tablets' }));
    expect(results.filter((response) => response.status === 201)).toHaveLength(1);
    expect(await tablets.player.cash()).toBe(before - quote.youPay);

    const injection = await sickPlayer();
    const injectionQuote = await quoteFor(injection.player, injection.conditionId);
    const beforeInjection = await injection.player.cash();
    ok(await injection.player.post('/health/treatments', { conditionId: injection.conditionId, method: 'injection' }));
    expect(await injection.player.cash()).toBe(beforeInjection - injectionQuote.injection!.youPay);
  });
});
