import { MINUTES_PER_DAY, MINUTES_PER_HOUR, startOfDay, type GameMinute } from '../time/calendar.js';
import { DISTRICTS, type CityId } from './geography.js';
import { findVenue, type VenueDefinition } from './venues.js';

/**
 * Hotels (Lagos and Abuja). A hotel is a `hotel` venue: a lobby with a reception desk, a guest room, and the bar,
 * restaurant, pool and gym where the hotel has them. Book a night or several at reception (price by tier): a stay
 * is a temporary home until checkout, so travellers in the other city have somewhere to sleep.
 */

export const HOTEL_TIERS = ['standard', 'upscale', 'luxury'] as const;
export type HotelTier = (typeof HOTEL_TIERS)[number];

export const HOTEL_AMENITIES = ['bar', 'restaurant', 'pool', 'gym'] as const;
export type HotelAmenity = (typeof HOTEL_AMENITIES)[number];

export const HOTEL_AMENITY_LABELS: Readonly<Record<HotelAmenity, string>> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
  pool: 'Pool',
  gym: 'Gym',
};

export interface HotelTierInfo {
  readonly label: string;
  /** Sleep quality of the room's bed (0-1), like a home's `bedQuality`. */
  readonly bedQuality: number;
  /** What the room adds to how comfortable you feel (like a home's comfort). */
  readonly comfort: number;
}

export const HOTEL_TIER_INFO: Readonly<Record<HotelTier, HotelTierInfo>> = {
  standard: { label: 'Standard', bedQuality: 0.55, comfort: 8 },
  upscale: { label: 'Upscale', bedQuality: 0.75, comfort: 18 },
  luxury: { label: 'Luxury', bedQuality: 0.95, comfort: 30 },
};

export interface HotelDefinition {
  /** The `hotel` venue id. */
  readonly venueId: string;
  readonly tier: HotelTier;
  /** One night in a room (₦, before the world price index). */
  readonly nightlyRate: number;
  readonly amenities: readonly HotelAmenity[];
  /** A line for the booking sheet. */
  readonly tagline: string;
}

/**
 * Real hotels, real names. Rates are what a night costs in a double room at the base price index; the world's price
 * index (inflation) scales them like any other price.
 */
export const HOTELS: readonly HotelDefinition[] = [
  // Lagos
  { venueId: 'eko-hotel', tier: 'luxury', nightlyRate: 320_000, amenities: ['bar', 'restaurant', 'pool', 'gym'], tagline: 'Victoria Island’s resort hotel: lagoon pools, ballrooms and a lobby that has seen every wedding.' },
  { venueId: 'federal-palace-hotel', tier: 'luxury', nightlyRate: 300_000, amenities: ['bar', 'restaurant', 'pool', 'gym'], tagline: 'Ahmadu Bello Way’s grand old hotel, reopened and renovated, with a pool you can see from the Atlantic.' },
  { venueId: 'the-wheatbaker', tier: 'luxury', nightlyRate: 350_000, amenities: ['bar', 'restaurant', 'pool', 'gym'], tagline: 'Ikoyi’s quiet boutique hotel: art on the walls, afternoon tea and a garden pool.' },
  { venueId: 'lagos-continental-hotel', tier: 'luxury', nightlyRate: 280_000, amenities: ['bar', 'restaurant', 'pool', 'gym'], tagline: 'Victoria Island’s tall business hotel, with a spa and a view of the lagoon.' },
  { venueId: 'radisson-blu-ikeja', tier: 'upscale', nightlyRate: 190_000, amenities: ['bar', 'restaurant', 'pool', 'gym'], tagline: 'Ikeja’s business hotel on Isaac John Street: meetings by day, a pool and a bar by night.' },
  { venueId: 'four-points-lekki', tier: 'upscale', nightlyRate: 175_000, amenities: ['bar', 'restaurant', 'pool', 'gym'], tagline: 'Four Points by Sheraton on the Lekki side: rooftop views and a breakfast spread.' },
  // Abuja
  { venueId: 'transcorp-hilton', tier: 'luxury', nightlyRate: 330_000, amenities: ['bar', 'restaurant', 'pool', 'gym'], tagline: 'The grand hotel on Aguiyi Ironsi Street: delegations, wedding parties and a pool bar.' },
  { venueId: 'sheraton-abuja', tier: 'luxury', nightlyRate: 290_000, amenities: ['bar', 'restaurant', 'pool', 'gym'], tagline: 'Conferences, receptions and a lobby where deals get done, with rooms that look over Abuja.' },
  { venueId: 'fraser-suites-abuja', tier: 'upscale', nightlyRate: 170_000, amenities: ['restaurant', 'gym'], tagline: 'Serviced suites in the Central Business District: a kitchenette, a desk and a short walk to the ministries.' },
  { venueId: 'chelsea-hotel-abuja', tier: 'standard', nightlyRate: 95_000, amenities: ['bar', 'restaurant'], tagline: 'A dependable mid-range hotel off Wuse: a clean room, a bar and Abuja’s best pepper soup.' },
];

const HOTEL_INDEX: ReadonlyMap<string, HotelDefinition> = new Map(HOTELS.map((hotel) => [hotel.venueId, hotel]));

export function findHotel(venueId: string): HotelDefinition | undefined {
  return HOTEL_INDEX.get(venueId);
}

export function isHotelVenueId(venueId: string): boolean {
  return HOTEL_INDEX.has(venueId);
}

/** The hotel's venue (where it stands, its name). */
export function hotelVenue(hotel: HotelDefinition): VenueDefinition {
  const venue = findVenue(hotel.venueId);
  if (!venue) throw new RangeError(`Hotel ${hotel.venueId} has no venue`);
  return venue;
}

/** Hotels of a city. */
export function hotelsInCity(cityId: CityId): readonly HotelDefinition[] {
  return HOTELS.filter((hotel) => DISTRICTS[hotelVenue(hotel).districtId].cityId === cityId);
}

/** Whether this hotel has a bar, restaurant, pool or gym. */
export function hotelOffers(venueId: string, amenity: HotelAmenity): boolean {
  return findHotel(venueId)?.amenities.includes(amenity) ?? false;
}

/** Longest single booking (extend for more). */
export const HOTEL_MAX_NIGHTS = 14;
/** Rooms are given up at noon. */
export const HOTEL_CHECKOUT_HOUR = 12;

/**
 * Home actions you can do in your hotel room (a bed and a shower; no kitchen, TV set or workshop of your own):
 * the room is a temporary home for these only.
 */
export const HOTEL_ROOM_ACTION_IDS: ReadonlySet<string> = new Set(['sleep', 'nap', 'shower']);

/**
 * When a stay of `nights` booked at `time` ends: noon after the first night, plus one day per extra night. Booked at
 * 02:00 for one night you still get that night and leave at noon the same day; booked at 15:00 you leave at noon
 * tomorrow.
 */
export function stayCheckoutAt(time: GameMinute, nights: number): GameMinute {
  const noonToday = startOfDay(time) + HOTEL_CHECKOUT_HOUR * MINUTES_PER_HOUR;
  const firstNoon = noonToday > time ? noonToday : noonToday + MINUTES_PER_DAY;
  return firstNoon + (nights - 1) * MINUTES_PER_DAY;
}
