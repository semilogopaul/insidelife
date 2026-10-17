import { formatNaira } from '../money/money.js';
import type { DistrictId } from './geography.js';
import { VENUES, cityOfVenue, type VenueDefinition, type VenueType } from './venues.js';

/**
 * Promotions catalog — owned by the promotions domain.
 *
 * Real-money advertising inside the game (docs/PLAYER_PSYCHOLOGY.md §5): billboards placed over the city and club
 * plays for artists. Prices are real naira charged in kobo through Flutterwave. Everything is capped, reviewed by a
 * moderator before it goes live, and booked in real calendar days (Africa/Lagos, WAT = UTC+1, no DST).
 */

// ----- Billboards ---------------------------------------------------------------------------------------------------

/**
 * The 17 hand-placed premium billboards (12 in Lagos, 5 in Abuja). Stable ids — the 3D world places a board per id. Never rename; add new ids at
 * the end. Every other ad surface (street boards, bus shelters, lightboxes, Lagos TV, phone apps) is in `AD_SLOTS`.
 */
export const BILLBOARD_SLOT_IDS = [
  'mmia-arrivals',
  'third-mainland-north',
  'third-mainland-south',
  'lekki-toll-gate',
  'ozumba-mbadiwe',
  'ikeja-allen',
  'yaba-hub',
  'surulere-stadium',
  'balogun-market',
  'vi-towers',
  'ajah-roundabout',
  'ikorodu-garage',
  // Abuja's hand-placed premium boards (docs/MULTI_CITY.md).
  'abuja-airport-road',
  'abuja-ibb-boulevard',
  'abuja-central-area',
  'abuja-jabi-lake',
  'abuja-wuse-banex',
] as const;
export type PremiumBillboardId = (typeof BILLBOARD_SLOT_IDS)[number];
/** Any bookable ad slot id (premium boards, generated placements, Lagos TV, phone apps). */
export type BillboardSlotId = string;

/** `landscape` 3:1 roadside boards, `portrait` 2:3 building wraps, `square` 1:1 market/rooftop panels. */
export const BILLBOARD_FORMATS = ['landscape', 'portrait', 'square', 'wide'] as const;
export type BillboardFormat = (typeof BILLBOARD_FORMATS)[number];

export interface BillboardFormatSpec {
  readonly format: BillboardFormat;
  readonly label: string;
  readonly aspect: string;
  /** Exact pixel size the server re-encodes uploads to (WebP, cover crop). */
  readonly width: number;
  readonly height: number;
}

export const BILLBOARD_FORMAT_SPECS: Readonly<Record<BillboardFormat, BillboardFormatSpec>> = {
  landscape: { format: 'landscape', label: 'Landscape', aspect: '3:1', width: 1500, height: 500 },
  portrait: { format: 'portrait', label: 'Portrait', aspect: '2:3', width: 1000, height: 1500 },
  square: { format: 'square', label: 'Square', aspect: '1:1', width: 1000, height: 1000 },
  wide: { format: 'wide', label: 'Widescreen (TV)', aspect: '16:9', width: 1600, height: 900 },
};

/** Uploads smaller than this share of the target size on either side are refused (they would look blurry). */
export const BILLBOARD_MIN_UPLOAD_SCALE = 0.5;

/** How much traffic sees the board. Drives price, not rotation. */
export const BILLBOARD_VISIBILITY_TIERS = ['premium', 'high', 'standard', 'local'] as const;
export type BillboardVisibilityTier = (typeof BILLBOARD_VISIBILITY_TIERS)[number];

export const BILLBOARD_PLACEMENTS = ['roadside', 'building', 'terminal', 'street', 'shelter', 'totem', 'arena', 'market', 'motor-park', 'broadcast', 'phone'] as const;
export type BillboardPlacement = (typeof BILLBOARD_PLACEMENTS)[number];

export interface BillboardSlot {
  readonly id: BillboardSlotId;
  readonly name: string;
  /** Null for citywide slots (Lagos TV, phone apps). */
  readonly districtId: DistrictId | null;
  readonly description: string;
  readonly placement: BillboardPlacement;
  readonly format: BillboardFormat;
  /** Pixel size to upload (same as the format spec; repeated so clients don't need a second lookup). */
  readonly width: number;
  readonly height: number;
  readonly tier: BillboardVisibilityTier;
  /**
   * Default real-money price of one 7-day block, in kobo. Ops can override it (the server's `ad_rates`), so clients
   * show the price the slots endpoint sends; this is the catalog default.
   */
  readonly weekPriceKobo: number;
  /** Ads sharing the board on any given day (they rotate every BILLBOARD_ROTATION_SECONDS). */
  readonly maxConcurrentAds: number;
}

