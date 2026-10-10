import { formatNaira, type PaymentDto } from '@insidelife/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/common/api/api-error';
import {
  checkErrorAlert,
  deliveredAlert,
  isNewlyDelivered,
  isRecoverable,
  paymentChanged,
  paymentsToRecover,
  pruneChecks,
  purchaseSummary,
  RECOVERY,
  shouldScan,
} from '../recovery';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const MINUTE = 60_000;
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

const payment = (overrides: Partial<PaymentDto> = {}): PaymentDto => ({
  reference: 'ref-1',
  purpose: 'billboard',
  subjectId: 'campaign-1',
  description: 'Inside Life ad: Lekki Toll Gate, 1 week from 2026-10-09',
  amountNgn: 105_000,
  amountKobo: 10_500_000,
  status: 'initialized',
  fulfilled: false,
  channel: null,
  createdAt: ago(5 * MINUTE),
  verifiedAt: null,
  refundedNgn: 0,
  topup: null,
  ...overrides,
});

const topup = (overrides: Partial<PaymentDto> = {}): PaymentDto =>
  payment({
    purpose: 'topup',
    subjectId: 'owambe-pack',
    description: 'Inside Life top-up: ₦1,000,000 in game (Owambe pack)',
    amountNgn: 2_500,
    amountKobo: 250_000,
    topup: { packageId: 'owambe-pack', label: 'Owambe pack', ratePerNaira: 400, virtualAmount: 1_000_000 },
    ...overrides,
  });

describe('isRecoverable (could it still turn out paid?)', () => {
  it('checks unconfirmed checkouts for a day', () => {
    expect(isRecoverable(payment({ createdAt: ago(1 * MINUTE) }), NOW)).toBe(true);
    expect(isRecoverable(payment({ createdAt: ago(RECOVERY.maxAgeMs) }), NOW)).toBe(true);
    expect(isRecoverable(payment({ createdAt: ago(RECOVERY.maxAgeMs + 1) }), NOW)).toBe(false);
  });

  it('checks failed and closed ones only while recent (30 min)', () => {
    for (const status of ['failed', 'abandoned'] as const) {
      expect(isRecoverable(payment({ status, createdAt: ago(29 * MINUTE) }), NOW), status).toBe(true);
      expect(isRecoverable(payment({ status, createdAt: ago(31 * MINUTE) }), NOW), status).toBe(false);
    }
  });

  it('never re-checks a confirmed payment, or one with a nonsense date', () => {
    expect(isRecoverable(payment({ status: 'success' }), NOW)).toBe(false);
    expect(isRecoverable(payment({ status: 'success', fulfilled: false }), NOW)).toBe(false);
    expect(isRecoverable(payment({ createdAt: 'yesterday-ish' }), NOW)).toBe(false);
  });

  it('still checks a payment “from the future” (the phone’s clock is behind the server’s)', () => {
    expect(isRecoverable(payment({ createdAt: new Date(NOW + 3 * MINUTE).toISOString() }), NOW)).toBe(true);
  });
});

describe('paymentsToRecover (selection and throttling)', () => {
  const none = new Map<string, number>();

  it('picks at most 3 recoverable payments, newest first', () => {
    const list = [
      payment({ reference: 'old', createdAt: ago(60 * MINUTE) }),
      payment({ reference: 'paid', status: 'success', fulfilled: true, createdAt: ago(1 * MINUTE) }),
      payment({ reference: 'newest', createdAt: ago(2 * MINUTE) }),
      payment({ reference: 'failed-recent', status: 'failed', createdAt: ago(10 * MINUTE) }),
      payment({ reference: 'abandoned-old', status: 'abandoned', createdAt: ago(45 * MINUTE) }),
      payment({ reference: 'too-old', createdAt: ago(25 * 60 * MINUTE) }),
      payment({ reference: 'middle', createdAt: ago(20 * MINUTE) }),
    ];
    expect(paymentsToRecover(list, NOW, none).map((p) => p.reference)).toEqual(['newest', 'failed-recent', 'middle']);
  });

  it('returns nothing when nothing could still be paid', () => {
    expect(paymentsToRecover([], NOW, none)).toEqual([]);
    expect(paymentsToRecover([payment({ status: 'success', fulfilled: true }), payment({ status: 'failed', createdAt: ago(2 * 60 * MINUTE) })], NOW, none)).toEqual([]);
  });

  it('checks the same payment at most every 30 s', () => {
    const list = [payment({ reference: 'a', createdAt: ago(1 * MINUTE) }), payment({ reference: 'b', createdAt: ago(2 * MINUTE) })];
    const checked = new Map([
      ['a', NOW - 10_000],
      ['b', NOW - RECOVERY.perPaymentEveryMs],
    ]);
    expect(paymentsToRecover(list, NOW, checked).map((p) => p.reference)).toEqual(['b']);
    expect(paymentsToRecover(list, NOW + 20_000, checked).map((p) => p.reference)).toEqual(['a', 'b']);
  });

  it('never reaches past the 3 newest because they were checked recently (no creeping through old payments)', () => {
    const list = ['p1', 'p2', 'p3', 'p4'].map((reference, index) => payment({ reference, createdAt: ago((index + 1) * MINUTE) }));
    const checked = new Map(['p1', 'p2', 'p3'].map((reference) => [reference, NOW - 1_000] as const));
    expect(paymentsToRecover(list, NOW, checked)).toEqual([]);
  });
});

