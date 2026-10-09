import { describe, expect, it } from 'vitest';
import { economyOn } from '../world/world.js';
import { DAYS_PER_WEEK } from '../time/calendar.js';
import { DISTRICTS, DISTRICT_IDS } from './geography.js';
import {
  BLUEPRINTS,
  BUILDING_COMPLETION_PREMIUM,
  HOUSE_CONDITION,
  HOUSE_LISTINGS_PER_WEEK,
  HOUSE_SELLER_PREMIUM,
  LAND_DISTRICT_IDS,
  NEW_BUILD_CONDITION,
  PLOT_SQM,
  SALE_PRICE_NOISE,
  PROPERTY_AGENT_RATE,
  availableTitles,
  blueprintBuildCost,
  findHouseListing,
  generateHouseListings,
  houseListingId,
  houseQuote,
  landPurchaseCosts,
  landQuote,
  minPlotsFor,
  parseHouseListingId,
  type HouseQuoteInput,
} from './housing.js';

const SEED = 'eko-o-ni-baje';
const WEEK = 412;

const input = (overrides: Partial<HouseQuoteInput> = {}): HouseQuoteInput => ({
  districtId: 'ikorodu',
  blueprintId: 'bungalow',
  title: 'c-of-o',
  plots: 1,
  condition: 85,
  premium: 0.25,
  weekIndex: WEEK,
  ...overrides,
});

describe('houseQuote (ready-built house pricing)', () => {
  it('prices land like the land market plus the structure at today’s build cost, discounted by condition, times the premium', () => {
    const quote = houseQuote(SEED, input());
    expect(quote).not.toBeNull();
    if (!quote) return;
    const land = landQuote(SEED, 'ikorodu', 'c-of-o', 1, WEEK);
    expect(quote.land).toEqual(land);

    const priceIndex = economyOn(SEED, WEEK * DAYS_PER_WEEK).priceIndex;
    expect(quote.buildCost).toBe(Math.round((BLUEPRINTS.bungalow.baseCost * priceIndex) / 10_000) * 10_000);
    expect(quote.buildCost).toBe(blueprintBuildCost(SEED, 'bungalow', WEEK));
    expect(quote.structureValue).toBe(Math.round(quote.buildCost * (1 + BUILDING_COMPLETION_PREMIUM)));
    expect(quote.valuation).toBe((land?.price ?? 0) + Math.round(quote.structureValue * 0.85));
    expect(quote.price).toBe(Math.round((quote.valuation * 1.25) / 100_000) * 100_000);
    expect(quote.costs).toEqual(landPurchaseCosts(quote.price));
    expect(quote.total).toBe(quote.price + quote.costs.total);
  });

  it('splits the price between land and building in proportion to their value', () => {
    for (const quote of [
      houseQuote(SEED, input()),
      houseQuote(SEED, input({ districtId: 'lekki', blueprintId: 'duplex' })),
    ]) {
      if (!quote) throw new RangeError('expected a quote');
      expect(quote.landShare + quote.buildingShare).toBe(quote.price);
      expect(quote.landShare / quote.price).toBeCloseTo(quote.land.price / quote.valuation, 4);
    }
  });

  it('is null where that land isn’t sold or the plots are too small', () => {
    expect(houseQuote(SEED, input({ districtId: 'yaba' }))).toBeNull();
    expect(houseQuote(SEED, input({ districtId: 'ikoyi', title: 'survey' }))).toBeNull();
    expect(houseQuote(SEED, input({ blueprintId: 'mansion', plots: 2 }))).toBeNull();
    expect(houseQuote(SEED, input({ blueprintId: 'block-of-flats', plots: 1 }))).toBeNull();
    expect(houseQuote(SEED, input({ blueprintId: 'mansion', plots: minPlotsFor('mansion') }))).not.toBeNull();
  });

  it('rises with condition, premium, plots and better papers', () => {
    const price = (overrides: Partial<HouseQuoteInput>): number =>
      houseQuote(SEED, input(overrides))?.price ?? 0;
    expect(price({ condition: 100 })).toBeGreaterThan(price({ condition: 70 }));
    expect(price({ premium: 0.35 })).toBeGreaterThan(price({ premium: 0.15 }));
    expect(price({ plots: 2 })).toBeGreaterThan(price({ plots: 1 }));
    expect(price({ title: 'c-of-o' })).toBeGreaterThan(price({ title: 'survey' }));
  });

  it('always costs more than you could flip it for (sale noise, agent fee and purchase fees included)', () => {
    for (const districtId of LAND_DISTRICT_IDS) {
      for (let week = 0; week < 40; week++) {
        for (const listing of generateHouseListings(SEED, districtId, week)) {
          const { quote } = listing;
          expect(quote.price).toBeGreaterThan(quote.valuation);
          const bestResale = quote.valuation * (1 + SALE_PRICE_NOISE) * (1 - PROPERTY_AGENT_RATE);
          expect(bestResale).toBeLessThan(quote.total);
        }
      }
    }
  });

  it('is calibrated to Lagos 2026 house prices', () => {
    const bungalow = houseQuote(SEED, input())?.price ?? 0;
    expect(bungalow).toBeGreaterThan(20_000_000);
    expect(bungalow).toBeLessThan(70_000_000);
    const duplex =
      houseQuote(SEED, input({ districtId: 'lekki', blueprintId: 'duplex', condition: 90 }))?.price ?? 0;
    expect(duplex).toBeGreaterThan(500_000_000);
    expect(duplex).toBeLessThan(1_200_000_000);
    const mansion =
      houseQuote(
        SEED,
        input({ districtId: 'banana-island', blueprintId: 'mansion', plots: 3, condition: 95 }),
      )?.price ?? 0;
    expect(mansion).toBeGreaterThan(5_000_000_000);
    expect(mansion).toBeLessThan(12_000_000_000);
  });
});

