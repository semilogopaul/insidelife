import { FUNERALS, FUNERAL_TIERS, type FuneralTier } from '@insidelife/shared';

/** Probate and court fees on what is left after the funeral. */
export const PROBATE_RATE = 0.05;

export interface EstateInput {
  readonly cash: number;
  readonly savings: number;
  /** Funeral cost at today's prices. */
  readonly funeralCost: number;
}

export interface EstateSettlement {
  readonly gross: number;
  readonly funeral: number;
  readonly probate: number;
  readonly inherited: number;
}

/** Cash + savings, minus the funeral (capped at what there is) and 5% probate on the remainder → the heir. */
export function settleEstate(input: EstateInput): EstateSettlement {
  const gross = Math.max(0, Math.round(input.cash)) + Math.max(0, Math.round(input.savings));
  const funeral = Math.min(gross, Math.max(0, Math.round(input.funeralCost)));
  const probate = Math.round((gross - funeral) * PROBATE_RATE);
  return { gross, funeral, probate, inherited: gross - funeral - probate };
}

/**
 * The burial the family insists on: the more clout you had, the bigger the send-off — but never more than half the
 * estate (the aunties will complain either way).
 */
export function funeralTierFor(status: number, gross: number, priceIndex: number): FuneralTier {
  const wanted: FuneralTier = status >= 450 ? 'celebration' : status >= 250 ? 'lagos-burial' : status >= 100 ? 'befitting' : 'simple';
  let tier: FuneralTier = 'simple';
  for (const candidate of FUNERAL_TIERS) {
    if (FUNERAL_TIERS.indexOf(candidate) > FUNERAL_TIERS.indexOf(wanted)) break;
    if (FUNERALS[candidate].cost * priceIndex <= gross * 0.5) tier = candidate;
  }
  return tier;
}
