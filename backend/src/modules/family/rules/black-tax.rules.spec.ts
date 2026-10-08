import { BLACK_TAX, BLACK_TAX_REASONS, BACKGROUND_IDS, createRng } from '@insidelife/shared';
import { BLACK_TAX_MAX_CHANCE, blackTaxAmount, blackTaxChance, pickBlackTaxReason } from './black-tax.rules.js';

describe('black tax', () => {
  const incomes = [0, 70_000, 450_000, 2_000_000, 25_000_000, 500_000_000];
  const cashes = [0, 50_000, 5_000_000, 900_000_000_000];

  it('keeps the monthly chance between 0 and the cap', () => {
    for (const background of BACKGROUND_IDS) {
      for (const monthlyIncome of incomes) {
        for (const cash of cashes) {
          const chance = blackTaxChance({ background, monthlyIncome, cash, age: 30 });
          expect(chance).toBeGreaterThan(0);
          expect(chance).toBeLessThanOrEqual(BLACK_TAX_MAX_CHANCE);
        }
      }
    }
  });

  it('asks Sapa families more often than Nepo families', () => {
    const profile = { monthlyIncome: 300_000, cash: 200_000, age: 28 };
    expect(blackTaxChance({ background: 'sapa-pikin', ...profile })).toBeGreaterThan(blackTaxChance({ background: 'working-class', ...profile }));
    expect(blackTaxChance({ background: 'working-class', ...profile })).toBeGreaterThan(blackTaxChance({ background: 'nepo-baby', ...profile }));
  });

  it('rings more as visible wealth grows, and less for teenagers', () => {
    const base = { background: 'working-class' as const, cash: 0, age: 30 };
    let previous = 0;
    for (const monthlyIncome of incomes) {
      const chance = blackTaxChance({ ...base, monthlyIncome });
      expect(chance).toBeGreaterThanOrEqual(previous);
      previous = chance;
    }
    expect(blackTaxChance({ ...base, monthlyIncome: 100_000, age: 17 })).toBeLessThan(blackTaxChance({ ...base, monthlyIncome: 100_000 }));
  });

  it('keeps every ask inside its reason’s bounds and scales with income', () => {
    for (const reason of BLACK_TAX_REASONS) {
      const { min, max } = BLACK_TAX[reason];
      for (const monthlyIncome of incomes) {
        for (const cash of cashes) {
          for (const priceIndex of [0.85, 1, 1.35]) {
            const amount = blackTaxAmount(reason, monthlyIncome, cash, priceIndex);
            expect(amount).toBeGreaterThanOrEqual(min);
            expect(amount).toBeLessThanOrEqual(max);
            expect(Number.isInteger(amount)).toBe(true);
          }
        }
      }
      expect(blackTaxAmount(reason, 2_000_000, 0, 1)).toBeGreaterThanOrEqual(blackTaxAmount(reason, 100_000, 0, 1));
    }
  });

  it('only picks requests that make sense for who is alive', () => {
    for (let i = 0; i < 300; i++) {
      const reason = pickBlackTaxReason(createRng(`reason:${i}`), { mother: false, father: false, youngSibling: false });
      expect(['uncle-business', 'village-levy']).toContain(reason);
    }
    const seen = new Set(Array.from({ length: 500 }, (_, i) => pickBlackTaxReason(createRng(`all:${i}`), { mother: true, father: true, youngSibling: true })));
    expect(seen.size).toBe(BLACK_TAX_REASONS.length);
  });
});
