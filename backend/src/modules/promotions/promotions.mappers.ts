import { findBillboardSlot, findClubPlayProduct, type AdCampaignDto, type ClubPlayOrderDto, type ClubTrackDto, type IsoDate } from '@insidelife/shared';
import type { AdCampaignEntity } from './entities/ad-campaign.entity.js';
import type { ClubPlayOrderEntity } from './entities/club-play-order.entity.js';
import type { ClubTrackEntity } from './entities/club-track.entity.js';
import { lagosToday } from './rules/schedule.rules.js';
import { effectiveStatus } from './rules/status.rules.js';

/** "Now" for a response: effective statuses depend on today's Lagos date, checkout links on the hold. */
export interface Clock {
  readonly now: Date;
  readonly today: IsoDate;
}

export function clockAt(now: Date = new Date()): Clock {
  return { now, today: lagosToday(now) };
}

const iso = (date: Date | null): string | null => (date ? date.toISOString() : null);

/** The checkout link is only useful while it can still be paid and the slot is held. */
function openCheckout(entity: { status: string; checkoutUrl: string | null; holdExpiresAt: Date | null }, clock: Clock): string | null {
  if (entity.status !== 'pending-payment' || !entity.holdExpiresAt || entity.holdExpiresAt <= clock.now) return null;
  return entity.checkoutUrl;
}

export function toCampaignDto(entity: AdCampaignEntity, clock: Clock): AdCampaignDto {
  return {
    id: entity.id,
    slotId: entity.slotId,
    slotName: findBillboardSlot(entity.slotId)?.name ?? entity.slotId,
    title: entity.title,
    creativeUrl: entity.creativeUrl,
    linkUrl: entity.linkUrl,
    startDate: entity.startDate,
    endDate: entity.endDate,
    days: entity.days,
    amountKobo: entity.amountKobo,
    status: effectiveStatus(entity.status, entity, clock.today),
    rejectionReason: entity.rejectionReason,
    paymentReference: entity.paymentReference,
    checkoutUrl: openCheckout(entity, clock),
    holdExpiresAt: entity.status === 'pending-payment' ? iso(entity.holdExpiresAt) : null,
    impressions: entity.impressions,
    clicks: entity.clicks,
    createdAt: entity.createdAt.toISOString(),
    paidAt: iso(entity.paidAt),
    reviewedAt: iso(entity.reviewedAt),
  };
}

export function toClubOrderDto(entity: ClubPlayOrderEntity, clock: Clock): ClubPlayOrderDto {
  return {
    id: entity.id,
    trackId: entity.trackId,
    productId: entity.productId,
    productName: findClubPlayProduct(entity.productId)?.name ?? entity.productId,
    allClubs: entity.allClubs,
    clubs: entity.clubs,
    startDate: entity.startDate,
    endDate: entity.endDate,
    days: entity.days,
    amountKobo: entity.amountKobo,
    status: effectiveStatus(entity.status, entity, clock.today),
    rejectionReason: entity.rejectionReason,
    paymentReference: entity.paymentReference,
    checkoutUrl: openCheckout(entity, clock),
    holdExpiresAt: entity.status === 'pending-payment' ? iso(entity.holdExpiresAt) : null,
    plays: entity.plays,
    createdAt: entity.createdAt.toISOString(),
    paidAt: iso(entity.paidAt),
    reviewedAt: iso(entity.reviewedAt),
  };
}

/** `orders` newest first. */
export function toTrackDto(track: ClubTrackEntity, orders: readonly ClubPlayOrderEntity[], clock: Clock): ClubTrackDto {
  const orderDtos = orders.map((order) => toClubOrderDto(order, clock));
  return {
    id: track.id,
    artistName: track.artistName,
    title: track.title,
    audioUrl: track.audioUrl,
    contentType: track.contentType,
    durationSeconds: track.durationSeconds,
    plays: track.plays,
    removed: track.removedAt !== null,
    status: orderDtos[0]?.status ?? 'draft',
    orders: orderDtos,
    createdAt: track.createdAt.toISOString(),
  };
}
