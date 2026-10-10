/**
 * Betting app API contracts (`/v1/betting/*`): the Lagos League's board, live matches, the table, slips and the
 * player's responsible-play settings. Odds are decimals with two places (2.35); every price and return is the
 * server's.
 */
import type { BetMarketId, BetSelectionId, SelfExclusionDays } from '../catalog/betting.js';
import type { GameMinute } from '../time/calendar.js';

export interface BettingClubDto {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly colors: readonly [string, string];
  readonly home: string;
}

/** A fixture on the board, before kickoff: the house's odds per selection (null = off the board). */
export interface BetFixtureDto {
  readonly matchId: string;
  readonly homeId: string;
  readonly awayId: string;
  readonly kickoffAt: GameMinute;
  readonly odds: Readonly<Record<BetSelectionId, number | null>>;
}

export interface MatchGoalDto {
  readonly side: 'home' | 'away';
  /** Match minute, 1-90. */
  readonly minute: number;
  /** Game minutes after kickoff when it goes in (the live view counts goals up to now). */
  readonly at: number;
}

/** A match that has kicked off: its whole timeline is public from kickoff (no bets can be placed on it any more). */
export interface PlayedMatchDto {
  readonly matchId: string;
  readonly homeId: string;
  readonly awayId: string;
  readonly kickoffAt: GameMinute;
  readonly fullTimeAt: GameMinute;
  readonly goals: readonly MatchGoalDto[];
  /** Final score (the live view shows the goals up to now). */
  readonly home: number;
  readonly away: number;
}

export interface BetRoundDto {
  /** Global round index (season × 30 + week). */
  readonly round: number;
  readonly season: number;
  /** 0-based week of the season. */
  readonly week: number;
  readonly kickoffAt: GameMinute;
}

/** `GET /v1/betting/league`: the weeks open for betting (soonest first) and the week live (or just finished). */
export interface BettingLeagueDto {
  readonly appName: string;
  readonly leagueName: string;
  /** Server time when this was built (game minute). */
  readonly now: GameMinute;
  readonly clubs: readonly BettingClubDto[];
  readonly upcoming: ReadonlyArray<BetRoundDto & { readonly fixtures: readonly BetFixtureDto[] }>;
  readonly live: (BetRoundDto & { readonly fullTimeAt: GameMinute; readonly matches: readonly PlayedMatchDto[] }) | null;
}

export type FormResult = 'W' | 'D' | 'L';

export interface LeagueTableRowDto {
  readonly position: number;
  readonly clubId: string;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly points: number;
  /** The last five, oldest first. */
  readonly form: readonly FormResult[];
}

/** `GET /v1/betting/table`: this season's table after every finished week. */
export interface LeagueTableDto {
  readonly season: number;
  /** Weeks finished (full time) so far this season. */
  readonly weeksPlayed: number;
  readonly rows: readonly LeagueTableRowDto[];
}

/** `GET /v1/betting/results?round=`: one finished (or live) week. */
export interface RoundResultsDto extends BetRoundDto {
  readonly fullTimeAt: GameMinute;
  readonly matches: readonly PlayedMatchDto[];
  /** Neighbouring rounds that can be shown (null at either end). */
  readonly previous: number | null;
  readonly next: number | null;
}

// ----- Slips --------------------------------------------------------------------------------------------------------

export interface BetLegRequest {
  readonly matchId: string;
  readonly selection: BetSelectionId;
}

/** `POST /v1/betting/quotes`: what this slip would pay (the slip drawer's live returns). */
export interface BetQuoteRequest {
  readonly legs: readonly BetLegRequest[];
  readonly stake: number;
}

export interface PlaceBetRequest extends BetQuoteRequest {
  readonly idempotencyKey?: string;
}

export type BetLegResult = 'won' | 'lost' | 'pending';

export interface BetLegDto {
  readonly matchId: string;
  readonly round: number;
  readonly homeId: string;
  readonly awayId: string;
  readonly kickoffAt: GameMinute;
  readonly market: BetMarketId;
  readonly selection: BetSelectionId;
  /** "Over 2.5 goals". */
  readonly label: string;
  readonly odds: number;
  /** Settled legs only: the full-time score and whether it won. */
  readonly result: BetLegResult;
  readonly score: { readonly home: number; readonly away: number } | null;
}

export interface BetQuoteDto {
  readonly legs: readonly BetLegDto[];
  readonly stake: number;
  readonly totalOdds: number;
  /** Stake × odds, rounded down, capped at the most a slip can pay. */
  readonly potentialReturns: number;
  readonly capped: boolean;
  /** Why it can't be placed right now (null = it can). */
  readonly problem: string | null;
}

export type BetSlipStatus = 'open' | 'won' | 'lost';

export interface BetSlipDto {
  readonly id: string;
  readonly placedAt: GameMinute;
  readonly stake: number;
  readonly totalOdds: number;
  readonly potentialReturns: number;
  readonly capped: boolean;
  readonly status: BetSlipStatus;
  /** Paid out (0 unless won). */
  readonly payout: number;
  /** Full time of the last match on the slip (when it settles). */
  readonly settlesAt: GameMinute;
  readonly settledAt: GameMinute | null;
  readonly legs: readonly BetLegDto[];
}

/** A retry with the same idempotency key gets this same answer back (and is charged nothing). */
export interface PlaceBetResultDto {
  readonly slip: BetSlipDto;
  readonly balanceAfter: number;
}

/** `GET /v1/betting/slips`: your latest slips, newest first (due ones are settled before this is built). */
export interface BetSlipsDto {
  readonly slips: readonly BetSlipDto[];
}

// ----- Responsible play ------------------------------------------------------------------------------------------

/** Why the board is closed to you (null = you may bet). */
export type BettingBlock = 'confirm-birth-date' | 'under-age' | 'self-excluded' | 'character-under-age';

/** `GET /v1/betting/me`: your eligibility, limits and today's play. */
export interface BettingAccountDto {
  readonly block: BettingBlock | null;
  /** Player-facing reason for the block. */
  readonly blockMessage: string | null;
  /** While self-excluded: when it ends (ISO, real time). */
  readonly excludedUntil: string | null;
  readonly cash: number;
  readonly limits: {
    readonly minStake: number;
    readonly maxStake: number;
    readonly maxPayout: number;
    readonly maxLegs: number;
    /** Your daily loss limit now, and the most it can be. */
    readonly dailyLossLimit: number;
    readonly maxDailyLossLimit: number;
    /** A raise waiting out its cooling-off period. */
    readonly pendingDailyLossLimit: { readonly amount: number; readonly effectiveAt: string } | null;
    readonly realityCheckMinutes: number;
  };
  /** This game day: stakes placed, winnings paid, and net losses counted against the limit. */
  readonly today: { readonly staked: number; readonly won: number; readonly netLoss: number; readonly lossLeft: number };
  readonly lifetime: { readonly staked: number; readonly won: number; readonly slips: number };
  readonly openSlips: number;
}

export interface UpdateBettingLimitsRequest {
  readonly dailyLossLimit?: number;
  readonly realityCheckMinutes?: number;
}

export interface SelfExclusionRequest {
  readonly days: SelfExclusionDays;
}

/** For accounts made before dates of birth were asked: confirm yours once (it can't be changed afterwards). */
export interface ConfirmBirthDateRequest {
  readonly birthDate: string;
}
