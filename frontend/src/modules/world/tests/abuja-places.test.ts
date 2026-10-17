import { CITY_MAP, DISTRICTS, VENUES, venuesOfCity, type CityLot } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { ABUJA_GOVERNMENT_LOOKS, ABUJA_MARKET_STYLES, ABUJA_PARK_STYLES, ABUJA_PROCEDURAL, ABUJA_SHOP_LOOKS, ABUJA_TOWER_LOOKS } from '../city/layout/abuja-looks';
import { cityPlan } from '../city/layout/placements';
import { buildLandmarkGeometry } from '../city/render/landmark-geometry';

const abujaLots = CITY_MAP.lots.filter((lot) => lot.kind === 'venue' && DISTRICTS[lot.districtId].cityId === 'abuja');
const plan = cityPlan();

const overlaps = (lot: CityLot, box: { minX: number; maxX: number; minZ: number; maxZ: number }): boolean =>
  box.maxX > lot.footprint.minX && box.minX < lot.footprint.maxX && box.maxZ > lot.footprint.minZ && box.minZ < lot.footprint.maxZ;
const inside = (lot: CityLot, x: number, z: number): boolean => x > lot.footprint.minX && x < lot.footprint.maxX && z > lot.footprint.minZ && z < lot.footprint.maxZ;

/** Lots that are open ground (stalls, trees, cars), not a building. */
const OPEN = new Set(['market', 'park', 'beach', 'motor-park', 'airport', 'aviation-terminal', 'jet-pad']);

describe('Abuja on the plan', () => {
  it('builds something on every Abuja venue lot: a solid building or open ground with things on it', () => {
    expect(abujaLots.length).toBe(venuesOfCity('abuja').length);
    for (const lot of abujaLots) {
      const solid = plan.colliders.some((box) => overlaps(lot, box));
      const props = Object.values(plan.placements).some((placements) => placements.some((placement) => inside(lot, placement.x, placement.z)));
      if (OPEN.has(lot.archetype ?? 'shop')) expect(props || solid, lot.id).toBe(true);
      else expect(solid, `${lot.id} (${lot.archetype}) has no building`).toBe(true);
    }
  });

  it('keys its looks to Abuja venues that exist and are the type of place the look is for', () => {
    const byId = new Map(VENUES.map((venue) => [venue.id as string, venue]));
    const tables: ReadonlyArray<readonly [string, Readonly<Record<string, unknown>>]> = [
      ['market', ABUJA_MARKET_STYLES],
      ['park', ABUJA_PARK_STYLES],
      ['shops', ABUJA_SHOP_LOOKS],
      ['towers', ABUJA_TOWER_LOOKS],
      ['government', ABUJA_GOVERNMENT_LOOKS],
    ];
    for (const [name, table] of tables) {
      for (const id of Object.keys(table)) {
        const venue = byId.get(id);
        expect(venue, `${name}: ${id}`).toBeDefined();
        if (venue) expect(DISTRICTS[venue.districtId].cityId, `${name}: ${id}`).toBe('abuja');
      }
    }
    for (const id of ABUJA_PROCEDURAL.keys()) expect(byId.has(id), id).toBe(true);
  });

  it('gives every Abuja market, park and bank its own paint, so none look alike', () => {
    for (const type of ['market', 'park'] as const) {
      const lots = abujaLots.filter((lot) => lot.venueId && VENUES.find((venue) => venue.id === lot.venueId)?.type === type);
      const keys = new Set(lots.map((lot) => lot.venueId));
      for (const id of keys) {
        const look = type === 'market' ? ABUJA_MARKET_STYLES[id as string] : ABUJA_PARK_STYLES[id as string];
        expect(look, `${type} ${id}`).toBeDefined();
      }
      const grounds = lots.map((lot) => (type === 'market' ? ABUJA_MARKET_STYLES[lot.venueId as string]?.ground : ABUJA_PARK_STYLES[lot.venueId as string]?.ground));
      expect(new Set(grounds).size, type).toBeGreaterThanOrEqual(Math.min(grounds.length, 3));
    }
    const shops = Object.entries(ABUJA_SHOP_LOOKS);
    expect(new Set(shops.map(([, look]) => `${look.tint}:${look.accent ?? ''}:${look.accessory ?? ''}`)).size).toBe(shops.length);
  });

  it('puts Aso Rock, the monoliths and the national mosque into Abuja’s landmark mesh only', () => {
    const rock = abujaLots.length > 0 && CITY_MAP.lots.some((lot) => lot.id === 'landmark:aso-rock');
    expect(rock).toBe(true);
    expect(plan.colliders.some((box) => box.height >= 60)).toBe(true);
    const abuja = buildLandmarkGeometry('abuja');
    const lagos = buildLandmarkGeometry('lagos');
    expect(abuja.getAttribute('position').count).toBeGreaterThan(20_000);
    expect(abuja.getAttribute('position').count).not.toBe(lagos.getAttribute('position').count);
    abuja.dispose();
    lagos.dispose();
  });

  it('plants the boulevards: Abuja’s arterial roads are lined with trees on both pavements', () => {
    // Abuja lies south of Lagos in the world frame (z > 1000 m), so its trees are the ones down there.
    const arterials = CITY_MAP.roadTiles.filter((tile) => tile.roadClass !== 'street' && tile.kind === 'straight' && tile.z > 1000);
    expect(arterials.length).toBeGreaterThan(50);
    const trees = plan.placements.nature.filter((placement) => placement.model.startsWith('tree_') && placement.z > 1000).length;
    expect(trees).toBeGreaterThan(arterials.length / 3);
  });
});
