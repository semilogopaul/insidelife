import { AD_PLACEMENT_KINDS, AD_PLACEMENTS, type AdPlacementKind, type AdPlacementSpot } from '../world-map/ad-placements.js';
import { DISTRICTS, type DistrictId } from './geography.js';
import {
  AD_MAX_PRICE_KOBO,
  BILLBOARD_FORMAT_SPECS,
  BILLBOARD_SLOT_IDS,
  BILLBOARD_SLOTS,
  CLUB_SONG_WEEK_PRICE_KOBO,
  PHONE_APP_WEEK_PRICE_KOBO,
  friendlyWeekPriceKobo,
  type BillboardFormat,
  type BillboardPlacement,
  type BillboardSlot,
  type BillboardVisibilityTier,
} from './promotions.js';
import { findVenue } from './venues.js';
import { DEFAULT_USD_RATE_NGN, USD_RATE_KEY, USD_RATE_MAX_NGN, USD_RATE_MIN_NGN, isValidUsdRateNgn } from './payments.js';

/**
 * Everything an advertiser can book with real money, one list: the 12 hand-placed premium billboards, the ~540
 * generated street surfaces (roadside boards, bus shelters, lightbox totems, stadium LEDs, market banners, motor-park
 * boards), Lagos TV (every TV in every home and venue) and the phone's Sponsored apps shelf. Each slot is booked the
 * same way (creative + 1–4 consecutive weeks from its next free day + Flutterwave checkout) and rotates up to
 * `maxConcurrentAds` ads a day.
 *
 * Prices are per 7 days: 7 × the old day rate (roadside kinds keep their district prestige factor; venue boards, the
 * stadium, markets, parks, Lagos TV and the premium boards are flat), rounded to ₦500, never under ₦2,000. A
 * Sponsored phone app is ₦100,000 a week. Ops can override any of these "rates" on the server (`ad_rates`).
 */

export type AdSlotKind = 'premium-billboard' | AdPlacementKind | 'lagos-tv' | 'phone-app';

export interface AdSlot extends BillboardSlot {
  readonly kind: AdSlotKind;
}

/** How the booking app groups slots (and what each kind is for). */
export const AD_SLOT_KIND_LABELS: Readonly<Record<AdSlotKind, string>> = {
  'premium-billboard': 'Premium billboards',
  'street-billboard': 'Street billboards',
  'bus-shelter': 'Bus shelters',
  totem: 'Lightbox totems',
  'stadium-led': 'Stadium LED boards',
  'market-banner': 'Market banners',
  'park-board': 'Motor park boards',
  'lagos-tv': 'Lagos TV',
  'phone-app': 'Sponsored phone apps',
};

/** The most phone app slots the catalog defines; the server sells the first `PHONE_APP_AD_SLOTS` (configurable). */
export const PHONE_APP_SLOT_LIMIT = 20;
/** Default number of Sponsored apps on the phone (the server may override with PHONE_APP_AD_SLOTS). */
export const DEFAULT_PHONE_APP_SLOTS = 10;

const NAIRA = 100;

interface KindPricing {
  readonly placement: BillboardPlacement;
  /** The old ₦ per day; the weekly default is 7 × this (× the district's prestige factor when `byDistrict`). */
  readonly dailyNaira: number;
  readonly maxConcurrentAds: number;
  readonly tier: BillboardVisibilityTier;
  /** Prestige scales roadside prices (Mushin ×0.8 … Banana Island ×1.9); venue spots are flat. */
  readonly byDistrict: boolean;
}

const PRICING: Readonly<Record<AdPlacementKind, KindPricing>> = {
  'street-billboard': { placement: 'street', dailyNaira: 1_800, maxConcurrentAds: 3, tier: 'standard', byDistrict: true },
  'bus-shelter': { placement: 'shelter', dailyNaira: 900, maxConcurrentAds: 2, tier: 'local', byDistrict: true },
  totem: { placement: 'totem', dailyNaira: 600, maxConcurrentAds: 2, tier: 'local', byDistrict: true },
  'stadium-led': { placement: 'arena', dailyNaira: 2_500, maxConcurrentAds: 4, tier: 'high', byDistrict: false },
  'market-banner': { placement: 'market', dailyNaira: 1_000, maxConcurrentAds: 2, tier: 'standard', byDistrict: false },
  'park-board': { placement: 'motor-park', dailyNaira: 1_500, maxConcurrentAds: 3, tier: 'standard', byDistrict: false },
};

/** Lagos TV: every TV in the game, 12 ads share the channel (was ₦6,000/day). */
const LAGOS_TV_WEEK_PRICE_KOBO = 7 * 6_000 * NAIRA;

/** District prestige multiplier for roadside spots (≈0.82 in the poorest district … 1.92 in the richest). */
export const districtPriceFactor = (districtId: DistrictId): number => 0.72 + (DISTRICTS[districtId].prestige / 100) * 1.2;

