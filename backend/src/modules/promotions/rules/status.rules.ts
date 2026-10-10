import type { IsoDate, PromotionStatus } from '@insidelife/shared';
import type { DateRange } from './schedule.rules.js';

/**
 * The promotion status machine, shared by billboard campaigns and club-play orders.
 *
 *   draft → pending-payment → in-review → approved → live → completed
 *                 ↓    ↑           ↓          ↓        ↓
 *            cancelled (late pay)  └──── refund-due / rejected ────┘ → refunded
 */
const TRANSITIONS: Readonly<Record<PromotionStatus, readonly PromotionStatus[]>> = {
  // `refunded` straight from an unpaid state: the payment was refunded before it was ever delivered.
  draft: ['pending-payment', 'cancelled', 'refunded'],
  'pending-payment': ['in-review', 'refund-due', 'cancelled', 'refunded'],
  // A payment that lands after the buyer cancelled is honoured (back to review) or refunded.
  cancelled: ['in-review', 'refund-due', 'refunded'],
  'in-review': ['approved', 'live', 'refund-due', 'rejected'],
  approved: ['live', 'completed', 'refund-due', 'rejected'],
  live: ['completed', 'refund-due', 'rejected'],
  completed: [],
  rejected: [],
  'refund-due': ['refunded'],
  refunded: [],
};

