import {
  DEPOSIT_PRODUCTS,
  MINUTES_PER_DAY,
  MIN_ORDER_NAIRA,
  brokerFee,
  formatNaira,
  quoteFx,
  simpleInterest,
  withholdingTax,
  type DepositProductId,
  type FxSide,
  type GameMinute,
  type InstrumentKind,
} from '@insidelife/shared';

/**
 * Client previews for trades, deposits and FX, built on the shared catalog maths the server uses. The server re-prices
 * everything at execution; these only tell the player what to expect.
 */

// ----- Formatting ------------------------------------------------------------------------------------------------

const unitPrice = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Instrument prices carry kobo: 23.9 → "₦23.90"; big crypto prices stay whole: 98,450,120 → "₦98,450,120". */
export function formatUnitPrice(price: number): string {
  if (Math.abs(price) >= 100_000) return `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(price)}`;
  return `₦${unitPrice.format(price)}`;
}

/** 0.0123 → "+1.23%", -0.4 → "−40%". Always signed so direction is never colour-only. */
export function formatChange(ratio: number, digits = 2): string {
  const value = Math.abs(ratio * 100);
  const text = value >= 100 ? value.toFixed(0) : value.toFixed(digits);
  if (ratio > 0) return `+${text}%`;
  if (ratio < 0) return `−${text}%`;
  return `${(0).toFixed(digits)}%`;
}

/** Units with up to 6 decimals, trimmed: 12.5 → "12.5", 0.000123 → "0.000123". */
export function formatUnits(units: number): string {
  return new Intl.NumberFormat('en-NG', { maximumFractionDigits: units < 1 ? 6 : units < 1000 ? 4 : 2 }).format(units);
}

// ----- Trades ----------------------------------------------------------------------------------------------------

export interface TradePreview {
  readonly units: number;
  /** Naira for the units before the fee. */
  readonly gross: number;
  readonly fee: number;
  /** Buy: what leaves your cash (gross + fee). Sell: what lands (gross − fee). */
  readonly net: number;
  readonly problem: string | null;
}

export interface TradeContext {
  readonly side: 'buy' | 'sell';
  readonly kind: InstrumentKind;
  readonly price: number;
  readonly cash: number;
  /** Units held (sells). */
  readonly heldUnits: number;
}

/** Preview of a market order sized in naira (mirrors the server's floor/ceil so the player is never surprised). */
export function previewTrade(amount: number | null, context: TradeContext): TradePreview {
  const naira = amount ?? 0;
  if (naira <= 0 || context.price <= 0) return { units: 0, gross: 0, fee: 0, net: 0, problem: null };
  if (context.side === 'buy') {
    const units = Math.floor((naira / context.price) * 1e6) / 1e6;
    const gross = Math.min(naira, Math.ceil(units * context.price));
    const fee = brokerFee(context.kind, gross);
    const net = gross + fee;
    const problem = naira < MIN_ORDER_NAIRA ? `The smallest order is ${formatNaira(MIN_ORDER_NAIRA)}.` : net > context.cash ? 'Not enough cash, fee included.' : null;
    return { units, gross, fee, net, problem };
  }
  const requested = Math.ceil((naira / context.price) * 1e6) / 1e6;
  const units = Math.min(context.heldUnits, requested);
  const gross = Math.floor(units * context.price);
  const fee = brokerFee(context.kind, gross);
  const net = gross - fee;
  const problem =
    context.heldUnits <= 0 ? 'You don’t own any yet.' : naira < MIN_ORDER_NAIRA ? `The smallest order is ${formatNaira(MIN_ORDER_NAIRA)}.` : net <= 0 ? 'Too small to cover the broker fee.' : null;
  return { units, gross, fee, net, problem };
}

// ----- Deposits --------------------------------------------------------------------------------------------------

export interface DepositPreview {
  readonly grossInterest: number;
  readonly tax: number;
  /** Principal + interest − tax at maturity (fixed tenors), or a 30-day estimate for open-ended funds. */
  readonly payout: number;
  readonly maturesAt: GameMinute | null;
  /** What breaking right after buying would cost (principal × rate). */
  readonly earlyBreakPenalty: number;
  readonly problem: string | null;
}

/** Projected outcome of a deposit opened now. Open-ended products project 30 days. */
export function previewDeposit(product: DepositProductId, amount: number | null, annualRate: number, tenorDays: number | null, now: GameMinute): DepositPreview {
  const spec = DEPOSIT_PRODUCTS[product];
  const principal = amount ?? 0;
  const days = tenorDays ?? 30;
  const grossInterest = Math.floor(simpleInterest(principal, annualRate, days));
  const tax = withholdingTax(grossInterest);
  const problem =
    principal <= 0
      ? null
      : principal < spec.minAmount
        ? `${spec.label}s start from ${formatNaira(spec.minAmount)}.`
        : principal > spec.maxAmount
          ? `${spec.label}s go up to ${formatNaira(spec.maxAmount)}.`
          : null;
  return {
    grossInterest,
    tax,
    payout: principal + grossInterest - tax,
    maturesAt: tenorDays === null ? null : now + tenorDays * MINUTES_PER_DAY,
    earlyBreakPenalty: Math.round(principal * spec.earlyBreakPenaltyRate),
    problem,
  };
}

/** Plain-words explainer for each product. */
export const DEPOSIT_EXPLAINERS: Readonly<Record<DepositProductId, { readonly title: string; readonly line: string }>> = {
  tbill: { title: 'Treasury bills', line: 'Lend to the Federal Government, collect your interest at maturity. The safest return in Lagos.' },
  'fixed-deposit': { title: 'Fixed deposit', line: 'Lock money with your bank for a fixed rate. Simple, steady, a little below T-bills.' },
  'money-market': { title: 'Money-market fund', line: 'Daily interest, take it out any time. Good for money you might need soon.' },
};

// ----- FX --------------------------------------------------------------------------------------------------------

export interface FxPreview {
  readonly usdCents: number;
  readonly naira: number;
  /** Naira per dollar applied (spread included). */
  readonly rate: number;
}

/** Buy: naira in → dollars out. Sell: dollars (cents) in → naira out. Same integer maths as the desk. */
export function previewFx(side: FxSide, amount: number | null, midRate: number): FxPreview | null {
  if (amount === null || amount <= 0 || midRate <= 0) return null;
  const quote = side === 'buy-usd' ? quoteFx(side, { naira: amount }, midRate) : quoteFx(side, { usdCents: amount }, midRate);
  return { usdCents: quote.usdCents, naira: quote.naira, rate: quote.rateKobo / 100 };
}

/** "12.50" / "$12.50" → 1250 cents (two decimals max). Empty → null. */
export function parseUsdInput(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const [whole = '', fraction = ''] = cleaned.split('.');
  const cents = Number(whole || '0') * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
