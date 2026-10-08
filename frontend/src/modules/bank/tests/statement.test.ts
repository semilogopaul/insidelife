import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, type LedgerEntryDto } from '@insidelife/shared';
import { dayLabel, filterEntries, groupByDay } from '../services/statement';
import { isPaymentReference, outcomeCopy, paymentOutcome } from '../services/payment-status';

const entry = (id: string, day: number, amount: number): LedgerEntryDto => ({
  id,
  kind: amount > 0 ? 'salary' : 'purchase',
  amount,
  balanceAfter: 0,
  memo: id,
  gameMinute: day * MINUTES_PER_DAY + 600,
  createdAt: '2026-10-08T00:00:00.000Z',
  counterparty: null,
});

describe('statement grouping', () => {
  const now = 100 * MINUTES_PER_DAY + 30;
  const entries = [entry('a', 100, 5_000), entry('b', 100, -2_000), entry('c', 99, -500), entry('d', 90, 1_000)];

  it('groups newest-first entries by game day with a net total', () => {
    const days = groupByDay(entries, now);
    expect(days.map((day) => day.label)).toEqual(['Today', 'Yesterday', expect.stringMatching(/\d{4}$/)]);
    expect(days[0]?.entries.map((item) => item.id)).toEqual(['a', 'b']);
    expect(days[0]?.net).toBe(3_000);
  });

  it('labels days relative to today', () => {
    expect(dayLabel(5, 5)).toBe('Today');
    expect(dayLabel(4, 5)).toBe('Yesterday');
    expect(dayLabel(1, 5)).not.toMatch(/day/);
  });

  it('filters money in and out', () => {
    expect(filterEntries(entries, 'in').map((item) => item.id)).toEqual(['a', 'd']);
    expect(filterEntries(entries, 'out').map((item) => item.id)).toEqual(['b', 'c']);
    expect(filterEntries(entries, 'all')).toHaveLength(4);
  });
});

describe('payment outcome', () => {
  it('only calls a payment done when it is paid and delivered', () => {
    expect(paymentOutcome({ status: 'success', fulfilled: true })).toBe('delivered');
    expect(paymentOutcome({ status: 'success', fulfilled: false })).toBe('delivering');
    expect(paymentOutcome({ status: 'initialized', fulfilled: false })).toBe('pending');
    expect(paymentOutcome({ status: 'failed', fulfilled: false })).toBe('failed');
    expect(paymentOutcome({ status: 'abandoned', fulfilled: false })).toBe('abandoned');
  });

  it('says how much landed for a top-up', () => {
    const copy = outcomeCopy({
      reference: 'x',
      purpose: 'topup',
      subjectId: 'owambe-pack',
      description: 'Owambe',
      amountNgn: 2_500,
      amountKobo: 250_000,
      status: 'success',
      fulfilled: true,
      channel: 'sandbox',
      createdAt: '',
      verifiedAt: null,
      topup: { packageId: 'owambe-pack', label: 'Owambe pack', virtualAmount: 1_000_000 },
    });
    expect(copy.title).toBe('₦1,000,000 added to your wallet');
  });

  it('accepts only UUID references from the URL', () => {
    expect(isPaymentReference('0f78b5db-d87d-4e94-9217-4ec62df2062a')).toBe(true);
    expect(isPaymentReference('<script>')).toBe(false);
    expect(isPaymentReference(null)).toBe(false);
  });
});
