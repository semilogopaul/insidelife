import {
  BLUEPRINTS,
  LAND_DISTRICT_IDS,
  MINUTES_PER_DAY,
  generateHouseListings,
  weekStartsAt,
  type HouseListing,
} from '@insidelife/shared';
import {
  ConflictException,
  GameRuleException,
  ResourceNotFoundException,
} from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { BuildingEntity } from './entities/building.entity.js';
import type { PropertyEntity } from './entities/property.entity.js';
import { HousePurchasesService } from './house-purchases.service.js';
import { isHouseListingBought, landValue, propertyValue } from './housing.rules.js';
import type { HousingStore } from './housing.store.js';

const SEED = 'eko-o-ni-baje';
const WEEK = 412;
const NOW = weekStartsAt(WEEK) + 3 * MINUTES_PER_DAY + 600;

interface Payment {
  readonly amount: number;
  readonly kind: string;
  readonly key: string;
  readonly sink?: string;
}

interface Harness {
  readonly service: HousePurchasesService;
  readonly ctx: SimulationContext;
  readonly payments: Payment[];
  readonly properties: PropertyEntity[];
  readonly buildings: BuildingEntity[];
  readonly notifications: unknown[];
  readonly reports: unknown[];
}

/** The service with an in-memory store and wallet (the real ones only add the database and the ledger). */
function harness(cash: number, time = NOW, history: Partial<PropertyEntity>[] = []): Harness {
  const payments: Payment[] = [];
  const properties: PropertyEntity[] = history.map((row) => ({ ...row }) as PropertyEntity);
  const buildings: BuildingEntity[] = [];
  const notifications: unknown[] = [];
  const reports: unknown[] = [];
  let balance = cash;
  const store = {
    acquiredSince: async (_ctx: SimulationContext, since: number) =>
      properties.filter((property) => property.acquiredAt >= since),
    addProperty: async (_ctx: SimulationContext, property: PropertyEntity) => {
      const saved = { ...property, id: `property-${properties.length + 1}` } as PropertyEntity;
      properties.push(saved);
      return saved;
    },
    addBuilding: async (_ctx: SimulationContext, building: BuildingEntity) => {
      const saved = { ...building, id: `building-${buildings.length + 1}` } as BuildingEntity;
      buildings.push(saved);
      return saved;
    },
  } as unknown as HousingStore;
  const ctx = {
    time,
    world: { seed: SEED },
    character: { id: 'character-1' },
    manager: { create: (_entity: unknown, data: object) => ({ ...data }) },
    wallet: {
      get cash() {
        return balance;
      },
      canAfford: (amount: number) => balance >= amount,
      pay: async (
        amount: number,
        kind: string,
        _memo: string,
        key: string,
        options: { sink?: string } = {},
      ) => {
        balance -= amount;
        payments.push({ amount, kind, key, sink: options.sink });
      },
    },
    rng: () => {
      throw new RangeError('buying a listed house must not roll any dice');
    },
    notify: (draft: unknown) => notifications.push(draft),
    report: (line: unknown) => reports.push(line),
  } as unknown as SimulationContext;
  return {
    service: new HousePurchasesService(store),
    ctx,
    payments,
    properties,
    buildings,
    notifications,
    reports,
  };
}

const listingIn = (districtId: (typeof LAND_DISTRICT_IDS)[number], week = WEEK): HouseListing => {
  const listing = generateHouseListings(SEED, districtId, week)[0];
  if (!listing) throw new RangeError(`no houses in ${districtId}`);
  return listing;
};

describe('HousePurchasesService.listings', () => {
  it('lists this week’s houses in every land district, cheapest first', async () => {
    const { service, ctx } = harness(50_000_000);
    const listings = await service.listings(ctx);
    expect(new Set(listings.map((listing) => listing.districtId))).toEqual(new Set(LAND_DISTRICT_IDS));
    expect(listings.map((listing) => listing.price)).toEqual(
      listings.map((listing) => listing.price).toSorted((a, b) => a - b),
    );
    for (const listing of listings) {
      expect(listing.total).toBe(listing.price + listing.costs.total);
      expect(listing.affordable).toBe(listing.total <= 50_000_000);
      expect(listing.bought).toBe(false);
      expect(listing.bedrooms).toBe(BLUEPRINTS[listing.blueprintId].bedrooms);
    }
  });

  it('marks a house you bought this week (even if you sold it since)', async () => {
    const listing = listingIn('lekki');
    const { service, ctx } = harness(0, NOW, [
      { districtId: 'lekki', label: listing.label, acquiredAt: NOW - 60, status: 'sold' },
    ]);
    const listings = await service.listings(ctx, 'lekki');
    expect(listings.find((candidate) => candidate.id === listing.id)?.bought).toBe(true);
    expect(listings.filter((candidate) => candidate.bought)).toHaveLength(1);
  });

  it('refuses districts where nothing is sold', async () => {
    const { service, ctx } = harness(0);
    await expect(service.listings(ctx, 'yaba')).rejects.toBeInstanceOf(GameRuleException);
  });
});

