import { buildTimeline, lagosMidnight, type TimelineItem, type TimelineLogEntry } from './timeline.rules.js';

const at = (iso: string): Date => new Date(iso);
const base: TimelineItem = {
  status: 'pending-payment',
  startDate: '2026-10-10',
  endDate: '2026-10-17',
  createdAt: at('2026-10-09T10:00:00Z'),
  paidAt: null,
  reviewedAt: null,
  rejectionReason: null,
};
const log = (action: string, toStatus: TimelineLogEntry['toStatus'], iso: string, reason: string | null = null): TimelineLogEntry => ({ action, toStatus, reason, createdAt: at(iso) });
const steps = (timeline: ReturnType<typeof buildTimeline>) => timeline.map((step) => `${step.step}:${step.state}`);

describe('promotion timeline (what happened to what you paid for)', () => {
  it('shows a pending order waiting for payment, with the run dates ahead', () => {
    const timeline = buildTimeline(base, [], '2026-10-09');
    expect(steps(timeline)).toEqual(['paid:current', 'in-review:next', 'approved:next', 'live:next', 'ended:next']);
    expect(timeline[0]?.note).toMatch(/I’ve paid: check now/);
    expect(timeline.find((step) => step.step === 'live')?.at).toBe(lagosMidnight('2026-10-10'));
    expect(lagosMidnight('2026-10-10')).toBe('2026-10-09T23:00:00.000Z');
  });

  it('walks paid → in review → approved → live → ended by date', () => {
    const paid = { ...base, status: 'in-review' as const, paidAt: at('2026-10-09T10:05:00Z') };
    const trail = [log('paid', 'in-review', '2026-10-09T10:05:00Z')];
    expect(steps(buildTimeline(paid, trail, '2026-10-09'))).toEqual(['paid:done', 'in-review:current', 'approved:next', 'live:next', 'ended:next']);
    const approved = { ...paid, status: 'approved' as const, reviewedAt: at('2026-10-09T12:00:00Z') };
    const approvedTrail = [...trail, log('approved', 'approved', '2026-10-09T12:00:00Z')];
    expect(steps(buildTimeline(approved, approvedTrail, '2026-10-09'))).toEqual(['paid:done', 'in-review:done', 'approved:current', 'live:next', 'ended:next']);
    // Effective status by date: live on its days, ended after.
    expect(steps(buildTimeline(approved, approvedTrail, '2026-10-12'))).toEqual(['paid:done', 'in-review:done', 'approved:done', 'live:current', 'ended:next']);
    const ended = buildTimeline(approved, approvedTrail, '2026-10-17');
    expect(steps(ended)).toEqual(['paid:done', 'in-review:done', 'approved:done', 'live:done', 'ended:current']);
    expect(ended.find((step) => step.step === 'approved')?.at).toBe('2026-10-09T12:00:00.000Z');
    expect(ended.find((step) => step.step === 'ended')?.at).toBe(lagosMidnight('2026-10-17'));
  });

  it('dates "live" from the approval when it was approved after its first day', () => {
    const late = { ...base, status: 'live' as const, paidAt: at('2026-10-09T10:05:00Z'), reviewedAt: at('2026-10-11T09:00:00Z') };
    const timeline = buildTimeline(late, [log('paid', 'in-review', '2026-10-09T10:05:00Z'), log('approved', 'live', '2026-10-11T09:00:00Z')], '2026-10-11');
    expect(timeline.find((step) => step.step === 'live')?.at).toBe('2026-10-11T09:00:00.000Z');
  });

  it('explains a rejection, the refund and when the money went back', () => {
    const rejected = { ...base, status: 'refunded' as const, paidAt: at('2026-10-09T10:05:00Z'), reviewedAt: at('2026-10-09T13:00:00Z'), rejectionReason: 'Gambling ad' };
    const trail = [
      log('paid', 'in-review', '2026-10-09T10:05:00Z'),
      log('rejected', 'refund-due', '2026-10-09T13:00:00Z', 'Gambling ad'),
      log('refunded', 'refunded', '2026-10-09T13:01:00Z'),
    ];
    const timeline = buildTimeline(rejected, trail, '2026-10-09');
    expect(steps(timeline)).toEqual(['paid:done', 'in-review:done', 'refund-due:done', 'refunded:current']);
    expect(timeline.find((step) => step.step === 'refund-due')?.note).toBe('Gambling ad');
    expect(timeline.at(-1)?.at).toBe('2026-10-09T13:01:00.000Z');
  });

  it('shows a refund when the space filled up before the payment landed (never reviewed)', () => {
    const soldOut = { ...base, status: 'refund-due' as const, paidAt: at('2026-10-09T11:00:00Z'), rejectionReason: 'The space filled up before your payment landed. You’ll get a full refund.' };
    const timeline = buildTimeline(soldOut, [log('refund-flagged', 'refund-due', '2026-10-09T11:00:00Z', 'The space filled up')], '2026-10-09');
    expect(steps(timeline)).toEqual(['paid:done', 'refund-due:current', 'refunded:next']);
  });

  it('shows an ad taken down while running', () => {
    const takenDown = { ...base, status: 'rejected' as const, paidAt: at('2026-10-09T10:05:00Z'), reviewedAt: at('2026-10-12T08:00:00Z'), rejectionReason: 'Misleading' };
    const trail = [log('paid', 'in-review', '2026-10-09T10:05:00Z'), log('approved', 'approved', '2026-10-09T12:00:00Z'), log('rejected', 'rejected', '2026-10-12T08:00:00Z', 'Misleading')];
    expect(steps(buildTimeline(takenDown, trail, '2026-10-12'))).toEqual(['paid:done', 'in-review:done', 'approved:done', 'live:done', 'rejected:current']);
  });

  it('shows a cancellation before payment', () => {
    const cancelled = { ...base, status: 'cancelled' as const };
    const timeline = buildTimeline(cancelled, [log('cancelled', 'cancelled', '2026-10-09T10:10:00Z')], '2026-10-09');
    expect(steps(timeline)).toEqual(['cancelled:current']);
    expect(timeline[0]?.note).toMatch(/Nothing was charged/);
  });
});
