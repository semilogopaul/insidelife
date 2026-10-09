import { AD_PLACEMENTS, type AdPlacementKind, type AdPlacementSpot } from '../world-map/ad-placements.js';
import { DISTRICTS } from './geography.js';
import { BILLBOARD_FORMAT_SPECS, BILLBOARD_SLOTS, type BillboardFormat, type BillboardPlacement, type BillboardSlot, type BillboardVisibilityTier } from './promotions.js';
import { findVenue } from './venues.js';

/**
 * Everything an advertiser can book with real money, one list: the 12 hand-placed premium billboards, the ~540
 * generated street surfaces (roadside boards, bus shelters, lightbox totems, stadium LEDs, market banners, motor-park
 * boards), Lagos TV (every TV in every home and venue) and the phone's Sponsored apps shelf. Each slot is booked the
 * same way (creative + dates + Paystack) and rotates up to `maxConcurrentAds` ads a day.
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
  /** ₦ per day before the district's prestige factor. */
  readonly baseNaira: number;
  readonly maxConcurrentAds: number;
  readonly tier: BillboardVisibilityTier;
  /** Prestige scales roadside prices (Mushin ×0.8 … Banana Island ×1.9); venue spots are flat. */
  readonly byDistrict: boolean;
}

const PRICING: Readonly<Record<AdPlacementKind, KindPricing>> = {
  'street-billboard': { placement: 'street', baseNaira: 1_800, maxConcurrentAds: 3, tier: 'standard', byDistrict: true },
  'bus-shelter': { placement: 'shelter', baseNaira: 900, maxConcurrentAds: 2, tier: 'local', byDistrict: true },
  totem: { placement: 'totem', baseNaira: 600, maxConcurrentAds: 2, tier: 'local', byDistrict: true },
  'stadium-led': { placement: 'arena', baseNaira: 2_500, maxConcurrentAds: 4, tier: 'high', byDistrict: false },
  'market-banner': { placement: 'market', baseNaira: 1_000, maxConcurrentAds: 2, tier: 'standard', byDistrict: false },
  'park-board': { placement: 'motor-park', baseNaira: 1_500, maxConcurrentAds: 3, tier: 'standard', byDistrict: false },
};

const prestigeFactor = (spot: AdPlacementSpot): number => 0.72 + (DISTRICTS[spot.districtId].prestige / 100) * 1.2;
/** Round to a friendly price (nearest ₦50). */
const friendly = (naira: number): number => Math.max(100, Math.round(naira / 50) * 50);

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
  const naira = pricing.byDistrict ? friendly(pricing.baseNaira * prestigeFactor(spot)) : pricing.baseNaira;
  return {
    id: spot.id,
    kind: spot.kind,
    ...describe(spot),
    districtId: spot.districtId,
    placement: pricing.placement,
    ...pixels(spot.format),
    tier: pricing.byDistrict && DISTRICTS[spot.districtId].prestige >= 70 && pricing.tier === 'standard' ? 'high' : pricing.tier,
    pricePerDayKobo: naira * NAIRA,
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
  pricePerDayKobo: 6_000 * NAIRA,
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
  pricePerDayKobo: 4_000 * NAIRA,
  maxConcurrentAds: 1,
});

/** Every bookable slot (the server hides phone app slots beyond its configured count). */
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
