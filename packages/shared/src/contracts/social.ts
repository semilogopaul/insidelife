/**
 * Social API contracts — owned by the social domain: friends, blocks & reports, player profiles and search,
 * "who's here", leaderboards and owambe parties with spraying. Realtime money rain uses `party:spray`
 * (`SprayEventDto` in realtime.ts).
 */
import type { Appearance, Gender, Outfit } from '../catalog/appearance.js';
import type { StatusTierId } from '../catalog/life.js';
import type {
  LeaderboardBoardId,
  NightOutItemId,
  NightOutSection,
  NightOutTarget,
  PartyDressCode,
  PartyTierId,
  PartyVenueKind,
  PlayerReportReason,
  ProfileLocationVisibility,
  SocialBadgeId,
  VenueMomentKind,
} from '../catalog/social.js';
import type { DistrictId } from '../catalog/geography.js';
import type { HomeDecor } from '../catalog/home-style.js';
import type { GameMinute } from '../time/calendar.js';
import type { Entrance } from '../world-map/types.js';
import type { HomeTreatDto, VisitTreatDto } from './hosting.js';
import type { PublicCharacterDto } from './core.js';
import type { VenueMomentDto, VenueMomentPersonDto } from './realtime.js';

// ----- Shared bits -------------------------------------------------------------------------------------------------

export interface StatusTierDto {
  readonly id: StatusTierId;
  readonly label: string;
}

export interface SocialBadgeDto {
  readonly id: SocialBadgeId;
  readonly label: string;
  readonly emoji: string;
}

/** Compact player card for lists (friends, search, leaderboards, guests). */
export interface PlayerCardDto {
  readonly id: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: number;
  readonly statusTier: StatusTierDto;
  /** Job title, "Student at University of Lagos", "Corps member (NYSC)"… */
  readonly title: string | null;
  readonly online: boolean;
}

// ----- Players & profiles ------------------------------------------------------------------------------------------

export type PlayerRelationship = 'self' | 'friends' | 'request-sent' | 'request-received' | 'none';

/**
 * Rich public profile (`GET /players/:handle`). Never exposes email, background, balances or exact wealth: money is a
 * band ("₦10M+") of *self-made* net worth unless the player opts in to exact figures. Location is shown only to
 * friends (and only if the player allows it).
 */
export interface PlayerProfileDto extends Omit<PublicCharacterDto, 'locationId'> {
  readonly locationId: string | null;
  readonly locationLabel: string | null;
  readonly statusTier: StatusTierDto;
  readonly badges: readonly SocialBadgeDto[];
  readonly education: { readonly label: string | null; readonly cgpa: number | null };
  readonly family: { readonly married: boolean; readonly children: number };
  readonly wealth: {
    readonly selfMadeBand: string;
    /** Exact only when the player opted in (or it's your own profile). */
    readonly selfMade: number | null;
    readonly incomeBand: string | null;
    readonly monthlyIncome: number | null;
    readonly exact: boolean;
  };
  readonly generation: number;
  readonly friendCount: number;
  readonly mutualFriends: { readonly count: number; readonly sample: readonly PlayerCardDto[] };
  readonly relationship: PlayerRelationship;
  /** The pending friend request between you, if any (accept/decline/cancel it by id). */
  readonly pendingRequestId: string | null;
  readonly blockedByYou: boolean;
}

export interface PlayerSearchResultDto {
  readonly items: readonly PlayerCardDto[];
}

export interface SocialPrivacyDto {
  /** Show exact self-made net worth and monthly income on your profile and leaderboards (default: bands only). */
  readonly showExactWealth: boolean;
  /** Who can see where you are right now. */
  readonly locationVisibility: ProfileLocationVisibility;
}

export type UpdateSocialPrivacyRequest = Partial<SocialPrivacyDto>;

/** A player at a venue ("who's here"). */
export interface VenuePlayerDto extends PlayerCardDto {
  readonly gender: Gender;
  readonly appearance: Appearance;
  readonly outfit: Outfit;
  readonly activity: string | null;
  readonly isFriend: boolean;
}

