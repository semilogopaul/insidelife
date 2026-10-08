import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, MINUTES_PER_HOUR, findProduct, fromDateParts, type ShopProduct } from '@insidelife/shared';
import {
  conditionNow,
  deliveryArrival,
  inStoreVenue,
  itemRepairCost,
  onlineDeliveryFee,
  resaleOffer,
  type ShopperPosition,
} from './purchase.rules.js';

const product = (id: string): ShopProduct => {
  const found = findProduct(id);
  if (!found) throw new RangeError(`missing product ${id}`);
  return found;
};
const at = (locationId: string, hour = 12, travelling = false): ShopperPosition => ({ locationId, hour, travelling });

describe('in-store purchase location rules', () => {
  it('sells gadgets at Computer Village but not clothes', () => {
    expect(inStoreVenue(at('computer-village'), product('phone-iphone-17-pro-max'))?.id).toBe('computer-village');
    expect(inStoreVenue(at('computer-village'), product('laptop-hp-uk'))?.id).toBe('computer-village');
    expect(inStoreVenue(at('computer-village'), product('okrika-white-tee'))).toBeNull();
  });

  it('sells okrika at Yaba market and market-tier fabrics at Balogun', () => {
    expect(inStoreVenue(at('yaba-market'), product('okrika-vintage-tee'))?.id).toBe('yaba-market');
    expect(inStoreVenue(at('yaba-market'), product('ankara-buba-iro'))).toBeNull();
    expect(inStoreVenue(at('balogun-market'), product('ankara-buba-iro'))?.id).toBe('balogun-market');
    expect(inStoreVenue(at('balogun-market'), product('okrika-vintage-tee'))).toBeNull();
  });

  it('lets malls sell every item category but keeps designer clothes at Lekki', () => {
    expect(inStoreVenue(at('ikeja-city-mall'), product('tv-55'))?.id).toBe('ikeja-city-mall');
    expect(inStoreVenue(at('ikeja-city-mall'), product('fan-standing'))?.id).toBe('ikeja-city-mall');
    expect(inStoreVenue(at('ikeja-city-mall'), product('aso-oke-agbada'))).toBeNull();
    expect(inStoreVenue(at('lekki-mall'), product('aso-oke-agbada'))?.id).toBe('lekki-mall');
    expect(inStoreVenue(at('lekki-mall'), product('bed-super-king'))?.id).toBe('lekki-mall');
  });

  it('keeps generic markets to cheaper basics', () => {
    expect(inStoreVenue(at('mushin-market'), product('gen-small'))?.id).toBe('mushin-market');
    expect(inStoreVenue(at('mushin-market'), product('ac-split'))).toBeNull();
    expect(inStoreVenue(at('mushin-market'), product('tv-32'))).toBeNull();
  });

  it('falls back to online when on the road, at home, outside or after closing', () => {
    expect(inStoreVenue(at('computer-village', 12, true), product('tv-32'))).toBeNull();
    expect(inStoreVenue(at('home:abc'), product('tv-32'))).toBeNull();
    expect(inStoreVenue(at('street:ikeja'), product('tv-32'))).toBeNull();
    expect(inStoreVenue(at('computer-village', 20), product('tv-32'))).toBeNull();
  });

  it('never sells event-only items on shelves', () => {
    expect(inStoreVenue(at('computer-village'), product('phone-iphone-clone'))).toBeNull();
  });
});

describe('online orders', () => {
  it('charges a 10% delivery fee', () => {
    expect(onlineDeliveryFee(170_000)).toBe(17_000);
  });

  it('delivers at the next midnight before noon, otherwise the midnight after', () => {
    const day = fromDateParts({ year: 2027, month: 3, day: 10, hour: 0 });
    expect(deliveryArrival(day + 9 * MINUTES_PER_HOUR)).toBe(day + MINUTES_PER_DAY);
    expect(deliveryArrival(day + 15 * MINUTES_PER_HOUR)).toBe(day + 2 * MINUTES_PER_DAY);
  });
});

describe('resale, repair and wear', () => {
  it('buyers pay 30-60% of the shelf price, less for worn items', () => {
    expect(resaleOffer(100_000, 100, 0)).toBe(30_000);
    expect(resaleOffer(100_000, 100, 1)).toBe(60_000);
    expect(resaleOffer(100_000, 50, 1)).toBe(45_000);
    expect(resaleOffer(100_000, 0, 1)).toBe(30_000);
  });

  it('prices repairs by missing condition and skips items in top shape', () => {
    expect(itemRepairCost(200_000, 100)).toBeNull();
    expect(itemRepairCost(200_000, 50)).toBe(35_000);
  });

  it('wears linearly per day and never below zero', () => {
    expect(conditionNow(100, 0, 10 * MINUTES_PER_DAY, 0.5)).toBe(95);
    expect(conditionNow(10, 0, 100 * MINUTES_PER_DAY, 0.5)).toBe(0);
  });
});
