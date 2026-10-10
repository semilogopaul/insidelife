/**
 * Fobes API contracts (`/v1/fobes/*`) — the Lagos Rich List phone app, owned by the social domain. Money follows the
 * social privacy setting: an exact figure only for players who chose "show exact wealth" (and for yourself), a band
 * ("₦1B+") for everyone else.
 */
import type { FobesListId, FobesWealthSource } from '../catalog/fobes.js';
import type { GameMinute } from '../time/calendar.js';
import type { StatusTierDto } from './social.js';

/** An amount as this viewer may see it. */
export interface FobesAmountDto {
  /** The exact naira, or null when only a band may be shown. */
  readonly exact: number | null;
  /** What to print: "₦12.5B" when exact, else the band ("₦10B+"). */
  readonly display: string;
}

/** How a fortune was made: shares of today's net worth (whole percents that add up to 100). */
export interface FobesWealthMixDto {
  /** Earned: salaries, businesses, investments (net worth minus everything unearned). */
  readonly selfMadePct: number;
  /** Given: family money, the starter fund, allowance, gifts, sprays, inheritance. */
  readonly givenPct: number;
  /** Bought: real-money top-ups. */
  readonly boughtPct: number;
  readonly source: FobesWealthSource;
  /** "Self-made", "Inherited", "Bought with top-ups"… */
  readonly label: string;
}

/** A week's movement (risers and fallers). */
export interface FobesMoveDto {
  /** Naira gained (negative: lost); null when the player keeps exact figures private or they're a new entry. */
  readonly change: number | null;
  /** Percent change against a week ago (one decimal); null for a new entry. */
  readonly pct: number | null;
  /** "+₦120M", "▲ 34%", "New entry". */
  readonly display: string;
  /** Their rank on the rich list a week ago, if they were in the top 100 then. */
  readonly rankBefore: number | null;
  /** Wasn't in the top 100 a week ago. */
  readonly newEntry: boolean;
}

export interface FobesEntryDto {
  /** Rank on this list (movers: order of the move). */
  readonly rank: number;
  readonly characterId: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Whole game years. */
  readonly age: number;
  /** Job title, "Student at University of Lagos", "Hustling"… */
  readonly title: string | null;
  readonly statusTier: StatusTierDto;
  /** The list's figure: self-made net worth on the self-made list, total net worth everywhere else. */
  readonly worth: FobesAmountDto;
  readonly mix: FobesWealthMixDto;
  /** Exact figures are public (the player opted in), or it's you. */
  readonly exact: boolean;
  readonly isYou: boolean;
  /** Risers and fallers only. */
  readonly move: FobesMoveDto | null;
}

export interface FobesListDto {
  readonly list: FobesListId;
  readonly title: string;
  readonly blurb: string;
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  /** People on the list (at most the top 100). */
  readonly total: number;
  readonly entries: readonly FobesEntryDto[];
  /** Risers and fallers: the game minute their week is measured from; null on the ranked lists. */
  readonly since: GameMinute | null;
  readonly generatedAt: string;
}

/** Your place on one ranked list. */
export interface FobesPositionDto {
  readonly list: Extract<FobesListId, 'rich-list' | 'self-made' | 'under-30'>;
  /** Your rank among everyone (it can be beyond the top 100); null when you're not on this list yet (nothing to count). */
  readonly rank: number | null;
  /** In the top 100 the list shows. */
  readonly inTop: boolean;
  /** Your figure on this list (always exact: it's yours). */
  readonly worth: number;
  /** Who to beat next: the rank above you in the top 100, or #100 to get in. Null when you're #1 or not ranked. */
  readonly next: {
    readonly rank: number;
    /** How far behind you are (an exact figure only if they show theirs; otherwise a band). */
    readonly gap: FobesAmountDto;
  } | null;
}

export interface FobesMeDto {
  readonly characterId: string;
  readonly handle: string;
  readonly age: number;
  readonly netWorth: number;
  readonly selfMade: number;
  readonly mix: FobesWealthMixDto;
  /** Your privacy setting: when false others see your bands, not your figures. */
  readonly showExactWealth: boolean;
  readonly richList: FobesPositionDto;
  readonly selfMadeList: FobesPositionDto;
  /** Null once you're 30 or older. */
  readonly under30: FobesPositionDto | null;
  /** Your net worth change over the past game week (since the first time Fobes saw you, if that's sooner). */
  readonly week: { readonly change: number; readonly pct: number | null; readonly since: GameMinute } | null;
  readonly generatedAt: string;
}
