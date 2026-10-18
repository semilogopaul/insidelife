/**
 * Furniture: the pieces of a home, one model. A piece you bought in the furniture store (a bed, a sofa, a TV…) is the
 * same kind of thing as a piece of decor: it stands in a room at a pose, you can move it, turn it, re-finish it, put
 * it away or sell it. What furniture adds is a *function* (a bed to sleep on, a table to eat at…) that the server and
 * the 3D room both derive from where the pieces actually stand (`furnishing.ts`).
 *
 * The store sells these through the shop (`ITEMS`: price, comfort, condition, tags stay there); this table says how
 * each one stands in a room: its footprint, its function, which template slot it used to fill (for moving existing
 * players across) and how it can be re-finished. `FURNITURE_ITEMS` are `DecorItem`s so the whole placement check,
 * Decorate mode and cabin/home views serve them unchanged. Appliances (cooker, fridge…), fittings (AC, clocks, wall
 * art, chandelier) and gadgets stay fitted in the home as before.
 */
import type { DecorItem, DecorTier, DecorVariant } from './decor.js';
import { findItem } from './shop.js';

/** What a piece is for. Beds sleep, tables eat, sofas rest, TVs entertain, desks study, wardrobes dress. */
export const FURNITURE_FNS = ['sleep', 'eat', 'sit', 'tv', 'study', 'dress'] as const;
export type FurnitureFn = (typeof FURNITURE_FNS)[number];

export const FURNITURE_FN_LABELS: Readonly<Record<FurnitureFn, string>> = {
  sleep: 'a bed',
  eat: 'a table to eat at',
  sit: 'a sofa or chairs',
  tv: 'a TV',
  study: 'a desk',
  dress: 'a wardrobe',
};

/** The template slots a movable piece used to fill (see `frontend/.../templates/furnish.ts`). */
export const FURNITURE_SLOTS = ['bed', 'seating', 'dining', 'rug', 'plants', 'storage', 'desk', 'tv'] as const;
export type FurnitureSlot = (typeof FURNITURE_SLOTS)[number];

/** Decor ids of furniture start with this (shop ids such as `rug-persian` also exist as decor pieces). */
export const FURNITURE_ID_PREFIX = 'home-';

/** How a furniture piece is drawn and re-finished in the 3D room. */
export type FurniturePaint = 'fabric' | 'wood' | 'plastic' | 'sheet' | 'none';

export interface FurnitureSpec {
  /** Shop item id (`ITEMS`). */
  readonly shopItemId: string;
  readonly fn: FurnitureFn | null;
  readonly slot: FurnitureSlot;
  /** Width (x) and depth (z) in metres at rotation 0, the whole arrangement (chairs round a table, drawers by a bed). */
  readonly footprint: readonly [number, number];
  readonly height: number;
  /** Height of the top others can sit on (tables, beds, desks); also where a sleeper lies on a bed. */
  readonly surface?: number;
  /** How it can be re-finished (`none`: one finish only). */
  readonly paint: FurniturePaint;
  readonly variants: readonly DecorVariant[];
  /** Where the template's own piece of the slot stood, relative to the middle of this footprint (right, ahead). */
  readonly anchorOffset?: readonly [number, number];
}

const v = (id: string, label: string, hex: string, accent: string): DecorVariant => ({ id, label, hex, accent });

