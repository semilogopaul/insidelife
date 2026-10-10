import {
  formatNaira,
  formatUsdCents,
  usdCentsForKobo,
  type PaymentChoice,
  type PaymentCurrency,
  type PaymentMethod,
  type UsdPaymentOptionsDto,
} from '@insidelife/shared';

/**
 * Paying in naira or dollars (pure rules, tested). The game stays in naira: dollars are only a way to pay, offered when
 * the server sends `usd` options. The server prices everything; these only decide what to show and which intent to send.
 */

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  card: 'Card',
  applepay: 'Apple Pay',
  googlepay: 'Google Pay',
};

/** Apple Pay only works in Safari (it exposes `ApplePaySession`). */
export function supportsApplePay(): boolean {
  return typeof window !== 'undefined' && 'ApplePaySession' in window;
}

/** The dollar methods this browser can use: card first and always, Apple Pay only where it works, Google Pay anywhere. */
export function offeredMethods(methods: readonly PaymentMethod[], canApplePay: boolean = supportsApplePay()): PaymentMethod[] {
  const usable = methods.filter((method) => method !== 'applepay' || canApplePay);
  return ['card', ...usable.filter((method) => method !== 'card')];
}

/** "Dollar cards, Apple Pay or Google Pay" for what this browser is offered. */
export function dollarMethodsLine(methods: readonly PaymentMethod[]): string {
  const names = methods.map((method) => (method === 'card' ? 'Dollar cards' : PAYMENT_METHOD_LABELS[method]));
  return names.length <= 1 ? (names[0] ?? 'Dollar cards') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

/** "₦1,500 per $1". */
export const rateLine = (ngnPerUsd: number): string => `${formatNaira(ngnPerUsd)} per $1`;

export interface DollarPrice {
  /** The dollar price in cents (the naira price ÷ rate, rounded up to the cent). */
  readonly cents: number;
  /** Under the smallest dollar charge: it can only be paid in naira. */
  readonly belowMinimum: boolean;
}

/** The dollar price of a naira price (kobo), or null when dollars aren't offered (or the rate can't be used). */
export function dollarPriceFor(kobo: number, usd: UsdPaymentOptionsDto | null): DollarPrice | null {
  if (!usd) return null;
  try {
    const cents = usdCentsForKobo(kobo, usd.ngnPerUsd);
    return { cents, belowMinimum: cents < usd.minChargeCents };
  } catch {
    return null;
  }
}

/** Why the $ option is off for this price ("Under $1: pay in naira"), or null when it can be paid in dollars. */
export function dollarUnavailableReason(price: DollarPrice | null, usd: UsdPaymentOptionsDto | null): string | null {
  if (!usd) return null;
  if (!price) return 'Pay this one in naira';
  return price.belowMinimum ? `Under ${formatUsdCents(usd.minChargeCents)}: pay in naira` : null;
}

export interface WantedPayment {
  readonly currency: PaymentCurrency;
  readonly method: PaymentMethod;
}

export interface ResolvedPayment extends WantedPayment {
  /** Dollar methods to offer (empty when dollars aren't offered). */
  readonly methods: readonly PaymentMethod[];
  /** The player can pick dollars right now. */
  readonly dollarsOpen: boolean;
}

/**
 * What will actually be paid: naira unless dollars are offered and allowed for this price, and a method this browser
 * offers (card otherwise). What is shown and what is sent both come from here, so they never disagree.
 */
export function resolvePayment(wanted: WantedPayment, usd: UsdPaymentOptionsDto | null, dollarsAllowed: boolean, canApplePay: boolean = supportsApplePay()): ResolvedPayment {
  const methods = usd ? offeredMethods(usd.methods, canApplePay) : [];
  const dollarsOpen = usd !== null && dollarsAllowed;
  const currency: PaymentCurrency = wanted.currency === 'USD' && dollarsOpen ? 'USD' : 'NGN';
  const method: PaymentMethod = currency === 'USD' && methods.includes(wanted.method) ? wanted.method : 'card';
  return { currency, method, methods, dollarsOpen };
}

/**
 * The payment part of a checkout request. Naira sends nothing extra (the server's default, exactly as before);
 * dollars send the currency, the method and the rate the player was shown (the server refuses if it moved).
 */
export function paymentChoiceBody(payment: WantedPayment, usd: UsdPaymentOptionsDto | null): PaymentChoice {
  if (payment.currency !== 'USD' || !usd) return {};
  return { currency: 'USD', method: payment.method, expectedNgnPerUsd: usd.ngnPerUsd };
}
