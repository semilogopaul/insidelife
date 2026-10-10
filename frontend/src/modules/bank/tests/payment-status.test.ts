import { formatNaira, type PaymentDto } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { checkResultAlert, offersPaidCheck, outcomeCopy } from '../services/payment-status';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const HOUR = 3_600_000;

const payment = (overrides: Partial<PaymentDto> = {}): PaymentDto => ({
  reference: 'ref-1',
  purpose: 'topup',
  subjectId: 'owambe-pack',
  description: 'Inside Life top-up: ₦1,000,000 in game (Owambe pack)',
  currency: 'NGN',
  amountMinor: 250_000,
  ngnPerUsd: null,
  amountNgn: 2_500,
  amountKobo: 250_000,
  status: 'initialized',
  fulfilled: false,
  channel: null,
  createdAt: new Date(NOW - HOUR).toISOString(),
  verifiedAt: null,
  refundedMinor: 0,
  refundedNgn: 0,
  topup: { packageId: 'owambe-pack', label: 'Owambe pack', ratePerNaira: 400, virtualAmount: 1_000_000 },
  ...overrides,
});

describe('offersPaidCheck (“I’ve paid: check now” on a history row)', () => {
  it('is offered for anything not yet confirmed: pending, and failed or closed ones for a day', () => {
    expect(offersPaidCheck(payment(), NOW)).toBe(true);
    expect(offersPaidCheck(payment({ createdAt: new Date(NOW - 30 * HOUR).toISOString() }), NOW)).toBe(true);
    expect(offersPaidCheck(payment({ status: 'failed' }), NOW)).toBe(true);
    expect(offersPaidCheck(payment({ status: 'abandoned', createdAt: new Date(NOW - 23 * HOUR).toISOString() }), NOW)).toBe(true);
    expect(offersPaidCheck(payment({ status: 'abandoned', createdAt: new Date(NOW - 25 * HOUR).toISOString() }), NOW)).toBe(false);
    expect(offersPaidCheck(payment({ status: 'success', fulfilled: true }), NOW)).toBe(false);
  });
});

describe('checkResultAlert (what the check found)', () => {
  it('confirms a delivered payment with what it bought', () => {
    expect(checkResultAlert(payment({ status: 'success', fulfilled: true }))).toEqual({
      title: 'Payment confirmed',
      body: `${formatNaira(1_000_000)} added to your wallet`,
      tone: 'good',
      amount: 1_000_000,
    });
    expect(checkResultAlert(payment({ purpose: 'billboard', topup: null, description: 'Inside Life ad: Yaba Hub, 1 week', status: 'success', fulfilled: true }))).toMatchObject({
      title: 'Payment confirmed',
      body: 'Ad: Yaba Hub, 1 week',
    });
  });

  it('never leaves a possibly-paid payment at a dead end', () => {
    for (const status of ['initialized', 'failed', 'abandoned'] as const) {
      const alert = checkResultAlert(payment({ status }));
      expect(alert.body, status).toMatch(/If you paid, it’s safe: we keep checking/);
      expect(alert.tone, status).not.toBe('good');
    }
    expect(checkResultAlert(payment({ status: 'success' }))).toMatchObject({ title: 'Paid. Delivering now…', tone: 'good' });
    expect(checkResultAlert(payment({ status: 'success', fulfilled: true, refundedMinor: 250_000, refundedNgn: 2_500 }))).toMatchObject({ title: 'Payment refunded' });
  });

  it('says a failed or closed checkout can still be checked on the callback page', () => {
    expect(outcomeCopy(payment({ status: 'failed' })).body).toMatch(/Paid anyway\? Check again/);
    expect(outcomeCopy(payment({ status: 'abandoned' })).body).toMatch(/Paid anyway\? Check again/);
    expect(outcomeCopy(payment()).body).toMatch(/it’s safe/);
  });

  it('says a refund in the currency it was paid in', () => {
    const dollars = payment({ status: 'success', fulfilled: true, currency: 'USD', amountMinor: 1_000, ngnPerUsd: 1_500, amountNgn: 15_000, amountKobo: 1_500_000, refundedMinor: 1_000, refundedNgn: 15_000 });
    expect(outcomeCopy(dollars).body).toBe('$10 went back to your card or bank. It can take a few working days to show.');
    expect(checkResultAlert(dollars).body).toBe('$10 went back to your card or bank.');
  });
});