describe('HousePurchasesService.buy', () => {
  it('pays price and fees with deterministic keys and hands over land plus a finished house', async () => {
    const listing = listingIn('ikorodu');
    const { quote } = listing;
    const { service, ctx, payments, properties, buildings, notifications, reports } = harness(
      quote.total + 1_000,
    );
    const { property, building } = await service.buy(ctx, listing.id);

    expect(payments).toEqual([
      { amount: quote.price, kind: 'property', key: `house:${listing.id}`, sink: undefined },
      { amount: quote.costs.total, kind: 'fee', key: `house:${listing.id}:fees`, sink: 'fees' },
    ]);
    expect(ctx.wallet.cash).toBe(1_000);

    expect(properties).toHaveLength(1);
    expect(property).toMatchObject({
      characterId: 'character-1',
      districtId: 'ikorodu',
      label: listing.label,
      plots: listing.plots,
      title: listing.title,
      status: 'owned',
      purchasePrice: quote.landShare,
      costBasis: quote.total,
      marketValue: quote.land.marketValue,
      dispute: null,
      titlePerfection: null,
      arrears: 0,
      acquiredAt: NOW,
    });
    expect(buildings).toHaveLength(1);
    expect(building).toMatchObject({
      propertyId: property.id,
      characterId: 'character-1',
      blueprintId: listing.blueprintId,
      status: 'complete',
      budget: quote.buildingShare,
      costPaid: quote.buildingShare,
      completedAt: NOW,
      value: quote.structureValue,
      condition: listing.condition,
      ownerOccupied: false,
      letting: false,
      units: [],
      overrun: null,
      stalledSince: null,
    });
    expect(building.progressDays).toBe(building.durationDays);
    expect(building.milestonesPaid).toBe(building.milestones);
    expect(property.purchasePrice + building.costPaid).toBe(quote.price);

    // The existing valuation rules see exactly the listing's valuation (land at this week's price + structure × condition).
    expect(landValue(property)).toBe(quote.land.price);
    expect(propertyValue(property, building)).toBe(quote.valuation);
    expect(property.valueHistory).toEqual([{ t: NOW, value: quote.valuation }]);
    expect(notifications).toHaveLength(1);
    expect(reports).toHaveLength(1);
  });

  it('refuses a second purchase of the same listing', async () => {
    const listing = listingIn('epe');
    const { service, ctx, payments } = harness(listing.quote.total * 3);
    await service.buy(ctx, listing.id);
    await expect(service.buy(ctx, listing.id)).rejects.toBeInstanceOf(ConflictException);
    expect(payments).toHaveLength(2);
  });

  it('refuses listings from another week and unknown ids', async () => {
    const stale = listingIn('ajah', WEEK - 1);
    const { service, ctx, payments } = harness(Number.MAX_SAFE_INTEGER);
    await expect(service.buy(ctx, stale.id)).rejects.toMatchObject({ errorCode: 'LISTING_GONE' });
    await expect(service.buy(ctx, `house.ajah.${WEEK}.99`)).rejects.toBeInstanceOf(ResourceNotFoundException);
    await expect(service.buy(ctx, `house.yaba.${WEEK}.1`)).rejects.toBeInstanceOf(ResourceNotFoundException);
    expect(payments).toHaveLength(0);
  });

  it('refuses when you can’t cover price and fees, without charging anything', async () => {
    const listing = listingIn('ojo');
    const { service, ctx, payments, properties } = harness(listing.quote.total - 1);
    await expect(service.buy(ctx, listing.id)).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_FUNDS' });
    expect(payments).toHaveLength(0);
    expect(properties).toHaveLength(0);
  });

  it('doesn’t let last week’s purchase block this week’s houses', async () => {
    const listing = listingIn('ikoyi');
    const later = NOW + 7 * MINUTES_PER_DAY;
    const { service, ctx } = harness(Number.MAX_SAFE_INTEGER, later, [
      { districtId: 'ikoyi', label: listing.label, acquiredAt: NOW, status: 'owned' },
    ]);
    const next = listingIn('ikoyi', WEEK + 1);
    await expect(service.buy(ctx, next.id)).resolves.toMatchObject({ listing: { id: next.id } });
  });
});

describe('isHouseListingBought', () => {
  it('matches district, address and the listing week', () => {
    const listing = { districtId: 'lekki', label: '12 Admiralty Way', weekIndex: WEEK } as const;
    expect(
      isHouseListingBought(listing, [{ districtId: 'lekki', label: '12 Admiralty Way', acquiredAt: NOW }]),
    ).toBe(true);
    expect(
      isHouseListingBought(listing, [{ districtId: 'ajah', label: '12 Admiralty Way', acquiredAt: NOW }]),
    ).toBe(false);
    expect(
      isHouseListingBought(listing, [{ districtId: 'lekki', label: '14 Admiralty Way', acquiredAt: NOW }]),
    ).toBe(false);
    expect(
      isHouseListingBought(listing, [
        { districtId: 'lekki', label: '12 Admiralty Way', acquiredAt: weekStartsAt(WEEK + 1) },
      ]),
    ).toBe(false);
    expect(isHouseListingBought(listing, [])).toBe(false);
  });
});