// ----- Rates (what ops can re-price) ----------------------------------------------------------------------------------

/**
 * One editable price per rate key: each placement kind (a base weekly rate; roadside kinds are then scaled per
 * district), Lagos TV, the phone apps, each premium board, and the club song.
 */
export const AD_RATE_KEYS = [...AD_PLACEMENT_KINDS, 'lagos-tv', 'phone-app', ...BILLBOARD_SLOT_IDS, 'club-song'] as const;
export type AdRateKey = (typeof AD_RATE_KEYS)[number];

export interface AdRateDefinition {
  readonly key: AdRateKey;
  readonly label: string;
  /**
   * `week`: per 7-day block, for every rate including the club song (₦5,000 a day = ₦35,000 a week since Oct 2026).
   * `song` (a flat price per song) is no longer used; it stays in the type for older admin clients.
   */
  readonly unit: 'week' | 'song';
  /** The stored rate is a base weekly price, scaled by each spot's district prestige. */
  readonly byDistrict: boolean;
  readonly defaultKobo: number;
}

export const AD_RATE_DEFINITIONS: Readonly<Record<AdRateKey, AdRateDefinition>> = Object.fromEntries([
  ...AD_PLACEMENT_KINDS.map((kind) => [
    kind,
    { key: kind, label: AD_SLOT_KIND_LABELS[kind], unit: 'week', byDistrict: PRICING[kind].byDistrict, defaultKobo: 7 * PRICING[kind].dailyNaira * NAIRA },
  ]),
  ['lagos-tv', { key: 'lagos-tv', label: AD_SLOT_KIND_LABELS['lagos-tv'], unit: 'week', byDistrict: false, defaultKobo: LAGOS_TV_WEEK_PRICE_KOBO }],
  ['phone-app', { key: 'phone-app', label: AD_SLOT_KIND_LABELS['phone-app'], unit: 'week', byDistrict: false, defaultKobo: PHONE_APP_WEEK_PRICE_KOBO }],
  ...BILLBOARD_SLOTS.map((board) => [board.id, { key: board.id, label: `Premium billboard: ${board.name}`, unit: 'week', byDistrict: false, defaultKobo: board.weekPriceKobo }]),
  ['club-song', { key: 'club-song', label: 'Club DJ song (per week, every club and lounge)', unit: 'week', byDistrict: false, defaultKobo: CLUB_SONG_WEEK_PRICE_KOBO }],
]) as Record<AdRateKey, AdRateDefinition>;

export function isAdRateKey(key: string): key is AdRateKey {
  return Object.hasOwn(AD_RATE_DEFINITIONS, key);
}

/**
 * The owner's rate card: every ad price, plus `usd-rate`, the exchange rate dollar payments use ("₦ per $1 for
 * payments", unit `ngn-per-usd`). Like the prices it is stored in kobo (₦1,500 per $1 = 150,000) and edited through
 * the same audited admin route; it is not an ad, so it isn't one of `AD_RATE_KEYS`.
 */
export const RATE_CARD_KEYS = [...AD_RATE_KEYS, USD_RATE_KEY] as const;
export type RateCardKey = (typeof RATE_CARD_KEYS)[number];
export type RateCardUnit = AdRateDefinition['unit'] | 'ngn-per-usd';

export function isRateCardKey(key: string): key is RateCardKey {
  return key === USD_RATE_KEY || isAdRateKey(key);
}

export const USD_RATE_DEFINITION = {
  key: USD_RATE_KEY,
  label: '₦ per $1 for payments',
  unit: 'ngn-per-usd',
  byDistrict: false,
  defaultKobo: DEFAULT_USD_RATE_NGN * NAIRA,
} as const;

/** Whole naira per $1 (in kobo) from ₦500 to ₦5,000: what `usd-rate` can be set to. */
export function isValidUsdRateKobo(kobo: number): boolean {
  return Number.isSafeInteger(kobo) && kobo % NAIRA === 0 && isValidUsdRateNgn(kobo / NAIRA);
}

/** Lowest value any rate-card entry can take (₦500 per $1), for request shape checks. */
export const RATE_CARD_MIN_KOBO = USD_RATE_MIN_NGN * NAIRA;
export const USD_RATE_MAX_KOBO = USD_RATE_MAX_NGN * NAIRA;

/** The rate a slot is priced from: its own key for a premium board, else its kind. */
export function adRateKeyOf(slot: Pick<AdSlot, 'id' | 'kind'>): AdRateKey {
  if (slot.kind !== 'premium-billboard') return slot.kind;
  if (!isAdRateKey(slot.id)) throw new RangeError(`No rate for premium board ${slot.id}`);
  return slot.id;
}

const BY_DISTRICT_KINDS: ReadonlySet<AdSlotKind> = new Set(AD_PLACEMENT_KINDS.filter((kind) => PRICING[kind].byDistrict));

