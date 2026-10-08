import type { ModerationCampaignDto, ModerationClubOrderDto, ModerationQueueDto } from '@insidelife/shared';
import type { ModerationKind } from './moderation.api';

/** One reviewable item, whichever product it is. */
export type QueueItem =
  | { readonly kind: 'campaigns'; readonly id: string; readonly campaign: ModerationCampaignDto }
  | { readonly kind: 'club-orders'; readonly id: string; readonly order: ModerationClubOrderDto };

export type QueueSection = 'campaigns' | 'club-orders' | 'refunds';

export function itemsFor(queue: ModerationQueueDto, section: QueueSection): QueueItem[] {
  const campaigns = (list: readonly ModerationCampaignDto[]): QueueItem[] => list.map((campaign) => ({ kind: 'campaigns', id: campaign.id, campaign }));
  const orders = (list: readonly ModerationClubOrderDto[]): QueueItem[] => list.map((order) => ({ kind: 'club-orders', id: order.id, order }));
  if (section === 'campaigns') return campaigns(queue.campaigns);
  if (section === 'club-orders') return orders(queue.clubOrders);
  return [...campaigns(queue.refundsDue.campaigns), ...orders(queue.refundsDue.clubOrders)];
}

export const itemKey = (item: Pick<QueueItem, 'kind' | 'id'>): string => `${item.kind}:${item.id}`;

/** After a decision removes `removedKey`, select the item that took its place (or the new last one). */
export function nextSelection(before: readonly QueueItem[], after: readonly QueueItem[], removedKey: string): string | null {
  if (after.length === 0) return null;
  const index = before.findIndex((item) => itemKey(item) === removedKey);
  const candidate = after[Math.min(Math.max(0, index), after.length - 1)];
  return candidate ? itemKey(candidate) : null;
}

/** Reject reasons are shown to the buyer: 3–300 characters. */
export function reasonProblem(reason: string): string | null {
  const length = reason.trim().length;
  if (length < 3) return 'Write a short reason the buyer will understand (at least 3 characters).';
  if (length > 300) return 'Keep the reason under 300 characters.';
  return null;
}

export const KIND_LABEL: Readonly<Record<ModerationKind, string>> = { campaigns: 'Billboard ad', 'club-orders': 'Club play' };
