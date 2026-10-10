import {
  formatNaira,
  formatUsdCents,
  topupAmountProblem,
  topupRateFor,
  topupUsdAmountProblem,
  topupVirtualAmountUsd,
  type TopupCatalogDto,
  type TopupUsdCatalogDto,
} from '@insidelife/shared';

/**
 * Live preview of a custom top-up as the player types, using the shared rule (`topupRateFor`: the rate of the largest
 * pack the amount reaches). The server quotes the same and credits what Flutterwave verifies; this is display only.
 */
export interface TopupAmountPreview {
  readonly amountNgn: number | null;
  /** Game naira per real ₦1 (null below the minimum). */
  readonly ratePerNaira: number | null;
  /** In-game naira this amount buys (null when it can't be bought). */
  readonly virtualAmount: number | null;
  /** Why it can't be paid (null when it can, or nothing was typed). */
  readonly problem: string | null;
}

type Limits = Pick<TopupCatalogDto, 'maxPerPaymentNgn' | 'remainingTodayNgn'>;

export function previewTopupAmount(amountNgn: number | null, limits: Limits): TopupAmountPreview {
  if (amountNgn === null) return { amountNgn: null, ratePerNaira: null, virtualAmount: null, problem: null };
  const problem =
    topupAmountProblem(amountNgn, limits.maxPerPaymentNgn) ??
    (limits.remainingTodayNgn !== null && amountNgn > limits.remainingTodayNgn ? `You can top up ${formatNaira(limits.remainingTodayNgn)} more today` : null);
  const ratePerNaira = topupRateFor(amountNgn);
  return { amountNgn, ratePerNaira, virtualAmount: ratePerNaira === null ? null : amountNgn * ratePerNaira, problem };
}

/** Live preview of a dollar top-up (whole dollars), with the game naira it credits at the server's rate. Display only. */
export interface TopupUsdPreview {
  readonly dollars: number | null;
  /** The naira value at the rate (what counts toward a daily cap). */
  readonly nairaValue: number | null;
  /** In-game naira this buys (`topupVirtualAmountUsd`; null when it can't be bought). */
  readonly virtualAmount: number | null;
  /** Why it can't be paid (null when it can, or nothing was typed). */
  readonly problem: string | null;
}

export function previewTopupUsd(dollars: number | null, usd: TopupUsdCatalogDto, remainingTodayNgn: number | null): TopupUsdPreview {
  if (dollars === null) return { dollars: null, nairaValue: null, virtualAmount: null, problem: null };
  const nairaValue = dollars * usd.ngnPerUsd;
  let virtualAmount: number | null;
  try {
    virtualAmount = topupVirtualAmountUsd(dollars, usd.ngnPerUsd);
  } catch {
    virtualAmount = null;
  }
  const problem =
    (Number.isSafeInteger(dollars) && dollars < usd.minUsd ? `Dollar top-ups start at ${formatUsdCents(usd.minUsd * 100)}` : null) ??
    topupUsdAmountProblem(dollars, usd.maxPerPaymentUsd) ??
    (remainingTodayNgn !== null && nairaValue > remainingTodayNgn
      ? `You can top up ${formatNaira(remainingTodayNgn)} more today (up to ${formatUsdCents(Math.floor(remainingTodayNgn / usd.ngnPerUsd) * 100)})`
      : null) ??
    (virtualAmount === null ? 'Dollar top-ups aren’t available right now' : null);
  return { dollars, nairaValue, virtualAmount: problem === null ? virtualAmount : null, problem };
}
