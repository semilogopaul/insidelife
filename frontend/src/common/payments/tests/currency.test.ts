import type { UsdPaymentOptionsDto } from '@insidelife/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { dollarMethodsLine, dollarPriceFor, dollarUnavailableReason, offeredMethods, paymentChoiceBody, rateLine, resolvePayment, supportsApplePay } from '../currency';

const usd: UsdPaymentOptionsDto = { ngnPerUsd: 1_500, methods: ['card', 'applepay', 'googlepay'], minChargeCents: 100 };

describe('dollar payment methods', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).ApplePaySession;
  });

  it('offers Apple Pay only where the browser has ApplePaySession (Safari)', () => {
    expect(supportsApplePay()).toBe(false);
    expect(offeredMethods(usd.methods)).toEqual(['card', 'googlepay']);
    (window as unknown as Record<string, unknown>).ApplePaySession = function ApplePaySession() {};
    expect(supportsApplePay()).toBe(true);
    expect(offeredMethods(usd.methods)).toEqual(['card', 'applepay', 'googlepay']);
  });

  it('always offers card first', () => {
    expect(offeredMethods(['googlepay'], false)).toEqual(['card', 'googlepay']);
    expect(offeredMethods(['card'], true)).toEqual(['card']);
  });

  it('describes what can be used', () => {
    expect(dollarMethodsLine(['card', 'applepay', 'googlepay'])).toBe('Dollar cards, Apple Pay or Google Pay');
    expect(dollarMethodsLine(['card', 'googlepay'])).toBe('Dollar cards or Google Pay');
    expect(dollarMethodsLine(['card'])).toBe('Dollar cards');
    expect(rateLine(1_500)).toBe('₦1,500 per $1');
  });
});

describe('dollar prices', () => {
  it('rounds a naira price up to the cent at the rate', () => {
    expect(dollarPriceFor(15_000_000, usd)).toEqual({ cents: 10_000, belowMinimum: false });
    // ₦10,000 at ₦1,500 per $1 = $6.666… → $6.67.
    expect(dollarPriceFor(1_000_000, usd)).toEqual({ cents: 667, belowMinimum: false });
  });

  it('keeps prices under $1 in naira', () => {
    const cheap = dollarPriceFor(100_000, usd);
    expect(cheap).toEqual({ cents: 67, belowMinimum: true });
    expect(dollarUnavailableReason(cheap, usd)).toBe('Under $1: pay in naira');
    expect(dollarUnavailableReason(dollarPriceFor(15_000_000, usd), usd)).toBeNull();
  });

  it('has no dollar price when dollars are off or the rate is unusable', () => {
    expect(dollarPriceFor(15_000_000, null)).toBeNull();
    expect(dollarUnavailableReason(null, null)).toBeNull();
    expect(dollarPriceFor(15_000_000, { ...usd, ngnPerUsd: 0 })).toBeNull();
  });
});

describe('resolvePayment and the request body', () => {
  it('pays naira when dollars are off, not allowed for the price, or not picked', () => {
    expect(resolvePayment({ currency: 'USD', method: 'googlepay' }, null, true, false)).toMatchObject({ currency: 'NGN', method: 'card', methods: [], dollarsOpen: false });
    expect(resolvePayment({ currency: 'USD', method: 'card' }, usd, false, false)).toMatchObject({ currency: 'NGN', dollarsOpen: false });
    expect(resolvePayment({ currency: 'NGN', method: 'card' }, usd, true, false)).toMatchObject({ currency: 'NGN', dollarsOpen: true });
  });

  it('falls back to card for a method this browser can’t use', () => {
    expect(resolvePayment({ currency: 'USD', method: 'applepay' }, usd, true, false)).toMatchObject({ currency: 'USD', method: 'card' });
    expect(resolvePayment({ currency: 'USD', method: 'applepay' }, usd, true, true)).toMatchObject({ currency: 'USD', method: 'applepay' });
  });

  it('sends nothing extra for naira and the currency, method and shown rate for dollars', () => {
    expect(paymentChoiceBody({ currency: 'NGN', method: 'card' }, usd)).toEqual({});
    expect(paymentChoiceBody({ currency: 'USD', method: 'card' }, null)).toEqual({});
    expect(paymentChoiceBody({ currency: 'USD', method: 'googlepay' }, usd)).toEqual({ currency: 'USD', method: 'googlepay', expectedNgnPerUsd: 1_500 });
  });
});
