import { PROMOTION_STATUSES, type PromotionStatus } from '@insidelife/shared';
import { rangeOf } from './schedule.rules.js';
import { admitAfterPayment, canTransition, decideModeration, effectiveStatus, matchPayment, occupiesCapacity, refundSettlement } from './status.rules.js';

const run = rangeOf('2026-10-10', 3); // 10th, 11th, 12th
const paidAt = new Date('2026-10-08T10:00:00Z');

describe('status machine', () => {
  it('follows the happy path', () => {
    const path: PromotionStatus[] = ['draft', 'pending-payment', 'in-review', 'approved', 'live', 'completed'];
    for (let index = 1; index < path.length; index++) expect(canTransition(path[index - 1] ?? 'draft', path[index] ?? 'draft')).toBe(true);
  });

  it('routes refusals after payment to refunds and keeps terminal states terminal', () => {
    expect(canTransition('in-review', 'refund-due')).toBe(true);
    expect(canTransition('live', 'refund-due')).toBe(true);
    expect(canTransition('refund-due', 'refunded')).toBe(true);
    for (const terminal of ['completed', 'rejected', 'refunded'] as const) {
      for (const next of PROMOTION_STATUSES) expect(canTransition(terminal, next)).toBe(false);
    }
  });

  it('never skips review or payment', () => {
    expect(canTransition('pending-payment', 'approved')).toBe(false);
    expect(canTransition('pending-payment', 'live')).toBe(false);
    expect(canTransition('draft', 'in-review')).toBe(false);
    expect(canTransition('refund-due', 'live')).toBe(false);
  });

  it('derives live/completed from calendar dates', () => {
    expect(effectiveStatus('approved', run, '2026-10-09')).toBe('approved');
    expect(effectiveStatus('approved', run, '2026-10-10')).toBe('live');
    expect(effectiveStatus('live', run, '2026-10-12')).toBe('live');
    expect(effectiveStatus('approved', run, '2026-10-13')).toBe('completed');
    expect(effectiveStatus('in-review', run, '2026-10-13')).toBe('in-review');
  });

  it('holds capacity for paid items and for unpaid ones only while the hold lasts', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    expect(occupiesCapacity('in-review', null, now)).toBe(true);
    expect(occupiesCapacity('live', null, now)).toBe(true);
    expect(occupiesCapacity('pending-payment', new Date('2026-10-08T12:10:00Z'), now)).toBe(true);
    expect(occupiesCapacity('pending-payment', new Date('2026-10-08T11:59:00Z'), now)).toBe(false);
    expect(occupiesCapacity('refund-due', null, now)).toBe(false);
    expect(occupiesCapacity('cancelled', null, now)).toBe(false);
  });
});

describe('payment fulfilment', () => {
  it('is idempotent by reference and flags second payments', () => {
    expect(matchPayment({ status: 'pending-payment', paymentReference: 'ref-1', paidAt: null }, 'ref-1')).toBe('accept');
    expect(matchPayment({ status: 'in-review', paymentReference: 'ref-1', paidAt }, 'ref-1')).toBe('already-fulfilled');
    expect(matchPayment({ status: 'in-review', paymentReference: 'ref-1', paidAt }, 'ref-2')).toBe('duplicate');
    // A buyer cancelled, then paid anyway: honour it.
    expect(matchPayment({ status: 'cancelled', paymentReference: 'ref-1', paidAt: null }, 'ref-1')).toBe('accept');
  });

  it('sends paid items to review, or to refund when the run can no longer happen', () => {
    const base = { range: run, today: '2026-10-08', amountKobo: 500_000, paidKobo: 500_000, hasRoom: true };
    expect(admitAfterPayment(base)).toEqual({ kind: 'review' });
    expect(admitAfterPayment({ ...base, hasRoom: false }).kind).toBe('refund');
    expect(admitAfterPayment({ ...base, today: '2026-10-13' }).kind).toBe('refund');
    expect(admitAfterPayment({ ...base, paidKobo: 499_900 }).kind).toBe('refund');
  });
});

describe('moderation decisions', () => {
  const inReview = { ...run, status: 'in-review' as const, paidAt };

  it('approves into approved or straight into live by date', () => {
    expect(decideModeration(inReview, { action: 'approve' }, '2026-10-08')).toEqual({ ok: true, to: 'approved' });
    expect(decideModeration(inReview, { action: 'approve' }, '2026-10-11')).toEqual({ ok: true, to: 'live' });
    expect(decideModeration(inReview, { action: 'approve' }, '2026-10-13').ok).toBe(false);
  });

  it('flags paid rejections for refund unless withheld', () => {
    expect(decideModeration(inReview, { action: 'reject', refund: true }, '2026-10-08')).toEqual({ ok: true, to: 'refund-due' });
    expect(decideModeration(inReview, { action: 'reject', refund: false }, '2026-10-08')).toEqual({ ok: true, to: 'rejected' });
    // Take-down of a live ad.
    expect(decideModeration({ ...run, status: 'approved', paidAt }, { action: 'reject', refund: true }, '2026-10-11')).toEqual({ ok: true, to: 'refund-due' });
  });

  it('refuses decisions that don’t fit the state', () => {
    expect(decideModeration({ ...run, status: 'pending-payment', paidAt: null }, { action: 'approve' }, '2026-10-08').ok).toBe(false);
    expect(decideModeration({ ...run, status: 'approved', paidAt }, { action: 'approve' }, '2026-10-08').ok).toBe(false);
    expect(decideModeration({ ...run, status: 'approved', paidAt }, { action: 'reject', refund: true }, '2026-10-20').ok).toBe(false);
    expect(decideModeration(inReview, { action: 'mark-refunded' }, '2026-10-08').ok).toBe(false);
    expect(decideModeration({ ...run, status: 'refund-due', paidAt }, { action: 'mark-refunded' }, '2026-10-08')).toEqual({ ok: true, to: 'refunded' });
  });
});

describe('refund settlement', () => {
  it('finishes an owed refund and takes down a running item refunded from the dashboard', () => {
    expect(refundSettlement({ status: 'refund-due', paymentReference: 'ref-1' }, 'ref-1')).toEqual({ kind: 'refunded', takenDown: false });
    for (const status of ['in-review', 'approved', 'live'] as const) {
      expect(refundSettlement({ status, paymentReference: 'ref-1' }, 'ref-1')).toEqual({ kind: 'refunded', takenDown: true });
    }
  });

  it('only logs a refunded duplicate payment and leaves finished items alone', () => {
    expect(refundSettlement({ status: 'live', paymentReference: 'ref-1' }, 'ref-2')).toEqual({ kind: 'duplicate-payment' });
    for (const status of ['refunded', 'rejected', 'completed', 'cancelled'] as const) {
      expect(refundSettlement({ status, paymentReference: 'ref-1' }, 'ref-1')).toEqual({ kind: 'none' });
    }
  });
});
