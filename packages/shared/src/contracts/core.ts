import type { BlueprintId } from '../catalog/housing.js';
import type { HomeDecor, HouseExterior } from '../catalog/home-style.js';
import type { GameClockConfig } from '../time/clock.js';
import type { GameMinute } from '../time/calendar.js';
import type { NeedProfile, Needs } from '../needs/needs.js';
import type { Appearance, Gender, Outfit } from '../catalog/appearance.js';
import type { BackgroundId, LifestyleTier, Skills } from '../catalog/life.js';
import type { Habit } from '../catalog/habits.js';
import type { DistrictId, RegionId } from '../catalog/geography.js';
import type { TransportMode } from '../catalog/transport.js';
import type { EconomyState, Weather, WorldEvent } from '../world/world.js';
import type { WorldPoint } from '../world-map/types.js';

/** Standard error body returned by every endpoint (see backend global exception filter). */
export interface ApiErrorBody {
  readonly errorCode: string;
  readonly message: string;
  readonly timestamp: string;
  readonly traceId: string;
  /** Field-level validation messages, when relevant. */
  readonly details?: readonly string[];
}

// ----- Auth --------------------------------------------------------------------------------------------------------

export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  /** Date of birth, `YYYY-MM-DD`. Checked against the minimum age; never shown to other players. */
  readonly birthDate: string;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface AuthUserDto {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  /**
   * The server requires a confirmed email before playing (`REQUIRE_EMAIL_VERIFICATION`) and this one isn't confirmed
   * yet: send the player to the code screen. False whenever verification is optional.
   */
  readonly mustVerifyEmail: boolean;
  readonly hasCharacter: boolean;
}

/** Access token in the body; the refresh token travels only as an httpOnly cookie. */
export interface AuthSessionDto {
  readonly accessToken: string;
  /** Unix ms. */
  readonly accessTokenExpiresAt: number;
  readonly user: AuthUserDto;
}

/** Where the account's email check stands. Times are Unix ms. */
export interface EmailVerificationDto {
  readonly email: string;
  readonly verified: boolean;
  /** The server can send codes (false on a deployment without email settings: verifying isn't possible yet). */
  readonly available: boolean;
  /** When the code in the inbox stops working; null when there is no live code (ask for one). */
  readonly codeExpiresAt: number | null;
  /** Earliest time another code can be sent. */
  readonly resendAvailableAt: number;
  /**
   * Development only, when the server has no SMTP settings: the code that was just "sent", so the flow can be tested
   * without an inbox. Never present in production.
   */
  readonly devCode?: string;
}

/** Sign-up answers with a session (email unconfirmed) and where the email check stands (a code is sent only when required). */
export interface RegisterResponseDto extends AuthSessionDto {
  readonly emailVerification: EmailVerificationDto;
}

export interface ConfirmEmailRequest {
  readonly code: string;
}

/** `POST /v1/account/deletion`: delete your own account (soft delete; restorable by support for a while). */
export interface DeleteAccountRequest {
  /** Your current password, re-entered. */
  readonly password: string;
  /** `ACCOUNT_DELETION_PHRASE`, typed out. */
  readonly confirmation: string;
}

export interface AccountDeletionDto {
  /** ISO time the account was deleted. */
  readonly deletedAt: string;
  /** ISO time after which it can no longer be restored and is anonymised. */
  readonly restorableUntil: string;
}

// ----- World -------------------------------------------------------------------------------------------------------

export interface WorldClockDto extends GameClockConfig {
  /** Server wall clock (ms) when the response was produced — clients use it to estimate offset. */
  readonly serverNowMs: number;
  readonly worldSeed: string;
}

export interface WorldStateDto {
  readonly gameMinute: GameMinute;
  readonly weather: Weather;
  readonly economy: EconomyState;
  readonly events: readonly WorldEvent[];
  readonly onlinePlayers: number;
  readonly headline: string;
}

// ----- Character ---------------------------------------------------------------------------------------------------

export interface CreateCharacterRequest {
  readonly firstName: string;
  readonly lastName: string;
  /** Public @handle, 3-20 chars [a-z0-9_]. */
  readonly handle: string;
  readonly gender: Gender;
  readonly stateOfOrigin: string;
  readonly appearance: Appearance;
}

