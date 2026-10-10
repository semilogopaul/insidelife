import {
  USD_MIN_CHARGE_CENTS,
  formatNaira,
  formatUsdCents,
  usdCentsForKobo,
  type PaymentChoice,
  type PaymentCurrency,
  type PaymentMethod,
  type UsdPaymentOptionsDto,
} from '@insidelife/shared';

/** What a booking is charged, fixed when it is made (and stored on the order and its payment). */
export interface BookingCharge {
  readonly currency: PaymentCurrency;
  /** Kobo for NGN (the naira total), cents for USD (`usdCentsForKobo(totalKobo, ngnPerUsd)`). */
  readonly chargeMinor: number;
  readonly ngnPerUsd: number | null;
  readonly method: PaymentMethod;
}

export type ChargeResult =
  | { readonly ok: true; readonly charge: BookingCharge }
  | { readonly ok: false; readonly code: 'PAYMENT_CURRENCY_UNAVAILABLE' | 'INVALID_PAYMENT_METHOD' | 'BELOW_DOLLAR_MINIMUM'; readonly reason: string }
  /** The buyer saw another ₦ per $1: show the new dollar price instead of charging a different amount. */
  | { readonly ok: false; readonly code: 'PRICE_CHANGED'; readonly reason: string };

/**
 * How a booking of `totalKobo` (the naira quote) is charged for the buyer's choice. Naira: the total itself, by card
 * (hosted checkout). Dollars (only when `usd` is offered): the total ÷ the current ₦ per $1, rounded up to the cent,
 * at least $1, by card or an offered wallet. A rate the buyer didn't see is refused. Pure.
 */
export function bookingCharge(totalKobo: number, choice: PaymentChoice, usd: UsdPaymentOptionsDto | null): ChargeResult {
  const currency = choice.currency ?? 'NGN';
  const method = choice.method ?? 'card';
  if (currency === 'NGN') {
    if (method !== 'card') return { ok: false, code: 'INVALID_PAYMENT_METHOD', reason: 'Apple Pay and Google Pay are for dollar payments' };
    return { ok: true, charge: { currency, chargeMinor: totalKobo, ngnPerUsd: null, method } };
  }
  if (!usd) return { ok: false, code: 'PAYMENT_CURRENCY_UNAVAILABLE', reason: 'Ads and songs are paid in naira for now' };
  if (!usd.methods.includes(method)) return { ok: false, code: 'INVALID_PAYMENT_METHOD', reason: 'That way to pay isn’t available' };
  const cents = usdCentsForKobo(totalKobo, usd.ngnPerUsd);
  if (choice.expectedNgnPerUsd !== undefined && choice.expectedNgnPerUsd !== usd.ngnPerUsd) {
    return {
      ok: false,
      code: 'PRICE_CHANGED',
      reason: `The dollar rate just changed to ${formatNaira(usd.ngnPerUsd)} per $1, so this is now ${formatUsdCents(cents)}. Check it and pay again`,
    };
  }
  if (cents < Math.max(USD_MIN_CHARGE_CENTS, usd.minChargeCents)) {
    return { ok: false, code: 'BELOW_DOLLAR_MINIMUM', reason: `That’s under ${formatUsdCents(USD_MIN_CHARGE_CENTS)}: pay for it in naira` };
  }
  return { ok: true, charge: { currency, chargeMinor: cents, ngnPerUsd: usd.ngnPerUsd, method } };
}
