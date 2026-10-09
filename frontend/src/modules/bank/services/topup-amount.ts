import { formatNaira, topupAmountProblem, topupRateFor, type TopupCatalogDto } from '@insidelife/shared';

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
