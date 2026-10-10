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

/** `wasRunning`: taken down after it started; per the terms it isn't refunded (unless a refund was granted anyway). */
export function rejectedNotice(subject: NoticeSubject, reason: string, refund: boolean, wasRunning = false): PromotionNotice {
  const money = refund ? ' Your payment will be refunded in full.' : wasRunning ? ' It had already started running, so it isn’t refunded.' : '';
  return {
    title: wasRunning ? `${subject.noun} taken down` : `${subject.noun} not approved`,
    body: `${quoted(subject)} ${wasRunning ? 'was taken down' : 'wasn’t approved'}: ${reason}${money}`,
    tone: 'bad',
  };
}

/** Deep links into the Promote app (see the frontend's PromoteApp): an ad's or a song order's detail. */
export const campaignLink = (campaignId: string): string => `campaign:${campaignId}`;
export const songLink = (orderId: string, venueId?: string): string => (venueId ? `song:${orderId}:${venueId}` : `song:${orderId}`);

const count = (value: number, one: string, many: string): string => `${value.toLocaleString('en-NG')} ${value === 1 ? one : many}`;

export function adLiveNotice(campaignId: string, title: string, where: string): PromotionNotice {
  return {
    title: 'Your ad is live',
    body: `“${title}” is up on ${where} now. Every player who passes it counts as a view.`,
    tone: 'good',
    link: { app: 'promote', param: campaignLink(campaignId), label: 'See it' },
  };
}

export function adEndedNotice(campaignId: string, title: string, where: string, views: number, viewers: number): PromotionNotice {
  return {
    title: `Your campaign has ended: ${count(views, 'view', 'views')}`,
    body: `“${title}” on ${where} finished its run: ${count(views, 'view', 'views')} from ${count(viewers, 'player', 'players')}. Run it again any time.`,
    tone: 'neutral',
    link: { app: 'promote', param: campaignLink(campaignId), label: 'Run it again' },
  };
}

export function songLiveNotice(orderId: string, song: string): PromotionNotice {
  return {
    title: 'Your song is in rotation',
    body: `“${song}” plays in every club and lounge from today. Open Promote to see when and where it plays next.`,
    tone: 'good',
    link: { app: 'promote', param: songLink(orderId), label: 'See the times' },
  };
}

/** "🎶 Your song is on at Quilox now. Go hear it!" with a way there. */
export function songPlayingNotice(orderId: string, song: string, venueId: string, venueName: string, canEnter: boolean): PromotionNotice {
  return {
    title: `🎶 Your song is on at ${venueName} now`,
    body: canEnter ? `“${song}” is playing at ${venueName}. Go hear it!` : `“${song}” is playing at ${venueName} right now.`,
    tone: 'good',
    link: canEnter ? { app: 'promote', param: songLink(orderId, venueId), label: 'Take me there' } : { app: 'promote', param: songLink(orderId), label: 'See the times' },
  };
}

export function songEndedNotice(orderId: string, song: string, plays: number, listeners: number, clubs: number): PromotionNotice {
  return {
    title: `Your song’s run has ended: ${count(plays, 'play', 'plays')}`,
    body: `“${song}” played ${count(plays, 'time', 'times')} in ${count(clubs, 'club', 'clubs')} and was heard by ${count(listeners, 'player', 'players')}. Run it again any time.`,
    tone: 'neutral',
    link: { app: 'promote', param: songLink(orderId), label: 'Run it again' },
  };
}

export function refundedNotice(subject: NoticeSubject, amountKobo: number): PromotionNotice {
  return {
    title: `${subject.noun} refund sent`,
    body: `${formatNaira(koboToNaira(amountKobo))} for ${quoted(subject)} has been refunded to your card or bank. It can take a few working days to show.`,
    tone: 'neutral',
  };
}
