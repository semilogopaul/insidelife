/** Shop API contracts — owned by the shop domain. */
import type { GameMinute } from '../time/calendar.js';
import type { ClothingDefinition, Outfit, StoreTier } from '../catalog/appearance.js';
import type { VenueType } from '../catalog/venues.js';
import type { ItemDefinition, PowerBackupKind, ShopCategory } from '../catalog/shop.js';

// ----- Catalogue ---------------------------------------------------------------------------------------------------

/** GET /v1/shop?category=&venueId= */
export interface ShopQuery {
  readonly category?: ShopCategory;
  /** Only products this venue sells in person (defaults to everything listed). */
  readonly venueId?: string;
}

export interface ShopVenueDto {
  readonly id: string;
  readonly name: string;
  readonly type: VenueType;
  /** What the outlet is known for, or null if it doesn't sell anything in person. */
  readonly label: string | null;
  readonly open: boolean;
  /** The character is inside right now (and can buy off the shelf). */
  readonly here: boolean;
}

export interface ShopProductDto {
  readonly id: string;
  readonly kind: 'item' | 'clothing';
  readonly name: string;
  readonly category: ShopCategory;
  readonly store: StoreTier;
  /** Shelf price right now (world price index applied). */
  readonly price: number;
  /** Extra charged when ordering online (per unit). */
  readonly deliveryFee: number;
  readonly status: number;
  /** Venue ids that sell it in person. */
  readonly soldAt: readonly string[];
  /** Can be bought off the shelf where the character is standing right now. */
  readonly inStoreHere: boolean;
  /** Units owned (plus any legacy order still arriving). */
  readonly owned: number;
  readonly maxQuantity: number;
  readonly item: ItemDefinition | null;
  readonly clothing: ClothingDefinition | null;
}

export interface ShopCatalogDto {
  /** The venue the catalogue is filtered to (or where the character is), if any. */
  readonly venue: ShopVenueDto | null;
  readonly products: readonly ShopProductDto[];
}

// ----- Purchases & deliveries --------------------------------------------------------------------------------------

/** POST /v1/shop/purchases — lands in your things at once; ordering from the phone (not in a venue that sells it) adds a delivery fee. */
export interface ShopPurchaseRequest {
  readonly itemId: string;
  /** Default 1. Clothing is always 1. */
  readonly quantity?: number;
  /** "Tap once" key (a UUID per purchase): a retry with the same key gets the first result back instead of buying twice. */
  readonly idempotencyKey?: string;
}

export type ShopChannel = 'in-store' | 'online';
export type ShopOrderStatus = 'delivered' | 'pending';

export interface ShopOrderDto {
  readonly id: string;
  readonly itemId: string;
  readonly name: string;
  readonly kind: 'item' | 'clothing';
  readonly quantity: number;
  readonly unitPrice: number;
  readonly deliveryFee: number;
  readonly total: number;
  readonly channel: ShopChannel;
  readonly venueId: string | null;
  readonly status: ShopOrderStatus;
  readonly orderedAt: GameMinute;
  /** Online orders: when the dispatch rider arrives. */
  readonly arrivesAt: GameMinute | null;
}

export interface ShopPurchaseResultDto {
  readonly order: ShopOrderDto;
  /** The owned stack, the stack it joined. */
  readonly inventoryItem: InventoryItemDto | null;
  readonly balance: number;
}

// ----- Inventory ---------------------------------------------------------------------------------------------------

export interface InventoryItemDto {
  /** Inventory row id (use for sale/repair). */
  readonly id: string;
  readonly itemId: string;
  readonly kind: 'item' | 'clothing';
  readonly name: string;
  readonly category: ShopCategory;
  readonly quantity: number;
  /** 0-100 right now. */
  readonly condition: number;
  /** Below the faulty threshold: no comfort, power or capability tags until repaired. */
  readonly faulty: boolean;
  readonly acquiredAt: GameMinute;
  readonly source: InventorySource;
  /** Currently worn (clothing). */
  readonly equipped: boolean;
  /** What a buyer offers for one unit today. */
  readonly resaleOffer: number;
  /** Cost to restore to 100 condition (null if it can't be repaired or doesn't need it). */
  readonly repairCost: number | null;
  readonly item: ItemDefinition | null;
  readonly clothing: ClothingDefinition | null;
}

export type InventorySource = 'store' | 'online' | 'starter' | 'gift' | 'event';

/** What your belongings add at home (fed to the housing domain's comfort calculation). */
export interface BelongingsComfortDto {
  /** 0-15 comfort from furniture and appliances. */
  readonly comfort: number;
  /** 0.2-1 best bed. */
  readonly bedQuality: number;
  readonly power: PowerBackupKind;
}

export interface InventoryDto {
  readonly items: readonly InventoryItemDto[];
  readonly deliveries: readonly ShopOrderDto[];
  readonly home: BelongingsComfortDto;
  /** Capability tags your belongings provide (`tv`, `laptop`, `phone`…). */
  readonly tags: readonly string[];
}

/** POST /v1/inventory/:id/sale */
export interface InventorySaleRequest {
  /** Default 1. */
  readonly quantity?: number;
}

export interface InventorySaleResultDto {
  readonly itemId: string;
  readonly quantity: number;
  readonly amount: number;
  readonly balance: number;
}

/** POST /v1/inventory/:id/repairs */
export interface InventoryRepairResultDto {
  readonly item: InventoryItemDto;
  readonly cost: number;
  readonly balance: number;
}

// ----- Wardrobe ----------------------------------------------------------------------------------------------------

export interface WardrobeItemDto {
  readonly inventoryId: string;
  readonly equipped: boolean;
  readonly clothing: ClothingDefinition;
}

export interface WardrobeDto {
  readonly outfit: Outfit;
  readonly items: readonly WardrobeItemDto[];
  /** Status points from what you're wearing. */
  readonly outfitStatus: number;
}

/** PUT /v1/wardrobe — every slot must hold an owned clothing item for that slot; `full` overrides top + bottom. */
export interface UpdateWardrobeRequest {
  readonly outfit: Outfit;
}
