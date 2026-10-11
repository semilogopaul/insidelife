import {
  INCOME_MULTIPLIER,
  CENTS_PER_DOLLAR,
  CUSTOM_TOPUP_ID,
  KOBO_PER_NAIRA,
  findTopupPackage,
  isValidUsdRateNgn,
  topupAmountProblem,
  topupRateFor,
  topupUsdAmountProblem,
  type PaymentCurrency,
  type TopupDetailsDto,
  type TopupPackageId,
} from '@insidelife/shared';

/** What a top-up checkout sells: the price (naira value and what is charged), the rate quoted and the game naira. */
export interface TopupQuote extends TopupDetailsDto {
  readonly subjectId: TopupPackageId | typeof CUSTOM_TOPUP_ID;
  /** Naira value: the naira price, or dollars × `ngnPerUsd`. */
  readonly priceNgn: number;
  readonly currency: PaymentCurrency;
  /** What is charged, in minor units of `currency` (kobo, cents). */
  readonly amountMinor: number;
  /** Whole dollars for a dollar top-up, else null. */
  readonly priceUsd: number | null;
  /** ₦ per $1 the dollar price was converted at (null for naira). */
  readonly ngnPerUsd: number | null;
}

export type QuoteResult = { readonly ok: true; readonly quote: TopupQuote } | { readonly ok: false; readonly reason: string };

export const CUSTOM_TOPUP_LABEL = 'Custom top-up';
export const DOLLAR_TOPUP_LABEL = 'Dollar top-up';

/**
 * Sanity bounds on a stored rate (game naira per real ₦1). Rates are validated against today's tiers when quoted;
 * at credit time the rate the server stored is trusted (tiers may have changed since), only checked against these.
 */
export const TOPUP_RATE_MIN = 1;
/** Top-up packs scale with the Lagos boom (INCOME_MULTIPLIER), so the bound does too. */
export const TOPUP_RATE_MAX = 2_000 * INCOME_MULTIPLIER;

export const isSaneTopupRate = (rate: number): boolean => Number.isSafeInteger(rate) && rate >= TOPUP_RATE_MIN && rate <= TOPUP_RATE_MAX;

export interface TopupLimits {
  /** Largest naira top-up (TOPUP_MAX_PER_PAYMENT_NGN). */
  readonly maxNgn: number;
  /** Dollar top-ups: the largest (TOPUP_MAX_PER_PAYMENT_USD) and today's ₦ per $1; null when dollars are off. */
  readonly usd: { readonly maxUsd: number; readonly ngnPerUsd: number } | null;
}

export interface TopupQuoteRequest {
  readonly currency?: PaymentCurrency;
  readonly packageId?: string;
  readonly amountNgn?: number;
  readonly amountUsd?: number;
}

/**
 * Quote a top-up. Naira: a pack or a custom whole-naira amount (exactly one). Dollars: whole dollars only, credited as
 * the same naira value would be (`topupVirtualAmountUsd`). The rate is the largest pack's whose price the naira value
 * reaches (`topupRateFor`), so a pack, a custom amount and a dollar amount worth the same all credit the same. Pure.
 */
export function quoteTopup(request: TopupQuoteRequest, limits: TopupLimits): QuoteResult {
  if ((request.currency ?? 'NGN') === 'USD') return quoteDollars(request, limits);
  if (request.amountUsd !== undefined) return { ok: false, reason: 'Choose dollars to pay a dollar amount' };
  const { maxNgn } = limits;
  if ((request.packageId === undefined) === (request.amountNgn === undefined)) {
    return { ok: false, reason: 'Pick a pack or enter an amount' };
  }
  if (request.packageId !== undefined) {
    const pack = findTopupPackage(request.packageId);
    if (!pack) return { ok: false, reason: 'That top-up pack doesn’t exist' };
    if (pack.priceNgn > maxNgn) return { ok: false, reason: topupAmountProblem(pack.priceNgn, maxNgn) ?? 'That pack isn’t available' };
    const rate = topupRateFor(pack.priceNgn);
    if (rate === null || !isSaneTopupRate(rate)) return { ok: false, reason: 'That pack isn’t available right now' };
    return { ok: true, quote: nairaQuote(pack.id, pack.id, pack.label, pack.priceNgn, rate) };
  }
  const amount = request.amountNgn ?? 0;
  const problem = topupAmountProblem(amount, maxNgn);
  if (problem) return { ok: false, reason: problem };
  const rate = topupRateFor(amount);
  if (rate === null || !isSaneTopupRate(rate)) return { ok: false, reason: 'Top-ups aren’t available right now' };
  return { ok: true, quote: nairaQuote(CUSTOM_TOPUP_ID, null, CUSTOM_TOPUP_LABEL, amount, rate) };
}

function nairaQuote(subjectId: TopupQuote['subjectId'], packageId: TopupPackageId | null, label: string, priceNgn: number, rate: number): TopupQuote {
  return {
    subjectId,
    packageId,
    label,
    priceNgn,
    ratePerNaira: rate,
    virtualAmount: priceNgn * rate,
    currency: 'NGN',
    amountMinor: priceNgn * KOBO_PER_NAIRA,
    priceUsd: null,
    ngnPerUsd: null,
  };
}