export function canTransition(from: PromotionStatus, to: PromotionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Paid and not refused: these always occupy capacity. */
export const COMMITTED_STATUSES: readonly PromotionStatus[] = ['in-review', 'approved', 'live'];
/** Statuses a moderator decision applies to. */
export const REVIEWABLE_STATUSES: readonly PromotionStatus[] = ['in-review', 'approved', 'live'];
/** Statuses a payment can be applied to. */
export const PAYABLE_STATUSES: readonly PromotionStatus[] = ['draft', 'pending-payment', 'cancelled'];

/** Does the item take a place in the slot/club on its dates? Unpaid items only while their checkout hold lasts. */
export function occupiesCapacity(status: PromotionStatus, holdExpiresAt: Date | null, now: Date): boolean {
  if (COMMITTED_STATUSES.includes(status)) return true;
  return status === 'pending-payment' && holdExpiresAt !== null && holdExpiresAt.getTime() > now.getTime();
}

/** Approved runs go live and complete by calendar date; the stored status may lag until the next reconcile. */
export function effectiveStatus(status: PromotionStatus, range: DateRange, today: IsoDate): PromotionStatus {
  if (status !== 'approved' && status !== 'live') return status;
  if (today >= range.endDate) return 'completed';
  if (today >= range.startDate) return 'live';
  return 'approved';
}

export interface PaymentTarget {
  readonly status: PromotionStatus;
  readonly paymentReference: string | null;
  readonly paidAt: Date | null;
}

export type PaymentMatch = 'already-fulfilled' | 'duplicate' | 'accept';

/**
 * Idempotency of the checkout fulfiller: the same reference twice is a no-op; a second, different payment for an
 * item that is already paid (or no longer payable) must be refunded by ops.
 */
export function matchPayment(target: PaymentTarget, reference: string): PaymentMatch {
  if (target.paidAt !== null) return target.paymentReference === reference ? 'already-fulfilled' : 'duplicate';
  return PAYABLE_STATUSES.includes(target.status) ? 'accept' : 'duplicate';
}

export type Admission = { readonly kind: 'review' } | { readonly kind: 'refund'; readonly reason: string };

/**
 * After an accepted payment: go to review, or flag a refund when the run can no longer happen. The payment must be in
 * the booking's currency and for at least its charge (minor units of that currency: kobo or cents).
 */
export function admitAfterPayment(input: {
  readonly range: DateRange;
  readonly today: IsoDate;
  readonly currency: string;
  readonly chargeMinor: number;
  readonly paidCurrency: string;
  readonly paidMinor: number;
  readonly hasRoom: boolean;
}): Admission {
  if (input.paidCurrency !== input.currency || input.paidMinor < input.chargeMinor) {
    return { kind: 'refund', reason: 'The payment didn’t match the price. You’ll get a full refund.' };
  }
  if (input.today >= input.range.endDate) return { kind: 'refund', reason: 'Your booked dates passed before the payment landed. You’ll get a full refund.' };
  if (!input.hasRoom) return { kind: 'refund', reason: 'The space filled up before your payment landed. You’ll get a full refund.' };
  return { kind: 'review' };
}

export type RefundSettlement =
  /** Owed refund done (`refund-due` → `refunded`), or a running item refunded from the dashboard: taken down. */
  | { readonly kind: 'refunded'; readonly takenDown: boolean }
  /** The refund was for another payment of this item (a duplicate payment): nothing changes on the item. */
  | { readonly kind: 'duplicate-payment' }
  | { readonly kind: 'none' };

/**
 * What a recorded refund (ours or one made in the gateway dashboard) does to the item it paid for. Finished items
 * (completed, rejected, already refunded) don't change.
 */
export function refundSettlement(item: { readonly status: PromotionStatus; readonly paymentReference: string | null }, paymentReference: string): RefundSettlement {
  if (item.paymentReference !== paymentReference) return { kind: 'duplicate-payment' };
  if (item.status === 'refund-due') return { kind: 'refunded', takenDown: false };
  if (COMMITTED_STATUSES.includes(item.status)) return { kind: 'refunded', takenDown: true };
  // Refunded before the payment was ever confirmed (e.g. from the dashboard): the booking ends now, its hold is released,
  // instead of sitting at "awaiting payment" until the hold runs out.
  if (PAYABLE_STATUSES.includes(item.status)) return { kind: 'refunded', takenDown: false };
  return { kind: 'none' };
}

export type ModerationDecision =
  | { readonly action: 'approve' }
  /** `refund` omitted = the policy default: refund what hasn't started running, not what has. */
  | { readonly action: 'reject'; readonly refund?: boolean }
  | { readonly action: 'mark-refunded' };

export interface ModeratedItem extends DateRange {
  readonly status: PromotionStatus;
  readonly paidAt: Date | null;
}

export type ModerationOutcome =
  | {
      readonly ok: true;
      readonly to: PromotionStatus;
      /** Refund the payer through the gateway now (rejected before it started running). */
      readonly autoRefund: boolean;
      /** It was running when taken down. */
      readonly wasRunning: boolean;
    }
  | { readonly ok: false; readonly message: string };

/**
 * What a moderator's decision does to an item. Approvals only apply to items in review whose run hasn't ended;
 * rejections apply to anything paid and not finished (a live ad can be taken down).
 *
 * Refund policy (the public terms): an ad or song rejected before it starts running is refunded in full,
 * automatically. Once it has started running there is no refund: it is taken down (`rejected`). The moderator can
 * still choose to refund a running item (`refund: true`), which lands it in "refunds due" for a manual refund in the
 * Flutterwave dashboard, never an automatic one; and can withhold the refund of an unstarted item (`refund: false`:
 * fraud, repeat abuse).
 */
export function decideModeration(item: ModeratedItem, decision: ModerationDecision, today: IsoDate): ModerationOutcome {
  const current = effectiveStatus(item.status, item, today);
  const wasRunning = current === 'live';
  let to: PromotionStatus;
  let autoRefund = false;
  switch (decision.action) {
    case 'approve':
      if (current !== 'in-review') return { ok: false, message: `Only items in review can be approved (this one is ${current})` };
      if (today >= item.endDate) return { ok: false, message: 'This run has already ended — reject it with a refund instead' };
      to = effectiveStatus('approved', item, today);
      break;
    case 'reject': {
      if (!REVIEWABLE_STATUSES.includes(current)) return { ok: false, message: `This item can’t be rejected (it is ${current})` };
      const refund = (decision.refund ?? !wasRunning) && item.paidAt !== null;
      to = refund ? 'refund-due' : 'rejected';
      autoRefund = refund && !wasRunning;
      break;
    }
    case 'mark-refunded':
      if (current !== 'refund-due') return { ok: false, message: `Only items awaiting a refund can be marked refunded (this one is ${current})` };
      to = 'refunded';
      break;
  }
  // Transitions are checked from the stored status: a lagging 'approved' that is effectively live may still move on.
  return canTransition(item.status, to) ? { ok: true, to, autoRefund, wasRunning } : { ok: false, message: `Can’t move from ${item.status} to ${to}` };
}

export type RefundReversal =
  /** The refund we recorded for this item's payment failed after all: back under "refunds due". */
  | { readonly kind: 'back-to-refund-due' }
  /** Still waiting for its refund (`refund-due`): nothing moves, it's logged. */
  | { readonly kind: 'still-due' }
  | { readonly kind: 'none' };

/**
 * A refund of an item's payment failed at the gateway. If it had been settled (`refunded`), the item goes back to
 * `refund-due` for a manual refund — the only way out of `refunded`, used by the payments system, never by moderators.
 */
export function refundReversal(item: { readonly status: PromotionStatus; readonly paymentReference: string | null }, paymentReference: string): RefundReversal {
  if (item.paymentReference !== paymentReference) return { kind: 'none' };
  if (item.status === 'refunded') return { kind: 'back-to-refund-due' };
  if (item.status === 'refund-due') return { kind: 'still-due' };
  return { kind: 'none' };
}
