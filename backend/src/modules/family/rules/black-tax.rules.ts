import { BLACK_TAX, BLACK_TAX_BASE_CHANCE, type BackgroundId, type BlackTaxReason, type Rng } from '@insidelife/shared';

export interface BlackTaxProfile {
  readonly background: BackgroundId;
  /** Monthly income from jobs and businesses (₦). */
  readonly monthlyIncome: number;
  /** Cash in hand (₦) — visible wealth. */
  readonly cash: number;
  readonly age: number;
}

export const BLACK_TAX_MAX_CHANCE = 0.9;

/**
 * Monthly chance the family asks for money: Sapa families ask most; visible wealth (income, cash) makes the phone ring
 * more; teenagers get asked less.
 */
export function blackTaxChance(profile: BlackTaxProfile): number {
  const base = BLACK_TAX_BASE_CHANCE[profile.background];
  const visible = Math.max(0, profile.monthlyIncome) + Math.max(0, profile.cash) * 0.02;
  const wealthBoost = Math.min(0.3, 0.06 * Math.log10(1 + visible / 50_000));
  const ageFactor = profile.age < 18 ? 0.4 : profile.age < 22 ? 0.7 : 1;
  return Math.max(0, Math.min(BLACK_TAX_MAX_CHANCE, (base + wealthBoost) * ageFactor));
}

/** Amount asked: a base need plus a share of what the family thinks you earn, within the reason's bounds. */
export function blackTaxAmount(reason: BlackTaxReason, monthlyIncome: number, cash: number, priceIndex: number): number {
  const definition = BLACK_TAX[reason];
  const visible = Math.max(0, monthlyIncome) + Math.max(0, cash) * 0.01;
  const raw = definition.base * priceIndex + definition.incomeShare * visible;
  const rounded = Math.round(raw / 1_000) * 1_000;
  return Math.max(definition.min, Math.min(definition.max, rounded));
}

export interface FamilyAvailability {
  readonly mother: boolean;
  readonly father: boolean;
  readonly youngSibling: boolean;
}

/** Pick a reason that makes sense for who is alive in the family. */
export function pickBlackTaxReason(rng: Rng, family: FamilyAvailability): BlackTaxReason {
  const options = Object.values(BLACK_TAX).filter((definition) => {
    switch (definition.needs) {
      case 'mother':
        return family.mother;
      case 'father':
        return family.father;
      case 'parent':
        return family.mother || family.father;
      case 'young-sibling':
        return family.youngSibling;
      default:
        return true;
    }
  });
  return rng.weighted(options.map((definition) => ({ value: definition.id, weight: definition.weight })));
}
