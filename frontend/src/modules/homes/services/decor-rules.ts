import { DECOR_ITEMS, DECOR_MAX_OWNED, DECOR_MAX_PER_PURCHASE, type DecorCategory, type DecorItem, type DecorPieceDto, type DecorPlacementType, type DecorTier } from '@insidelife/shared';

export const PLACEMENT_LABEL: Readonly<Record<DecorPlacementType, string>> = {
  floor: 'On the floor',
  wall: 'On the wall',
  tabletop: 'On a table, bed or shelf',
};

export const TIER_LABEL: Readonly<Record<DecorTier, string>> = {
  budget: 'Budget',
  standard: 'Standard',
  premium: 'Premium',
  luxury: 'Luxury',
};

const TIER_ORDER: Readonly<Record<DecorTier, number>> = { budget: 0, standard: 1, premium: 2, luxury: 3 };

/** The store's shelf for one category, cheapest first (by today's prices). */
export function shelf(category: DecorCategory, prices: Readonly<Record<string, number>>): DecorItem[] {
  return DECOR_ITEMS.filter((item) => item.category === category).toSorted(
    (a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || (prices[a.id] ?? a.price) - (prices[b.id] ?? b.price) || a.name.localeCompare(b.name),
  );
}

/** How many of an item you can buy in one go: the per-purchase cap and the room left in your collection. */
export function maxBuyable(owned: number): number {
  return Math.max(0, Math.min(DECOR_MAX_PER_PURCHASE, DECOR_MAX_OWNED - owned));
}

export interface DecorSummary {
  readonly total: number;
  readonly placed: number;
  readonly stored: number;
}

/** "12 pieces, 9 on display" for the top of the store. */
export function summarise(pieces: readonly DecorPieceDto[]): DecorSummary {
  const placed = pieces.filter((piece) => piece.spot !== null).length;
  return { total: pieces.length, placed, stored: pieces.length - placed };
}

/** How many of each item you own (for "You have 2"). */
export function ownedCounts(pieces: readonly DecorPieceDto[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const piece of pieces) counts.set(piece.itemId, (counts.get(piece.itemId) ?? 0) + 1);
  return counts;
}
