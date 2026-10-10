import type { PaymentChoice, PromotionChargeDto, PromotionQuote, UsdPaymentOptionsDto } from '@insidelife/shared';
import { PriceChangedException, PromotionRuleException } from '../promotions.errors.js';
import { bookingCharge, type BookingCharge } from '../rules/charge.rules.js';

/** The charge for a quote and the buyer's choice (`bookingCharge`), or the player-facing refusal. */
export function requireCharge(quote: PromotionQuote, choice: PaymentChoice, usd: UsdPaymentOptionsDto | null): BookingCharge {
  const result = bookingCharge(quote.totalKobo, choice, usd);
  if (result.ok) return result.charge;
  if (result.code === 'PRICE_CHANGED') throw new PriceChangedException(result.reason, quote.weekPriceKobo, quote.totalKobo);
  throw new PromotionRuleException(result.code, result.reason);
}

export const chargeDto = (charge: Pick<BookingCharge, 'currency' | 'chargeMinor' | 'ngnPerUsd'>): PromotionChargeDto => ({
  currency: charge.currency,
  amountMinor: charge.chargeMinor,
  ngnPerUsd: charge.ngnPerUsd,
});