describe('houses for sale', () => {
  it('are deterministic per district × week', () => {
    const first = generateHouseListings(SEED, 'lekki', WEEK);
    expect(first).toHaveLength(HOUSE_LISTINGS_PER_WEEK);
    expect(generateHouseListings(SEED, 'lekki', WEEK)).toEqual(first);
    expect(generateHouseListings(SEED, 'lekki', WEEK + 1)).not.toEqual(first);
    expect(generateHouseListings('another-world', 'lekki', WEEK)).not.toEqual(first);
  });

  it('only exist where land is sold', () => {
    for (const districtId of DISTRICT_IDS) {
      const listings = generateHouseListings(SEED, districtId, WEEK);
      if (DISTRICTS[districtId].landPricePerPlot === null) expect(listings).toEqual([]);
      else expect(listings.length).toBeGreaterThan(0);
    }
  });

  it('round-trip their ids', () => {
    for (const listing of generateHouseListings(SEED, 'epe', 9)) {
      expect(parseHouseListingId(listing.id)).toEqual({
        districtId: 'epe',
        weekIndex: 9,
        n: expect.any(Number),
      });
      expect(findHouseListing(SEED, listing.id)).toEqual(listing);
    }
    expect(houseListingId('ajah', 3, 2)).toBe('house.ajah.3.2');
    expect(findHouseListing(SEED, 'house.epe.9.99')).toBeNull();
    expect(findHouseListing(SEED, 'house.yaba.9.1')).toBeNull();
    expect(parseHouseListingId('epe.duplex.9.1')).toBeNull();
    expect(parseHouseListingId('house.atlantis.9.1')).toBeNull();
    expect(parseHouseListingId('house.epe.x.1')).toBeNull();
    expect(parseHouseListingId('house.epe.9.1.2')).toBeNull();
  });

  it('respect land rules, sizes and ranges', () => {
    for (const districtId of LAND_DISTRICT_IDS) {
      for (let week = 0; week < 60; week++) {
        const listings = generateHouseListings(SEED, districtId, week);
        expect(new Set(listings.map((listing) => listing.label)).size).toBe(listings.length);
        for (const listing of listings) {
          expect(availableTitles(districtId)).toContain(listing.title);
          expect(listing.plots * PLOT_SQM).toBeGreaterThanOrEqual(BLUEPRINTS[listing.blueprintId].minSqm);
          expect(listing.condition).toBeGreaterThanOrEqual(HOUSE_CONDITION.min);
          expect(listing.condition).toBeLessThanOrEqual(HOUSE_CONDITION.max);
          expect(listing.quote.premium).toBeGreaterThanOrEqual(HOUSE_SELLER_PREMIUM.min);
          expect(listing.quote.premium).toBeLessThanOrEqual(HOUSE_SELLER_PREMIUM.max);
          expect(listing.ageYears === 0).toBe(listing.condition >= NEW_BUILD_CONDITION);
          expect(listing.label.endsWith(listing.street)).toBe(true);
          expect(listing.quote).toEqual(
            houseQuote(SEED, {
              districtId,
              blueprintId: listing.blueprintId,
              title: listing.title,
              plots: listing.plots,
              condition: listing.condition,
              premium: listing.quote.premium,
              weekIndex: week,
            }),
          );
        }
      }
    }
  });

  it('put mansions on the prime Island and bungalows on the mainland', () => {
    const counts = (districtId: (typeof LAND_DISTRICT_IDS)[number]): Record<string, number> => {
      const tally: Record<string, number> = {};
      for (let week = 0; week < 80; week++) {
        for (const listing of generateHouseListings(SEED, districtId, week))
          tally[listing.blueprintId] = (tally[listing.blueprintId] ?? 0) + 1;
      }
      return tally;
    };
    for (const districtId of ['ikorodu', 'ojo', 'epe', 'ajah', 'ikeja'] as const)
      expect(counts(districtId)['mansion'] ?? 0).toBe(0);
    for (const districtId of ['ikoyi', 'banana-island', 'lekki'] as const) {
      expect(counts(districtId)['mansion'] ?? 0).toBeGreaterThan(0);
      expect(counts(districtId)['bungalow'] ?? 0).toBe(0);
    }
    const ikorodu = counts('ikorodu');
    expect(ikorodu['bungalow'] ?? 0).toBeGreaterThan(ikorodu['duplex'] ?? 0);
    const banana = counts('banana-island');
    expect(banana['mansion'] ?? 0).toBeGreaterThan(banana['duplex'] ?? 0);
  });
});
