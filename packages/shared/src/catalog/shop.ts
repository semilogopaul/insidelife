/**
 * Shop catalog — owned by the shop domain.
 *
 * Two kinds of products:
 * - **Items** (furniture, appliances, gadgets, power backup, essentials): add home comfort, unlock actions through
 *   capability `tags` (`tv`, `console`, `laptop`…) and power the NEPA mitigation (generator → inverter → solar).
 * - **Clothing** (`ClothingDefinition` from the appearance catalog): equipped into avatar slots, adds status.
 *
 * Where you can buy in person is data: each shopping venue has an outlet profile (which store tiers and item
 * categories are on its shelves). Anything can also be ordered online for a delivery fee.
 * Prices are 2026 Lagos base prices (₦, VAT included) before the world price index.
 */
import {
  STORE_TIERS,
  type ClothingDefinition,
  type ClothingSlot,
  type ClothingStyle,
  type StoreTier,
} from './appearance.js';
import { VENUES, findVenue, type VenueType } from './venues.js';

// ---------------------------------------------------------------------------------------------------------------
// Categories, power and rules
// ---------------------------------------------------------------------------------------------------------------

export const ITEM_CATEGORIES = ['furniture', 'appliances', 'electronics', 'power', 'phones', 'computers', 'essentials'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** Categories in the Shop app (items plus clothing). */
export const SHOP_CATEGORIES = [...ITEM_CATEGORIES, 'clothing'] as const;
export type ShopCategory = (typeof SHOP_CATEGORIES)[number];

export const SHOP_CATEGORY_LABELS: Readonly<Record<ShopCategory, string>> = {
  furniture: 'Furniture',
  appliances: 'Appliances',
  electronics: 'TV & Gaming',
  power: 'Power (NEPA wahala)',
  phones: 'Phones',
  computers: 'Laptops',
  essentials: 'Essentials',
  clothing: 'Clothes & Drip',
};

/** NEPA mitigation, weakest first. */
export const POWER_BACKUPS = ['none', 'generator', 'inverter', 'solar'] as const;
export type PowerBackupKind = (typeof POWER_BACKUPS)[number];

/** Items below this condition (0-100) are faulty: no comfort, no power, no capability tags until repaired. */
export const FAULTY_CONDITION = 25;
/** Most home comfort furniture and appliances can add on top of lifestyle and housing. */
export const MAX_FURNITURE_COMFORT = 15;
/** Sleep quality with no bed at all (a mat on the floor). */
export const NO_BED_QUALITY = 0.2;
/** Online orders pay this share of the price on top as a delivery fee. */
export const ONLINE_DELIVERY_FEE_RATE = 0.1;
/** Second-hand buyers pay this share of today's shelf price (scaled by condition). */
export const RESALE_RANGE = [0.3, 0.6] as const;
/** Repairing an item from 0 to 100 condition costs this share of its shelf price. */
export const ITEM_REPAIR_RATE = 0.35;
/** Most units of one product a single purchase can order. */
export const MAX_PURCHASE_QUANTITY = 10;

/** Typical clothing price bands per store tier (₦). */
export const STORE_TIER_PRICE_RANGES: Readonly<Record<StoreTier, readonly [number, number]>> = {
  okrika: [2_000, 15_000],
  market: [8_000, 80_000],
  mall: [25_000, 300_000],
  designer: [200_000, 5_000_000],
};

export const STORE_TIER_LABELS: Readonly<Record<StoreTier, string>> = {
  okrika: 'Okrika (thrift)',
  market: 'Market',
  mall: 'Mall',
  designer: 'Designer',
};

// ---------------------------------------------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------------------------------------------

export interface ItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly category: ItemCategory;
  readonly emoji: string;
  readonly blurb: string;
  /** Base price (₦) before the world price index. */
  readonly price: number;
  readonly store: StoreTier;
  /** Capability tags: unlock actions (`tv`, `console`, `laptop`) and domain checks (`mosquito-net`, `phone`). */
  readonly tags: readonly string[];
  /** Home comfort points. Only the best item per `group` counts; totals have diminishing returns (max +15). */
  readonly comfort: number;
  /** Items in one group don't stack (two beds don't make you sleep twice). */
  readonly group: string;
  /** 0.2-1 sleep quality (beds only). */
  readonly bedQuality?: number;
  /**
   * NEPA backup this item provides. Power items add no comfort points themselves: the housing domain turns the best
   * backup into a smaller blackout penalty (and buys the generator fuel).
   */
  readonly power?: Exclude<PowerBackupKind, 'none'>;
  /** Status (clout) while owned; the best item per group counts. */
  readonly status: number;
  /** Condition (0-100) lost per game day of ownership. */
  readonly wearPerDay: number;
  /** Most units one character can own. */
  readonly maxQuantity: number;
  /** Event/gift only — never on shelves. */
  readonly unlisted?: boolean;
}

type ItemInput = Omit<ItemDefinition, 'tags' | 'status' | 'wearPerDay' | 'maxQuantity' | 'comfort'> &
  Partial<Pick<ItemDefinition, 'tags' | 'status' | 'wearPerDay' | 'maxQuantity' | 'comfort'>>;

const item = (input: ItemInput): ItemDefinition => ({
  tags: [],
  status: 0,
  wearPerDay: 0,
  maxQuantity: 1,
  comfort: 0,
  ...input,
});

