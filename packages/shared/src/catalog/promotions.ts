import type { DistrictId } from './geography.js';
import { VENUES, type VenueDefinition, type VenueType } from './venues.js';

/**
 * Promotions catalog — owned by the promotions domain.
 *
 * Real-money advertising inside the game (docs/PLAYER_PSYCHOLOGY.md §5): billboards placed over the city and club
 * plays for artists. Prices are real naira charged in kobo through Paystack. Everything is capped, reviewed by a
 * moderator before it goes live, and booked in real calendar days (Africa/Lagos, WAT = UTC+1, no DST).
 */

// ----- Billboards ---------------------------------------------------------------------------------------------------

/** Stable ids — the 3D world places a billboard mesh per id. Never rename; add new ids at the end. */
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
export type BillboardSlotId = (typeof BILLBOARD_SLOT_IDS)[number];

/** `landscape` 3:1 roadside boards, `portrait` 2:3 building wraps, `square` 1:1 market/rooftop panels. */
export const BILLBOARD_FORMATS = ['landscape', 'portrait', 'square'] as const;
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
};

/** Uploads smaller than this share of the target size on either side are refused (they would look blurry). */
export const BILLBOARD_MIN_UPLOAD_SCALE = 0.5;

/** How much traffic sees the board. Drives price, not rotation. */
export const BILLBOARD_VISIBILITY_TIERS = ['premium', 'high', 'standard', 'local'] as const;
export type BillboardVisibilityTier = (typeof BILLBOARD_VISIBILITY_TIERS)[number];

export const BILLBOARD_PLACEMENTS = ['roadside', 'building', 'terminal'] as const;
export type BillboardPlacement = (typeof BILLBOARD_PLACEMENTS)[number];

export interface BillboardSlot {
  readonly id: BillboardSlotId;
  readonly name: string;
  readonly districtId: DistrictId;
  readonly description: string;
  readonly placement: BillboardPlacement;
  readonly format: BillboardFormat;
  /** Pixel size to upload (same as the format spec; repeated so clients don't need a second lookup). */
  readonly width: number;
  readonly height: number;
  readonly tier: BillboardVisibilityTier;
  /** Real money per real calendar day, in kobo. */
  readonly pricePerDayKobo: number;
  /** Ads sharing the board on any given day (they rotate every BILLBOARD_ROTATION_SECONDS). */
  readonly maxConcurrentAds: number;
}

const NAIRA = 100;

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
    pricePerDayKobo: 25_000 * NAIRA,
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
    pricePerDayKobo: 20_000 * NAIRA,
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
    pricePerDayKobo: 20_000 * NAIRA,
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
    pricePerDayKobo: 15_000 * NAIRA,
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
    pricePerDayKobo: 12_000 * NAIRA,
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
    pricePerDayKobo: 12_000 * NAIRA,
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
    pricePerDayKobo: 8_000 * NAIRA,
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
    pricePerDayKobo: 7_500 * NAIRA,
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
    pricePerDayKobo: 6_000 * NAIRA,
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
    pricePerDayKobo: 5_000 * NAIRA,
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
    pricePerDayKobo: 4_000 * NAIRA,
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
    pricePerDayKobo: 2_500 * NAIRA,
    maxConcurrentAds: 4,
  }),
];

const SLOT_INDEX: ReadonlyMap<string, BillboardSlot> = new Map(BILLBOARD_SLOTS.map((entry) => [entry.id, entry]));

export function findBillboardSlot(id: string): BillboardSlot | undefined {
  return SLOT_INDEX.get(id);
}

export function isBillboardSlotId(id: string): id is BillboardSlotId {
  return SLOT_INDEX.has(id);
}

/** Bookings run 1–30 real days and can start up to 60 days ahead (today included). */
export const BILLBOARD_MIN_DAYS = 1;
export const BILLBOARD_MAX_DAYS = 30;
export const BILLBOARD_MAX_LEAD_DAYS = 60;
/** Weekly bundle: every complete block of 7 days is discounted. */
export const BILLBOARD_WEEK_DAYS = 7;
export const BILLBOARD_WEEKLY_DISCOUNT_PERCENT = 15;
/** Each creative on a board shows for this long before the next one (client-side rotation). */
export const BILLBOARD_ROTATION_SECONDS = 10;

export interface PromotionQuote {
  readonly days: number;
  readonly unitPriceKobo: number;
  readonly subtotalKobo: number;
  readonly discountKobo: number;
  /** What Paystack charges (whole naira). */
  readonly totalKobo: number;
}

