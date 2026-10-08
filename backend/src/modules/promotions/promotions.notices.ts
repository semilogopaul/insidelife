import { formatNaira, koboToNaira, type IsoDate } from '@insidelife/shared';
import type { PromotionNotice } from './promotions-notifier.service.js';

/** What the buyer is told about: "Billboard" + ad title + board, or "Club rotation" + song + clubs. */
export interface NoticeSubject {
  readonly noun: 'Billboard' | 'Club rotation';
  /** Ad title or "Artist – Song". */
  readonly name: string;
  /** Board name or club(s). */
  readonly where: string;
}

const quoted = (subject: NoticeSubject): string => `“${subject.name}”`;

export function paidNotice(subject: NoticeSubject): PromotionNotice {
  return {
    title: `${subject.noun} payment received`,
    body: `${quoted(subject)} on ${subject.where} is in review. We’ll tell you as soon as a moderator approves it.`,
    tone: 'good',
  };
}

export function autoRefundNotice(subject: NoticeSubject, reason: string): PromotionNotice {
  return { title: `${subject.noun} refund on the way`, body: `${quoted(subject)}: ${reason}`, tone: 'neutral' };
}

export function approvedNotice(subject: NoticeSubject, live: boolean, startDate: IsoDate): PromotionNotice {
  return {
    title: `${subject.noun} approved`,
    body: live ? `${quoted(subject)} is now live on ${subject.where}.` : `${quoted(subject)} goes live on ${subject.where} on ${startDate}.`,
    tone: 'good',
  };
}

export function rejectedNotice(subject: NoticeSubject, reason: string, refund: boolean): PromotionNotice {
  return {
    title: `${subject.noun} not approved`,
    body: `${quoted(subject)} wasn’t approved: ${reason}${refund ? ' Your payment will be refunded in full.' : ''}`,
    tone: 'bad',
  };
}

export function refundedNotice(subject: NoticeSubject, amountKobo: number): PromotionNotice {
  return {
    title: `${subject.noun} refund sent`,
    body: `${formatNaira(koboToNaira(amountKobo))} for ${quoted(subject)} has been refunded to your card or bank. It can take a few working days to show.`,
    tone: 'neutral',
  };
}