/** A slot's weekly price from its rate: roadside kinds are scaled by district prestige and rounded to ₦500. */
export function adWeekPriceKobo(slot: Pick<AdSlot, 'kind' | 'districtId'>, rateKobo: number): number {
  if (!BY_DISTRICT_KINDS.has(slot.kind) || !slot.districtId) return rateKobo;
  // A base rate near the ₦100m cap times a rich district's factor would exceed it: clamp, so it stays bookable.
  return Math.min(AD_MAX_PRICE_KOBO, friendlyWeekPriceKobo(rateKobo * districtPriceFactor(slot.districtId)));
}

// ----- Slots -------------------------------------------------------------------------------------------------------

const pixels = (format: BillboardFormat) => ({ format, width: BILLBOARD_FORMAT_SPECS[format].width, height: BILLBOARD_FORMAT_SPECS[format].height });

function describe(spot: AdPlacementSpot): { readonly name: string; readonly description: string } {
  const district = DISTRICTS[spot.districtId].name;
  const venue = spot.venueId ? findVenue(spot.venueId)?.name : undefined;
  const number = spot.id.split('-').at(-1);
  switch (spot.kind) {
    case 'street-billboard':
      return { name: `${spot.street} billboard`, description: `Pole board angled at oncoming traffic on ${spot.street}, ${district}. Drivers and danfo passengers see it on every trip.` };
    case 'bus-shelter':
      return { name: `${spot.street} bus shelter`, description: `Lit panel at a bus shelter on ${spot.street}, ${district}. Commuters wait right beside it.` };
    case 'totem':
      return { name: `${spot.street} lightbox`, description: `Pavement lightbox on ${spot.street}, ${district}, readable from both directions. Cheap, local, everywhere.` };
    case 'stadium-led':
      return { name: `Stadium LED board ${number}`, description: `Pitch-side LED around ${venue ?? 'the stadium'}. Match days fill it with fans.` };
    case 'market-banner':
      return { name: `${venue ?? 'Market'} banner ${number}`, description: `Banner over the stalls at ${venue ?? 'the market'}, ${district}. Thousands of shoppers a day.` };
    case 'park-board':
      return { name: `${venue ?? 'Motor park'} board ${number}`, description: `Board over the bays at ${venue ?? 'the motor park'}, ${district}, where travellers wait for their bus.` };
  }
}

function placementSlot(spot: AdPlacementSpot): AdSlot {
  const pricing = PRICING[spot.kind];
  return {
    id: spot.id,
    kind: spot.kind,
    ...describe(spot),
    districtId: spot.districtId,
    placement: pricing.placement,
    ...pixels(spot.format),
    tier: pricing.byDistrict && DISTRICTS[spot.districtId].prestige >= 70 && pricing.tier === 'standard' ? 'high' : pricing.tier,
    weekPriceKobo: adWeekPriceKobo(spot, AD_RATE_DEFINITIONS[spot.kind].defaultKobo),
    maxConcurrentAds: pricing.maxConcurrentAds,
  };
}

const LAGOS_TV: AdSlot = {
  id: 'lagos-tv',
  kind: 'lagos-tv',
  name: 'Lagos TV',
  description: 'Your ad plays on every TV in the game: in players’ homes, bukas, bars and offices. Up to 12 ads share the channel each day.',
  districtId: null,
  placement: 'broadcast',
  ...pixels('wide'),
  tier: 'premium',
  weekPriceKobo: LAGOS_TV_WEEK_PRICE_KOBO,
  maxConcurrentAds: 12,
};

const phoneAppSlot = (index: number): AdSlot => ({
  id: `app-${index}`,
  kind: 'phone-app',
  name: `Sponsored app ${index}`,
  description: 'Your app on every player’s phone home screen: icon, name and a one-line pitch. Tapping it opens your page with a button to your website.',
  districtId: null,
  placement: 'phone',
  ...pixels('square'),
  tier: 'premium',
  weekPriceKobo: PHONE_APP_WEEK_PRICE_KOBO,
  maxConcurrentAds: 1,
});

/** Every bookable slot, with default prices (the server hides phone app slots beyond its configured count). */
export const AD_SLOTS: readonly AdSlot[] = [
  ...BILLBOARD_SLOTS.map((slot): AdSlot => ({ ...slot, kind: 'premium-billboard' })),
  ...AD_PLACEMENTS.map(placementSlot),
  LAGOS_TV,
  ...Array.from({ length: PHONE_APP_SLOT_LIMIT }, (_, index) => phoneAppSlot(index + 1)),
];

const AD_SLOT_INDEX: ReadonlyMap<string, AdSlot> = new Map(AD_SLOTS.map((slot) => [slot.id, slot]));

export function findAdSlot(id: string): AdSlot | undefined {
  return AD_SLOT_INDEX.get(id);
}

/** Phone app slot number (1-based), or null for other slots. */
export function phoneAppSlotNumber(id: string): number | null {
  const match = /^app-(\d+)$/.exec(id);
  return match ? Number(match[1]) : null;
}