export interface VenuePlayersDto {
  readonly venueId: string;
  readonly venueName: string;
  /** Everyone there (online or on autopilot), excluding you and anyone you've blocked. */
  readonly total: number;
  readonly youAreHere: boolean;
  /** Everyone if you're there yourself; otherwise only your friends. */
  readonly players: readonly VenuePlayerDto[];
}

// ----- Friends -----------------------------------------------------------------------------------------------------

export interface SendFriendRequestRequest {
  readonly handle: string;
}

export interface FriendDto extends PlayerCardDto {
  /** ISO time the friendship was accepted. */
  readonly since: string;
  /** Where they are ("The Vault VI", "Home") when they share it with friends. */
  readonly locationLabel: string | null;
}

export interface FriendRequestDto {
  readonly id: string;
  readonly direction: 'incoming' | 'outgoing';
  /** The other player. */
  readonly player: PlayerCardDto;
  readonly createdAt: string;
}

export interface FriendsOverviewDto {
  readonly friends: readonly FriendDto[];
  readonly incoming: readonly FriendRequestDto[];
  readonly outgoing: readonly FriendRequestDto[];
  readonly limits: { readonly maxFriends: number; readonly maxPendingOutgoing: number };
}

export interface FriendRequestResultDto {
  /** `accepted` when they had already asked you (mutual requests auto-accept). */
  readonly state: 'pending' | 'accepted';
  readonly request: FriendRequestDto | null;
  readonly friend: FriendDto | null;
}

// ----- Blocks & reports --------------------------------------------------------------------------------------------

export interface BlockPlayerRequest {
  readonly handle: string;
}

export interface BlockedPlayerDto {
  readonly characterId: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly blockedAt: string;
}

export type PlayerReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

export interface ReportPlayerRequest {
  readonly handle: string;
  readonly reason: PlayerReportReason;
  /** Chat message being reported, if any. */
  readonly messageId?: string;
  readonly details?: string;
  /** Report and block in one go. */
  readonly alsoBlock?: boolean;
}

export interface PlayerReportDto {
  readonly id: string;
  readonly targetHandle: string;
  readonly reason: PlayerReportReason;
  readonly status: PlayerReportStatus;
  readonly createdAt: string;
  readonly blocked: boolean;
}

// ----- Leaderboards ------------------------------------------------------------------------------------------------

export interface LeaderboardEntryDto {
  readonly rank: number;
  readonly characterId: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: number;
  readonly statusTier: StatusTierDto;
  /** Exact value when public (CGPA, clout, family size) or opted in; null when only a band is shown. */
  readonly value: number | null;
  /** What to print: "₦10M+", "4.85", "Married · 3 kids". */
  readonly display: string;
  /** Secondary line: "B.Sc First Class", "3 generations". */
  readonly detail: string | null;
}

export interface LeaderboardYouDto {
  readonly rank: number | null;
  readonly value: number | null;
  readonly display: string;
}

export interface LeaderboardDto {
  readonly board: LeaderboardBoardId;
  readonly title: string;
  readonly blurb: string;
  readonly entries: readonly LeaderboardEntryDto[];
  readonly you: LeaderboardYouDto | null;
  readonly generatedAt: string;
}

// ----- Parties (owambe) --------------------------------------------------------------------------------------------

export type PartyPhase = 'upcoming' | 'live' | 'ended' | 'cancelled';

export interface PartyCostDto {
  readonly venueHire: number;
  readonly setup: number;
  readonly catering: number;
  readonly total: number;
}

export interface PartyQuoteRequest {
  /** A bar, club or event-centre venue id, or `home` for a street owambe at your house. */
  readonly venueId: string;
  readonly tier: PartyTierId;
  readonly durationHours: number;
  /** Game minutes from now (0 = start immediately); opening hours are checked for this window. */
  readonly startsInMinutes?: number;
}

export interface PartyQuoteDto {
  readonly venueId: string;
  readonly venueName: string;
  readonly venueKind: PartyVenueKind;
  readonly tier: PartyTierId;
  readonly durationHours: number;
  readonly capacity: number;
  readonly cost: PartyCostDto;
  readonly available: boolean;
  readonly reason: string | null;
}

export interface CreatePartyRequest extends PartyQuoteRequest {
  readonly title: string;
  readonly startsInMinutes: number;
  readonly dressCode?: PartyDressCode;
}