export const ACTIVITY_KINDS = ['sleep', 'idle', 'work', 'lecture', 'commute', 'action', 'travel', 'away', 'hospital'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * One block of the character's near-future timeline. The server sends the next ~day of segments so the client can
 * animate the avatar, run the clock and project needs without polling.
 */
export interface TimelineSegmentDto {
  readonly kind: ActivityKind;
  readonly startsAt: GameMinute;
  readonly endsAt: GameMinute;
  /** Venue id, or `home:<characterId>`. */
  readonly locationId: string;
  readonly label: string;
  readonly actionId?: string;
  /** Explicit (player-chosen) vs routine (autopilot). */
  readonly explicit: boolean;
  readonly profile: NeedProfile;
}

export interface TravelDto {
  readonly fromLocationId: string;
  readonly toLocationId: string;
  readonly mode: TransportMode;
  readonly departAt: GameMinute;
  readonly arriveAt: GameMinute;
  readonly fare: number;
}

export interface WalletSummaryDto {
  readonly balance: number;
  readonly savings: number;
  readonly pension: number;
  readonly usd: number;
}

export interface ConditionSummaryDto {
  readonly id: string;
  readonly conditionId: string;
  readonly label: string;
  readonly severity: 'mild' | 'moderate' | 'severe' | 'critical';
  readonly diagnosed: boolean;
}

/** A plot or house you own, as the world draws it. */
export interface OwnedPropertyMarkerDto {
  readonly id: string;
  readonly districtId: DistrictId;
  readonly label: string;
  /** Bare land, building site, or finished house. */
  readonly stage: 'land' | 'construction' | 'built';
  /** What's built or being built there. */
  readonly blueprintId: BlueprintId | null;
  readonly livedIn: boolean;
  /** Paint, roof, gate and gate plate of a finished house. */
  readonly exterior: HouseExterior;
}

export interface CharacterSummaryDto {
  readonly job: { readonly title: string; readonly employer: string; readonly monthlyPay: number; readonly currency: 'NGN' | 'USD' } | null;
  readonly education: { readonly label: string; readonly institution: string | null; readonly status: string } | null;
  readonly home: {
    readonly label: string;
    readonly districtId: DistrictId;
    readonly comfort: number;
    readonly ownership: 'family' | 'rented' | 'owned' | 'hostel';
    /** Wall paint and floor you chose (rented or owned homes). */
    readonly decor?: HomeDecor;
  };
  readonly relationship: { readonly status: 'single' | 'dating' | 'engaged' | 'married' | 'widowed' | 'divorced'; readonly partnerName: string | null };
  readonly children: number;
  /** Catalog ids of belongings that live at home (furniture, appliances, TVs, laptops…) — the 3D home shows them. */
  readonly homeItems: readonly string[];
  /** Home-cooked meals in the kitchen (groceries stock it; Cook uses one). */
  readonly pantryMeals: number;
  /** Land and houses you own, for the map and the city (each stands on `homeLotOf(\`property:<id>\`)`). */
  readonly properties: readonly OwnedPropertyMarkerDto[];
  readonly conditions: readonly ConditionSummaryDto[];
  readonly netWorth: number;
}

export interface CharacterDto {
  readonly id: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly gender: Gender;
  readonly stateOfOrigin: string;
  readonly background: BackgroundId;
  readonly appearance: Appearance;
  readonly outfit: Outfit;
  readonly bornAt: GameMinute;
  readonly age: number;
  readonly alive: boolean;
  readonly generation: number;
  readonly lifestyle: LifestyleTier;
  readonly defaultTransport: TransportMode;
  readonly needs: Needs;
  readonly mood: number;
  readonly health: number;
  readonly fitness: number;
  readonly skills: Skills;
  readonly status: number;
  readonly connections: number;
  readonly locationId: string;
  readonly homeDistrictId: DistrictId;
  /** Set while living in a house you built (see `homeKey`). */
  readonly homePropertyId: string | null;
  readonly regionId: RegionId;
  /** Daily habits the autopilot keeps while the player is away. */
  readonly habits: readonly Habit[];
}

/** Where the server last accepted the player in the open world (resume here after a reload). */
export interface OpenWorldPoseDto {
  readonly position: WorldPoint;
  /** Radians (see `Entrance`). */
  readonly heading: number;
  readonly mode: 'walk' | 'car';
}

export interface CharacterSnapshotDto {
  /** Game minute the snapshot (needs, balances) is valid at. */
  readonly asOf: GameMinute;
  readonly character: CharacterDto;
  readonly timeline: readonly TimelineSegmentDto[];
  readonly travel: TravelDto | null;
  readonly wallet: WalletSummaryDto;
  readonly summary: CharacterSummaryDto;
  readonly pendingEvents: number;
  readonly unreadNotifications: number;
  /** Set while the character is out on the street and the server has a recent position for them. */
  readonly openWorld: OpenWorldPoseDto | null;
}

/**
 * Whether the player is at the controls. The client reports `playing` while the tab is visible and the player is
 * touching it, and `away` when they leave; the autopilot only runs the character's routine while they're away.
 */
export const PLAY_STATES = ['playing', 'away'] as const;
export type PlayState = (typeof PLAY_STATES)[number];

/** `PUT /v1/characters/me/play-state` */
export interface PlayStateRequestDto {
  readonly state: PlayState;
}

export interface PlayStateDto {
  readonly state: PlayState;
  /** The player was away until this report (the snapshot's timeline was planned for the autopilot: refetch it). */
  readonly resumed: boolean;
  /** Game minute the autopilot takes over again unless the player reports in before then. */
  readonly presentUntil: GameMinute;
}

/** Epitaph for the player's most recently deceased character. */
export interface LastLifeDto {
  readonly characterId: string;
  readonly name: string;
  readonly handle: string;
  readonly ageAtDeath: number;
  readonly bornAt: GameMinute;
  readonly diedAt: GameMinute;
  readonly causeOfDeath: string | null;
  readonly generation: number;
  readonly netWorth: number;
  readonly selfMadeNetWorth: number;
  /** True if an heir already continues the dynasty (the player now plays as them). */
  readonly heirContinues: boolean;
}

/** What other players see. */
export interface PublicCharacterDto {
  readonly id: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly gender: Gender;
  readonly age: number;
  readonly appearance: Appearance;
  readonly outfit: Outfit;
  readonly status: number;
  readonly title: string | null;
  readonly locationId: string;
  readonly online: boolean;
}

// ----- Actions & travel --------------------------------------------------------------------------------------------

export interface StartActionRequest {
  readonly actionId: string;
  /** Game minutes; must be one of the action's allowed durations. */
  readonly durationMinutes?: number;
  /** For social actions: target NPC or player. */
  readonly targetId?: string;
}

export interface TravelRequest {
  readonly destinationId: string;
  readonly mode: TransportMode;
}

export interface UpdateSettingsRequest {
  readonly lifestyle?: LifestyleTier;
  readonly defaultTransport?: TransportMode;
  readonly outfit?: Outfit;
  /** Replaces the whole habit list (max `MAX_HABITS`). */
  readonly habits?: readonly Habit[];
}

// ----- Wallet ------------------------------------------------------------------------------------------------------

export const LEDGER_KINDS = [
  'opening-balance',
  'allowance',
  'salary',
  'hustle',
  'business',
  'investment',
  'interest',
  'rental-income',
  'event-reward',
  'topup',
  'transfer',
  'gift',
  'living-cost',
  'rent',
  'school-fees',
  'tax',
  'fee',
  'purchase',
  'transport',
  'health',
  'ceremony',
  'family-support',
  'travel',
  'fine',
  'property',
  'refund',
  'sale',
  'savings',
  'fx',
  'trade',
  'inheritance',
  'pension',
  'loan',
  'adjustment',
] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];

