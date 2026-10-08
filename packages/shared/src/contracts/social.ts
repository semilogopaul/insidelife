/**
 * Social API contracts — owned by the social domain: friends, blocks & reports, player profiles and search,
 * "who's here", leaderboards and owambe parties with spraying. Realtime money rain uses `party:spray`
 * (`SprayEventDto` in realtime.ts).
 */
import type { Appearance, Gender, Outfit } from '../catalog/appearance.js';
import type { StatusTierId } from '../catalog/life.js';
import type {
  LeaderboardBoardId,
  PartyDressCode,
  PartyTierId,
  PartyVenueKind,
  PlayerReportReason,
  ProfileLocationVisibility,
  SocialBadgeId,
} from '../catalog/social.js';
import type { GameMinute } from '../time/calendar.js';
import type { PublicCharacterDto } from './core.js';

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