function quoteDollars(request: TopupQuoteRequest, limits: TopupLimits): QuoteResult {
  if (!limits.usd) return { ok: false, reason: 'Dollar payments aren’t available right now' };
  if (request.packageId !== undefined || request.amountNgn !== undefined) return { ok: false, reason: 'Packs are in naira: enter a dollar amount instead' };
  if (request.amountUsd === undefined) return { ok: false, reason: 'Enter a dollar amount' };
  const { maxUsd, ngnPerUsd } = limits.usd;
  const problem = topupUsdAmountProblem(request.amountUsd, maxUsd);
  if (problem) return { ok: false, reason: problem };
  if (!isValidUsdRateNgn(ngnPerUsd)) return { ok: false, reason: 'Dollar payments aren’t available right now' };
  const dollars = request.amountUsd;
  const priceNgn = dollars * ngnPerUsd;
  const rate = topupRateFor(priceNgn);
  if (rate === null || !isSaneTopupRate(rate)) return { ok: false, reason: 'Top-ups aren’t available right now' };
  return {
    ok: true,
    quote: {
      subjectId: CUSTOM_TOPUP_ID,
      packageId: null,
      label: DOLLAR_TOPUP_LABEL,
      priceNgn,
      ratePerNaira: rate,
      // = topupVirtualAmountUsd(dollars, ngnPerUsd): the same value in naira credits the same.
      virtualAmount: priceNgn * rate,
      currency: 'USD',
      amountMinor: dollars * CENTS_PER_DOLLAR,
      priceUsd: dollars,
      ngnPerUsd,
    },
  };
}

export interface TopupPaymentFacts {
  readonly subjectId: string;
  readonly currency: PaymentCurrency;
  /** Price quoted at checkout, minor units of `currency`. */
  readonly amountMinor: number;
  /** Real money verified as paid, minor units of `currency`; falls back to the price before verification. */
  readonly paidMinor: number | null;
  /** Dollar top-ups: the ₦ per $1 stored at checkout. */
  readonly ngnPerUsd: number | null;
  /** Rate stored at checkout (null on top-ups made before custom amounts: derived from the pack). */
  readonly topupRate: number | null;
}

export type CreditResult = { readonly ok: true; readonly credit: TopupDetailsDto } | { readonly ok: false; readonly reason: string };

/** Whole naira a verified payment is worth: kobo ÷ 100, or cents × the stored ₦ per $1 ÷ 100 (rounded down). */
export function paidNairaValue(payment: Pick<TopupPaymentFacts, 'currency' | 'amountMinor' | 'paidMinor' | 'ngnPerUsd'>): number | null {
  const paid = payment.paidMinor ?? payment.amountMinor;
  if (!Number.isSafeInteger(paid) || paid < 0) return null;
  if (payment.currency === 'NGN') return Math.floor(paid / KOBO_PER_NAIRA);
  if (payment.currency !== 'USD' || payment.ngnPerUsd === null || !isValidUsdRateNgn(payment.ngnPerUsd)) return null;
  return Math.floor((paid * payment.ngnPerUsd) / CENTS_PER_DOLLAR);
}

/**
 * What a top-up payment credits: the naira value of what Flutterwave verified (dollars at the ₦ per $1 stored at
 * checkout) × the rate the server stored at checkout. Never from the client, and never re-derived from today's packs,
 * tiers or exchange rate, so editing them can't strand a paid top-up; the stored rates only have to be sane. Top-ups
 * made before rates were stored use their pack's rate.
 */
export function topupCredit(payment: TopupPaymentFacts): CreditResult {
  const pack = payment.currency === 'NGN' ? findTopupPackage(payment.subjectId) : undefined;
  let rate = payment.topupRate;
  if (rate === null) {
    // Legacy rows (all naira): the pack (as it is now) must still match what was charged.
    if (!pack || pack.priceNgn * KOBO_PER_NAIRA !== payment.amountMinor) return { ok: false, reason: `No stored rate for top-up ${payment.subjectId}` };
    rate = pack.virtualAmount / pack.priceNgn;
  }
  if (!isSaneTopupRate(rate)) return { ok: false, reason: `Stored top-up rate ${rate} is out of bounds` };
  const paidNgn = paidNairaValue(payment);
  if (paidNgn === null) return { ok: false, reason: `Top-up ${payment.subjectId} has no valid ${payment.currency} amount or exchange rate` };
  const label = payment.currency === 'USD' ? DOLLAR_TOPUP_LABEL : (pack?.label ?? (payment.subjectId === CUSTOM_TOPUP_ID ? CUSTOM_TOPUP_LABEL : 'Top-up'));
  return { ok: true, credit: { packageId: pack?.id ?? null, label, ratePerNaira: rate, virtualAmount: paidNgn * rate } };
}