export interface LedgerEntryDto {
  readonly id: string;
  readonly kind: LedgerKind;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly memo: string;
  readonly gameMinute: GameMinute;
  readonly createdAt: string;
  readonly counterparty: string | null;
}

export interface WalletDto extends WalletSummaryDto {
  readonly transferTier: 1 | 2 | 3;
  /** What you may send to players per day (transfers, sprays…); null = no daily limit. */
  readonly dailyLimit: number | null;
  readonly sentToday: number;
  /** How much of your money can still go to players: starting money never can. */
  readonly sendable: number;
  /** Received from players today, and the most anyone can receive from players in a day. */
  readonly receivedToday: number;
  readonly receiveLimit: number;
  readonly earnedTotal: number;
  readonly purchasedTotal: number;
}

export interface TransferRequest {
  readonly toHandle: string;
  readonly amount: number;
  readonly note?: string;
  /** Client-generated UUID; retries with the same key never double-send. */
  readonly idempotencyKey: string;
}

export interface TransferResultDto {
  readonly transferId: string;
  readonly amount: number;
  readonly fee: number;
  readonly stampDuty: number;
  readonly balanceAfter: number;
  readonly recipient: { readonly handle: string; readonly name: string };
}

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

// ----- Notifications & life events ---------------------------------------------------------------------------------

export const NOTIFICATION_KINDS = [
  'money-received',
  'salary',
  'bill',
  'education',
  'career',
  'health',
  'relationship',
  'family',
  'property',
  'investment',
  'world',
  'social',
  'system',
  'achievement',
  'promotion',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationDto {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly body: string;
  readonly gameMinute: GameMinute;
  readonly createdAt: string;
  readonly read: boolean;
  readonly tone: 'good' | 'bad' | 'neutral';
  readonly amount?: number;
}

export interface LifeEventChoiceDto {
  readonly id: string;
  readonly label: string;
  /** Short hint: "₦25,000", "risky", "costs your Saturday". */
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
}

export interface LifeEventDto {
  readonly id: string;
  readonly eventId: string;
  readonly title: string;
  readonly body: string;
  readonly art: string;
  readonly choices: readonly LifeEventChoiceDto[];
  readonly createdAt: GameMinute;
  /** If unanswered by then, the default choice is applied. */
  readonly expiresAt: GameMinute;
}

export interface ResolveLifeEventRequest {
  readonly choiceId: string;
}

export interface LifeEventOutcomeDto {
  readonly title: string;
  readonly body: string;
  readonly tone: 'good' | 'bad' | 'neutral';
  readonly moneyDelta: number;
}

export interface AwayReportDto {
  readonly fromGameMinute: GameMinute;
  readonly toGameMinute: GameMinute;
  readonly lines: ReadonlyArray<{ readonly label: string; readonly amount?: number; readonly tone: 'good' | 'bad' | 'neutral' }>;
}