const NAIRA = 100;

// ----- Ad prices (real naira) ----------------------------------------------------------------------------------------

/**
 * Ads are sold in blocks of consecutive real days, starting on the slot's next free day, back to back, up to
 * `AD_MAX_RUN_DAYS` in all. Rates are stored per 7 days (`weekPriceKobo`); most slots are sold in 7-day blocks (1–4
 * weeks), but expensive ones (a weekly rate of `AD_SHORT_BLOCK_FROM_KOBO` or more) in 3-day blocks (1–9), so a big
 * board can be tried for a long weekend. The block length follows the CURRENT rate (`adBlockDays`), so re-pricing a
 * slot moves it between the two automatically; a booking keeps the block length and price it was sold with.
 */
export const AD_WEEK_DAYS = 7;
export const AD_MAX_WEEKS = 4;
/** Longest run one booking can buy (4 weeks, or 9 × 3 days). */
export const AD_MAX_RUN_DAYS = 28;
/** The short block for expensive slots. */
export const AD_SHORT_BLOCK_DAYS = 3;
/** The single definition of "expensive" (owner's rule, Oct 2026): a weekly rate of ₦35,000 or more is sold in 3-day blocks. */
export const AD_SHORT_BLOCK_FROM_KOBO = 35_000 * NAIRA;
export type AdBlockDays = typeof AD_SHORT_BLOCK_DAYS | typeof AD_WEEK_DAYS;
/** No ad costs less than ₦2,000 a week; no rate can be set above ₦100m. */
export const AD_MIN_PRICE_KOBO = 2_000 * NAIRA;
export const AD_MAX_PRICE_KOBO = 100_000_000 * NAIRA;
/** A Sponsored app on every player's phone: ₦100,000 per 7 days. */
export const PHONE_APP_WEEK_PRICE_KOBO = 100_000 * NAIRA;

/** The weekly price of a slot that used to be sold by the day: 7 × the old day rate (₦/day). */
const weekOf = (dailyNaira: number): number => 7 * dailyNaira * NAIRA;

/** Round a weekly price to a friendly amount (nearest ₦500), never under the ₦2,000 floor. */
export function friendlyWeekPriceKobo(kobo: number): number {
  const step = 500 * NAIRA;
  return Math.max(AD_MIN_PRICE_KOBO, Math.round(kobo / step) * step);
}

const slot = (def: Omit<BillboardSlot, 'width' | 'height'>): BillboardSlot => ({
  ...def,
  width: BILLBOARD_FORMAT_SPECS[def.format].width,
  height: BILLBOARD_FORMAT_SPECS[def.format].height,
});

