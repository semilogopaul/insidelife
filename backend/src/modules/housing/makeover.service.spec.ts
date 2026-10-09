import { NO_DECOR, decorQuote, exteriorQuote } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { GameRuleException } from '../../common/exceptions/domain.exception.js';
import type { SimulationContext } from '../simulation/simulation-context.js';
import type { BuildingEntity } from './entities/building.entity.js';
import type { LeaseEntity } from './entities/lease.entity.js';
import type { PropertyEntity } from './entities/property.entity.js';
import type { HomeService, HomeState } from './home.service.js';
import type { HousingStore } from './housing.store.js';
import { MakeoverService } from './makeover.service.js';

const PRICE_INDEX = 1.1;

/** The service with an in-memory store, home and wallet. */
function harness(
  home: Partial<HomeState>,
  building: Partial<BuildingEntity> | null = {
    id: 'b1',
    propertyId: 'p1',
    blueprintId: 'duplex',
    status: 'complete',
    condition: 80,
    exterior: null,
    interior: null,
  },
) {
  const payments: { amount: number; key: string }[] = [];
  const saved: unknown[] = [];
  const property = { id: 'p1', label: '14 Admiralty Way', status: 'owned' } as PropertyEntity;
  const lease = { id: 'l1', decor: null } as unknown as LeaseEntity;
  const buildings = building ? [building as BuildingEntity] : [];
  const store = {
    property: async () => property,
    portfolio: async () => ({ properties: [property], buildings, sales: [] }),
    buildingOf: () => buildings[0] ?? null,
    lease: async () => lease,
    save: async (_ctx: unknown, entity: unknown) => {
      saved.push(entity);
      return entity;
    },
  } as unknown as HousingStore;
  const homes = {
    current: async () => ({
      label: 'Mini flat, Yaba',
      bedrooms: 2,
      decor: NO_DECOR,
      leaseId: 'l1',
      buildingId: 'b1',
      ...home,
    }),
  } as unknown as HomeService;
  const ctx = {
    time: 5_000,
    world: { economy: () => ({ priceIndex: PRICE_INDEX }) },
    wallet: {
      pay: async (amount: number, _kind: string, _memo: string, key: string) =>
        void payments.push({ amount, key }),
    },
    notify: () => undefined,
    invalidate: () => undefined,
  } as unknown as SimulationContext;
  return { service: new MakeoverService(store, homes), ctx, payments, saved, lease, building: buildings[0] };
}

describe('MakeoverService', () => {
  it('paints, re-roofs and names a finished house, charging only the changes at today’s prices', async () => {
    const { service, ctx, payments, building } = harness({});
    const { quote } = await service.exterior(ctx, 'p1', {
      paint: 'sky',
      roof: 'charcoal',
      name: '  Bakare Lodge ',
    });
    expect(quote.total).toBe(
      exteriorQuote(
        'duplex',
        { paint: null, roof: null, gate: null, name: null },
        { paint: 'sky', roof: 'charcoal', name: 'Bakare Lodge' },
        PRICE_INDEX,
      ).total,
    );
    expect(payments).toEqual([{ amount: quote.total, key: 'makeover:b1:5000' }]);
    expect(building?.exterior).toEqual({ paint: 'sky', roof: 'charcoal', gate: null, name: 'Bakare Lodge' });
    expect(building?.condition).toBe(85);
  });

  it('refuses a no-op and an unfinished house', async () => {
    const done = harness(
      {},
      {
        id: 'b1',
        blueprintId: 'duplex',
        status: 'complete',
        condition: 90,
        exterior: { paint: 'sky', roof: null, gate: null, name: null },
      },
    );
    await expect(done.service.exterior(done.ctx, 'p1', { paint: 'sky' })).rejects.toThrow(GameRuleException);
    const site = harness(
      {},
      { id: 'b1', blueprintId: 'duplex', status: 'under-construction', condition: 100, exterior: null },
    );
    await expect(site.service.exterior(site.ctx, 'p1', { paint: 'sky' })).rejects.toThrow(
      'no finished house',
    );
    expect(done.payments).toHaveLength(0);
  });

  it('redecorates a rented flat on the lease, an owned house on the building', async () => {
    const rented = harness({ ownership: 'rented' });
    const { quote } = await rented.service.decor(rented.ctx, { paint: 'teal', floor: 'ceramic' });
    expect(quote.total).toBe(decorQuote(2, NO_DECOR, { paint: 'teal', floor: 'ceramic' }, PRICE_INDEX).total);
    expect(rented.lease.decor).toEqual({ paint: 'teal', floor: 'ceramic' });

    const owned = harness({ ownership: 'owned' });
    await owned.service.decor(owned.ctx, { floor: 'marble' });
    expect(owned.building?.interior).toEqual({ paint: null, floor: 'marble' });
  });

  it('won’t repaint the family house', async () => {
    const family = harness({ ownership: 'family' });
    await expect(family.service.decor(family.ctx, { paint: 'teal' })).rejects.toThrow('isn’t your house');
    expect(family.payments).toHaveLength(0);
  });
});
