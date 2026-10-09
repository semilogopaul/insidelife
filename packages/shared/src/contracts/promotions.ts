import type {
  BillboardFormat,
  BillboardPlacement,
  BillboardSlotId,
  BillboardVisibilityTier,
  ClubPlayProductId,
  ContentRule,
  PromotionQuote,
  TrackContentType,
} from '../catalog/promotions.js';
import type { DistrictId } from '../catalog/geography.js';
import type { AdRateKey, AdSlotKind } from '../catalog/ad-inventory.js';
import type { AdPlacementKind } from '../world-map/ad-placements.js';

/**
 * Promotions API contracts — owned by the promotions domain. Billboards (players and brands buy ad space on in-world
 * billboards) and Club DJ (artists pay for club rotation). All money here is REAL money in kobo; dates are real
 * calendar days in Africa/Lagos (`YYYY-MM-DD`), `endDate` is exclusive.
 */

/** ISO calendar date `YYYY-MM-DD` (Africa/Lagos). */
export type IsoDate = string;

/**
 * draft → pending-payment → in-review → approved → live → completed
 *                                      ↘ refund-due → refunded   (rejected after payment, or slot sold out)
 *                                      ↘ rejected                 (taken down without refund, e.g. fraud)
 * pending-payment → cancelled (by the buyer; a late payment re-opens it or flags a refund).
 */
export const PROMOTION_STATUSES = [
  'draft',
  'pending-payment',
  'in-review',
  'approved',
  'live',
  'completed',
  'rejected',
  'refund-due',
  'refunded',
  'cancelled',
] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

// ----- Billboards ---------------------------------------------------------------------------------------------------

/**
 * A slot as the Promote app shows it: the static catalog entry (`findAdSlot`) joined with its live state
 * (`AdSlotStateDto`). Built on the client; the server sends the state, including the current price.
 */
export interface BillboardSlotDto {
  readonly id: BillboardSlotId;
  readonly kind: AdSlotKind;
  readonly name: string;
  /** Null for citywide slots (Lagos TV, phone apps). */
  readonly districtId: DistrictId | null;
  readonly description: string;
  readonly placement: BillboardPlacement;
  readonly format: BillboardFormat;
  readonly width: number;
  readonly height: number;
  readonly tier: BillboardVisibilityTier;
  /** Current price of one 7-day block, in kobo (from the server). */
  readonly weekPriceKobo: number;
  readonly maxConcurrentAds: number;
  /** Ads running on the board right now. */
  readonly liveCount: number;
  /** `nextStarts[w - 1]`: the day a booking of `w` weeks made now would start (null: no room in the next 60 days). */
  readonly nextStarts: readonly (IsoDate | null)[];
}

/** What changes about a slot: its current weekly price, when a booking would start, and ads running now. */
export interface AdSlotStateDto {
  readonly id: BillboardSlotId;
  /** Current price of one 7-day block, in kobo (ops can change it; a booking keeps the price it was quoted). */
  readonly weekPriceKobo: number;
  /**
   * For 1…`maxWeeks` consecutive weeks: the start date the server would give a booking made now — today when the run
   * fits, else the day the earliest blocking booking ends. Null when there's no room within 60 days.
   */
  readonly nextStarts: readonly (IsoDate | null)[];
  readonly liveCount: number;
}

/** The Club DJ product as it can be bought right now. */
export interface ClubSongOfferDto {
  /** Current price per song, in kobo. */
  readonly priceKobo: number;
  readonly days: number;
  /** When an order placed now would start playing in every club (null: rotation full for 30 days). */
  readonly startDate: IsoDate | null;
}

/** `GET /v1/promotions/slots` — every slot for sale (phone app slots up to the server's configured count). */
export interface BillboardSlotsDto {
  readonly today: IsoDate;
  /** Bookings are 1…`maxWeeks` consecutive 7-day blocks. */
  readonly maxWeeks: number;
  readonly slots: readonly AdSlotStateDto[];
  readonly rules: readonly ContentRule[];
  readonly clubSong: ClubSongOfferDto;
}