export const BILLBOARD_SLOTS: readonly BillboardSlot[] = [
  slot({
    id: 'mmia-arrivals',
    name: 'MMIA Arrivals Hall',
    districtId: 'ikeja',
    description: 'The first thing every arrival sees at Murtala Muhammed Airport. Japa returnees, tourists and big men.',
    placement: 'terminal',
    format: 'landscape',
    tier: 'premium',
    weekPriceKobo: weekOf(25_000),
    maxConcurrentAds: 3,
  }),
  slot({
    id: 'third-mainland-north',
    name: 'Third Mainland Bridge (Oworonshoki end)',
    districtId: 'yaba',
    description: 'Island-bound traffic crawling onto the bridge every morning. Hours of eyeballs per car.',
    placement: 'roadside',
    format: 'landscape',
    tier: 'premium',
    weekPriceKobo: weekOf(20_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'third-mainland-south',
    name: 'Third Mainland Bridge (Adeniji end)',
    districtId: 'lagos-island',
    description: 'Mainland-bound evening traffic leaving the Island. The longest red-light-free stare in Lagos.',
    placement: 'roadside',
    format: 'landscape',
    tier: 'premium',
    weekPriceKobo: weekOf(20_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'lekki-toll-gate',
    name: 'Lekki Toll Gate',
    districtId: 'lekki',
    description: 'Over the toll plaza on the Lekki-Epe Expressway. Every Lekki and Ajah commuter passes here.',
    placement: 'roadside',
    format: 'landscape',
    tier: 'high',
    weekPriceKobo: weekOf(15_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'ozumba-mbadiwe',
    name: 'Ozumba Mbadiwe Avenue',
    districtId: 'victoria-island',
    description: 'VI waterfront avenue between the clubs, lounges and Eko Hotel. Nightlife and money traffic.',
    placement: 'roadside',
    format: 'landscape',
    tier: 'high',
    weekPriceKobo: weekOf(12_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'vi-towers',
    name: 'VI Towers Wrap',
    districtId: 'victoria-island',
    description: 'A tall building wrap facing Ahmadu Bello Way. Seen from the beach road and the towers.',
    placement: 'building',
    format: 'portrait',
    tier: 'high',
    weekPriceKobo: weekOf(12_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'ikeja-allen',
    name: 'Allen Avenue Junction',
    districtId: 'ikeja',
    description: 'Busy Ikeja junction near Computer Village. Shoppers, okada riders and office workers.',
    placement: 'roadside',
    format: 'square',
    tier: 'standard',
    weekPriceKobo: weekOf(8_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'balogun-market',
    name: 'Balogun Market Rooftop',
    districtId: 'lagos-island',
    description: 'Above the busiest market in West Africa. Traders, shoppers and serious haggling.',
    placement: 'building',
    format: 'square',
    tier: 'standard',
    weekPriceKobo: weekOf(7_500),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'yaba-hub',
    name: 'Yaba Tech Hub Wall',
    districtId: 'yaba',
    description: 'On the side of the tech hub, facing UNILAG and Yabatech students. Startups, gigs and gadgets.',
    placement: 'building',
    format: 'portrait',
    tier: 'standard',
    weekPriceKobo: weekOf(6_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'surulere-stadium',
    name: 'National Stadium Gate',
    districtId: 'surulere',
    description: 'Outside the National Stadium on the way to Shitta. Joggers, football fans and amala lovers.',
    placement: 'roadside',
    format: 'landscape',
    tier: 'standard',
    weekPriceKobo: weekOf(5_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'ajah-roundabout',
    name: 'Ajah Roundabout',
    districtId: 'ajah',
    description: 'Where the Lekki-Epe Expressway meets Ajah market traffic. Great for local businesses.',
    placement: 'roadside',
    format: 'square',
    tier: 'local',
    weekPriceKobo: weekOf(4_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'ikorodu-garage',
    name: 'Ikorodu Garage',
    districtId: 'ikorodu',
    description: 'Above the motor park: danfo, BRT and agberos. The cheapest way to be seen in Lagos.',
    placement: 'roadside',
    format: 'landscape',
    tier: 'local',
    weekPriceKobo: weekOf(2_500),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'abuja-airport-road',
    name: 'Airport Road Gantry',
    districtId: 'lugbe',
    description: 'On the Airport Road beside the Glory Dome, the road every arrival and every Lugbe commuter takes into Abuja.',
    placement: 'roadside',
    format: 'landscape',
    tier: 'high',
    weekPriceKobo: weekOf(8_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'abuja-ibb-boulevard',
    name: 'IBB Boulevard, Maitama',
    districtId: 'maitama',
    description: 'On Ibrahim Babangida Boulevard between the embassies and the Hilton. Diplomats, senators and their drivers.',
    placement: 'roadside',
    format: 'landscape',
    tier: 'high',
    weekPriceKobo: weekOf(9_000),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'abuja-central-area',
    name: 'Central Area, Ahmadu Bello Way',
    districtId: 'abuja-cbd',
    description: 'Beside Eagle Square and the National Mosque on Ahmadu Bello Way: ministries, banks and every parade.',
    placement: 'roadside',
    format: 'landscape',
    tier: 'high',
    weekPriceKobo: weekOf(9_500),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'abuja-jabi-lake',
    name: 'Jabi Lake Gateway',
    districtId: 'jabi',
    description: 'At the lake on the way to the mall and the universities. Joggers, students and weekend families.',
    placement: 'roadside',
    format: 'square',
    tier: 'standard',
    weekPriceKobo: weekOf(5_500),
    maxConcurrentAds: 4,
  }),
  slot({
    id: 'abuja-wuse-banex',
    name: 'Wuse 2 near Banex',
    districtId: 'wuse',
    description: 'Wuse 2’s shopping strip by Banex Plaza and the bars: phone shoppers by day, nightlife by night.',
    placement: 'roadside',
    format: 'square',
    tier: 'standard',
    weekPriceKobo: weekOf(6_000),
    maxConcurrentAds: 4,
  }),
];

const SLOT_INDEX: ReadonlyMap<string, BillboardSlot> = new Map(BILLBOARD_SLOTS.map((entry) => [entry.id, entry]));

export function findBillboardSlot(id: string): BillboardSlot | undefined {
  return SLOT_INDEX.get(id);
}

export function isPremiumBillboardId(id: string): id is PremiumBillboardId {
  return SLOT_INDEX.has(id);
}

/**
 * A booking starts on the slot's next free day (today if there's room for the whole run) and can't be pushed further
 * out than this: a slot with no room for 60 days is "fully booked".
 */
export const BILLBOARD_MAX_LEAD_DAYS = 60;
/** Each creative on a board shows for this long before the next one (client-side rotation). */
export const BILLBOARD_ROTATION_SECONDS = 10;

export interface PromotionQuote {
  /** Consecutive blocks bought. */
  readonly blocks: number;
  /** Days per block (7, or 3 for expensive slots). */
  readonly blockDays: number;
  readonly days: number;
  /** Price of one block when quoted (the order keeps it: later rate changes never touch it). */
  readonly blockPriceKobo: number;
  /** The slot's weekly rate when quoted (what the block price is derived from). */
  readonly weekPriceKobo: number;
  /** @deprecated `days / 7` (a whole number only for 7-day blocks). */
  readonly weeks: number;
  /** What the payer is charged (whole naira). */
  readonly totalKobo: number;
}

/** Block length for a slot at this weekly rate: 3 days from `AD_SHORT_BLOCK_FROM_KOBO`, else 7. */
export function adBlockDays(weekPriceKobo: number): AdBlockDays {
  return weekPriceKobo >= AD_SHORT_BLOCK_FROM_KOBO ? AD_SHORT_BLOCK_DAYS : AD_WEEK_DAYS;
}

/** Most blocks one booking can buy (4 of 7 days, 9 of 3 days). */
export function adMaxBlocks(blockDays: number): number {
  return Math.max(1, Math.floor(AD_MAX_RUN_DAYS / blockDays));
}

/**
 * Price of one block: the daily rate × the block's days, rounded to a friendly amount (nearest ₦500, never under
 * ₦2,000). A 7-day block is exactly the weekly rate. E.g. ₦100,000 a week → ₦43,000 for 3 days.
 */
export function adBlockPriceKobo(weekPriceKobo: number, blockDays: number): number {
  if (blockDays === AD_WEEK_DAYS) return weekPriceKobo;
  return friendlyWeekPriceKobo((weekPriceKobo / AD_WEEK_DAYS) * blockDays);
}

/** Why a booking of `blocks` blocks of `blockDays` can't be made (player-facing), or null. */
export function adBlocksProblem(blocks: number, blockDays: number = AD_WEEK_DAYS): string | null {
  const max = adMaxBlocks(blockDays);
  if (Number.isInteger(blocks) && blocks >= 1 && blocks <= max) return null;
  return blockDays === AD_WEEK_DAYS ? `Book 1 to ${max} weeks` : `Book 1 to ${max} blocks of ${blockDays} days`;
}

/** @deprecated `adBlocksProblem(weeks, 7)`. */
export function adWeeksProblem(weeks: number): string | null {
  return adBlocksProblem(weeks, AD_WEEK_DAYS);
}

/** Whole naira between ₦2,000 and ₦100m: the only prices an ad rate can have. */
export function isValidAdPriceKobo(kobo: number): boolean {
  return Number.isSafeInteger(kobo) && kobo % NAIRA === 0 && kobo >= AD_MIN_PRICE_KOBO && kobo <= AD_MAX_PRICE_KOBO;
}

/**
 * Price of `blocks` consecutive blocks at a weekly rate. The block length defaults to the rate's (`adBlockDays`); club
 * songs pass 7 (always sold by the week). Throws a RangeError for anything that can't be sold.
 */
export function adQuote(weekPriceKobo: number, blocks: number, blockDays: number = adBlockDays(weekPriceKobo)): PromotionQuote {
  const problem = adBlocksProblem(blocks, blockDays);
  if (problem) throw new RangeError(problem);
  if (!isValidAdPriceKobo(weekPriceKobo)) throw new RangeError(`Ad prices are whole naira from ${formatNaira(AD_MIN_PRICE_KOBO / NAIRA)} a week`);
  const blockPriceKobo = adBlockPriceKobo(weekPriceKobo, blockDays);
  const days = blocks * blockDays;
  return { blocks, blockDays, days, blockPriceKobo, weekPriceKobo, weeks: days / AD_WEEK_DAYS, totalKobo: blockPriceKobo * blocks };
}

/** "₦175,000/week". */
export const adWeekPriceLabel = (weekPriceKobo: number): string => `${formatNaira(weekPriceKobo / NAIRA)}/week`;

/** "₦17,500/week" for 7-day blocks, "₦43,000 per 3 days" for short ones. */
export const adBlockPriceLabel = (blockPriceKobo: number, blockDays: number): string =>
  blockDays === AD_WEEK_DAYS ? adWeekPriceLabel(blockPriceKobo) : `${formatNaira(blockPriceKobo / NAIRA)} per ${blockDays} days`;

/** "1 week", "3 weeks", "3 days", "9 days". */
export function runLengthLabel(days: number): string {
  if (days % AD_WEEK_DAYS === 0) return days === AD_WEEK_DAYS ? '1 week' : `${days / AD_WEEK_DAYS} weeks`;
  return days === 1 ? '1 day' : `${days} days`;
}

/** How a rate reads on the admin price list: "₦100,000 per 7 days · sold in 3-day blocks of ₦43,000". */
export function adRateSummary(weekPriceKobo: number, blockDays: number = adBlockDays(weekPriceKobo)): string {
  const week = `${formatNaira(weekPriceKobo / NAIRA)} per 7 days`;
  return blockDays === AD_WEEK_DAYS ? `${week} · sold by the week` : `${week} · sold in ${blockDays}-day blocks of ${formatNaira(adBlockPriceKobo(weekPriceKobo, blockDays) / NAIRA)}`;
}

// ----- Club DJ ------------------------------------------------------------------------------------------------------

/** Venue types whose sound system plays paid tracks: clubs, and bars (the lounges and rooftop bars). */
export const CLUB_PLAY_VENUE_TYPES: readonly VenueType[] = ['club', 'bar'];

/**
 * Clubs and lounges that run a paid rotation (derived from the venue catalog, so new Lagos clubs join automatically).
 * The club-song product is Lagos nightlife: Abuja's bars and clubs play the game's own music until it gets a rotation of
 * its own, so the lanes and the plays-a-day guarantee stay as they were sold.
 */
export function clubPlayVenues(): VenueDefinition[] {
  return VENUES.filter((venue) => CLUB_PLAY_VENUE_TYPES.includes(venue.type) && cityOfVenue(venue) === 'lagos');
}

export function isClubPlayVenue(venueId: string): boolean {
  return clubPlayVenues().some((venue) => venue.id === venueId);
}

/**
 * One product (owner's rule, Oct 2026): a song costs ₦5,000 a day, sold like every other ad in 7-day blocks (₦35,000 a
 * week), 1–4 consecutive weeks in every club and lounge's rotation, starting on the rotation's next free day (today
 * when a lane is free for the whole run).
 */
export const CLUB_PLAY_PRODUCT_IDS = ['all-clubs-7d'] as const;
export type ClubPlayProductId = (typeof CLUB_PLAY_PRODUCT_IDS)[number];

/** The owner's day rate for a club song (what the weekly default is built from). */
export const CLUB_SONG_DAY_PRICE_KOBO = 5_000 * NAIRA;
/** Default price of one 7-day block in every club (ops can override it: rate key `club-song`, stored per week). */
export const CLUB_SONG_WEEK_PRICE_KOBO = 7 * CLUB_SONG_DAY_PRICE_KOBO;
/** @deprecated The default price of one 7-day block; use `CLUB_SONG_WEEK_PRICE_KOBO`. */
export const CLUB_TRACK_PRICE_KOBO = CLUB_SONG_WEEK_PRICE_KOBO;

export interface ClubPlayProduct {
  readonly id: ClubPlayProductId;
  readonly name: string;
  readonly description: string;
  /** Real calendar days in one block (a booking is 1–`AD_MAX_WEEKS` blocks back to back). */
  readonly days: number;
  /** Default price of one block; the server's current rate wins. */
  readonly priceKobo: number;
}

export const CLUB_PLAY_PRODUCT: ClubPlayProduct = {
  id: 'all-clubs-7d',
  name: 'Every club and lounge',
  description: 'Your song in the rotation of every club and lounge in Lagos, a week at a time.',
  days: AD_WEEK_DAYS,
  priceKobo: CLUB_SONG_WEEK_PRICE_KOBO,
};

export const CLUB_PLAY_PRODUCTS: readonly ClubPlayProduct[] = [CLUB_PLAY_PRODUCT];

export function findClubPlayProduct(id: string): ClubPlayProduct | undefined {
  return CLUB_PLAY_PRODUCTS.find((product) => product.id === id);
}

/**
 * Songs in rotation at once: the "lanes" of the club schedule (`catalog/club-schedule.ts`). A booked song holds one
 * lane for its whole run and every lane gets the same share of the paid slots in every club, which is what makes the
 * plays-a-day guarantee hold. When every lane is taken, a booking starts on the day one frees up for the whole run.
 */
export const CLUB_ROTATION_CAPACITY = 12;
/** A club order starts on the rotation's next free day; with no room for this many days, the rotation is full. */
export const CLUB_PLAY_MAX_LEAD_DAYS = 30;

// ----- Uploads ------------------------------------------------------------------------------------------------------

/** Multipart field name for the file on both upload endpoints. */
export const PROMOTION_UPLOAD_FIELD = 'file';

export const CREATIVE_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type CreativeSourceType = (typeof CREATIVE_ACCEPTED_TYPES)[number];
export const CREATIVE_MAX_BYTES = 4 * 1024 * 1024;

export const TRACK_ACCEPTED_TYPES = ['audio/mpeg', 'audio/ogg'] as const;
export type TrackContentType = (typeof TRACK_ACCEPTED_TYPES)[number];
export const TRACK_MAX_BYTES = 10 * 1024 * 1024;
export const TRACK_MIN_SECONDS = 30;
/** Longest song allowed (owner's rule: 3 minutes or shorter), measured from the file on the server. */
export const TRACK_MAX_SECONDS = 3 * 60;

export const PROMOTION_TITLE_MAX = 60;
export const ARTIST_NAME_MAX = 40;
export const LINK_URL_MAX = 500;

// ----- Content rules ------------------------------------------------------------------------------------------------

/**
 * Political campaign content is refused inside this window (inclusive, Lagos dates). Ops: keep it aligned with the
 * INEC timetable for the 2027 general elections (campaign start → final results).
 */
export const POLITICAL_CONTENT_BLACKOUT = { from: '2026-09-01', to: '2027-03-31' } as const;

export type ContentRuleScope = 'billboard' | 'music' | 'all';

export interface ContentRule {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly appliesTo: ContentRuleScope;
}

export const PROMOTION_CONTENT_RULES: readonly ContentRule[] = [
  { id: 'nudity', title: 'No nudity or sexual content', body: 'No nudity, sexual poses or suggestive close-ups. Swimwear is fine in a beach or fashion context.', appliesTo: 'all' },
  { id: 'hate', title: 'No hate or harassment', body: 'No tribal, religious, gender or disability insults, no slurs and no targeting of real people.', appliesTo: 'all' },
  { id: 'scams', title: 'No scams', body: 'No “double your money”, Ponzi or pyramid schemes, guaranteed returns, fake giveaways, loan apps or crypto pumps.', appliesTo: 'all' },
  { id: 'gambling', title: 'No gambling or betting', body: 'No sportsbooks, casinos, lotteries, betting tips or prediction sites.', appliesTo: 'all' },
  { id: 'politics', title: 'No political campaigns during elections', body: `No political party, candidate or campaign content from ${POLITICAL_CONTENT_BLACKOUT.from} to ${POLITICAL_CONTENT_BLACKOUT.to} (2027 general elections).`, appliesTo: 'all' },
  { id: 'impersonation', title: 'No impersonation', body: 'Only advertise brands you own or represent. Don’t pose as another person, a government agency, a bank or Inside Life.', appliesTo: 'all' },
  { id: 'restricted', title: 'No restricted products', body: 'No drugs, weapons, tobacco or vapes, prescription medicine or adult services.', appliesTo: 'all' },
  { id: 'links', title: 'Honest https links only', body: 'Links must start with https://, go to a real website you are allowed to promote and match the ad. No link shorteners, IP addresses or app/file downloads.', appliesTo: 'billboard' },
  { id: 'rights', title: 'Only music you own', body: 'Upload only tracks you made or are licensed to promote. No hate lyrics. Explicit lyrics are allowed in clubs.', appliesTo: 'music' },
  { id: 'review', title: 'Everything is reviewed', body: 'A moderator reviews every ad and track before it goes live. If we don’t approve it, you get a full refund.', appliesTo: 'all' },
];
