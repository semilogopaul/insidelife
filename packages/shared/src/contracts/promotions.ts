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
  /** Current weekly rate, in kobo (from the server). */
  readonly weekPriceKobo: number;
  /** Days per block it's sold in now (7, or 3 for expensive slots: see `adBlockDays`). */
  readonly blockDays: number;
  /** Current price of one block, in kobo. */
  readonly blockPriceKobo: number;
  /** Most blocks one booking can buy (`adMaxBlocks`). */
  readonly maxBlocks: number;
  readonly maxConcurrentAds: number;
  /** Ads running on the board right now. */
  readonly liveCount: number;
  /** `nextStarts[b - 1]`: the day a booking of `b` blocks made now would start (null: no room in the next 60 days). */
  readonly nextStarts: readonly (IsoDate | null)[];
}

/** What changes about a slot: its current price and block length, when a booking would start, and ads running now. */
export interface AdSlotStateDto {
  readonly id: BillboardSlotId;
  /** Current weekly rate, in kobo (ops can change it; a booking keeps the price it was quoted). */
  readonly weekPriceKobo: number;
  /** Days per block at this rate (3 when the weekly rate is ₦100,000 or more, else 7). */
  readonly blockDays: number;
  /** Price of one block at this rate. */
  readonly blockPriceKobo: number;
  readonly maxBlocks: number;
  /**
   * For 1…`maxBlocks` consecutive blocks: the start date the server would give a booking made now — today when the
   * run fits, else the day the earliest blocking booking ends. Null when there's no room within 60 days.
   */
  readonly nextStarts: readonly (IsoDate | null)[];
  readonly liveCount: number;
}

/**
 * The Club DJ product as it can be bought right now: ₦5,000 a day, sold in 7-day blocks (1–`maxWeeks` weeks back to
 * back) like every other ad, with a guaranteed number of plays a day spread over every club and lounge.
 */
export interface ClubSongOfferDto {
  /** Current price of one 7-day block, in kobo. */
  readonly weekPriceKobo: number;
  /** The same price per day (`weekPriceKobo / 7`, rounded to the naira) for the copy. */
  readonly dayPriceKobo: number;
  /** @deprecated Same as `weekPriceKobo` (older clients read it as the price of 7 days). */
  readonly priceKobo: number;
  /** Days in one block (7). */
  readonly days: number;
  readonly maxWeeks: number;
  /** `nextStarts[w - 1]`: the day a booking of `w` weeks made now would start playing (null: no free lane in 30 days). */
  readonly nextStarts: readonly (IsoDate | null)[];
  /** @deprecated `nextStarts[0]`. */
  readonly startDate: IsoDate | null;
  /** Average plays a real day for one song, across every club and lounge. */
  readonly playsPerDay: number;
  /** Plays a real day every booked song gets at least. */
  readonly minPlaysPerDay: number;
  /** Clubs and lounges it plays in. */
  readonly clubs: number;
  /** Songs that can be in rotation at once (the cap that keeps the guarantee). */
  readonly lanes: number;
}

