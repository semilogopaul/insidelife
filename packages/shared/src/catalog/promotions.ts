import { formatNaira } from '../money/money.js';
import type { DistrictId } from './geography.js';
import { VENUES, type VenueDefinition, type VenueType } from './venues.js';

/**
 * Promotions catalog — owned by the promotions domain.
 *
 * Real-money advertising inside the game (docs/PLAYER_PSYCHOLOGY.md §5): billboards placed over the city and club
 * plays for artists. Prices are real naira charged in kobo through Flutterwave. Everything is capped, reviewed by a
 * moderator before it goes live, and booked in real calendar days (Africa/Lagos, WAT = UTC+1, no DST).
 */

// ----- Billboards ---------------------------------------------------------------------------------------------------

/**
 * The 12 hand-placed premium billboards. Stable ids — the 3D world places a board per id. Never rename; add new ids at
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

/** Every ad is sold in blocks of 7 consecutive real days: 1 to 4 weeks, starting on the slot's next free day. */
export const AD_WEEK_DAYS = 7;
export const AD_MAX_WEEKS = 4;
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
  /** Consecutive 7-day blocks (1–4). */
  readonly weeks: number;
  readonly days: number;
  /** Price of one 7-day block when quoted (the order keeps it: later rate changes never touch it). */
  readonly weekPriceKobo: number;
  /** What the payer is charged (whole naira). */
  readonly totalKobo: number;
}

/** Why a booking of `weeks` can't be made (player-facing), or null. */
export function adWeeksProblem(weeks: number): string | null {
  return Number.isInteger(weeks) && weeks >= 1 && weeks <= AD_MAX_WEEKS ? null : `Book 1 to ${AD_MAX_WEEKS} weeks`;
}

/** Whole naira between ₦2,000 and ₦100m: the only prices an ad rate can have. */
export function isValidAdPriceKobo(kobo: number): boolean {
  return Number.isSafeInteger(kobo) && kobo % NAIRA === 0 && kobo >= AD_MIN_PRICE_KOBO && kobo <= AD_MAX_PRICE_KOBO;
}

/** Price of `weeks` consecutive 7-day blocks at a weekly price. Throws a RangeError for anything that can't be sold. */
export function adQuote(weekPriceKobo: number, weeks: number): PromotionQuote {
  const problem = adWeeksProblem(weeks);
  if (problem) throw new RangeError(problem);
  if (!isValidAdPriceKobo(weekPriceKobo)) throw new RangeError(`Ad prices are whole naira from ${formatNaira(AD_MIN_PRICE_KOBO / NAIRA)} a week`);
  return { weeks, days: weeks * AD_WEEK_DAYS, weekPriceKobo, totalKobo: weekPriceKobo * weeks };
}

/** "₦175,000/week". */
export const adWeekPriceLabel = (weekPriceKobo: number): string => `${formatNaira(weekPriceKobo / NAIRA)}/week`;

// ----- Club DJ ------------------------------------------------------------------------------------------------------

/** Venue types whose sound system plays paid tracks: clubs, and bars (the lounges and rooftop bars). */
export const CLUB_PLAY_VENUE_TYPES: readonly VenueType[] = ['club', 'bar'];

/** Clubs and lounges that run a paid rotation (derived from the venue catalog, so new clubs join automatically). */
export function clubPlayVenues(): VenueDefinition[] {
  return VENUES.filter((venue) => CLUB_PLAY_VENUE_TYPES.includes(venue.type));
}

export function isClubPlayVenue(venueId: string): boolean {
  return clubPlayVenues().some((venue) => venue.id === venueId);
}

/**
 * One product (owner's rule): ₦5,000 per song = 7 real days in every club and lounge's rotation, starting on the next
 * day every club has room (today if they do).
 */
export const CLUB_PLAY_PRODUCT_IDS = ['all-clubs-7d'] as const;
export type ClubPlayProductId = (typeof CLUB_PLAY_PRODUCT_IDS)[number];

/** Default price per song (ops can override it: rate key `club-song`). */
export const CLUB_TRACK_PRICE_KOBO = 5_000 * NAIRA;

export interface ClubPlayProduct {
  readonly id: ClubPlayProductId;
  readonly name: string;
  readonly description: string;
  /** Real calendar days in rotation. */
  readonly days: number;
  /** Default price; the server's current rate wins. */
  readonly priceKobo: number;
}

export const CLUB_PLAY_PRODUCT: ClubPlayProduct = {
  id: 'all-clubs-7d',
  name: 'Every club · 7 days',
  description: 'Your song in the rotation of every club and lounge in Lagos for 7 days.',
  days: 7,
  priceKobo: CLUB_TRACK_PRICE_KOBO,
};

export const CLUB_PLAY_PRODUCTS: readonly ClubPlayProduct[] = [CLUB_PLAY_PRODUCT];

export function findClubPlayProduct(id: string): ClubPlayProduct | undefined {
  return CLUB_PLAY_PRODUCTS.find((product) => product.id === id);
}

/** Paid tracks sharing one club's rotation on any given day ('all clubs' orders count in every club). */
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
