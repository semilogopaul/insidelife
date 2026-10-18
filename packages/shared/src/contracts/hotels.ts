/** Hotels API contracts — owned by the hotels domain. */
import type { GameMinute } from '../time/calendar.js';
import type { CityId, DistrictId } from '../catalog/geography.js';
import type { HotelAmenity, HotelTier } from '../catalog/hotels.js';

/** One hotel as the booking sheet shows it. */
export interface HotelOfferDto {
  readonly venueId: string;
  readonly name: string;
  readonly cityId: CityId;
  readonly districtId: DistrictId;
  readonly tier: HotelTier;
  readonly tierLabel: string;
  /** One night right now (₦, world price index applied). */
  readonly nightlyRate: number;
  readonly amenities: readonly HotelAmenity[];
  readonly tagline: string;
  /** You are standing in this hotel (you can only book at its reception). */
  readonly here: boolean;
}

export type HotelStayStatus = 'active' | 'ended';

/** A room you have booked. Until checkout it is a temporary home (the autopilot beds you down there). */
export interface HotelStayDto {
  readonly id: string;
  readonly venueId: string;
  readonly name: string;
  readonly cityId: CityId;
  readonly districtId: DistrictId;
  readonly tier: HotelTier;
  readonly nights: number;
  /** What each night cost when booked (₦). */
  readonly nightlyRate: number;
  readonly totalPaid: number;
  readonly startedAt: GameMinute;
  /** Noon of the last night's morning: the room is yours until then. */
  readonly checkoutAt: GameMinute;
  readonly status: HotelStayStatus;
}

/** The stay as the snapshot summary carries it (HUD, Map, the room's actions). Null when you have no room. */
export interface StaySummaryDto {
  readonly stayId: string;
  readonly venueId: string;
  readonly name: string;
  readonly cityId: CityId;
  readonly districtId: DistrictId;
  readonly checkoutAt: GameMinute;
}

/** GET /v1/hotels */
export interface HotelsDto {
  /** The hotels of the city you are in, then the other city's (browse only). */
  readonly hotels: readonly HotelOfferDto[];
  readonly stay: HotelStayDto | null;
  /** Longest booking in one go. */
  readonly maxNights: number;
}

/** POST /v1/hotels/stays: book at the reception of the hotel you are standing in (or extend your stay there). */
export interface HotelBookingRequest {
  readonly venueId: string;
  readonly nights: number;
  /** "Tap once" key: a retry with the same key gets the first result back instead of paying twice. */
  readonly idempotencyKey: string;
}

export interface HotelBookingResultDto {
  readonly stay: HotelStayDto;
  /** Nights added by this booking and what it cost. */
  readonly nights: number;
  readonly price: number;
  readonly extended: boolean;
  readonly balance: number;
}

/** POST /v1/hotels/stay/checkout */
export interface HotelCheckoutResultDto {
  readonly stay: HotelStayDto;
  readonly balance: number;
}
