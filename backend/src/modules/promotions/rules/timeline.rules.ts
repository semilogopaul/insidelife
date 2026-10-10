import type { IsoDate, PromotionStatus, PromotionTimelineStep, PromotionTimelineStepDto } from '@insidelife/shared';
import { effectiveStatus } from './status.rules.js';

/** What the timeline needs from an ad campaign or a club order. */
export interface TimelineItem {
  readonly status: PromotionStatus;
  readonly startDate: IsoDate;
  /** Exclusive. */
  readonly endDate: IsoDate;
  readonly createdAt: Date;
  readonly paidAt: Date | null;
  readonly reviewedAt: Date | null;
  readonly rejectionReason: string | null;
}

/** One entry of the item's audit trail (`promotion_moderation_log`), oldest first. */
export interface TimelineLogEntry {
  readonly action: string;
  readonly toStatus: PromotionStatus | null;
  readonly reason: string | null;
  readonly createdAt: Date;
}

/** Midnight at the start of a Lagos calendar day (WAT, UTC+1). */
export const lagosMidnight = (date: IsoDate): string => new Date(`${date}T00:00:00.000+01:00`).toISOString();

const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

/**
 * "What happened to what you paid for", oldest first: paid → in review → approved → live → ended, or the way off that
 * path (rejected, refund on the way, refunded, cancelled) with the reason. Steps not reached yet on the happy path are
 * listed as `next` (live and ended carry their dates). Built from the stored status, the dates and the audit trail, so
 * it shows exactly what the server did and when.
 */
export function buildTimeline(item: TimelineItem, log: readonly TimelineLogEntry[], today: IsoDate): PromotionTimelineStepDto[] {
  const status = effectiveStatus(item.status, item, today);
  const last = (predicate: (entry: TimelineLogEntry) => boolean): TimelineLogEntry | undefined => log.filter(predicate).at(-1);
  const reached = (to: PromotionStatus): boolean => log.some((entry) => entry.toStatus === to);
  const paidAt = iso(item.paidAt);
  const approvedEntry = last((entry) => entry.action === 'approved');
  const approvedAt = iso(approvedEntry?.createdAt ?? (reached('approved') || reached('live') ? item.reviewedAt : null));
  const wasApproved = approvedEntry !== undefined || ['approved', 'live', 'completed'].includes(status);
  const liveAt = (): string => {
    const start = lagosMidnight(item.startDate);
    return approvedAt && approvedAt > start ? approvedAt : start;
  };
  const steps: PromotionTimelineStepDto[] = [];
  const add = (step: PromotionTimelineStep, state: PromotionTimelineStepDto['state'], at: string | null, note: string | null = null): void => {
    steps.push({ step, state, at, note });
  };

  if (status === 'draft' || status === 'pending-payment') {
    add('paid', 'current', null, 'Waiting for your payment. Paid already? Tap “I’ve paid: check now”.');
    add('in-review', 'next', null);
    add('approved', 'next', null);
    add('live', 'next', lagosMidnight(item.startDate));
    add('ended', 'next', lagosMidnight(item.endDate));
    return steps;
  }
  if (status === 'cancelled') {
    const cancelled = last((entry) => entry.toStatus === 'cancelled');
    add('cancelled', 'current', iso(cancelled?.createdAt ?? item.createdAt), 'Cancelled before payment. Nothing was charged.');
    return steps;
  }

  add('paid', 'done', paidAt);
  const happy: readonly PromotionStatus[] = ['in-review', 'approved', 'live', 'completed'];
  if (happy.includes(status)) {
    const position = happy.indexOf(status);
    const state = (index: number): PromotionTimelineStepDto['state'] => (index < position ? 'done' : index === position ? 'current' : 'next');
    add('in-review', state(0), paidAt, position === 0 ? 'A moderator checks every ad and song before it runs, usually within a day.' : null);
    add('approved', state(1), approvedAt);
    add('live', state(2), liveAt());
    add('ended', state(3), lagosMidnight(item.endDate));
    return steps;
  }

  // Off the happy path: it was reviewed (or the payment couldn't be used), then rejected and/or refunded.
  const flagged = last((entry) => entry.toStatus === 'refund-due' || entry.toStatus === 'rejected');
  const decidedInReview = flagged?.action === 'rejected' || wasApproved;
  if (decidedInReview) add('in-review', 'done', paidAt);
  if (wasApproved) add('approved', 'done', approvedAt);
  const ranUntil = flagged?.createdAt.toISOString() ?? null;
  if (wasApproved && ranUntil && ranUntil > lagosMidnight(item.startDate)) add('live', 'done', liveAt());
  const reason = item.rejectionReason ?? flagged?.reason ?? null;
  if (status === 'rejected') {
    add('rejected', 'current', iso(flagged?.createdAt ?? item.reviewedAt), reason);
    return steps;
  }
  add('refund-due', status === 'refund-due' ? 'current' : 'done', iso(flagged?.createdAt ?? item.reviewedAt), reason);
  if (status === 'refunded') {
    const refunded = last((entry) => entry.toStatus === 'refunded');
    add('refunded', 'current', iso(refunded?.createdAt), 'Your money went back to your card or bank. It can take a few working days to show.');
  } else {
    add('refunded', 'next', null);
  }
  return steps;
}
