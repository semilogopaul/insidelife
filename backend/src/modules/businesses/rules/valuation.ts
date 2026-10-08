import type { BusinessTypeDefinition } from '@insidelife/shared';

export interface SaleMultiple {
  readonly min: number;
  readonly max: number;
}

/**
 * Buyers pay a multiple of trailing annual profit for a going concern. Owner-run micro businesses (a POS stand, a
 * buka) are mostly the owner's own labour, so they fetch under a year's profit; only established firms fetch 2-3×.
 * Keeps paper valuations from inflating net worth (and the rich list) faster than real cash.
 */
export function saleMultiple(investedCapital: number): SaleMultiple {
  if (investedCapital < 2_000_000) return { min: 0.5, max: 1 };
  if (investedCapital < 20_000_000) return { min: 1, max: 2 };
  return { min: 2, max: 3 };
}
/** Months of P&L needed before profit history counts for a valuation. */
export const MIN_HISTORY_MONTHS = 3;
/** Assets never depreciate below this share of their original value. */
export const ASSET_FLOOR = 0.3;
/** Shutting down sells equipment at a fire-sale discount. */
export const CLOSURE_DISCOUNT = 0.6;
/** Debts beyond this share of invested capital fold the business. */
export const FOLD_DEBT_RATIO = 0.4;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Recoverable value of equipment, stock and property after depreciation. */
export function salvageValue(type: BusinessTypeDefinition, investedCapital: number, yearsOwned: number): number {
  const remaining = Math.max(ASSET_FLOOR, 1 - type.depreciationPerYear * Math.max(0, yearsOwned));
  return Math.round(investedCapital * type.assetShare * remaining);
}

/** Annualised profit from up to the last 12 monthly results (0 until there is enough history). */
export function trailingAnnualProfit(monthlyProfits: readonly number[]): number {
  const recent = monthlyProfits.slice(-12);
  if (recent.length < MIN_HISTORY_MONTHS) return 0;
  return Math.round((recent.reduce((sum, value) => sum + value, 0) / recent.length) * 12);
}

/** Price a buyer pays: the better of asset value and the profit multiple, minus debts the buyer takes on. */
export function salePrice(salvage: number, trailingProfit: number, debt: number, multiple: SaleMultiple, multipleDraw: number): number {
  const factor = multiple.min + (multiple.max - multiple.min) * clamp(multipleDraw, 0, 1);
  return Math.max(0, Math.round(Math.max(salvage, factor * Math.max(0, trailingProfit)) - debt));
}

export function saleRange(salvage: number, trailingProfit: number, debt: number, multiple: SaleMultiple): { readonly low: number; readonly high: number } {
  return { low: salePrice(salvage, trailingProfit, debt, multiple, 0), high: salePrice(salvage, trailingProfit, debt, multiple, 1) };
}

/** What the business adds to net worth (mid-point sale value). */
export function businessValuation(salvage: number, trailingProfit: number, debt: number, multiple: SaleMultiple): number {
  return salePrice(salvage, trailingProfit, debt, multiple, 0.5);
}

/** Net cash from shutting down: fire-sale salvage minus debts (negative = you still owe). */
export function closureProceeds(salvage: number, debt: number): number {
  return Math.round(salvage * CLOSURE_DISCOUNT) - debt;
}

export function shouldFold(debt: number, investedCapital: number): boolean {
  return debt > investedCapital * FOLD_DEBT_RATIO;
}