const SHEETS = [
  v('indigo', 'Indigo', '#3949ab', '#c5cae9'),
  v('magenta', 'Magenta', '#c2185b', '#f8bbd0'),
  v('green', 'Green', '#2e7d32', '#c8e6c9'),
  v('slate', 'Slate', '#455a64', '#cfd8dc'),
] as const;
const SPRING_BED = [
  v('burgundy', 'Burgundy', '#8e3b46', '#6d2c36'),
  v('navy', 'Navy', '#25365c', '#1a2644'),
  v('cream', 'Cream', '#d8cdb4', '#b0a58f'),
  v('forest', 'Forest', '#2f6b4f', '#214d39'),
] as const;
const ORTHO_BED = [
  v('cream', 'Cream', '#e8e2d6', '#b0a58f'),
  v('slate', 'Slate grey', '#7d8288', '#5b5f64'),
  v('blush', 'Blush', '#ecc9c9', '#c99a9a'),
  v('navy', 'Navy', '#25365c', '#1a2644'),
] as const;
const KING_BED = [
  v('ivory-gold', 'Ivory & gold', '#f4f0e8', '#c9a227'),
  v('midnight', 'Midnight', '#1c2541', '#c9a227'),
  v('blush', 'Blush', '#ecc9c9', '#b8912f'),
  v('emerald', 'Emerald', '#1f6b4f', '#e2c46a'),
] as const;
const PLASTIC = [
  v('white-red', 'White & red', '#ecebe6', '#c0392b'),
  v('blue', 'Blue', '#1e88e5', '#ecebe6'),
  v('green', 'Green', '#43a047', '#ecebe6'),
  v('yellow', 'Yellow', '#f6b90b', '#ecebe6'),
] as const;
const FABRIC_SOFA = [
  v('green', 'Moss green', '#4f7942', '#3c5c32'),
  v('terracotta', 'Terracotta', '#b5532f', '#8a3d22'),
  v('indigo', 'Indigo', '#2f3f7a', '#232f5c'),
  v('charcoal', 'Charcoal', '#3b3d42', '#2a2c30'),
  v('cream', 'Cream', '#e8dfc9', '#bdb095'),
] as const;
const LEATHER_SOFA = [
  v('brown', 'Chestnut', '#5d4037', '#3e2723'),
  v('black', 'Black', '#2b2b2e', '#1a1a1c'),
  v('tan', 'Tan', '#a4683a', '#7a4a29'),
  v('oxblood', 'Oxblood', '#6e2233', '#4a1522'),
] as const;
const ITALIAN_SOFA = [
  v('ivory', 'Ivory', '#f4f0e8', '#c9a227'),
  v('graphite', 'Graphite', '#3b3d42', '#c9a227'),
  v('navy', 'Navy', '#25365c', '#c9a227'),
  v('camel', 'Camel', '#b8935a', '#6e5430'),
] as const;
const DINING = [
  v('gold', 'Gold & glass', '#c9a227', '#8a6d12'),
  v('walnut', 'Walnut', '#5a3a26', '#3b2517'),
  v('oak', 'Oak', '#b58b57', '#6b4a2b'),
  v('white', 'White wash', '#ece6da', '#9b8f7a'),
] as const;
const PERSIAN = [
  v('burgundy', 'Burgundy', '#8e1b1b', '#c9a227'),
  v('indigo', 'Indigo', '#2f3f7a', '#d9d2c0'),
  v('emerald', 'Emerald', '#1f6b4f', '#e2c46a'),
  v('ivory', 'Ivory', '#e8dfc9', '#8a7a5a'),
] as const;
const WARDROBE = [
  v('mahogany', 'Mahogany', '#7a4a2a', '#5d3a22'),
  v('ebony', 'Ebony', '#26211f', '#14100f'),
  v('oak', 'Oak', '#b58b57', '#6b4a2b'),
  v('white', 'White wash', '#ece6da', '#9b8f7a'),
] as const;
const DESK = [
  v('teak', 'Teak', '#a0683a', '#7a4a29'),
  v('ebony', 'Ebony', '#26211f', '#14100f'),
  v('oak', 'Oak', '#b58b57', '#6b4a2b'),
  v('white', 'White wash', '#ece6da', '#9b8f7a'),
] as const;
const ONE_FINISH = [v('standard', 'Standard', '#2b2b2e', '#8a8a86')] as const;