export const ITEMS: readonly ItemDefinition[] = [
  // --- Furniture ------------------------------------------------------------------------------------------------
  item({ id: 'bed-foam-mattress', name: 'Vitafoam Mattress (on the floor)', category: 'furniture', emoji: '🛏️', blurb: 'Your first bed. Back pain sold separately.', price: 85_000, store: 'market', tags: ['bed'], comfort: 2, group: 'bed', bedQuality: 0.35, wearPerDay: 0.02 }),
  item({ id: 'bed-spring', name: 'Spring Bed & Wooden Frame', category: 'furniture', emoji: '🛏️', blurb: 'Off the floor at last. The springs only squeak a little.', price: 420_000, store: 'market', tags: ['bed'], comfort: 4, group: 'bed', bedQuality: 0.55, status: 1, wearPerDay: 0.015 }),
  item({ id: 'bed-orthopedic', name: 'Orthopedic Mattress & Upholstered Bed', category: 'furniture', emoji: '🛏️', blurb: 'Your spine says thank you. Wake up like a new person.', price: 1_250_000, store: 'mall', tags: ['bed'], comfort: 6, group: 'bed', bedQuality: 0.8, status: 4, wearPerDay: 0.01 }),
  item({ id: 'bed-super-king', name: 'Super King Bed (Hotel Suite Feel)', category: 'furniture', emoji: '👑', blurb: 'Eko Hotel suite energy, in your own room.', price: 3_800_000, store: 'designer', tags: ['bed'], comfort: 8, group: 'bed', bedQuality: 1, status: 10, wearPerDay: 0.008 }),
  item({ id: 'chairs-plastic', name: 'Plastic Chairs (set of 4)', category: 'furniture', emoji: '🪑', blurb: 'Owambe-certified. Stackable when visitors leave.', price: 38_000, store: 'market', comfort: 0.5, group: 'seating', wearPerDay: 0.02 }),
  item({ id: 'sofa-fabric', name: '3-Seater Fabric Sofa', category: 'furniture', emoji: '🛋️', blurb: 'Carpenter-made in Ikorodu. Cover it in nylon to keep it new.', price: 650_000, store: 'market', comfort: 3, group: 'seating', status: 1, wearPerDay: 0.01 }),
  item({ id: 'sofa-leather', name: 'L-Shaped Leather Sofa', category: 'furniture', emoji: '🛋️', blurb: 'Seats the whole family for Sunday rice.', price: 2_600_000, store: 'mall', comfort: 5, group: 'seating', status: 5, wearPerDay: 0.008 }),
  item({ id: 'sofa-italian', name: 'Italian Recliner Set (7-seater)', category: 'furniture', emoji: '🛋️', blurb: 'Press a button, lie back, feel like a senator.', price: 9_500_000, store: 'designer', comfort: 7, group: 'seating', status: 15, wearPerDay: 0.006 }),
  item({ id: 'dining-set', name: '6-Seater Dining Set', category: 'furniture', emoji: '🍽️', blurb: 'Glass top, gold legs. Nobody eats on the floor here.', price: 1_100_000, store: 'mall', comfort: 2, group: 'dining', status: 2, wearPerDay: 0.006 }),
  item({ id: 'rug-persian', name: 'Persian-style Rug', category: 'furniture', emoji: '🧶', blurb: 'From Balogun. "Imported", the trader swore.', price: 180_000, store: 'market', comfort: 1, group: 'rug', status: 1, wearPerDay: 0.01 }),
  item({ id: 'plants-snake', name: 'Potted Snake Plants', category: 'furniture', emoji: '🪴', blurb: 'Fresh air and good vibes. Hard to kill.', price: 25_000, store: 'market', comfort: 0.8, group: 'plants', maxQuantity: 5 }),
  item({ id: 'wardrobe-wooden', name: 'Wooden Wardrobe', category: 'furniture', emoji: '🚪', blurb: 'Your clothes deserve better than a Ghana-Must-Go bag.', price: 350_000, store: 'market', tags: ['wardrobe'], comfort: 1.5, group: 'storage', wearPerDay: 0.005 }),

  // --- Appliances -----------------------------------------------------------------------------------------------
  item({ id: 'fan-standing', name: 'Standing Fan', category: 'appliances', emoji: '🌀', blurb: 'Life support in March heat — when there is light.', price: 55_000, store: 'market', tags: ['fan'], comfort: 1.5, group: 'cooling', wearPerDay: 0.04, maxQuantity: 4 }),
  item({ id: 'ac-split', name: '1.5HP Split Air Conditioner', category: 'appliances', emoji: '❄️', blurb: 'Sleep like you live in London. Bill like you live in London.', price: 850_000, store: 'mall', tags: ['ac'], comfort: 4.5, group: 'cooling', status: 3, wearPerDay: 0.04, maxQuantity: 4 }),
  item({ id: 'fridge-tabletop', name: 'Table-top Fridge', category: 'appliances', emoji: '🧊', blurb: 'Cold water and one pot of stew. Priorities.', price: 230_000, store: 'market', tags: ['fridge'], comfort: 1.5, group: 'fridge', wearPerDay: 0.03 }),
  item({ id: 'fridge-double', name: 'Double-door Fridge', category: 'appliances', emoji: '🧊', blurb: 'Room for a month of soup. Mama would be proud.', price: 780_000, store: 'mall', tags: ['fridge'], comfort: 2.5, group: 'fridge', status: 2, wearPerDay: 0.025 }),
  item({ id: 'cooker-gas', name: '4-Burner Gas Cooker', category: 'appliances', emoji: '🔥', blurb: 'Goodbye kerosene stove, hello oven you will never use.', price: 190_000, store: 'market', tags: ['cooker'], comfort: 1.5, group: 'cooker', wearPerDay: 0.02 }),
  item({ id: 'washing-machine', name: 'Front-load Washing Machine', category: 'appliances', emoji: '🧺', blurb: 'No more Saturday hand-washing marathon.', price: 520_000, store: 'mall', tags: ['washing-machine'], comfort: 2, group: 'laundry', status: 1, wearPerDay: 0.03 }),

  // --- TV & gaming ----------------------------------------------------------------------------------------------
  item({ id: 'tv-32', name: '32" LED TV', category: 'electronics', emoji: '📺', blurb: 'Nollywood, football and Big Brother. Enough said.', price: 170_000, store: 'market', tags: ['tv'], comfort: 1.5, group: 'tv', wearPerDay: 0.025, maxQuantity: 3 }),
  item({ id: 'tv-55', name: '55" 4K Smart TV', category: 'electronics', emoji: '📺', blurb: 'Netflix in 4K. The neighbours come for the Champions League.', price: 720_000, store: 'mall', tags: ['tv'], comfort: 2.5, group: 'tv', status: 3, wearPerDay: 0.02, maxQuantity: 3 }),
  item({ id: 'tv-75', name: '75" QLED TV', category: 'electronics', emoji: '📺', blurb: 'Basically a cinema. Wall-mount guy not included.', price: 2_350_000, store: 'mall', tags: ['tv'], comfort: 3.5, group: 'tv', status: 8, wearPerDay: 0.02, maxQuantity: 3 }),
  item({ id: 'ps5', name: 'PlayStation 5', category: 'electronics', emoji: '🎮', blurb: 'FIFA nights. "One more match" at 2am.', price: 1_050_000, store: 'mall', tags: ['console'], comfort: 2, group: 'console', status: 6, wearPerDay: 0.04 }),
  item({ id: 'sound-system', name: 'Home Theatre Sound System', category: 'electronics', emoji: '🔊', blurb: 'Bass that rattles the louvres. The landlord will hear.', price: 420_000, store: 'mall', tags: ['sound-system'], comfort: 1.5, group: 'audio', status: 2, wearPerDay: 0.03 }),

  // --- Power (NEPA wahala) --------------------------------------------------------------------------------------
  item({ id: 'gen-small', name: '"I Better Pass My Neighbour" Generator', category: 'power', emoji: '⛽', blurb: 'Small petrol gen. Loud, smoky, and it will save your night.', price: 230_000, store: 'market', tags: ['generator'], group: 'power', power: 'generator', wearPerDay: 0.12 }),
  item({ id: 'gen-diesel', name: 'Soundproof Diesel Generator (20kVA)', category: 'power', emoji: '🏭', blurb: 'Runs the whole house — AC included. Diesel is not cheap o.', price: 14_500_000, store: 'mall', tags: ['generator'], group: 'power', power: 'generator', status: 12, wearPerDay: 0.05 }),
  item({ id: 'inverter', name: '3.5kVA Inverter + 4 Batteries', category: 'power', emoji: '🔋', blurb: 'Silent backup. Charges when NEPA remembers you.', price: 2_800_000, store: 'mall', tags: ['inverter'], group: 'power', power: 'inverter', status: 3, wearPerDay: 0.03 }),
  item({ id: 'solar', name: '5kVA Solar System (Panels + Lithium)', category: 'power', emoji: '☀️', blurb: 'Free light from the Lagos sun. NEPA can do whatever it likes.', price: 8_500_000, store: 'mall', tags: ['solar'], group: 'power', power: 'solar', status: 8, wearPerDay: 0.012 }),

  // --- Phones ---------------------------------------------------------------------------------------------------
  item({ id: 'phone-tecno-spark', name: 'Tecno Spark', category: 'phones', emoji: '📱', blurb: 'Big battery, bigger camera beauty mode.', price: 165_000, store: 'market', tags: ['phone'], group: 'phone', wearPerDay: 0.06, maxQuantity: 2 }),
  item({ id: 'phone-infinix-hot', name: 'Infinix Hot', category: 'phones', emoji: '📱', blurb: 'Fast enough for TikTok, cheap enough to not cry.', price: 230_000, store: 'market', tags: ['phone'], group: 'phone', status: 1, wearPerDay: 0.06, maxQuantity: 2 }),
  item({ id: 'phone-iphone-13-uk', name: 'iPhone 13 (UK-used)', category: 'phones', emoji: '📱', blurb: '"London used", battery health 86%. Blue ticks with class.', price: 720_000, store: 'market', tags: ['phone'], group: 'phone', status: 6, wearPerDay: 0.05, maxQuantity: 2 }),
  item({ id: 'phone-samsung-a56', name: 'Samsung Galaxy A56', category: 'phones', emoji: '📱', blurb: 'Solid all-rounder. Your aunty approves.', price: 690_000, store: 'mall', tags: ['phone'], group: 'phone', status: 4, wearPerDay: 0.05, maxQuantity: 2 }),
  item({ id: 'phone-samsung-s26-ultra', name: 'Samsung Galaxy S26 Ultra', category: 'phones', emoji: '📱', blurb: '200MP zoom — you can see the agbero across the road.', price: 2_400_000, store: 'mall', tags: ['phone'], group: 'phone', status: 14, wearPerDay: 0.04, maxQuantity: 2 }),
  item({ id: 'phone-iphone-17-pro-max', name: 'iPhone 17 Pro Max', category: 'phones', emoji: '📱', blurb: 'The Lagos status symbol. Hold it face-up at every table.', price: 2_900_000, store: 'mall', tags: ['phone'], group: 'phone', status: 18, wearPerDay: 0.04, maxQuantity: 2 }),
  item({ id: 'phone-iphone-clone', name: 'iPhone 17 Pro Max (Kirikiri copy)', category: 'phones', emoji: '🤡', blurb: 'The logo is upside down and Siri speaks Mandarin.', price: 120_000, store: 'market', tags: ['phone'], group: 'phone', wearPerDay: 0.2, maxQuantity: 2, unlisted: true }),

  // --- Laptops --------------------------------------------------------------------------------------------------
  item({ id: 'laptop-hp-uk', name: 'UK-used HP EliteBook', category: 'computers', emoji: '💻', blurb: 'Tough as nails. Previous owner\'s stickers included.', price: 380_000, store: 'market', tags: ['laptop'], group: 'laptop', status: 1, wearPerDay: 0.05, maxQuantity: 2 }),
  item({ id: 'laptop-dell-inspiron', name: 'Dell Inspiron 15', category: 'computers', emoji: '💻', blurb: 'New, reliable, does the job. Hello freelance gigs.', price: 850_000, store: 'mall', tags: ['laptop'], group: 'laptop', status: 3, wearPerDay: 0.04, maxQuantity: 2 }),
  item({ id: 'laptop-macbook-air', name: 'MacBook Air M4', category: 'computers', emoji: '💻', blurb: 'Yaba tech-bro starter pack. Battery lasts through NEPA.', price: 1_650_000, store: 'mall', tags: ['laptop'], group: 'laptop', status: 7, wearPerDay: 0.03, maxQuantity: 2 }),
  item({ id: 'laptop-macbook-pro', name: 'MacBook Pro 16"', category: 'computers', emoji: '💻', blurb: 'For senior engineers and people who want to look like one.', price: 4_200_000, store: 'mall', tags: ['laptop'], group: 'laptop', status: 14, wearPerDay: 0.025, maxQuantity: 2 }),

  // --- Essentials -----------------------------------------------------------------------------------------------
  item({ id: 'mosquito-net', name: 'Treated Mosquito Net', category: 'essentials', emoji: '🦟', blurb: 'Malaria is not your portion. Cheapest health insurance in Lagos.', price: 9_000, store: 'market', tags: ['mosquito-net'], comfort: 0.5, group: 'net', wearPerDay: 0.03, maxQuantity: 4 }),
  item({ id: 'books-past-questions', name: 'JAMB & WAEC Past Questions', category: 'essentials', emoji: '📗', blurb: 'From the Ilupeju bookshop. Answers at the back (mostly correct).', price: 7_500, store: 'market', tags: ['books'], group: 'books' }),
  item({ id: 'books-african-classics', name: 'African Classics Shelf (Achebe, Soyinka, Adichie)', category: 'essentials', emoji: '📚', blurb: 'Things Fall Apart, then things come together.', price: 65_000, store: 'mall', tags: ['books'], comfort: 0.5, group: 'books', status: 1 }),
  item({ id: 'lantern-rechargeable', name: 'Rechargeable Lantern', category: 'essentials', emoji: '🏮', blurb: 'When NEPA takes light at 8pm and you still have to read.', price: 18_000, store: 'market', tags: ['lamp'], comfort: 0.5, group: 'lamp', wearPerDay: 0.05, maxQuantity: 3 }),
];

