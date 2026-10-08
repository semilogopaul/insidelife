import { BUSINESS_TYPES, DISTRICT_IDS, businessAllowedIn, findBusinessType } from '@insidelife/shared';
import { bestDistrict } from './rules/pnl.js';

describe('businesses catalog', () => {
  it('covers the Lagos business ladder from a ₦350k POS kiosk to a ₦300m filling station', () => {
    expect(findBusinessType('pos-kiosk')?.capital).toBe(350_000);
    expect(findBusinessType('danfo-transport')?.capital).toBe(18_000_000);
    expect(findBusinessType('filling-station')?.capital).toBe(300_000_000);
    expect(new Set(BUSINESS_TYPES.map((type) => type.id)).size).toBe(BUSINESS_TYPES.length);
  });

  it('keeps every model internally consistent', () => {
    for (const type of BUSINESS_TYPES) {
      expect(type.revenue.min, type.id).toBeLessThanOrEqual(type.revenue.median);
      expect(type.revenue.median, type.id).toBeLessThanOrEqual(type.revenue.max);
      expect(type.costs.rentShare + type.costs.fuelShare, type.id).toBeLessThanOrEqual(1);
      expect(type.costs.variableShare, type.id).toBeLessThan(1);
      const weights = Object.values(type.ownerWeights).reduce((sum, weight) => sum + (weight ?? 0), 0);
      expect(weights, type.id).toBeCloseTo(1, 5);
      expect(type.expansion.maxUnits, type.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps the poultry farm out of town', () => {
    const poultry = findBusinessType('poultry-farm');
    if (!poultry) throw new RangeError('missing poultry');
    expect(businessAllowedIn(poultry, 'epe')).toBe(true);
    expect(businessAllowedIn(poultry, 'ikoyi')).toBe(false);
    expect(DISTRICT_IDS.filter((district) => businessAllowedIn(poultry, district))).toContain(bestDistrict(poultry));
  });
});
