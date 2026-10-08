import { FUNERALS } from '@insidelife/shared';
import { PROBATE_RATE, funeralTierFor, settleEstate } from './estate.rules.js';

describe('succession estate maths', () => {
  it('pays the funeral, then 5% probate on the rest, and the heir inherits the remainder', () => {
    const estate = settleEstate({ cash: 10_000_000, savings: 5_000_000, funeralCost: 6_000_000 });
    expect(estate.gross).toBe(15_000_000);
    expect(estate.funeral).toBe(6_000_000);
    expect(estate.probate).toBe(Math.round(9_000_000 * PROBATE_RATE));
    expect(estate.inherited).toBe(15_000_000 - 6_000_000 - 450_000);
  });

  it('always balances to the gross and never goes negative', () => {
    for (const [cash, savings, funeralCost] of [
      [0, 0, 1_500_000],
      [800_000, 0, 1_500_000],
      [1_234_567, 89_123, 1_500_000],
      [5_000_000_000, 2_000_000_000, 35_000_000],
    ] as const) {
      const estate = settleEstate({ cash, savings, funeralCost });
      expect(estate.funeral + estate.probate + estate.inherited).toBe(estate.gross);
      expect(estate.inherited).toBeGreaterThanOrEqual(0);
      expect(estate.funeral).toBeLessThanOrEqual(estate.gross);
    }
  });

  it('caps the funeral at what the estate holds', () => {
    const estate = settleEstate({ cash: 900_000, savings: 0, funeralCost: 1_500_000 });
    expect(estate).toEqual({ gross: 900_000, funeral: 900_000, probate: 0, inherited: 0 });
  });

  it('gives bigger burials to people with clout — but never more than half the estate', () => {
    expect(funeralTierFor(500, 1_000_000_000, 1)).toBe('celebration');
    expect(funeralTierFor(500, 20_000_000, 1)).toBe('befitting');
    expect(funeralTierFor(50, 1_000_000_000, 1)).toBe('simple');
    expect(funeralTierFor(300, 0, 1)).toBe('simple');
    const tier = funeralTierFor(300, 40_000_000, 1);
    expect(FUNERALS[tier].cost).toBeLessThanOrEqual(20_000_000);
  });
});
