import { describe, expect, it } from 'vitest';
import type { UsdPaymentOptionsDto } from '@insidelife/shared';
import { bookingCharge } from './charge.rules.js';

const usd: UsdPaymentOptionsDto = { ngnPerUsd: 1_500, methods: ['card', 'applepay', 'googlepay'], minChargeCents: 100 };

describe('bookingCharge', () => {
  it('charges naira as the naira total, by card only', () => {
    expect(bookingCharge(3_500_000, {}, usd)).toEqual({ ok: true, charge: { currency: 'NGN', chargeMinor: 3_500_000, ngnPerUsd: null, method: 'card' } });
    expect(bookingCharge(3_500_000, { currency: 'NGN' }, null)).toMatchObject({ ok: true, charge: { currency: 'NGN', chargeMinor: 3_500_000 } });
    expect(bookingCharge(3_500_000, { method: 'applepay' }, usd)).toMatchObject({ ok: false, code: 'INVALID_PAYMENT_METHOD' });
  });

  it('charges dollars as the naira total ÷ the rate, rounded up to the cent, with the rate kept', () => {
    // ₦35,000 at ₦1,500 = $23.333… → $23.34.
    expect(bookingCharge(3_500_000, { currency: 'USD', expectedNgnPerUsd: 1_500 }, usd)).toEqual({
      ok: true,
      charge: { currency: 'USD', chargeMinor: 2_334, ngnPerUsd: 1_500, method: 'card' },
    });
    expect(bookingCharge(3_000_000, { currency: 'USD', method: 'googlepay' }, usd)).toMatchObject({ ok: true, charge: { chargeMinor: 2_000, method: 'googlepay' } });
  });

  it('refuses dollars when the server takes naira only, a wallet it doesn’t offer, a rate the buyer didn’t see, or under $1', () => {
    expect(bookingCharge(3_500_000, { currency: 'USD' }, null)).toMatchObject({ ok: false, code: 'PAYMENT_CURRENCY_UNAVAILABLE' });
    expect(bookingCharge(3_500_000, { currency: 'USD', method: 'applepay' }, { ...usd, methods: ['card'] })).toMatchObject({ ok: false, code: 'INVALID_PAYMENT_METHOD' });
    expect(bookingCharge(3_500_000, { currency: 'USD', expectedNgnPerUsd: 1_400 }, usd)).toMatchObject({ ok: false, code: 'PRICE_CHANGED', reason: expect.stringMatching(/\$23\.34/) });
    // ₦2,000 at ₦5,000 per $1 = $0.40.
    expect(bookingCharge(200_000, { currency: 'USD' }, { ...usd, ngnPerUsd: 5_000 })).toMatchObject({ ok: false, code: 'BELOW_DOLLAR_MINIMUM' });
    // Exactly $1 is fine.
    expect(bookingCharge(500_000, { currency: 'USD' }, { ...usd, ngnPerUsd: 5_000 })).toMatchObject({ ok: true, charge: { chargeMinor: 100 } });
  });
});
