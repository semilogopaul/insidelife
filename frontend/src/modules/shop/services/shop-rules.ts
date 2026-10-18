import {
  formatNairaCompact,
  ACTIONS,
  CLOTHING_SLOTS,
  MAX_PURCHASE_QUANTITY,
  PANTRY_MAX_MEALS,
  MOSQUITO_NET_TAG,
  type ActionDefinition,
  type ClothingDefinition,
  type ClothingSlot,
  type ItemDefinition,
  type Outfit,
  type ShopCategory,
  type ShopProductDto,
  type StoreTier,
} from '@insidelife/shared';
import type { ReceiptLine } from '@/common/components';

// ----- What a product does for you ----------------------------------------------------------------------------------

const POWER_LABEL = {
  generator: 'NEPA backup: generator',
  inverter: 'NEPA backup: inverter',
  solar: 'NEPA backup: solar',
} as const;

/** Actions an item's capability tags unlock ("Watch Nollywood"), plus a few domain perks. */
export function unlocksFor(
  item: Pick<ItemDefinition, 'tags' | 'power'>,
  actions: readonly ActionDefinition[] = ACTIONS,
): string[] {
  const unlocked = actions
    .filter((action) => action.requires?.itemTag !== undefined && item.tags.includes(action.requires.itemTag))
    .map((action) => action.label);
  if (item.tags.includes(MOSQUITO_NET_TAG)) unlocked.push('Fewer malaria bites');
  if (item.power) unlocked.push(POWER_LABEL[item.power]);
  return [...new Set(unlocked)];
}

/** Comfort / status / sleep chips for a product card. */
export function productPerks(product: Pick<ShopProductDto, 'item' | 'clothing' | 'status' | 'price'>): string[] {
  const perks: string[] = [];
  const meals = product.item?.meals;
  if (meals) perks.push(`+${meals} meals in your kitchen`, `${formatNairaCompact(Math.round(product.price / meals))}/meal`);
  if (product.item && product.item.comfort > 0) perks.push(`+${product.item.comfort} comfort`);
  if (product.item?.bedQuality !== undefined)
    perks.push(`Sleep ${Math.round(product.item.bedQuality * 100)}%`);
  if (product.status > 0) perks.push(`+${product.status} clout`);
  return perks;
}

// ----- Browsing ------------------------------------------------------------------------------------------------------

export interface ProductFilter {
  readonly category: ShopCategory;
  /** Clothing only: store tier, or `all`. */
  readonly tier: StoreTier | 'all';
  /** Only what this store sells off the shelf. */
  readonly hereOnly: boolean;
}

export function filterProducts<
  T extends Pick<ShopProductDto, 'category' | 'store' | 'inStoreHere' | 'price'>,
>(products: readonly T[], filter: ProductFilter): T[] {
  return products
    .filter(
      (product) =>
        product.category === filter.category &&
        (filter.category !== 'clothing' || filter.tier === 'all' || product.store === filter.tier) &&
        (!filter.hereOnly || product.inStoreHere),
    )
    .sort((a, b) => a.price - b.price);
}

/** How many more you may buy (catalog cap minus owned, at most 10 at a time). */
export function maxBuyable(product: Pick<ShopProductDto, 'maxQuantity' | 'owned'>): number {
  return Math.max(0, Math.min(MAX_PURCHASE_QUANTITY, product.maxQuantity - product.owned));
}

/**
 * How many you may buy now and, when that is zero, the true reason: kitchen full, already in your wardrobe, or the cap on
 * how many of it you can keep. Never a vague "enough".
 */
export function buyLimit(
  product: Pick<ShopProductDto, 'maxQuantity' | 'owned' | 'name' | 'item' | 'clothing'>,
  pantryMeals: number,
): { readonly limit: number; readonly reason: string | null } {
  const meals = product.item?.meals;
  if (meals) {
    const room = Math.floor((PANTRY_MAX_MEALS - pantryMeals) / meals);
    if (room <= 0) return { limit: 0, reason: 'Your kitchen is full. Cook or eat some food first, then restock.' };
    return { limit: Math.min(MAX_PURCHASE_QUANTITY, room), reason: null };
  }
  const limit = maxBuyable(product);
  if (limit > 0) return { limit, reason: null };
  if (product.clothing) return { limit: 0, reason: 'This piece is already in your wardrobe.' };
  const cap = product.maxQuantity;
  return {
    limit: 0,
    reason: `You already have ${cap === 1 ? 'one' : cap} ${product.name}. ${cap === 1 ? 'You can only keep one.' : `${cap} is the most you can keep.`}`,
  };
}

/** Shelf price × quantity, plus the 10% delivery fee when ordering online. */
export function purchaseLines(
  product: Pick<ShopProductDto, 'price' | 'deliveryFee' | 'inStoreHere'>,
  quantity: number,
): { readonly lines: ReceiptLine[]; readonly total: number } {
  const n = Math.max(1, Math.floor(quantity));
  const subtotal = product.price * n;
  const lines: ReceiptLine[] = [{ label: n > 1 ? `${n} × item` : 'Item', amount: subtotal }];
  if (!product.inStoreHere) {
    const delivery = product.deliveryFee * n;
    lines.push({ label: 'Delivery (10%)', amount: delivery, note: 'Phone orders cost 10% more; it still lands right away' });
    return { lines, total: subtotal + delivery };
  }
  return { lines, total: subtotal };
}

// ----- Wardrobe ------------------------------------------------------------------------------------------------------

export const SLOT_LABELS: Record<ClothingSlot, string> = {
  top: 'Top',
  bottom: 'Bottom',
  full: 'Full outfit',
  shoes: 'Shoes',
  headwear: 'Headwear',
  eyewear: 'Eyewear',
  accessory: 'Accessory',
};

/** Wardrobe slots in dressing order (full outfits right after top/bottom). */
export const DRESSING_ORDER: readonly ClothingSlot[] = CLOTHING_SLOTS;

/** Put an item in a slot (or clear it with null) — immutable. */
export function setSlot(outfit: Outfit, slot: ClothingSlot, itemId: string | null): Outfit {
  const next: Partial<Record<ClothingSlot, string>> = { ...outfit };
  if (itemId === null) delete next[slot];
  else next[slot] = itemId;
  return next;
}

/** Client mirror of the dressing-room rule: a full outfit, or both a top and a bottom. */
export function outfitProblems(outfit: Outfit): string[] {
  if (outfit.full) return [];
  const problems: string[] = [];
  if (!outfit.top) problems.push('Add a top (or pick a full outfit).');
  if (!outfit.bottom) problems.push('Add a bottom (or pick a full outfit).');
  return problems;
}

/** Slots actually visible: a full outfit hides top and bottom. */
export function wornSlots(outfit: Outfit): ClothingSlot[] {
  return CLOTHING_SLOTS.filter(
    (slot) => outfit[slot] !== undefined && !(outfit.full && (slot === 'top' || slot === 'bottom')),
  );
}

/** Clout from what's worn (full overrides top + bottom). */
export function outfitClout(
  outfit: Outfit,
  lookup: (id: string) => Pick<ClothingDefinition, 'status'> | undefined,
): number {
  return wornSlots(outfit).reduce((sum, slot) => sum + (lookup(outfit[slot] ?? '')?.status ?? 0), 0);
}

export function sameOutfit(a: Outfit, b: Outfit): boolean {
  return CLOTHING_SLOTS.every((slot) => (a[slot] ?? null) === (b[slot] ?? null));
}
