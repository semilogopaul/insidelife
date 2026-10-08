import { findBusinessType, type BusinessTypeDefinition } from '@insidelife/shared';
import { ASSET_FLOOR, businessValuation, closureProceeds, saleMultiple, salePrice, saleRange, salvageValue, shouldFold, trailingAnnualProfit } from './valuation.js';

const ESTABLISHED = saleMultiple(50_000_000);

const type = (id: string): BusinessTypeDefinition => {
  const definition = findBusinessType(id);
  if (!definition) throw new RangeError(`missing business ${id}`);
  return definition;
};

describe('business valuation', () => {
  it('sells an established business for 2-3× trailing annual profit', () => {
    const range = saleRange(1_000_000, 8_000_000, 0, ESTABLISHED);
    expect(range).toEqual({ low: 16_000_000, high: 24_000_000 });
    expect(salePrice(1_000_000, 8_000_000, 0, ESTABLISHED, 0.5)).toBe(20_000_000);
  });

  it('values owner-run micro businesses at under a year of profit', () => {
    const kiosk = saleMultiple(350_000);
    expect(kiosk.max).toBeLessThanOrEqual(1);
    expect(businessValuation(100_000, 1_000_000, 0, kiosk)).toBe(750_000);
    expect(saleMultiple(5_000_000).max).toBeLessThan(ESTABLISHED.min + 0.01);
  });

  it('falls back to asset value when profits are thin, and nets off debt', () => {
    expect(salePrice(5_000_000, 1_000_000, 0, ESTABLISHED, 1)).toBe(5_000_000);
    expect(salePrice(5_000_000, 1_000_000, 2_000_000, ESTABLISHED, 1)).toBe(3_000_000);
    expect(salePrice(500_000, 0, 2_000_000, ESTABLISHED, 1)).toBe(0);
    expect(businessValuation(5_000_000, 0, 0, ESTABLISHED)).toBe(5_000_000);
  });

  it('depreciates assets to a floor', () => {
    const danfo = type('danfo-transport');
    expect(salvageValue(danfo, 18_000_000, 0)).toBe(Math.round(18_000_000 * danfo.assetShare));
    expect(salvageValue(danfo, 18_000_000, 2)).toBeLessThan(salvageValue(danfo, 18_000_000, 1));
    expect(salvageValue(danfo, 18_000_000, 100)).toBe(Math.round(18_000_000 * danfo.assetShare * ASSET_FLOOR));
  });

  it('needs three months of history before profits count', () => {
    expect(trailingAnnualProfit([100_000, 100_000])).toBe(0);
    expect(trailingAnnualProfit([100_000, 200_000, 300_000])).toBe(2_400_000);
    expect(trailingAnnualProfit(Array.from({ length: 24 }, (_, i) => (i < 12 ? 1_000_000 : 100_000)))).toBe(1_200_000);
  });

  it('fire-sells equipment on closure and folds over-indebted businesses', () => {
    expect(closureProceeds(1_000_000, 200_000)).toBe(400_000);
    expect(closureProceeds(100_000, 500_000)).toBeLessThan(0);
    expect(shouldFold(1_500_000, 3_000_000)).toBe(true);
    expect(shouldFold(1_000_000, 3_000_000)).toBe(false);
  });
});
