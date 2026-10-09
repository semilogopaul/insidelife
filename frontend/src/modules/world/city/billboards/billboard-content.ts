import { BILLBOARD_ROTATION_SECONDS, adWeekPriceLabel, findAdSlot, type BillboardSlotId, type LiveBillboardsDto } from '@insidelife/shared';

/**
 * What a board shows right now — pure, so the renderer and the (future) tap handler always agree.
 * Rotation is a function of wall-clock time: no state, every viewer sees the same advert at the same moment.
 */

export interface CreativeContent {
  readonly kind: 'creative';
  readonly slotId: BillboardSlotId;
  readonly campaignId: string;
  readonly imageUrl: string;
  readonly linkUrl: string;
  readonly title: string;
}

export interface HouseAdContent {
  readonly kind: 'house';
  readonly slotId: BillboardSlotId;
  readonly headline: string;
  readonly body: string;
  readonly priceLabel: string;
}

export type BillboardContent = CreativeContent | HouseAdContent;

export function houseAdFor(slotId: BillboardSlotId, live?: LiveBillboardsDto): HouseAdContent {
  const fromServer = live?.slots.find((slot) => slot.slotId === slotId)?.houseAd;
  const slot = findAdSlot(slotId);
  return {
    kind: 'house',
    slotId,
    headline: fromServer?.headline ?? 'Your ad here',
    body: fromServer?.body ?? 'Open Promote on your phone',
    // "₦175,000/week": the server's label carries the current rate; the catalog default is the fallback.
    priceLabel: fromServer?.priceLabel ?? (slot ? adWeekPriceLabel(slot.weekPriceKobo) : ''),
  };
}

/** The rotation for a slot: live creatives, plus the house ad when the board has room (or nothing is booked). */
export function rotationFor(slotId: BillboardSlotId, live?: LiveBillboardsDto): { readonly items: readonly BillboardContent[]; readonly seconds: number } {
  const slot = live?.slots.find((entry) => entry.slotId === slotId);
  const creatives: BillboardContent[] = (slot?.creatives ?? []).map((creative) => ({
    kind: 'creative',
    slotId,
    campaignId: creative.campaignId,
    imageUrl: creative.imageUrl,
    linkUrl: creative.linkUrl,
    title: creative.title,
  }));
  const items = creatives.length === 0 || slot?.hasSpace ? [...creatives, houseAdFor(slotId, live)] : creatives;
  return { items, seconds: Math.max(4, slot?.rotationSeconds ?? BILLBOARD_ROTATION_SECONDS) };
}

export function currentBillboard(slotId: BillboardSlotId, live: LiveBillboardsDto | undefined, nowMs: number): BillboardContent {
  const { items, seconds } = rotationFor(slotId, live);
  const index = Math.floor(nowMs / (seconds * 1000)) % items.length;
  return items[index] ?? houseAdFor(slotId, live);
}
