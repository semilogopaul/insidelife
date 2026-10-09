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
    const rate = topupRateFor(pack.priceNgn) ?? 0;
    return { ok: true, quote: { subjectId: pack.id, packageId: pack.id, label: pack.label, priceNgn: pack.priceNgn, ratePerNaira: rate, virtualAmount: pack.priceNgn * rate } };
  }
  const amount = request.amountNgn ?? 0;
  const problem = topupAmountProblem(amount, maxNgn);
  if (problem) return { ok: false, reason: problem };
  const rate = topupRateFor(amount) ?? 0;
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
 * What a top-up payment credits: the real naira Flutterwave verified × the rate stored at checkout. Never from the
 * client. Refuses a row whose stored rate isn't the one the server quotes for its price (a corrupted or forged row).
 */
export function topupCredit(payment: TopupPaymentFacts): CreditResult {
  const pack = findTopupPackage(payment.subjectId);
  if (!pack && payment.subjectId !== CUSTOM_TOPUP_ID) return { ok: false, reason: `Unknown top-up ${payment.subjectId}` };
  const priceNgn = payment.amountKobo / KOBO_PER_NAIRA;
  if (pack && pack.priceNgn !== priceNgn) return { ok: false, reason: 'Paid amount does not match the pack price' };
  const rate = payment.topupRate ?? (pack ? pack.virtualAmount / pack.priceNgn : null);
  if (rate === null || rate !== topupRateFor(priceNgn)) return { ok: false, reason: 'The stored top-up rate does not match the price' };
  const paidNgn = Math.floor((payment.paidKobo ?? payment.amountKobo) / KOBO_PER_NAIRA);
  return {
    ok: true,
    credit: { packageId: pack?.id ?? null, label: pack?.label ?? CUSTOM_TOPUP_LABEL, ratePerNaira: rate, virtualAmount: paidNgn * rate },
  };
}