export interface PartyDto {
  readonly id: string;
  readonly title: string;
  readonly tier: PartyTierId;
  readonly tierLabel: string;
  readonly dressCode: PartyDressCode;
  readonly dressCodeLabel: string;
  /** Venue id, or `home:<hostId>` for a street owambe. */
  readonly venueId: string;
  readonly venueName: string;
  readonly venueKind: PartyVenueKind;
  readonly districtId: string;
  readonly host: PlayerCardDto;
  readonly startsAt: GameMinute;
  readonly endsAt: GameMinute;
  readonly phase: PartyPhase;
  readonly guestCount: number;
  readonly capacity: number;
  readonly totalSprayed: number;
  /** Only shown to the host. */
  readonly costPaid: number | null;
  readonly attending: boolean;
  readonly isHost: boolean;
  readonly hostIsFriend: boolean;
  /** Socket room that receives `party:spray` (venue chat room, or the district room for street owambes). */
  readonly realtimeRoom: string;
}

export interface PartySprayerDto {
  readonly player: PlayerCardDto;
  readonly amount: number;
}

export interface PartyDetailDto extends PartyDto {
  readonly guests: readonly PlayerCardDto[];
  readonly topSprayers: readonly PartySprayerDto[];
}

export interface CreatePartyResultDto {
  readonly party: PartyDto;
  readonly cost: PartyCostDto;
}

export interface SprayRequest {
  readonly toHandle: string;
  /** Whole ₦500 / ₦1,000 notes. */
  readonly amount: number;
  /** Client-generated id; retries with the same key never spray twice. */
  readonly idempotencyKey: string;
}

/** Spray in a club or bar: someone here (`toHandle`), or the DJ when `toHandle` is null. */
export interface VenueSprayRequest {
  readonly toHandle: string | null;
  /** Whole ₦500 / ₦1,000 notes. */
  readonly amount: number;
  /** Client-generated id; retries with the same key never spray twice. */
  readonly idempotencyKey: string;
}

export interface VenueSprayResultDto {
  readonly sprayId: string;
  readonly amount: number;
  readonly notes: { readonly thousands: number; readonly fiveHundreds: number };
  /** Who got it (null: the DJ). */
  readonly to: PlayerCardDto | null;
  readonly balanceAfter: number;
  /** Everything you've sprayed at this place tonight. */
  readonly yourNightTotal: number;
  readonly cloutGained: number;
  readonly nairaAbuse: { readonly fined: boolean; readonly fine: number; readonly message: string } | null;
  readonly replayed?: boolean;
}

export interface SprayResultDto {
  readonly sprayId: string;
  readonly amount: number;
  readonly notes: { readonly thousands: number; readonly fiveHundreds: number };
  readonly to: PlayerCardDto;
  /** Your cash after the spray (and any fine). */
  readonly balanceAfter: number;
  /** Everything you've sprayed at this party. */
  readonly yourPartyTotal: number;
  readonly cloutGained: number;
  readonly nairaAbuse: { readonly fined: boolean; readonly fine: number; readonly message: string } | null;
  /** True when this idempotency key was already used (nothing moved this time). */
  readonly replayed: boolean;
}

// ----- Night out (clubs and bars) ----------------------------------------------------------------------------------

/** One thing on the Night out menu at this place, priced by the server for you right now. */
export interface NightOutOfferDto {
  readonly id: NightOutItemId;
  readonly section: NightOutSection;
  readonly kind: VenueMomentKind;
  readonly label: string;
  readonly emoji: string;
  readonly blurb: string;
  /** What everyone in the room sees. */
  readonly shows: string;
  /** Today's price here (venue band × world price index). */
  readonly price: number;
  /** Clout you'd get for it now (after tonight's cap). */
  readonly clout: number;
  /** How long it plays (ms); 0 for the VIP section, which lasts until closing. */
  readonly durationMs: number;
  readonly target: NightOutTarget;
  /** How many more of these you can buy here tonight. */
  readonly leftTonight: number;
  /** Why you can't buy it right now (null: you can). Picking someone is checked when you buy. */
  readonly unavailable: string | null;
}