describe('scan throttling', () => {
  it('scans on mount, then at most every few seconds (focus + visibilitychange fire together)', () => {
    expect(shouldScan(null, NOW)).toBe(true);
    expect(shouldScan(NOW - 100, NOW)).toBe(false);
    expect(shouldScan(NOW - RECOVERY.scanEveryMs, NOW)).toBe(true);
  });

  it('forgets checks once their 30 s are up', () => {
    const checked = new Map([
      ['fresh', NOW - 1_000],
      ['stale', NOW - RECOVERY.perPaymentEveryMs],
    ]);
    pruneChecks(checked, NOW);
    expect([...checked.keys()]).toEqual(['fresh']);
  });
});

describe('outcome of a check', () => {
  it('spots a delivery made by this check or since the list was read', () => {
    const before = payment();
    expect(isNewlyDelivered(before, { payment: payment({ status: 'success', fulfilled: true }), fulfilledNow: true })).toBe(true);
    expect(isNewlyDelivered(before, { payment: payment({ status: 'success', fulfilled: true }), fulfilledNow: false })).toBe(true);
    expect(isNewlyDelivered(before, { payment: payment({ status: 'success', fulfilled: false }), fulfilledNow: false })).toBe(false);
    expect(isNewlyDelivered(before, { payment: payment(), fulfilledNow: false })).toBe(false);
    expect(isNewlyDelivered(payment({ status: 'success', fulfilled: true }), { payment: payment({ status: 'success', fulfilled: true }), fulfilledNow: false })).toBe(false);
  });

  it('knows when cached views are stale', () => {
    expect(paymentChanged(payment(), payment())).toBe(false);
    expect(paymentChanged(payment(), payment({ status: 'failed' }))).toBe(true);
    expect(paymentChanged(payment({ status: 'success' }), payment({ status: 'success', fulfilled: true }))).toBe(true);
  });
});

describe('alerts', () => {
  it('says what a landed payment bought: the top-up amount, else the description', () => {
    expect(purchaseSummary(topup())).toBe(`${formatNaira(1_000_000)} added to your wallet`);
    expect(purchaseSummary(payment())).toBe('Ad: Lekki Toll Gate, 1 week from 2026-10-09');
    expect(purchaseSummary(payment({ description: 'club play: Afro night' }))).toBe('Club play: Afro night');
    expect(purchaseSummary(payment({ description: 'Inside Life ' }))).toBe('Your purchase is on its way');
    expect(deliveredAlert(topup())).toEqual({ title: 'Payment confirmed', body: `${formatNaira(1_000_000)} added to your wallet`, tone: 'good', amount: 1_000_000 });
    expect(deliveredAlert(payment())).toMatchObject({ title: 'Payment confirmed', tone: 'good', amount: undefined });
  });

  it('explains a check that couldn’t finish without ever saying “not paid”', () => {
    const cases = [
      [new ApiError(429, { errorCode: 'RATE_LIMITED', message: 'Slow down' }), 'Give it a moment'],
      [new ApiError(502, { errorCode: 'PAYMENT_CHECK_UNAVAILABLE', message: 'x' }), 'Couldn’t reach Flutterwave'],
      [new ApiError(504, null), 'Couldn’t reach Flutterwave'],
      [new ApiError(0, null), 'You’re offline'],
      [new ApiError(404, { errorCode: 'RESOURCE_NOT_FOUND', message: 'Payment not found' }), 'Not a payment on this account'],
      [new ApiError(500, null), 'Couldn’t check that payment'],
      [new RangeError('boom'), 'Couldn’t check that payment'],
    ] as const;
    for (const [error, title] of cases) {
      const alert = checkErrorAlert(error);
      expect(alert.title).toBe(title);
      expect(alert.body).toMatch(/If you paid, it’s safe/);
      expect(`${alert.title} ${alert.body}`).not.toMatch(/not paid|failed|declined/i);
    }
  });
});
