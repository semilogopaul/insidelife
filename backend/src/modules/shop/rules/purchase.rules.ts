import {
  ITEM_REPAIR_RATE,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  ONLINE_DELIVERY_FEE_RATE,
  RESALE_RANGE,
  findVenue,
  isVenueOpen,
  outletSells,
  shopOutletAt,
  startOfDay,
  type GameMinute,
  type ShopProduct,
  type VenueDefinition,
} from '@insidelife/shared';

/** Where the shopper is when they tap "Buy". */
export interface ShopperPosition {
  readonly locationId: string;
  readonly travelling: boolean;
  /** Hour of day (0-23). */
  readonly hour: number;
}

/**
 * The venue the product can be bought from off the shelf right now, or null (→ online order with delivery):
 * the character must be standing inside (not on the road) an open venue whose outlet stocks the product.
 */
export function inStoreVenue(position: ShopperPosition, product: ShopProduct): VenueDefinition | null {
  if (position.travelling) return null;
  const venue = findVenue(position.locationId);
  if (!venue || !isVenueOpen(venue, position.hour)) return null;
  const outlet = shopOutletAt(venue.id);
  return outlet && outletSells(outlet, product) ? venue : null;
}

/** Online delivery surcharge for an order subtotal. */
export function onlineDeliveryFee(subtotal: number): number {
  return Math.round((subtotal * ONLINE_DELIVERY_FEE_RATE) / 50) * 50;
}

/**
 * When the dispatch rider arrives: at the next midnight if ordered before noon, otherwise the midnight after
 * (12-36 game hours, about one game day on average). Deliveries are handed over at day end.
 */
export function deliveryArrival(orderedAt: GameMinute): GameMinute {
  const dayStart = startOfDay(orderedAt);
  const beforeNoon = orderedAt - dayStart < 12 * MINUTES_PER_HOUR;
  return dayStart + (beforeNoon ? 1 : 2) * MINUTES_PER_DAY;
}

/**
 * What a second-hand buyer pays for one unit: 30-60% of today's shelf price, the upside shrinking with wear.
 * `roll` is a deterministic 0-1 draw (per item per day).
 */
export function resaleOffer(shelfPrice: number, condition: number, roll: number): number {
  const [low, high] = RESALE_RANGE;
  const share = low + (high - low) * Math.min(1, Math.max(0, roll)) * (Math.min(100, Math.max(0, condition)) / 100);
  return Math.round((shelfPrice * share) / 50) * 50;
}

/** Expected resale value (for net worth): the middle of the buyer's range. */
export function expectedResaleValue(shelfPrice: number, condition: number): number {
  return resaleOffer(shelfPrice, condition, 0.5);
}

/** Cost to restore an item to 100 condition (null when there is nothing to repair). */
export function itemRepairCost(shelfPrice: number, condition: number): number | null {
  const missing = 100 - Math.min(100, Math.max(0, condition));
  if (missing < 1) return null;
  return Math.max(1_000, Math.round((shelfPrice * ITEM_REPAIR_RATE * missing) / 100 / 50) * 50);
}

/** Condition now, worn linearly since it was last set. */
export function conditionNow(condition: number, conditionAt: GameMinute, now: GameMinute, wearPerDay: number): number {
  const days = Math.max(0, now - conditionAt) / MINUTES_PER_DAY;
  return Math.max(0, Math.min(100, condition - wearPerDay * days));
}