/** `POST /v1/promotions/creatives` (multipart: `file` + `slotId`). The image is re-encoded to the slot size. */
export interface UploadCreativeFields {
  readonly slotId: BillboardSlotId;
}

export interface CreativeDto {
  /** Pass as `creativeKey` when booking. Owner-scoped; reusable on any slot of the same format. */
  readonly creativeKey: string;
  readonly url: string;
  readonly format: BillboardFormat;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

/** `POST /v1/promotions/campaigns` */
export interface CreateCampaignRequest {
  readonly slotId: BillboardSlotId;
  readonly creativeKey: string;
  /** Shown to you and to moderators (and as the billboard's accessible label). 3-60 chars. For phone apps: the app's name. */
  readonly title: string;
  /** Phone apps: one-line pitch under the name (≤ 60 chars). Ignored elsewhere. */
  readonly tagline?: string;
  /** https only, no IPs, localhost, shorteners or file downloads. */
  readonly linkUrl: string;
  /** 1…`maxWeeks` consecutive 7-day blocks. The server picks the start: the slot's next free day. */
  readonly weeks: number;
  /**
   * The start date the buyer was shown (`nextStarts[weeks - 1]`). If the slot filled up meanwhile and the run would
   * start later, the server refuses (`DATES_CHANGED`) instead of charging for dates the buyer never saw.
   */
  readonly expectedStartDate?: IsoDate;
}

export interface AdCampaignDto {
  readonly id: string;
  readonly slotId: BillboardSlotId;
  readonly slotName: string;
  readonly title: string;
  readonly tagline: string | null;
  readonly creativeUrl: string;
  readonly linkUrl: string;
  readonly startDate: IsoDate;
  /** Exclusive. */
  readonly endDate: IsoDate;
  readonly days: number;
  readonly amountKobo: number;
  /** Effective status (approved campaigns become `live`/`completed` by date). */
  readonly status: PromotionStatus;
  readonly rejectionReason: string | null;
  readonly paymentReference: string | null;
  /** Resume the Flutterwave checkout while the hold lasts (`pending-payment` only). */
  readonly checkoutUrl: string | null;
  /** The slot is held for you until then; after it a late payment may be refunded if the slot filled up. */
  readonly holdExpiresAt: string | null;
  readonly impressions: number;
  readonly clicks: number;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly reviewedAt: string | null;
}

export interface CheckoutStartedForPromotionDto {
  readonly reference: string;
  /** Flutterwave hosted checkout (or the local sandbox page). Open it, then verify via the payments API. */
  readonly authorizationUrl: string;
  readonly quote: PromotionQuote;
}

/** Response of `POST /v1/promotions/campaigns`. */
export interface CampaignCheckoutDto extends CheckoutStartedForPromotionDto {
  readonly campaignId: string;
  readonly campaign: AdCampaignDto;
}

/** One creative in a board's rotation. */
export interface LiveBillboardCreativeDto {
  readonly campaignId: string;
  readonly imageUrl: string;
  readonly linkUrl: string;
  /** Accessible label / alt text. */
  readonly title: string;
}

/** Shown when the board has no paid creative (or between them when there is free space). Rendered by the client. */
export interface BillboardHouseAdDto {
  readonly headline: string;
  readonly body: string;
  /** e.g. "₦300,000/week" or "From ₦2,000/day". */
  readonly priceLabel: string;
  /** Tapping it opens the in-game phone on this app and slot. */
  readonly action: { readonly type: 'open-phone-app'; readonly app: 'billboards'; readonly slotId: BillboardSlotId };
}

export interface LiveBillboardSlotDto {
  readonly slotId: BillboardSlotId;
  readonly format: BillboardFormat;
  readonly width: number;
  readonly height: number;
  readonly rotationSeconds: number;
  /** Approved, currently-live creatives in rotation order (≤ maxConcurrentAds). Empty → show `houseAd`. */
  readonly creatives: readonly LiveBillboardCreativeDto[];
  /** True when the board still has room today (clients may slot the house ad into the rotation). */
  readonly hasSpace: boolean;
  readonly houseAd: BillboardHouseAdDto;
}

/** `GET /v1/promotions/billboards/live` (public, cached 60 s). */
/** A sponsored app on the phone's home screen (icon = the square creative). */
export interface LivePhoneAppDto {
  readonly slotId: BillboardSlotId;
  readonly campaignId: string;
  readonly name: string;
  readonly tagline: string;
  readonly iconUrl: string;
  readonly linkUrl: string;
}

/**
 * `GET /v1/promotions/billboards/live` (public). `slots` lists the premium boards and every other slot that has a
 * creative running; anything missing shows the house ad. `phoneApps` is the Sponsored apps shelf, in slot order.
 */
export interface LiveBillboardsDto {
  readonly generatedAt: string;
  readonly slots: readonly LiveBillboardSlotDto[];
  readonly phoneApps: readonly LivePhoneAppDto[];
  /** "From ₦3,500/week" per street placement kind, for the empty faces the client draws (current rates). */
  readonly priceLabels: Readonly<Partial<Record<AdPlacementKind, string>>>;
}

// ----- Club DJ ------------------------------------------------------------------------------------------------------

/** `POST /v1/promotions/tracks` (multipart: `file` + these fields). MP3/OGG, ≤ 10 MB, 30 s to under 5 min. */
export interface UploadTrackFields {
  readonly artistName: string;
  readonly title: string;
}

/**
 * `POST /v1/promotions/tracks/:id/orders` — one song, 7 days in every club and lounge, from the rotation's next free
 * day (today when every club has room).
 */
export interface CreateClubOrderRequest {
  readonly productId: ClubPlayProductId;
  /** Every order plays in every club: `['all']` or omit. */
  readonly clubs?: readonly string[];
  /** The start date the artist was shown (`clubSong.startDate`); a later one is refused with `DATES_CHANGED`. */
  readonly expectedStartDate?: IsoDate;
}

export interface ClubPlayOrderDto {
  readonly id: string;
  readonly trackId: string;
  /** A `ClubPlayProductId`, or the id of an older package on orders placed before the single ₦5,000 product. */
  readonly productId: string;
  readonly productName: string;
  readonly allClubs: boolean;
  /** Venue ids (empty when `allClubs`; older single-club orders list their club). */
  readonly clubs: readonly string[];
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly days: number;
  readonly amountKobo: number;
  readonly status: PromotionStatus;
  readonly rejectionReason: string | null;
  readonly paymentReference: string | null;
  readonly checkoutUrl: string | null;
  readonly holdExpiresAt: string | null;
  readonly plays: number;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly reviewedAt: string | null;
}

export interface ClubTrackDto {
  readonly id: string;
  readonly artistName: string;
  readonly title: string;
  readonly audioUrl: string;
  readonly contentType: TrackContentType;
  readonly durationSeconds: number;
  /** Lifetime plays across all orders. */
  readonly plays: number;
  /** The audio was removed after a moderator rejected it; upload the song again to order a new rotation. */
  readonly removed: boolean;
  /** Status of the newest order, or `draft` when the track was never ordered. */
  readonly status: PromotionStatus;
  /** Newest first (last 10). */
  readonly orders: readonly ClubPlayOrderDto[];
  readonly createdAt: string;
}

/** Response of `POST /v1/promotions/tracks/:id/orders`. */
export interface ClubOrderCheckoutDto extends CheckoutStartedForPromotionDto {
  readonly orderId: string;
  readonly order: ClubPlayOrderDto;
}

export interface ClubRotationTrackDto {
  readonly trackId: string;
  readonly audioUrl: string;
  readonly contentType: TrackContentType;
  readonly artistName: string;
  readonly title: string;
  readonly durationSeconds: number;
}

/** `GET /v1/promotions/club-rotation?venueId=` (public, cached 60 s). Interleave with the club's house playlist. */
export interface ClubRotationDto {
  readonly venueId: string;
  readonly generatedAt: string;
  readonly tracks: readonly ClubRotationTrackDto[];
}

// ----- Tracking (public, no PII; counted once per player per item per real hour) ----------------------------------

/** `POST /v1/promotions/impressions` → 204. Batch what was on screen (≤ 32 ids); send the access token if you have it. */
export interface TrackImpressionsRequest {
  readonly campaignIds: readonly string[];
}

/** `POST /v1/promotions/clicks` → `ClickTargetDto`. Open `url` behind the "You're leaving Inside Life" screen. */
export interface TrackClickRequest {
  readonly campaignId: string;
}

export interface ClickTargetDto {
  readonly url: string;
}

/** `POST /v1/promotions/plays` → 204. Report when a paid track has played ≥ 30 s in a club. */
export interface TrackPlayRequest {
  readonly trackId: string;
  readonly venueId: string;
}

// ----- Moderation (admin) -------------------------------------------------------------------------------------------

export interface ModerationCampaignDto extends AdCampaignDto {
  readonly ownerUserId: string;
  readonly ownerHandle: string | null;
}

export interface ModerationClubOrderDto extends ClubPlayOrderDto {
  readonly ownerUserId: string;
  readonly ownerHandle: string | null;
  readonly track: Pick<ClubTrackDto, 'id' | 'artistName' | 'title' | 'audioUrl' | 'contentType' | 'durationSeconds'>;
}

/** `GET /v1/admin/moderation/queue` */
export interface ModerationQueueDto {
  /** Paid and waiting for review, soonest start first. */
  readonly campaigns: readonly ModerationCampaignDto[];
  readonly clubOrders: readonly ModerationClubOrderDto[];
  /** Refunds the server couldn’t send automatically: refund them in the Flutterwave dashboard, then mark them refunded. */
  readonly refundsDue: {
    readonly campaigns: readonly ModerationCampaignDto[];
    readonly clubOrders: readonly ModerationClubOrderDto[];
  };
}

/** `POST /v1/admin/moderation/{campaigns|club-orders}/:id/reject` */
export interface RejectPromotionRequest {
  /** Shown to the buyer. 3-300 chars. */
  readonly reason: string;
  /** Default true: paid items move to `refund-due`. false = `rejected` without refund (fraud, repeat abuse). */
  readonly refund?: boolean;
}

/** `POST /v1/admin/moderation/{campaigns|club-orders}/:id/refunded` — after refunding in the Flutterwave dashboard (fallback when the automatic refund failed). */
export interface MarkRefundedRequest {
  readonly note?: string;
}

// ----- Ad rates (admin-editable prices) -----------------------------------------------------------------------------

/**
 * One editable price. Keys: each street placement kind (`street-billboard`, `bus-shelter`, `totem`, `stadium-led`,
 * `market-banner`, `park-board`), `lagos-tv`, `phone-app`, each premium board id, and `club-song`. Changing a rate
 * only affects new quotes: every order keeps the price it was quoted and charged.
 */
export interface AdRateDto {
  readonly key: AdRateKey;
  readonly label: string;
  /** `week`: per 7-day block of an ad; `song`: per club song (7 days in every club). */
  readonly unit: 'week' | 'song';
  /** The rate is a base weekly price that each spot scales by its district's prestige (roadside kinds). */
  readonly byDistrict: boolean;
  /** The catalog default, in kobo. */
  readonly defaultKobo: number;
  /** What new quotes use now, in kobo (the override when there is one, else the default). */
  readonly currentKobo: number;
  /** When and by whom the override was last set (null when the default applies). */
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}

/** Set a rate: whole naira (a multiple of 100 kobo), from ₦2,000 to ₦100,000,000. */
export interface UpdateAdRateRequest {
  readonly priceKobo: number;
  /** Why (kept with the rate for the audit trail). */
  readonly reason?: string;
}
