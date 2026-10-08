import type { PromotionStatus } from '@insidelife/shared';

export type StatusTone = 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'ankara';

export interface StatusMeta {
  readonly label: string;
  readonly tone: StatusTone;
  /** One line on what happens next. */
  readonly next: string;
}

/** Every promotion status in the buyer's words. */
export const STATUS_META: Readonly<Record<PromotionStatus, StatusMeta>> = {
  draft: { label: 'Not booked', tone: 'neutral', next: 'Pick a package to put it in rotation.' },
  'pending-payment': { label: 'Waiting for payment', tone: 'warn', next: 'Finish paying to keep your spot. Unpaid holds expire.' },
  'in-review': { label: 'In review', tone: 'info', next: 'A moderator checks it before it goes live. Usually within a day.' },
  approved: { label: 'Approved', tone: 'good', next: 'Goes live on its start date.' },
  live: { label: 'Live now', tone: 'good', next: 'Showing in Lagos right now.' },
  completed: { label: 'Finished', tone: 'neutral', next: 'This run has ended.' },
  rejected: { label: 'Rejected', tone: 'bad', next: 'Taken down by a moderator.' },
  'refund-due': { label: 'Refund on the way', tone: 'ankara', next: 'Not approved, so we’re refunding you in full to your card or bank.' },
  refunded: { label: 'Refunded', tone: 'neutral', next: 'Your money has been sent back.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', next: 'You cancelled before paying. Nothing was charged.' },
};
