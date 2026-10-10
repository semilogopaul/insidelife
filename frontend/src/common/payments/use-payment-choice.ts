'use client';

import { useState } from 'react';
import type { PaymentCurrency, PaymentMethod, UsdPaymentOptionsDto } from '@insidelife/shared';
import { resolvePayment, supportsApplePay, type ResolvedPayment, type WantedPayment } from './currency';

export interface PaymentChoiceControl extends ResolvedPayment {
  readonly chooseCurrency: (currency: PaymentCurrency) => void;
  readonly chooseMethod: (method: PaymentMethod) => void;
}

const NAIRA_BY_CARD: WantedPayment = { currency: 'NGN', method: 'card' };

/**
 * The player's "Pay in ₦ / $" choice for one checkout. Naira is the default; the resolved currency and method are what
 * the form shows and sends (naira whenever dollars aren't offered, or not allowed for this price).
 */
export function usePaymentChoice(usd: UsdPaymentOptionsDto | null, dollarsAllowed = true): PaymentChoiceControl {
  const [wanted, setWanted] = useState<WantedPayment>(NAIRA_BY_CARD);
  const resolved = resolvePayment(wanted, usd, dollarsAllowed, supportsApplePay());
  return {
    ...resolved,
    chooseCurrency: (currency) => setWanted((current) => ({ ...current, currency })),
    chooseMethod: (method) => setWanted((current) => ({ ...current, method })),
  };
}