/** `GET /venues/:venueId/night-out`: the menu, what's playing or queued here, and your night so far. */
export interface NightOutDto {
  readonly venueId: string;
  readonly venueName: string;
  /** Server clock (epoch ms) when this was built; `startsAt` uses the same clock. */
  readonly serverNow: number;
  /** Why the whole panel is shut (not a nightlife spot, not inside, closed, under 18); null when it's open. */
  readonly closedReason: string | null;
  readonly offers: readonly NightOutOfferDto[];
  /** Moments playing or queued here now (late arrivals still see the shoutout queue and the VIP sign). */
  readonly moments: readonly VenueMomentDto[];
  /** Whoever holds the VIP section here tonight. */
  readonly vip: VenueMomentPersonDto | null;
  readonly you: {
    readonly adult: boolean;
    readonly cash: number;
    /** Paid moments tonight across Lagos, and how many more you can buy. */
    readonly momentsTonight: number;
    readonly momentsLeftTonight: number;
    readonly cloutTonight: number;
    /** When your queued shoutout here goes on screen (epoch ms), if you have one waiting. */
    readonly queuedShoutoutAt: number | null;
  };
}

/** `POST /venues/:venueId/night-out`: buy a bottle, a shoutout or an experience. */
export interface NightOutRequest {
  readonly itemId: NightOutItemId;
  /** Who it's for (bottles: required; a birthday: optional, defaults to you). */
  readonly toHandle?: string | null;
  /** Shoutouts: up to 60 characters, no links or phone numbers; the DJ won't say bad words. */
  readonly message?: string | null;
  /** Client-generated id; retries with the same key never charge twice. */
  readonly idempotencyKey: string;
}

export interface NightOutResultDto {
  readonly moment: VenueMomentDto;
  readonly price: number;
  readonly balanceAfter: number;
  readonly cloutGained: number;
  /** Shoutouts ahead of yours in the queue when you bought it (0: you're next). */
  readonly queueAhead: number;
  /** True when this idempotency key was already used (nothing was charged this time). */
  readonly replayed: boolean;
}

// ----- Home visits -------------------------------------------------------------------------------------------------

export const VISIT_STATUSES = ['invited', 'accepted', 'declined', 'ended'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** Someone in a visit, with what's needed to draw them in the house. */
export interface VisitPersonDto {
  readonly id: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly gender: Gender;
  readonly appearance: Appearance;
  readonly outfit: Outfit;
}

/** The host's home as the guest will see it (captured when the invite is sent). */
export interface VisitHomeDto {
  /** `home:<hostId>`: walk through this door (or GPS/ride to it). */
  readonly locationId: string;
  readonly label: string;
  readonly districtId: DistrictId;
  readonly ownership: 'family' | 'rented' | 'owned' | 'hostel';
  readonly comfort: number;
  /** Shop items in the home (furnishing), so the guest sees the real room. */
  readonly items: readonly string[];
  /** The host's wall paint and floor. */
  readonly decor: HomeDecor;
  /** The host's front door right now. */
  readonly entrance: Entrance;
}

export interface VisitDto {
  readonly id: string;
  readonly status: VisitStatus;
  /** Your side of it. */
  readonly role: 'host' | 'guest';
  readonly host: VisitPersonDto;
  readonly guest: VisitPersonDto;
  readonly home: VisitHomeDto;
  readonly createdAt: GameMinute;
  readonly expiresAt: GameMinute;
  /** The guest is inside the host's home right now. */
  readonly guestInside: boolean;
  /** Treats in this visit, newest first (what the guest got / what the host gave them). */
  readonly treats: readonly VisitTreatDto[];
}

/** Open invites and visits (invited or accepted, not expired). */
export interface VisitsDto {
  readonly incoming: readonly VisitDto[];
  readonly outgoing: readonly VisitDto[];
}

export interface InviteVisitRequest {
  readonly handle: string;
}

/** Who else is in a home right now (the host and guests), for drawing them in the room. */
export interface HomePeopleDto {
  readonly locationId: string;
  readonly people: readonly HomePersonDto[];
  /** What the host has put on the table right now (plates, drinks, cake), drawn in the room for everyone inside. */
  readonly treats: readonly HomeTreatDto[];
}

export interface HomePersonDto extends VisitPersonDto {
  /** Running action id (sleeping, cooking, hanging out…), for the pose. */
  readonly activity: string | null;
  readonly role: 'host' | 'guest';
}
