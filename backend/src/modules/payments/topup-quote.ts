import {
  CUSTOM_TOPUP_ID,
  KOBO_PER_NAIRA,
  findTopupPackage,
  topupAmountProblem,
  topupRateFor,
  type TopupDetailsDto,
  type TopupPackageId,
} from '@insidelife/shared';

/** What a top-up checkout sells: the price, the rate quoted for it and the game naira that buys. */
export interface TopupQuote extends TopupDetailsDto {
  readonly subjectId: TopupPackageId | typeof CUSTOM_TOPUP_ID;
  readonly priceNgn: number;
}

export type QuoteResult = { readonly ok: true; readonly quote: TopupQuote } | { readonly ok: false; readonly reason: string };

export const CUSTOM_TOPUP_LABEL = 'Custom top-up';

/**
 * Sanity bounds on a stored rate (game naira per real ₦1). Rates are validated against today's tiers when quoted;
 * at credit time the rate the server stored is trusted (tiers may have changed since), only checked against these.
 */
export const TOPUP_RATE_MIN = 1;
export const TOPUP_RATE_MAX = 2_000;

export const isSaneTopupRate = (rate: number): boolean => Number.isSafeInteger(rate) && rate >= TOPUP_RATE_MIN && rate <= TOPUP_RATE_MAX;

/**
 * Quote a pack or a custom whole-naira amount (exactly one). The rate is the largest pack's whose price the amount
 * reaches (`topupRateFor`), so a pack and a custom amount at the same price credit the same. Pure.
 */
export function quoteTopup(request: { readonly packageId?: string; readonly amountNgn?: number }, maxNgn: number): QuoteResult {
  if ((request.packageId === undefined) === (request.amountNgn === undefined)) {
    return { ok: false, reason: 'Pick a pack or enter an amount' };
  }
  if (request.packageId !== undefined) {
    const pack = findTopupPackage(request.packageId);
    if (!pack) return { ok: false, reason: 'That top-up pack doesn’t exist' };
    if (pack.priceNgn > maxNgn) return { ok: false, reason: topupAmountProblem(pack.priceNgn, maxNgn) ?? 'That pack isn’t available' };
    const rate = topupRateFor(pack.priceNgn);
    if (rate === null || !isSaneTopupRate(rate)) return { ok: false, reason: 'That pack isn’t available right now' };
    return { ok: true, quote: { subjectId: pack.id, packageId: pack.id, label: pack.label, priceNgn: pack.priceNgn, ratePerNaira: rate, virtualAmount: pack.priceNgn * rate } };
  }
  const amount = request.amountNgn ?? 0;
  const problem = topupAmountProblem(amount, maxNgn);
  if (problem) return { ok: false, reason: problem };
  const rate = topupRateFor(amount);
  if (rate === null || !isSaneTopupRate(rate)) return { ok: false, reason: 'Top-ups aren’t available right now' };
  return { ok: true, quote: { subjectId: CUSTOM_TOPUP_ID, packageId: null, label: CUSTOM_TOPUP_LABEL, priceNgn: amount, ratePerNaira: rate, virtualAmount: amount * rate } };
}

export interface TopupPaymentFacts {
  readonly subjectId: string;
  /** Price quoted at checkout. */
  readonly amountKobo: number;
  /** Real money verified as paid; falls back to the price before verification. */
  readonly paidKobo: number | null;
  /** Rate stored at checkout (null on top-ups made before custom amounts: derived from the pack). */
  readonly topupRate: number | null;
}

export type CreditResult = { readonly ok: true; readonly credit: TopupDetailsDto } | { readonly ok: false; readonly reason: string };

/**
 * What a top-up payment credits: the real naira Flutterwave verified × the rate the server stored at checkout. Never
 * from the client, and never re-derived from today's packs or tiers, so editing them can't strand a paid top-up; the
 * stored rate only has to be sane. Top-ups made before rates were stored use their pack's rate.
 */
export function topupCredit(payment: TopupPaymentFacts): CreditResult {
  const pack = findTopupPackage(payment.subjectId);
  let rate = payment.topupRate;
  if (rate === null) {
    // Legacy rows: the pack (as it is now) must still match what was charged.
    if (!pack || pack.priceNgn * KOBO_PER_NAIRA !== payment.amountKobo) return { ok: false, reason: `No stored rate for top-up ${payment.subjectId}` };
    rate = pack.virtualAmount / pack.priceNgn;
  }
  if (!isSaneTopupRate(rate)) return { ok: false, reason: `Stored top-up rate ${rate} is out of bounds` };
  const paidNgn = Math.floor((payment.paidKobo ?? payment.amountKobo) / KOBO_PER_NAIRA);
  const label = pack?.label ?? (payment.subjectId === CUSTOM_TOPUP_ID ? CUSTOM_TOPUP_LABEL : 'Top-up');
  return { ok: true, credit: { packageId: pack?.id ?? null, label, ratePerNaira: rate, virtualAmount: paidNgn * rate } };
}