/** Every furniture product that stands in a room. Order is catalog order. */
export const FURNITURE_SPECS: readonly FurnitureSpec[] = [
  { shopItemId: 'bed-foam-mattress', fn: 'sleep', slot: 'bed', footprint: [1.2, 1.9], height: 0.25, surface: 0.22, paint: 'sheet', variants: SHEETS },
  { shopItemId: 'bed-spring', fn: 'sleep', slot: 'bed', footprint: [0.9, 1.7], height: 0.6, surface: 0.4, paint: 'fabric', variants: SPRING_BED },
  { shopItemId: 'bed-orthopedic', fn: 'sleep', slot: 'bed', footprint: [1.45, 1.7], height: 0.6, surface: 0.4, paint: 'fabric', variants: ORTHO_BED },
  { shopItemId: 'bed-super-king', fn: 'sleep', slot: 'bed', footprint: [2.55, 2.05], height: 0.65, surface: 0.48, paint: 'fabric', variants: KING_BED },
  { shopItemId: 'chairs-plastic', fn: 'sit', slot: 'seating', footprint: [1.1, 0.5], height: 0.8, paint: 'plastic', variants: PLASTIC },
  { shopItemId: 'sofa-fabric', fn: 'sit', slot: 'seating', footprint: [1.5, 1.25], height: 0.7, paint: 'fabric', variants: FABRIC_SOFA },
  { shopItemId: 'sofa-leather', fn: 'sit', slot: 'seating', footprint: [1.5, 1.5], height: 0.7, paint: 'fabric', variants: LEATHER_SOFA },
  { shopItemId: 'sofa-italian', fn: 'sit', slot: 'seating', footprint: [2.8, 1.1], height: 0.95, paint: 'fabric', variants: ITALIAN_SOFA, anchorOffset: [-0.5, 0] },
  { shopItemId: 'dining-set', fn: 'eat', slot: 'dining', footprint: [1.3, 1.4], height: 0.85, surface: 0.52, paint: 'wood', variants: DINING },
  { shopItemId: 'rug-persian', fn: null, slot: 'rug', footprint: [2.4, 1.4], height: 0.02, paint: 'fabric', variants: PERSIAN },
  { shopItemId: 'plants-snake', fn: null, slot: 'plants', footprint: [0.4, 0.4], height: 1, paint: 'none', variants: ONE_FINISH },
  { shopItemId: 'wardrobe-wooden', fn: 'dress', slot: 'storage', footprint: [1.45, 0.45], height: 1.42, paint: 'wood', variants: WARDROBE },
  { shopItemId: 'desk-study', fn: 'study', slot: 'desk', footprint: [1.2, 1.25], height: 0.91, surface: 0.58, paint: 'wood', variants: DESK, anchorOffset: [0, -0.3] },
  { shopItemId: 'tv-32', fn: 'tv', slot: 'tv', footprint: [1.2, 0.45], height: 1, paint: 'none', variants: ONE_FINISH },
  { shopItemId: 'tv-55', fn: 'tv', slot: 'tv', footprint: [1.3, 0.45], height: 1.25, paint: 'none', variants: ONE_FINISH },
  { shopItemId: 'tv-75', fn: 'tv', slot: 'tv', footprint: [1.6, 0.45], height: 1.5, paint: 'none', variants: ONE_FINISH },
];

const SPEC_BY_SHOP_ID = new Map(FURNITURE_SPECS.map((spec) => [spec.shopItemId, spec]));
export const findFurnitureSpec = (shopItemId: string | null | undefined): FurnitureSpec | undefined => (shopItemId ? SPEC_BY_SHOP_ID.get(shopItemId) : undefined);

/** A shop product that becomes a piece of furniture when bought. */
export const isFurnitureProduct = (shopItemId: string): boolean => SPEC_BY_SHOP_ID.has(shopItemId);

export const furnitureDecorId = (shopItemId: string): string => `${FURNITURE_ID_PREFIX}${shopItemId}`;

const tierOf = (price: number): DecorTier => (price < 100_000 ? 'budget' : price < 500_000 ? 'standard' : price < 2_000_000 ? 'premium' : 'luxury');

/** The piece as the placement check, Decorate mode and the 3D room know it (priced and named by the shop). */
export const FURNITURE_ITEMS: readonly DecorItem[] = FURNITURE_SPECS.flatMap((spec): DecorItem[] => {
  const product = findItem(spec.shopItemId);
  if (!product) return [];
  return [
    {
      id: furnitureDecorId(spec.shopItemId),
      name: product.name,
      category: 'furniture',
      blurb: product.blurb,
      placement: 'floor',
      footprint: spec.footprint,
      height: spec.height,
      tier: tierOf(product.price),
      price: product.price,
      shape: 'kit',
      variants: spec.variants,
      ...(spec.surface !== undefined ? { surface: spec.surface } : {}),
      ...(spec.fn ? { fn: spec.fn } : {}),
      ...(spec.fn === 'sleep' && product.bedQuality !== undefined ? { quality: product.bedQuality } : {}),
      shopItemId: spec.shopItemId,
      furnitureSlot: spec.slot,
    },
  ];
});

/** Decor beds are beds too: how well they sleep, by tier. Shop beds carry their own `bedQuality`. */
export const DECOR_BED_QUALITY: Readonly<Record<DecorTier, number>> = { budget: 0.45, standard: 0.6, premium: 0.8, luxury: 0.9 };

/** Sold back to the furniture store for this share of today's shelf price (less for worn pieces). */
export const FURNITURE_SELL_BACK_RATE = 0.4;