// ---------------------------------------------------------------------------------------------------------------
// Clothing
// ---------------------------------------------------------------------------------------------------------------

type ClothingInput<S extends ClothingSlot> = Omit<ClothingDefinition, 'slot' | 'style'> & {
  readonly slot: S;
  readonly style: ClothingStyle<S>;
};

/** Typed builder: the style must be one the avatar builder knows for that slot. */
const wear = <S extends ClothingSlot>(input: ClothingInput<S>): ClothingDefinition => input;

export const CLOTHING: readonly ClothingDefinition[] = [
  // --- Tops -----------------------------------------------------------------------------------------------------
  wear({ id: 'okrika-white-tee', name: 'Bend-down Select White Tee', slot: 'top', style: 'tee', pattern: 'solid', primary: '#f4f3ef', secondary: '#d8d6cf', price: 2_500, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-vintage-tee', name: 'Okrika Vintage Tee', slot: 'top', style: 'tee', pattern: 'solid', primary: '#7d8b5a', secondary: '#e8e2d0', price: 3_500, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-singlet', name: 'Okrika Singlet', slot: 'top', style: 'tank', pattern: 'solid', primary: '#f2f2f2', secondary: '#cfcfcf', price: 2_000, status: 0, store: 'okrika', cut: 'masc' }),
  wear({ id: 'okrika-striped-polo', name: 'Okrika Striped Polo', slot: 'top', style: 'polo', pattern: 'stripes', primary: '#1f4e79', secondary: '#f1f1f1', price: 5_000, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-flannel', name: 'Okrika Flannel Shirt', slot: 'top', style: 'shirt', pattern: 'check', primary: '#9b2d2d', secondary: '#2b2b2b', price: 6_500, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-college-hoodie', name: 'Okrika College Hoodie', slot: 'top', style: 'hoodie', pattern: 'solid', primary: '#7a1f2b', secondary: '#f0e6d2', price: 9_000, status: 1, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-ribbed-crop', name: 'Okrika Ribbed Crop Top', slot: 'top', style: 'crop', pattern: 'solid', primary: '#e6ded3', secondary: '#bfb6aa', price: 4_000, status: 0, store: 'okrika', cut: 'fem' }),
  wear({ id: 'okrika-blouse', name: 'Okrika Chiffon Blouse', slot: 'top', style: 'blouse', pattern: 'solid', primary: '#d9a5b3', secondary: '#f6e9ec', price: 3_500, status: 0, store: 'okrika', cut: 'fem' }),
  wear({ id: 'ankara-shirt', name: 'Ankara Short-Sleeve Shirt', slot: 'top', style: 'shirt', pattern: 'ankara', primary: '#e35d1c', secondary: '#1d4e89', patternSeed: 1101, price: 18_000, status: 2, store: 'market', cut: 'masc' }),
  wear({ id: 'adire-shirt', name: 'Adire Tie-Dye Shirt (Abeokuta)', slot: 'top', style: 'shirt', pattern: 'adire', primary: '#2a3f8f', secondary: '#e8eef7', patternSeed: 2207, price: 22_000, status: 2, store: 'market', cut: 'unisex' }),
  wear({ id: 'balogun-knit-polo', name: 'Balogun Knit Polo', slot: 'top', style: 'polo', pattern: 'solid', primary: '#2e2e2e', secondary: '#c9a227', price: 12_000, status: 1, store: 'market', cut: 'masc' }),
  wear({ id: 'gym-tank', name: 'Gym Tank Top (Yaba Gym Bro)', slot: 'top', style: 'tank', pattern: 'solid', primary: '#151515', secondary: '#e53935', price: 8_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'super-eagles-jersey', name: 'Super Eagles Home Jersey', slot: 'top', style: 'jersey', pattern: 'solid', primary: '#008751', secondary: '#ffffff', price: 25_000, status: 3, store: 'market', cut: 'unisex' }),
  wear({ id: 'super-eagles-authentic', name: 'Super Eagles Authentic Jersey (Naija Zigzag Kit)', slot: 'top', style: 'jersey', pattern: 'ankara', primary: '#008751', secondary: '#0b2e1f', patternSeed: 1960, price: 85_000, status: 6, store: 'mall', cut: 'unisex' }),
  wear({ id: 'ankara-peplum-blouse', name: 'Ankara Peplum Blouse', slot: 'top', style: 'blouse', pattern: 'ankara', primary: '#c2185b', secondary: '#ffb300', patternSeed: 3311, price: 20_000, status: 2, store: 'market', cut: 'fem' }),
  wear({ id: 'lace-blouse', name: 'Lace Blouse (Owambe Ready)', slot: 'top', style: 'blouse', pattern: 'lace', primary: '#f3e3c8', secondary: '#c9a227', price: 65_000, status: 5, store: 'mall', cut: 'fem' }),
  wear({ id: 'lekki-brunch-crop', name: 'Lekki Brunch Crop Top', slot: 'top', style: 'crop', pattern: 'solid', primary: '#f2a7c3', secondary: '#ffffff', price: 28_000, status: 4, store: 'mall', cut: 'fem' }),
  wear({ id: 'soft-life-tee', name: '"Soft Life" Graphic Tee', slot: 'top', style: 'tee', pattern: 'solid', primary: '#fdf6e3', secondary: '#d4a017', price: 25_000, status: 3, store: 'mall', cut: 'unisex' }),
  wear({ id: 'oxford-shirt', name: 'Crisp Oxford Shirt (Bank Interview)', slot: 'top', style: 'shirt', pattern: 'solid', primary: '#dbe9f6', secondary: '#ffffff', price: 45_000, status: 4, store: 'mall', cut: 'masc' }),
  wear({ id: 'detty-december-hoodie', name: 'Detty December Hoodie', slot: 'top', style: 'hoodie', pattern: 'solid', primary: '#263238', secondary: '#ffca28', price: 55_000, status: 4, store: 'mall', cut: 'unisex' }),
  wear({ id: 'navy-blazer', name: 'Slim-fit Navy Blazer', slot: 'top', style: 'blazer', pattern: 'solid', primary: '#1c2841', secondary: '#c0c6d0', price: 120_000, status: 8, store: 'mall', cut: 'unisex' }),
  wear({ id: 'maison-eko-logo-tee', name: 'Maison Eko Logo Tee', slot: 'top', style: 'tee', pattern: 'solid', primary: '#0f0f0f', secondary: '#e8c46a', price: 380_000, status: 18, store: 'designer', cut: 'unisex' }),
  wear({ id: 'ikoyi-members-polo', name: 'Ikoyi Members\' Polo', slot: 'top', style: 'polo', pattern: 'solid', primary: '#0b3d2e', secondary: '#d9c58b', price: 250_000, status: 14, store: 'designer', cut: 'masc' }),
  wear({ id: 'lekki-atelier-blazer', name: 'Lekki Atelier Ankara Blazer', slot: 'top', style: 'blazer', pattern: 'ankara', primary: '#ff6f00', secondary: '#1a237e', patternSeed: 4401, price: 650_000, status: 30, store: 'designer', cut: 'unisex' }),
  wear({ id: 'silk-crop-designer', name: 'Silk Corset Crop Top', slot: 'top', style: 'crop', pattern: 'solid', primary: '#7b1e3a', secondary: '#e8c46a', price: 420_000, status: 20, store: 'designer', cut: 'fem' }),

  // --- Bottoms --------------------------------------------------------------------------------------------------
  wear({ id: 'okrika-jeans', name: 'Okrika Straight Jeans', slot: 'bottom', style: 'jeans', pattern: 'denim', primary: '#3b5b8c', secondary: '#2a3f63', price: 8_000, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-cargo-shorts', name: 'Okrika Cargo Shorts', slot: 'bottom', style: 'shorts', pattern: 'solid', primary: '#b49a6a', secondary: '#8a744c', price: 4_500, status: 0, store: 'okrika', cut: 'masc' }),
  wear({ id: 'okrika-joggers', name: 'Okrika Track Joggers', slot: 'bottom', style: 'joggers', pattern: 'stripes', primary: '#212121', secondary: '#ffffff', price: 5_000, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-denim-skirt', name: 'Okrika Denim Skirt', slot: 'bottom', style: 'skirt', pattern: 'denim', primary: '#4a6fa5', secondary: '#33507a', price: 5_500, status: 0, store: 'okrika', cut: 'fem' }),
  wear({ id: 'okrika-chinos', name: 'Okrika Chinos', slot: 'bottom', style: 'chinos', pattern: 'solid', primary: '#9c8a6a', secondary: '#7b6b50', price: 6_000, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'balogun-chinos', name: 'Balogun Chinos', slot: 'bottom', style: 'chinos', pattern: 'solid', primary: '#c8b48a', secondary: '#a8946a', price: 15_000, status: 1, store: 'market', cut: 'masc' }),
  wear({ id: 'sokoto-trousers', name: 'Native Sokoto Trousers', slot: 'bottom', style: 'trousers', pattern: 'solid', primary: '#f5f0e6', secondary: '#d8cfbd', price: 12_000, status: 1, store: 'market', cut: 'masc' }),
  wear({ id: 'ankara-pencil-skirt', name: 'Ankara Pencil Skirt', slot: 'bottom', style: 'skirt', pattern: 'ankara', primary: '#6a1b9a', secondary: '#fdd835', patternSeed: 5150, price: 16_000, status: 2, store: 'market', cut: 'fem' }),
  wear({ id: 'ankara-wrapper', name: 'Ankara Wrapper (6 yards)', slot: 'bottom', style: 'wrapper', pattern: 'ankara', primary: '#00897b', secondary: '#f4511e', patternSeed: 6060, price: 14_000, status: 2, store: 'market', cut: 'fem' }),
  wear({ id: 'adire-wrapper', name: 'Adire Wrapper', slot: 'bottom', style: 'wrapper', pattern: 'adire', primary: '#1b3a6b', secondary: '#dfe8f5', patternSeed: 6161, price: 18_000, status: 2, store: 'market', cut: 'unisex' }),
  wear({ id: 'market-joggers', name: 'Market Joggers', slot: 'bottom', style: 'joggers', pattern: 'solid', primary: '#37474f', secondary: '#90a4ae', price: 10_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'ripped-skinny-jeans', name: 'Ripped Skinny Jeans', slot: 'bottom', style: 'jeans', pattern: 'denim', primary: '#1e2a44', secondary: '#9fb3d1', price: 45_000, status: 4, store: 'mall', cut: 'unisex' }),
  wear({ id: 'pleated-midi-skirt', name: 'Pleated Midi Skirt', slot: 'bottom', style: 'skirt', pattern: 'solid', primary: '#8d6e63', secondary: '#bcaaa4', price: 38_000, status: 4, store: 'mall', cut: 'fem' }),
  wear({ id: 'tech-fleece-joggers', name: 'Tech Fleece Joggers', slot: 'bottom', style: 'joggers', pattern: 'solid', primary: '#455a64', secondary: '#cfd8dc', price: 60_000, status: 5, store: 'mall', cut: 'unisex' }),
  wear({ id: 'linen-shorts', name: 'Linen Shorts (Beach Day)', slot: 'bottom', style: 'shorts', pattern: 'solid', primary: '#e6d5b8', secondary: '#c9b48f', price: 32_000, status: 3, store: 'mall', cut: 'masc' }),
  wear({ id: 'tailored-trousers', name: 'Tailored Trousers', slot: 'bottom', style: 'trousers', pattern: 'solid', primary: '#263238', secondary: '#546e7a', price: 55_000, status: 4, store: 'mall', cut: 'unisex' }),
  wear({ id: 'george-wrapper', name: 'George Wrapper (Igbo Royalty)', slot: 'bottom', style: 'wrapper', pattern: 'check', primary: '#8b0000', secondary: '#d4af37', price: 180_000, status: 10, store: 'mall', cut: 'unisex' }),
  wear({ id: 'designer-distressed-denim', name: 'Designer Distressed Denim', slot: 'bottom', style: 'jeans', pattern: 'denim', primary: '#22324f', secondary: '#c7d3e6', price: 320_000, status: 15, store: 'designer', cut: 'unisex' }),

  // --- Full outfits ---------------------------------------------------------------------------------------------
  wear({ id: 'aso-oke-agbada', name: 'Aso-oke Agbada (Owambe King)', slot: 'full', style: 'agbada', pattern: 'aso-oke', primary: '#4a148c', secondary: '#d4af37', patternSeed: 7001, price: 850_000, status: 40, store: 'designer', cut: 'masc' }),
  wear({ id: 'brocade-agbada', name: 'Brocade Agbada', slot: 'full', style: 'agbada', pattern: 'solid', primary: '#1565c0', secondary: '#e3f2fd', price: 75_000, status: 6, store: 'market', cut: 'masc' }),
  wear({ id: 'swiss-lace-agbada', name: 'Swiss Lace Agbada (Chairman of the Day)', slot: 'full', style: 'agbada', pattern: 'lace', primary: '#fafafa', secondary: '#c9a227', price: 2_500_000, status: 70, store: 'designer', cut: 'masc' }),
  wear({ id: 'plain-kaftan', name: 'Plain Kaftan', slot: 'full', style: 'kaftan', pattern: 'solid', primary: '#e8e1d5', secondary: '#8d6e63', price: 28_000, status: 2, store: 'market', cut: 'masc' }),
  wear({ id: 'cashmere-kaftan', name: 'Embroidered Cashmere Kaftan', slot: 'full', style: 'kaftan', pattern: 'solid', primary: '#0d1b2a', secondary: '#c9a227', price: 150_000, status: 9, store: 'mall', cut: 'masc' }),
  wear({ id: 'mushin-tailor-senator', name: 'Tailor-made Senator (Mushin Tailor)', slot: 'full', style: 'senator', pattern: 'solid', primary: '#3e2723', secondary: '#a1887f', price: 45_000, status: 4, store: 'market', cut: 'masc' }),
  wear({ id: 'lagos-big-boy-senator', name: 'Lagos Big Boy Senator', slot: 'full', style: 'senator', pattern: 'solid', primary: '#111827', secondary: '#9ca3af', price: 120_000, status: 9, store: 'mall', cut: 'masc' }),
  wear({ id: 'ikoyi-couture-senator', name: 'Ikoyi Couture Senator', slot: 'full', style: 'senator', pattern: 'solid', primary: '#1b263b', secondary: '#e0c068', price: 480_000, status: 25, store: 'designer', cut: 'masc' }),
  wear({ id: 'ankara-buba-iro', name: 'Ankara Buba & Iro', slot: 'full', style: 'buba-iro', pattern: 'ankara', primary: '#ef6c00', secondary: '#283593', patternSeed: 8008, price: 35_000, status: 3, store: 'market', cut: 'fem' }),
  wear({ id: 'aso-oke-iro-buba', name: 'Aso-oke Iro & Buba (Aso-ebi)', slot: 'full', style: 'buba-iro', pattern: 'aso-oke', primary: '#880e4f', secondary: '#ffd54f', patternSeed: 8118, price: 220_000, status: 12, store: 'mall', cut: 'fem' }),
  wear({ id: 'beaded-lace-iro-buba', name: 'Beaded Lace Iro & Buba (Society Wife)', slot: 'full', style: 'buba-iro', pattern: 'lace', primary: '#e1bee7', secondary: '#c0c0c0', price: 1_800_000, status: 55, store: 'designer', cut: 'fem' }),
  wear({ id: 'ankara-mermaid-gown', name: 'Ankara Mermaid Gown', slot: 'full', style: 'gown', pattern: 'ankara', primary: '#00695c', secondary: '#ffeb3b', patternSeed: 9090, price: 45_000, status: 4, store: 'market', cut: 'fem' }),
  wear({ id: 'okrika-sundress', name: 'Okrika Floral Sundress', slot: 'full', style: 'gown', pattern: 'solid', primary: '#f7c8a0', secondary: '#7cb342', price: 7_000, status: 0, store: 'okrika', cut: 'fem' }),
  wear({ id: 'satin-dinner-gown', name: 'Satin Dinner Gown', slot: 'full', style: 'gown', pattern: 'solid', primary: '#b71c1c', secondary: '#f8bbd0', price: 180_000, status: 10, store: 'mall', cut: 'fem' }),
  wear({ id: 'red-carpet-gown', name: 'Red Carpet Gala Gown', slot: 'full', style: 'gown', pattern: 'lace', primary: '#c0a060', secondary: '#fff8e1', price: 3_500_000, status: 80, store: 'designer', cut: 'fem' }),
  wear({ id: 'okrika-interview-suit', name: 'Okrika Suit (Interview Special)', slot: 'full', style: 'suit', pattern: 'solid', primary: '#37474f', secondary: '#eceff1', price: 15_000, status: 1, store: 'okrika', cut: 'masc' }),
  wear({ id: 'corporate-navy-suit', name: 'Two-Piece Navy Suit (Corporate)', slot: 'full', style: 'suit', pattern: 'solid', primary: '#1a237e', secondary: '#ffffff', price: 250_000, status: 12, store: 'mall', cut: 'unisex' }),
  wear({ id: 'marina-banker-suit', name: 'Bespoke Three-Piece (Marina Banker)', slot: 'full', style: 'suit', pattern: 'stripes', primary: '#212121', secondary: '#b0bec5', price: 1_200_000, status: 45, store: 'designer', cut: 'masc' }),
  wear({ id: 'hospital-scrubs', name: 'Hospital Scrubs', slot: 'full', style: 'scrubs', pattern: 'solid', primary: '#26a69a', secondary: '#e0f2f1', price: 18_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'nysc-khaki', name: 'NYSC Khaki Uniform', slot: 'full', style: 'uniform', pattern: 'solid', primary: '#a1887f', secondary: '#2e7d32', price: 20_000, status: 2, store: 'market', cut: 'unisex' }),
  wear({ id: 'ladipo-overalls', name: 'Ladipo Mechanic Overalls', slot: 'full', style: 'jumpsuit', pattern: 'solid', primary: '#1565c0', secondary: '#90caf9', price: 7_000, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'ankara-jumpsuit', name: 'Ankara Jumpsuit', slot: 'full', style: 'jumpsuit', pattern: 'ankara', primary: '#ad1457', secondary: '#fbc02d', patternSeed: 9191, price: 38_000, status: 3, store: 'market', cut: 'fem' }),
  wear({ id: 'utility-jumpsuit', name: 'Utility Jumpsuit', slot: 'full', style: 'jumpsuit', pattern: 'solid', primary: '#6d4c41', secondary: '#d7ccc8', price: 85_000, status: 6, store: 'mall', cut: 'unisex' }),

  // --- Shoes ----------------------------------------------------------------------------------------------------
  wear({ id: 'rubber-slides', name: 'Rubber Slides (Pure Water Edition)', slot: 'shoes', style: 'slides', pattern: 'solid', primary: '#212121', secondary: '#1e88e5', price: 2_500, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-sandals', name: 'Okrika Leather Sandals', slot: 'shoes', style: 'sandals', pattern: 'solid', primary: '#8d5a3b', secondary: '#5d3a24', price: 6_000, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-sneakers', name: 'Okrika White Low-tops', slot: 'shoes', style: 'sneakers', pattern: 'solid', primary: '#f5f5f5', secondary: '#c62828', price: 12_000, status: 1, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-boots', name: 'Okrika Work Boots', slot: 'shoes', style: 'boots', pattern: 'solid', primary: '#c68e17', secondary: '#5d4037', price: 14_000, status: 1, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'balogun-sneakers', name: 'Balogun Sneakers', slot: 'shoes', style: 'sneakers', pattern: 'solid', primary: '#e53935', secondary: '#ffffff', price: 25_000, status: 2, store: 'market', cut: 'unisex' }),
  wear({ id: 'aba-palm-slippers', name: 'Palm Slippers (Aba-made)', slot: 'shoes', style: 'sandals', pattern: 'solid', primary: '#6d4c41', secondary: '#3e2723', price: 15_000, status: 2, store: 'market', cut: 'masc' }),
  wear({ id: 'suede-loafers', name: 'Suede Loafers', slot: 'shoes', style: 'loafers', pattern: 'solid', primary: '#5d4037', secondary: '#3e2723', price: 35_000, status: 3, store: 'market', cut: 'masc' }),
  wear({ id: 'block-heels', name: 'Block Heels', slot: 'shoes', style: 'heels', pattern: 'solid', primary: '#111111', secondary: '#c9a227', price: 28_000, status: 2, store: 'market', cut: 'fem' }),
  wear({ id: 'chelsea-boots', name: 'Chelsea Boots', slot: 'shoes', style: 'boots', pattern: 'solid', primary: '#4e342e', secondary: '#212121', price: 45_000, status: 3, store: 'market', cut: 'unisex' }),
  wear({ id: 'market-oxfords', name: 'Shiny Oxfords (Church Shoes)', slot: 'shoes', style: 'oxfords', pattern: 'solid', primary: '#1b1b1b', secondary: '#3a3a3a', price: 22_000, status: 2, store: 'market', cut: 'masc' }),
  wear({ id: 'running-sneakers', name: 'Original Running Sneakers', slot: 'shoes', style: 'sneakers', pattern: 'solid', primary: '#fafafa', secondary: '#1e88e5', price: 95_000, status: 6, store: 'mall', cut: 'unisex' }),
  wear({ id: 'leather-oxfords', name: 'Leather Oxfords (Corporate)', slot: 'shoes', style: 'oxfords', pattern: 'solid', primary: '#1b1b1b', secondary: '#6d4c41', price: 85_000, status: 5, store: 'mall', cut: 'masc' }),
  wear({ id: 'strappy-heels', name: 'Strappy Heels', slot: 'shoes', style: 'heels', pattern: 'solid', primary: '#c9a227', secondary: '#f5e6b8', price: 70_000, status: 5, store: 'mall', cut: 'fem' }),
  wear({ id: 'mall-slides', name: 'Logo Pool Slides', slot: 'shoes', style: 'slides', pattern: 'solid', primary: '#0d0d0d', secondary: '#ffffff', price: 30_000, status: 2, store: 'mall', cut: 'unisex' }),
  wear({ id: 'hypebeast-sneakers', name: 'Limited Drop Sneakers (Hypebeast)', slot: 'shoes', style: 'sneakers', pattern: 'solid', primary: '#000000', secondary: '#ff1744', price: 750_000, status: 30, store: 'designer', cut: 'unisex' }),
  wear({ id: 'horsebit-loafers', name: 'Italian Horsebit Loafers', slot: 'shoes', style: 'loafers', pattern: 'solid', primary: '#3e2723', secondary: '#d4af37', price: 520_000, status: 22, store: 'designer', cut: 'masc' }),
  wear({ id: 'red-bottom-stilettos', name: 'Red-Bottom Stilettos', slot: 'shoes', style: 'heels', pattern: 'solid', primary: '#111111', secondary: '#d50000', price: 1_100_000, status: 35, store: 'designer', cut: 'fem' }),
  wear({ id: 'designer-slides', name: 'Designer Logo Slides', slot: 'shoes', style: 'slides', pattern: 'solid', primary: '#f5f0e6', secondary: '#8d6e63', price: 280_000, status: 12, store: 'designer', cut: 'unisex' }),

  // --- Headwear -------------------------------------------------------------------------------------------------
  wear({ id: 'okrika-snapback', name: 'Okrika Snapback', slot: 'headwear', style: 'cap', pattern: 'solid', primary: '#263238', secondary: '#ffffff', price: 3_000, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'okrika-beanie', name: 'Okrika Beanie', slot: 'headwear', style: 'beanie', pattern: 'solid', primary: '#424242', secondary: '#757575', price: 2_500, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'abeti-aja-fila', name: 'Abetí-ajá Fila', slot: 'headwear', style: 'fila', pattern: 'aso-oke', primary: '#4a148c', secondary: '#d4af37', patternSeed: 7002, price: 12_000, status: 2, store: 'market', cut: 'masc' }),
  wear({ id: 'aso-oke-gele', name: 'Aso-oke Gele', slot: 'headwear', style: 'gele', pattern: 'aso-oke', primary: '#ad1457', secondary: '#ffd54f', patternSeed: 8119, price: 25_000, status: 3, store: 'market', cut: 'fem' }),
  wear({ id: 'super-eagles-cap', name: 'Super Eagles Cap', slot: 'headwear', style: 'cap', pattern: 'solid', primary: '#008751', secondary: '#ffffff', price: 10_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'ankara-bucket-hat', name: 'Ankara Bucket Hat', slot: 'headwear', style: 'bucket-hat', pattern: 'ankara', primary: '#f57c00', secondary: '#0d47a1', patternSeed: 1212, price: 9_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'silky-durag', name: 'Silky Durag (Waves Season)', slot: 'headwear', style: 'durag', pattern: 'solid', primary: '#1a237e', secondary: '#3949ab', price: 8_000, status: 1, store: 'market', cut: 'masc' }),
  wear({ id: 'site-hard-hat', name: 'Site Hard Hat', slot: 'headwear', style: 'hard-hat', pattern: 'solid', primary: '#fdd835', secondary: '#f9a825', price: 9_500, status: 0, store: 'market', cut: 'unisex' }),
  wear({ id: 'hand-woven-fila', name: 'Hand-woven Aso-oke Fila', slot: 'headwear', style: 'fila', pattern: 'aso-oke', primary: '#0d47a1', secondary: '#ffd54f', patternSeed: 7003, price: 45_000, status: 5, store: 'mall', cut: 'masc' }),
  wear({ id: 'wool-beret', name: 'Wool Beret', slot: 'headwear', style: 'beret', pattern: 'solid', primary: '#b71c1c', secondary: '#7f0000', price: 30_000, status: 3, store: 'mall', cut: 'unisex' }),
  wear({ id: 'auto-gele', name: 'Auto-gele (Pre-tied, Society)', slot: 'headwear', style: 'gele', pattern: 'solid', primary: '#d4af37', secondary: '#fffde7', price: 220_000, status: 15, store: 'designer', cut: 'fem' }),
  wear({ id: 'jersey-hijab-black', name: 'Jersey Hijab (Everyday Black)', slot: 'headwear', style: 'hijab', pattern: 'solid', primary: '#1f1d1c', secondary: '#3b3735', price: 3_500, status: 0, store: 'okrika', cut: 'fem' }),
  wear({ id: 'chiffon-hijab-rose', name: 'Chiffon Hijab (Dusty Rose)', slot: 'headwear', style: 'hijab', pattern: 'solid', primary: '#c48b9f', secondary: '#e8c3cf', price: 9_500, status: 1, store: 'market', cut: 'fem' }),
  wear({ id: 'cotton-hijab-cream', name: 'Cotton Hijab (Jumu’ah Cream)', slot: 'headwear', style: 'hijab', pattern: 'solid', primary: '#efe6d3', secondary: '#c9b48a', price: 9_000, status: 1, store: 'market', cut: 'fem' }),
  wear({ id: 'ankara-hijab', name: 'Ankara Print Hijab', slot: 'headwear', style: 'hijab', pattern: 'ankara', primary: '#00695c', secondary: '#f9a825', patternSeed: 7311, price: 12_000, status: 2, store: 'market', cut: 'fem' }),
  wear({ id: 'silk-hijab-emerald', name: 'Silk Hijab (Emerald & Gold)', slot: 'headwear', style: 'hijab', pattern: 'solid', primary: '#0b6e4f', secondary: '#d4af37', price: 38_000, status: 4, store: 'mall', cut: 'fem' }),

  // --- Eyewear --------------------------------------------------------------------------------------------------
  wear({ id: 'okrika-shades', name: 'Okrika Shades', slot: 'eyewear', style: 'sunglasses', pattern: 'solid', primary: '#000000', secondary: '#333333', price: 2_500, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'reading-glasses', name: 'Reading Glasses (Bookworm)', slot: 'eyewear', style: 'glasses', pattern: 'solid', primary: '#212121', secondary: '#9e9e9e', price: 15_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'market-aviators', name: 'Market Aviators', slot: 'eyewear', style: 'aviators', pattern: 'solid', primary: '#9e9e9e', secondary: '#4e342e', price: 10_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'polarised-sunglasses', name: 'Polarised Sunglasses', slot: 'eyewear', style: 'sunglasses', pattern: 'solid', primary: '#3e2723', secondary: '#795548', price: 65_000, status: 5, store: 'mall', cut: 'unisex' }),
  wear({ id: 'gold-aviators', name: 'Gold Aviators (Big Man Edition)', slot: 'eyewear', style: 'aviators', pattern: 'solid', primary: '#d4af37', secondary: '#2e7d32', price: 450_000, status: 20, store: 'designer', cut: 'unisex' }),

  // --- Accessories ----------------------------------------------------------------------------------------------
  wear({ id: 'ghana-must-go-bag', name: 'Ghana-Must-Go Bag', slot: 'accessory', style: 'bag', pattern: 'check', primary: '#1565c0', secondary: '#d32f2f', price: 8_000, status: 0, store: 'market', cut: 'unisex' }),
  wear({ id: 'plastic-coral-beads', name: 'Plastic "Coral" Beads', slot: 'accessory', style: 'beads', pattern: 'solid', primary: '#e64a19', secondary: '#ffccbc', price: 9_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'cuban-link-plated', name: 'Gold-plated Cuban Link', slot: 'accessory', style: 'chain', pattern: 'solid', primary: '#d4af37', secondary: '#b8962e', price: 18_000, status: 2, store: 'market', cut: 'unisex' }),
  wear({ id: 'digital-watch', name: 'Digital Watch', slot: 'accessory', style: 'watch', pattern: 'solid', primary: '#212121', secondary: '#9e9e9e', price: 12_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'wireless-headphones', name: 'Wireless Headphones', slot: 'accessory', style: 'headphones', pattern: 'solid', primary: '#212121', secondary: '#ff7043', price: 25_000, status: 1, store: 'market', cut: 'unisex' }),
  wear({ id: 'okrika-backpack', name: 'Okrika Backpack', slot: 'accessory', style: 'bag', pattern: 'solid', primary: '#33691e', secondary: '#1b1b1b', price: 4_000, status: 0, store: 'okrika', cut: 'unisex' }),
  wear({ id: 'smart-watch', name: 'Smart Watch', slot: 'accessory', style: 'watch', pattern: 'solid', primary: '#37474f', secondary: '#00e5ff', price: 180_000, status: 8, store: 'mall', cut: 'unisex' }),
  wear({ id: 'leather-tote', name: 'Leather Tote Bag', slot: 'accessory', style: 'bag', pattern: 'solid', primary: '#6d4c41', secondary: '#d7ccc8', price: 95_000, status: 6, store: 'mall', cut: 'fem' }),
  wear({ id: 'noise-cancelling-headphones', name: 'Noise-cancelling Headphones', slot: 'accessory', style: 'headphones', pattern: 'solid', primary: '#eceff1', secondary: '#90a4ae', price: 280_000, status: 9, store: 'mall', cut: 'unisex' }),
  wear({ id: 'coral-beads', name: 'Coral Beads', slot: 'accessory', style: 'beads', pattern: 'solid', primary: '#d84315', secondary: '#ffccbc', price: 600_000, status: 25, store: 'designer', cut: 'unisex' }),
  wear({ id: 'iced-cuban-chain', name: 'Iced-out Cuban Chain (Odogwu)', slot: 'accessory', style: 'chain', pattern: 'solid', primary: '#e0e0e0', secondary: '#b3e5fc', price: 4_800_000, status: 75, store: 'designer', cut: 'unisex' }),
  wear({ id: 'swiss-gold-watch', name: 'Swiss Gold Watch (Oga Patapata)', slot: 'accessory', style: 'watch', pattern: 'solid', primary: '#d4af37', secondary: '#0d47a1', price: 5_000_000, status: 85, store: 'designer', cut: 'unisex' }),
  wear({ id: 'designer-handbag', name: 'Designer Handbag (Lagos Babe)', slot: 'accessory', style: 'bag', pattern: 'solid', primary: '#ff8f00', secondary: '#4e342e', price: 3_800_000, status: 70, store: 'designer', cut: 'fem' }),
];

/** Free basics every new character owns and wears on day one, by cut (masc for male, fem for female). */
export const STARTER_WARDROBE: Readonly<Record<'masc' | 'fem', readonly string[]>> = {
  masc: ['okrika-white-tee', 'okrika-cargo-shorts', 'rubber-slides'],
  fem: ['okrika-white-tee', 'okrika-denim-skirt', 'okrika-sandals'],
};

/** Items every new character starts with: a foam mattress and a basic phone. */
export const STARTER_ITEMS: readonly string[] = ['bed-foam-mattress', 'phone-tecno-spark'];

// ---------------------------------------------------------------------------------------------------------------
// Products & lookup
// ---------------------------------------------------------------------------------------------------------------

export type ShopProduct =
  | { readonly kind: 'item'; readonly def: ItemDefinition }
  | { readonly kind: 'clothing'; readonly def: ClothingDefinition };

const ITEM_INDEX: ReadonlyMap<string, ItemDefinition> = new Map(ITEMS.map((entry) => [entry.id, entry]));
const CLOTHING_INDEX: ReadonlyMap<string, ClothingDefinition> = new Map(CLOTHING.map((entry) => [entry.id, entry]));

export function findItem(id: string): ItemDefinition | undefined {
  return ITEM_INDEX.get(id);
}

export function findClothing(id: string): ClothingDefinition | undefined {
  return CLOTHING_INDEX.get(id);
}

export function findProduct(id: string): ShopProduct | undefined {
  const itemDef = ITEM_INDEX.get(id);
  if (itemDef) return { kind: 'item', def: itemDef };
  const clothingDef = CLOTHING_INDEX.get(id);
  return clothingDef ? { kind: 'clothing', def: clothingDef } : undefined;
}

export function productCategory(product: ShopProduct): ShopCategory {
  return product.kind === 'item' ? product.def.category : 'clothing';
}

/** Products that appear on shelves and in the online catalogue. */
export function listedProducts(): readonly ShopProduct[] {
  return [
    ...ITEMS.filter((entry) => !entry.unlisted).map((def) => ({ kind: 'item', def }) as const),
    ...CLOTHING.map((def) => ({ kind: 'clothing', def }) as const),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Outlets: who sells what in person
// ---------------------------------------------------------------------------------------------------------------

export interface ShopOutlet {
  readonly label: string;
  /** Clothing store tiers on the racks. */
  readonly clothing: readonly StoreTier[];
  readonly itemCategories: readonly ItemCategory[];
  readonly itemTiers: readonly StoreTier[];
}

const MARKET_OUTLET: ShopOutlet = {
  label: 'Market stalls — cheaper basics, bring your haggling skills',
  clothing: ['okrika', 'market'],
  itemCategories: ['furniture', 'appliances', 'power', 'essentials'],
  itemTiers: ['market'],
};

const MALL_OUTLET: ShopOutlet = {
  label: 'Mall stores — everything, with AC and receipts',
  clothing: ['mall'],
  itemCategories: ITEM_CATEGORIES,
  itemTiers: ['market', 'mall'],
};

/** Default outlet per venue type (new markets and malls work without code changes). */
export const SHOP_OUTLETS_BY_TYPE: Readonly<Partial<Record<VenueType, ShopOutlet>>> = {
  market: MARKET_OUTLET,
  mall: MALL_OUTLET,
};

/** Venues with a speciality override their type's default. */
export const SHOP_OUTLETS_BY_VENUE: Readonly<Record<string, ShopOutlet>> = {
  'yaba-market': {
    label: 'Okrika heaven — dig well, look fresh',
    clothing: ['okrika'],
    itemCategories: ['furniture', 'essentials'],
    itemTiers: ['market'],
  },
  'balogun-market': {
    label: 'Fabrics, shoes and the haggling Olympics',
    clothing: ['market'],
    itemCategories: ['appliances', 'essentials'],
    itemTiers: ['market'],
  },
  'computer-village': {
    label: 'Phones, laptops, power and "original" chargers',
    clothing: [],
    itemCategories: ['phones', 'computers', 'electronics', 'power'],
    itemTiers: ['market', 'mall'],
  },
  'lekki-mall': {
    label: 'Designer stores and Shoprite',
    clothing: ['mall', 'designer'],
    itemCategories: ITEM_CATEGORIES,
    itemTiers: [...STORE_TIERS.filter((tier) => tier !== 'okrika')],
  },
};

/** The outlet at a venue, or null if nothing is sold there in person. */
export function shopOutletAt(venueId: string): ShopOutlet | null {
  const special = SHOP_OUTLETS_BY_VENUE[venueId];
  if (special) return special;
  const venue = findVenue(venueId);
  return venue ? (SHOP_OUTLETS_BY_TYPE[venue.type] ?? null) : null;
}

export function outletSells(outlet: ShopOutlet, product: ShopProduct): boolean {
  if (product.kind === 'clothing') return outlet.clothing.includes(product.def.store);
  if (product.def.unlisted) return false;
  return outlet.itemCategories.includes(product.def.category) && outlet.itemTiers.includes(product.def.store);
}

const sellingVenues = new Map<string, readonly string[]>();

/** Venue ids that sell a product in person (for "Available at …" and GPS routing). */
export function venuesSelling(product: ShopProduct): readonly string[] {
  const cached = sellingVenues.get(product.def.id);
  if (cached) return cached;
  const ids = VENUES.filter((venue) => {
    const outlet = shopOutletAt(venue.id);
    return outlet !== null && outletSells(outlet, product);
  }).map((venue) => venue.id);
  sellingVenues.set(product.def.id, ids);
  return ids;
}
