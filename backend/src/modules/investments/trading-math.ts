import { MICRO_UNITS_PER_UNIT, brokerFee, type InstrumentKind } from '@insidelife/shared';

/**
 * Pure order maths on integer micro-units and whole naira. Rounding always favours the house by less than ₦1
 * (buys round cost up, sells round proceeds down), so no sequence of trades can mint money from rounding.
 */

/** Guards float noise around exact integers (e.g. 99999.99999999999 → 100000) before ceil/floor. */
const nudge = (x: number): number => Math.max(1e-9, Math.abs(x) * 1e-12);
export const ceilMoney = (x: number): number => Math.ceil(x - nudge(x));
export const floorMoney = (x: number): number => Math.floor(x + nudge(x));

export type OrderSize = { readonly amountNaira: number } | { readonly microUnits: number };

export interface BuyQuote {
  readonly microUnits: number;
  /** Naira for the units (debited to the market). */
  readonly gross: number;
  /** Broker fee on top (to `system:fees`). */
  readonly fee: number;
}

export interface SellQuote {
  readonly microUnits: number;
  /** Naira proceeds before the fee. */
  readonly gross: number;
  readonly fee: number;
  /** Cost basis released by these units. */
  readonly costPortion: number;
  /** gross − fee − costPortion. */
  readonly realizedGain: number;
}

export function quoteBuy(kind: InstrumentKind, price: number, size: OrderSize): BuyQuote {
  const microUnits = 'amountNaira' in size ? Math.floor((size.amountNaira * MICRO_UNITS_PER_UNIT) / price) : size.microUnits;
  let gross = ceilMoney((microUnits * price) / MICRO_UNITS_PER_UNIT);
  if ('amountNaira' in size) gross = Math.min(gross, size.amountNaira);
  return { microUnits, gross, fee: brokerFee(kind, gross) };
}

/** `heldMicroUnits`/`costBasis` describe the current position; selling everything releases the whole basis. */
export function quoteSell(kind: InstrumentKind, price: number, heldMicroUnits: number, costBasis: number, size: OrderSize): SellQuote {
  const requested = 'amountNaira' in size ? Math.ceil((size.amountNaira * MICRO_UNITS_PER_UNIT) / price) : size.microUnits;
  const microUnits = Math.min(heldMicroUnits, requested);
  const gross = floorMoney((microUnits * price) / MICRO_UNITS_PER_UNIT);
  const fee = brokerFee(kind, gross);
  const costPortion = microUnits >= heldMicroUnits ? costBasis : Math.round((costBasis * microUnits) / heldMicroUnits);
  return { microUnits, gross, fee, costPortion, realizedGain: gross - fee - costPortion };
}

/** Decimal units → micro-units (input validated to ≤ 6 decimals). */
export const toMicroUnits = (units: number): number => Math.round(units * MICRO_UNITS_PER_UNIT);
export const fromMicroUnits = (microUnits: number): number => microUnits / MICRO_UNITS_PER_UNIT;