const roundToNaira = (kobo: number): number => Math.round(kobo / NAIRA) * NAIRA;

/** Price of booking `days` real days on a slot, with the weekly bundle discount. `days` must be a valid length. */
export function billboardQuote(target: Pick<BillboardSlot, 'pricePerDayKobo'>, days: number): PromotionQuote {
  if (!Number.isInteger(days) || days < BILLBOARD_MIN_DAYS || days > BILLBOARD_MAX_DAYS) {
    throw new RangeError(`Billboard bookings are ${BILLBOARD_MIN_DAYS}-${BILLBOARD_MAX_DAYS} days`);
  }
  const subtotalKobo = target.pricePerDayKobo * days;
  const bundledDays = Math.floor(days / BILLBOARD_WEEK_DAYS) * BILLBOARD_WEEK_DAYS;
  const discountKobo = roundToNaira((target.pricePerDayKobo * bundledDays * BILLBOARD_WEEKLY_DISCOUNT_PERCENT) / 100);
  return { days, unitPriceKobo: target.pricePerDayKobo, subtotalKobo, discountKobo, totalKobo: subtotalKobo - discountKobo };
}

// ----- Club DJ ------------------------------------------------------------------------------------------------------

/** Venue types whose sound system plays paid tracks. */
export const CLUB_PLAY_VENUE_TYPES: readonly VenueType[] = ['club', 'bar'];

/** Clubs and bars that run a paid rotation (derived from the venue catalog, so new clubs join automatically). */
export function clubPlayVenues(): VenueDefinition[] {
  return VENUES.filter((venue) => CLUB_PLAY_VENUE_TYPES.includes(venue.type));
}

export function isClubPlayVenue(venueId: string): boolean {
  return clubPlayVenues().some((venue) => venue.id === venueId);
}

export const CLUB_PLAY_SCOPES = ['single-club', 'all-clubs'] as const;
export type ClubPlayScope = (typeof CLUB_PLAY_SCOPES)[number];

export const CLUB_PLAY_PRODUCT_IDS = ['one-club-1d', 'one-club-3d', 'one-club-7d', 'all-clubs-1d', 'all-clubs-3d', 'all-clubs-7d'] as const;
export type ClubPlayProductId = (typeof CLUB_PLAY_PRODUCT_IDS)[number];

export interface ClubPlayProduct {
  readonly id: ClubPlayProductId;
  readonly name: string;
  readonly description: string;
  readonly scope: ClubPlayScope;
  /** Real calendar days in rotation. */
  readonly days: number;
  readonly priceKobo: number;
}

export const CLUB_PLAY_PRODUCTS: readonly ClubPlayProduct[] = [
  { id: 'one-club-1d', name: 'One club · 1 day', description: 'Your song in one club’s rotation for a day.', scope: 'single-club', days: 1, priceKobo: 1_000 * NAIRA },
  { id: 'one-club-3d', name: 'One club · 3 days', description: 'A long weekend in one club’s rotation.', scope: 'single-club', days: 3, priceKobo: 2_500 * NAIRA },
  { id: 'one-club-7d', name: 'One club · 7 days', description: 'A full week in one club’s rotation.', scope: 'single-club', days: 7, priceKobo: 5_000 * NAIRA },
  { id: 'all-clubs-1d', name: 'All clubs · 1 day', description: 'Every club and lounge in Lagos plays you for a day.', scope: 'all-clubs', days: 1, priceKobo: 3_000 * NAIRA },
  { id: 'all-clubs-3d', name: 'All clubs · 3 days', description: 'Every club and lounge, three days straight.', scope: 'all-clubs', days: 3, priceKobo: 8_000 * NAIRA },
  { id: 'all-clubs-7d', name: 'All clubs · 7 days', description: 'Takeover week: every club and lounge in Lagos.', scope: 'all-clubs', days: 7, priceKobo: 18_000 * NAIRA },
];

export function findClubPlayProduct(id: string): ClubPlayProduct | undefined {
  return CLUB_PLAY_PRODUCTS.find((product) => product.id === id);
}

/** Paid tracks sharing one club's rotation on any given day ('all clubs' orders count in every club). */
export const CLUB_ROTATION_CAPACITY = 12;
/** Club orders can start up to this many days ahead (today included). */
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
export const TRACK_MAX_SECONDS = 6 * 60;

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