/** `GET /v1/promotions/slots` — every slot for sale (phone app slots up to the server's configured count). */
export interface BillboardSlotsDto {
  readonly today: IsoDate;
  /** Bookings of 7-day blocks are 1…`maxWeeks` weeks (each slot says its own `blockDays` and `maxBlocks`). */
  readonly maxWeeks: number;
  /** Longest run one booking can buy, in days. */
  readonly maxRunDays: number;
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
  /** 1…`maxBlocks` consecutive blocks of the slot's `blockDays`. The server picks the start: the slot's next free day. */
  readonly blocks?: number;
  /** @deprecated Weeks, for 7-day slots only (same as `blocks` there). */
  readonly weeks?: number;
  /**
   * The start date the buyer was shown (`nextStarts[blocks - 1]`). If the slot filled up meanwhile and the run would
   * start later, the server refuses (`DATES_CHANGED`) instead of charging for dates the buyer never saw.
   */
  readonly expectedStartDate?: IsoDate;
  /**
   * The total the buyer was shown (`blockPriceKobo × blocks`). If ops re-priced the slot meanwhile (or it moved to
   * another block length), the server refuses with `PRICE_CHANGED` (details: `weekPriceKobo=…`, `totalKobo=…`) instead
   * of charging a different amount.
   */
  readonly expectedPriceKobo?: number;
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
  /** Days per block it was sold in (7, or 3 for expensive slots), and how many blocks. */
  readonly blockDays: number;
  readonly blocks: number;
  readonly amountKobo: number;
  /** Effective status (approved campaigns become `live`/`completed` by date). */
  readonly status: PromotionStatus;
  readonly rejectionReason: string | null;
  readonly paymentReference: string | null;
  /** Resume the Flutterwave checkout while the hold lasts (`pending-payment` only). */
  readonly checkoutUrl: string | null;
  /** The slot is held for you until then; after it a late payment may be refunded if the slot filled up. */
  readonly holdExpiresAt: string | null;
  /** Views (see `catalog/ad-views.ts`): each player counts once per game hour. */
  readonly impressions: number;
  /** Different players who saw it. */
  readonly uniqueViewers: number;
  /** @deprecated Kept for the admin portal; players see views only. */
  readonly clicks: number;
  /** The uploaded image, reusable for "Run it again" on a slot of the same format (null once removed after review). */
  readonly creativeKey: string | null;
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

/** `POST /v1/promotions/tracks` (multipart: `file` + these fields). MP3/OGG, ≤ 10 MB, 30 s to 3 min. */
export interface UploadTrackFields {
  readonly artistName: string;
  readonly title: string;
}

/**
 * `POST /v1/promotions/tracks/:id/orders` — one song in every club and lounge for 1–4 consecutive weeks, from the
 * rotation's next free day (today when a lane is free for the whole run).
 */
export interface CreateClubOrderRequest {
  readonly productId: ClubPlayProductId;
  /** 1…`clubSong.maxWeeks` consecutive 7-day blocks (default 1). */
  readonly weeks?: number;
  /** Every order plays in every club: `['all']` or omit. */
  readonly clubs?: readonly string[];
  /** The start date the artist was shown (`clubSong.nextStarts[weeks - 1]`); a later one is refused with `DATES_CHANGED`. */
  readonly expectedStartDate?: IsoDate;
  /** The total the artist was shown (`weekPriceKobo × weeks`); a different one is refused with `PRICE_CHANGED`. */
  readonly expectedPriceKobo?: number;
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
  /** Consecutive 7-day blocks booked. */
  readonly weeks: number;
  /** Plays so far (every scheduled slot of its lane in a club while it ran). */
  readonly plays: number;
  /** Different players who were in the club during at least one play (the artist not counted). */
  readonly listeners: number;
  /** Sum of each play's audience. */
  readonly audience: number;
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

/** `GET /v1/promotions/club-rotation?venueId=` (public, cached 60 s): the songs in rotation there today (no times). */
export interface ClubRotationDto {
  readonly venueId: string;
  readonly generatedAt: string;
  readonly tracks: readonly ClubRotationTrackDto[];
}

/** One paid song at an exact time in one club (see `catalog/club-schedule.ts`). */
export interface ClubScheduledPlayDto extends ClubRotationTrackDto {
  /** The schedule slot (unique across Lagos). */
  readonly slotIndex: number;
  readonly venueId: string;
  /** Real time the song starts (server clock, ms); it plays `durationSeconds` from there. */
  readonly startsAtMs: number;
  /** Game minute it starts. */
  readonly gameMinute: number;
}

/**
 * `GET /v1/promotions/club-schedule?venueId=` (public, cached ~15 s): the paid songs that play in this club from a
 * few minutes ago to `untilMs`. The audio plays exactly these at these times (joining mid-song seeks into it); between
 * them, and when there are none, the club's own game music plays.
 */
export interface ClubScheduleDto {
  readonly venueId: string;
  readonly generatedAt: string;
  readonly serverNowMs: number;
  /** Ask again before this (the schedule is complete up to here). */
  readonly untilMs: number;
  readonly plays: readonly ClubScheduledPlayDto[];
}

/** One play of a song (when and where), for the Promote app. */
export interface ClubPlayTimeDto {
  readonly venueId: string;
  readonly startsAtMs: number;
  readonly endsAtMs: number;
  readonly gameMinute: number;
}

// ----- Detail screens ("what you paid for") -------------------------------------------------------------------------

export const PROMOTION_TIMELINE_STEPS = ['paid', 'in-review', 'approved', 'live', 'ended', 'rejected', 'refund-due', 'refunded', 'cancelled'] as const;
export type PromotionTimelineStep = (typeof PROMOTION_TIMELINE_STEPS)[number];

/** One step of an ad or song's life, oldest first. `next` steps are what happens if all goes well. */
export interface PromotionTimelineStepDto {
  readonly step: PromotionTimelineStep;
  readonly state: 'done' | 'current' | 'next';
  /** When it happened (or is due, for `next` steps with a date); null when unknown. */
  readonly at: string | null;
  /** Why (a rejection reason, a refund) when there is one. */
  readonly note: string | null;
}

/** The receipt: what was charged and how to quote it to support. */
export interface PromotionReceiptDto {
  readonly amountKobo: number;
  readonly blocks: number;
  readonly blockDays: number;
  /** Price of one block as charged. */
  readonly blockPriceKobo: number;
  readonly paymentReference: string | null;
  readonly paidAt: string | null;
  /** Real naira sent back (kobo); 0 when nothing was refunded. */
  readonly refundedKobo: number;
}

/** `GET /v1/promotions/campaigns/:id` */
export interface AdCampaignDetailDto {
  readonly campaign: AdCampaignDto;
  readonly timeline: readonly PromotionTimelineStepDto[];
  readonly receipt: PromotionReceiptDto;
}

export interface ClubPlaysByClubDto {
  readonly venueId: string;
  readonly plays: number;
  readonly audience: number;
}

/** `GET /v1/promotions/club-orders/:id` */
export interface ClubOrderDetailDto {
  readonly order: ClubPlayOrderDto;
  readonly track: Pick<ClubTrackDto, 'id' | 'artistName' | 'title' | 'audioUrl' | 'contentType' | 'durationSeconds' | 'removed'>;
  readonly timeline: readonly PromotionTimelineStepDto[];
  readonly receipt: PromotionReceiptDto;
  readonly guarantee: { readonly playsPerDay: number; readonly minPlaysPerDay: number; readonly clubs: number };
  readonly byClub: readonly ClubPlaysByClubDto[];
  /** Playing somewhere right now. */
  readonly playingNow: ClubPlayTimeDto | null;
  /** The next plays (soonest first) while the run lasts. */
  readonly upcoming: readonly ClubPlayTimeDto[];
}

// ----- Tracking (public, no PII) ------------------------------------------------------------------------------------

/** A running ad a player saw (see `catalog/ad-views.ts` for the rules the client applies before reporting). */
export interface AdViewReport {
  readonly slotId: string;
  readonly campaignId: string;
  /** Server-clock ms when it had been in view for `AD_VIEW_DWELL_MS`. */
  readonly seenAt: number;
}

/**
 * `POST /v1/promotions/views` → 204. Signed-in players only (others are ignored). Batches of up to `AD_VIEW_BATCH_MAX`;
 * the server checks each view against where it last knew the player to be (or the ride they're on), rate-limits them
 * and counts each player once per ad per game hour.
 */
export interface TrackViewsRequest {
  readonly views: readonly AdViewReport[];
}

/** @deprecated `POST /v1/promotions/impressions` no longer counts (it can't be checked); use `TrackViewsRequest`. */
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

/** @deprecated `POST /v1/promotions/plays` → 204, ignored: the server counts plays from its own schedule. */
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
  /**
   * Omitted = the refund policy: an item rejected before it starts running is refunded in full automatically; one that
   * is already running is taken down without a refund. `true` on a running item: refund it by hand (refunds due).
   * `false` on an unstarted item: no refund (fraud, repeat abuse).
   */
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
  /** Always `week` now: every rate is stored per 7 days (the club song included). `song` is no longer used. */
  readonly unit: 'week' | 'song';
  /** The rate is a base weekly price that each spot scales by its district's prestige (roadside kinds). */
  readonly byDistrict: boolean;
  /** The catalog default, in kobo per 7 days. */
  readonly defaultKobo: number;
  /** What new quotes use now, in kobo per 7 days (the override when there is one, else the default). */
  readonly currentKobo: number;
  /**
   * Days per block it's sold in at the current rate: 3 when the weekly rate is ₦100,000 or more (`adBlockDays`), else
   * 7; club songs always 7. For district-scaled kinds it's the base rate's (each spot may differ).
   */
  readonly blockDays: number;
  /** Price of one block at the current rate (null for district-scaled kinds, where each spot has its own). */
  readonly blockPriceKobo: number | null;
  /** How to show it: "₦100,000 per 7 days · sold in 3-day blocks of ₦43,000" (or "… · sold by the week"). */
  readonly summary: string;
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
