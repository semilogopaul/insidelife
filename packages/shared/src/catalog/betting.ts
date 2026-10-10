/**
 * The betting app: a virtual football league on the game clock, always against the house, game naira only.
 * Pure and dependency-free. The server draws every result from a secret seed (never the public world seed), prices
 * every selection and settles every slip; the client only shows what it is sent.
 */
import type { GameMinute } from '../time/calendar.js';

/** The app's name (our own; not a real bookmaker). Rename it here and only here. */
export const BETTING_APP_NAME = 'Odogwu Odds';
/** The league the app runs. */
export const BETTING_LEAGUE_NAME = 'The Lagos League';

// ----- Clubs --------------------------------------------------------------------------------------------------------

export interface BettingClub {
  readonly id: string;
  readonly name: string;
  /** Three letters for the scoreboard. */
  readonly code: string;
  /** Badge colours: [main, trim]. */
  readonly colors: readonly [string, string];
  /** Where they come from (flavour on the club card). */
  readonly home: string;
  /** Long-run strength, 0-100; each season drifts around it. */
  readonly base: number;
}

/** Eight Lagos sides and eight visiting NPFL giants (16 clubs: a double round robin of 30 weeks). */
export const BETTING_CLUBS: readonly BettingClub[] = [
  { id: 'ikorodu-city', name: 'Ikorodu City', code: 'IKC', colors: ['#1d3fa6', '#f4c430'], home: 'Ikorodu', base: 74 },
  { id: 'sporting-lagos', name: 'Sporting Lagos', code: 'SPL', colors: ['#f26b1d', '#14141a'], home: 'Lekki', base: 71 },
  { id: 'mfm', name: 'MFM FC', code: 'MFM', colors: ['#6a2c91', '#ffffff'], home: 'Ojodu', base: 70 },
  { id: 'stationery-stores', name: 'Stationery Stores', code: 'STS', colors: ['#c8102e', '#ffffff'], home: 'Surulere', base: 66 },
  { id: 'julius-berger', name: 'Julius Berger', code: 'JBF', colors: ['#0b7a3e', '#ffffff'], home: 'Ijora', base: 65 },
  { id: 'first-bank', name: 'First Bank', code: 'FBK', colors: ['#0a2a5e', '#d4a63a'], home: 'Marina', base: 63 },
  { id: 'inter-lagos', name: 'Inter Lagos', code: 'INT', colors: ['#0f4fbf', '#111111'], home: 'Yaba', base: 62 },
  { id: 'ikorodu-united', name: 'Ikorodu United', code: 'IKU', colors: ['#e2001a', '#1b1b1b'], home: 'Ikorodu', base: 60 },
  { id: 'enyimba', name: 'Enyimba', code: 'ENY', colors: ['#3d8fd6', '#ffffff'], home: 'Aba', base: 82 },
  { id: 'rivers-united', name: 'Rivers United', code: 'RVU', colors: ['#1450a3', '#ffffff'], home: 'Port Harcourt', base: 81 },
  { id: 'rangers', name: 'Rangers International', code: 'RAN', colors: ['#d71920', '#ffffff'], home: 'Enugu', base: 80 },
  { id: 'remo-stars', name: 'Remo Stars', code: 'REM', colors: ['#5bc2e7', '#0e2733'], home: 'Ikenne', base: 79 },
  { id: 'kano-pillars', name: 'Kano Pillars', code: 'KAN', colors: ['#f6b90b', '#004b87'], home: 'Kano', base: 76 },
  { id: 'shooting-stars', name: 'Shooting Stars', code: '3SC', colors: ['#0055a4', '#ffd400'], home: 'Ibadan', base: 75 },
  { id: 'plateau-united', name: 'Plateau United', code: 'PLU', colors: ['#00843d', '#f4c430'], home: 'Jos', base: 74 },
  { id: 'lobi-stars', name: 'Lobi Stars', code: 'LOB', colors: ['#f5821f', '#003da5'], home: 'Makurdi', base: 72 },
];

const CLUBS_BY_ID: ReadonlyMap<string, BettingClub> = new Map(BETTING_CLUBS.map((club) => [club.id, club]));

export function findBettingClub(id: string): BettingClub | undefined {
  return CLUBS_BY_ID.get(id);
}

// ----- The clock --------------------------------------------------------------------------------------------------

/**
 * A round kicks off every 4 game hours (4 real minutes at ×60): 00:00, 04:00, 08:00… The next two weeks are on the
 * board, so a round is open for betting from two kickoffs before it until its own kickoff (and an accumulator can
 * reach ten legs). One game minute is one match minute: the first half runs 45 game minutes, a short break, then the
 * second half; full time is 93 game minutes after kickoff.
 */
export const LEAGUE_CLOCK = {
  roundMinutes: 240,
  /** Weeks on the board at once. */
  openWeeks: 2,
  halfLength: 45,
  /** Game minutes after kickoff when the second half starts. */
  secondHalfAt: 48,
  /** Game minutes after kickoff when the match is over (and slips on it can be settled). */
  fullTimeAt: 93,
  /** 16 clubs, home and away. */
  weeksPerSeason: 30,
  matchesPerWeek: 8,
} as const;

/** Global round index → kickoff (game minute). */
export function leagueKickoff(round: number): GameMinute {
  return round * LEAGUE_CLOCK.roundMinutes;
}

/** The next round to kick off after `t` (the first of the `openWeeks` rounds open for betting). */
export function openLeagueRound(t: GameMinute): number {
  return Math.floor(t / LEAGUE_CLOCK.roundMinutes) + 1;
}

/** Is betting on this round open at `t`? From `openWeeks` kickoffs before it until (not at) its own kickoff. */
export function isRoundOpen(round: number, t: GameMinute): boolean {
  const kickoff = leagueKickoff(round);
  return t < kickoff && t >= kickoff - LEAGUE_CLOCK.openWeeks * LEAGUE_CLOCK.roundMinutes;
}

/** The last round that has kicked off at `t` (live, or finished and on the results board). */
export function lastKickedOffRound(t: GameMinute): number {
  return Math.floor(t / LEAGUE_CLOCK.roundMinutes);
}

/** Global round → season and week (both 0-based; show week + 1). */
export function leagueWeek(round: number): { readonly season: number; readonly week: number } {
  const season = Math.floor(round / LEAGUE_CLOCK.weeksPerSeason);
  return { season, week: round - season * LEAGUE_CLOCK.weeksPerSeason };
}

export function leagueRound(season: number, week: number): number {
  return season * LEAGUE_CLOCK.weeksPerSeason + week;
}

/** Match ids are `<global round>-<match index>`. */
export function matchIdOf(round: number, index: number): string {
  return `${round}-${index}`;
}

export const MATCH_ID_PATTERN = /^\d{1,9}-\d{1,2}$/;

export function parseMatchId(matchId: string): { readonly round: number; readonly index: number } | null {
  if (!MATCH_ID_PATTERN.test(matchId)) return null;
  const [round, index] = matchId.split('-').map(Number) as [number, number];
  if (index >= LEAGUE_CLOCK.matchesPerWeek) return null;
  return { round, index };
}

export type MatchPhase = 'pre' | 'first-half' | 'half-time' | 'second-half' | 'full-time';

/** What the scoreboard shows `elapsed` game minutes after kickoff (fractional is fine). */
export function matchClock(elapsed: number): { readonly phase: MatchPhase; readonly minute: number; readonly label: string } {
  if (elapsed < 0) return { phase: 'pre', minute: 0, label: 'KO' };
  if (elapsed < LEAGUE_CLOCK.halfLength) {
    const minute = Math.floor(elapsed) + 1;
    return { phase: 'first-half', minute, label: `${minute}'` };
  }
  if (elapsed < LEAGUE_CLOCK.secondHalfAt) return { phase: 'half-time', minute: 45, label: 'HT' };
  if (elapsed < LEAGUE_CLOCK.fullTimeAt) {
    const minute = Math.min(90, Math.floor(elapsed - LEAGUE_CLOCK.secondHalfAt) + 46);
    return { phase: 'second-half', minute, label: `${minute}'` };
  }
  return { phase: 'full-time', minute: 90, label: 'FT' };
}

/** Game minutes after kickoff when a goal in match minute `minute` (1-90) goes in. */
export function goalElapsed(minute: number): number {
  return minute <= LEAGUE_CLOCK.halfLength ? minute - 0.5 : LEAGUE_CLOCK.secondHalfAt + (minute - 45) - 0.5;
}

// ----- Markets ------------------------------------------------------------------------------------------------------

export const BET_MARKET_IDS = ['1x2', 'dc', 'ou15', 'ou25', 'ou35', 'btts'] as const;
export type BetMarketId = (typeof BET_MARKET_IDS)[number];

export const BET_SELECTION_IDS = [
  '1x2:home',
  '1x2:draw',
  '1x2:away',
  'dc:1x',
  'dc:x2',
  'dc:12',
  'ou15:over',
  'ou15:under',
  'ou25:over',
  'ou25:under',
  'ou35:over',
  'ou35:under',
  'btts:yes',
  'btts:no',
] as const;
export type BetSelectionId = (typeof BET_SELECTION_IDS)[number];

export interface BetMarketDefinition {
  readonly id: BetMarketId;
  readonly label: string;
  readonly selections: readonly BetSelectionId[];
}

export const BET_MARKETS: Readonly<Record<BetMarketId, BetMarketDefinition>> = {
  '1x2': { id: '1x2', label: 'Match result', selections: ['1x2:home', '1x2:draw', '1x2:away'] },
  dc: { id: 'dc', label: 'Double chance', selections: ['dc:1x', 'dc:x2', 'dc:12'] },
  ou15: { id: 'ou15', label: 'Goals 1.5', selections: ['ou15:over', 'ou15:under'] },
  ou25: { id: 'ou25', label: 'Goals 2.5', selections: ['ou25:over', 'ou25:under'] },
  ou35: { id: 'ou35', label: 'Goals 3.5', selections: ['ou35:over', 'ou35:under'] },
  btts: { id: 'btts', label: 'Both teams to score', selections: ['btts:yes', 'btts:no'] },
};

export interface BetSelectionDefinition {
  readonly id: BetSelectionId;
  readonly market: BetMarketId;
  /** On the odds button: 1, X, 2, 1X, Over, GG… */
  readonly short: string;
  /** In the slip: "Home win", "Over 2.5 goals". */
  readonly label: string;
}

const selection = (id: BetSelectionId, short: string, label: string): BetSelectionDefinition => ({
  id,
  market: id.split(':')[0] as BetMarketId,
  short,
  label,
});

export const BET_SELECTIONS: Readonly<Record<BetSelectionId, BetSelectionDefinition>> = {
  '1x2:home': selection('1x2:home', '1', 'Home win'),
  '1x2:draw': selection('1x2:draw', 'X', 'Draw'),
  '1x2:away': selection('1x2:away', '2', 'Away win'),
  'dc:1x': selection('dc:1x', '1X', 'Home or draw'),
  'dc:x2': selection('dc:x2', 'X2', 'Draw or away'),
  'dc:12': selection('dc:12', '12', 'Home or away'),
  'ou15:over': selection('ou15:over', 'Over', 'Over 1.5 goals'),
  'ou15:under': selection('ou15:under', 'Under', 'Under 1.5 goals'),
  'ou25:over': selection('ou25:over', 'Over', 'Over 2.5 goals'),
  'ou25:under': selection('ou25:under', 'Under', 'Under 2.5 goals'),
  'ou35:over': selection('ou35:over', 'Over', 'Over 3.5 goals'),
  'ou35:under': selection('ou35:under', 'Under', 'Under 3.5 goals'),
  'btts:yes': selection('btts:yes', 'GG', 'Both teams score (GG)'),
  'btts:no': selection('btts:no', 'NG', 'Not both teams score (NG)'),
};

/** Does `selection` win with this full-time score? */
export function selectionWins(id: BetSelectionId, home: number, away: number): boolean {
  const total = home + away;
  switch (id) {
    case '1x2:home':
      return home > away;
    case '1x2:draw':
      return home === away;
    case '1x2:away':
      return away > home;
    case 'dc:1x':
      return home >= away;
    case 'dc:x2':
      return away >= home;
    case 'dc:12':
      return home !== away;
    case 'ou15:over':
      return total > 1.5;
    case 'ou15:under':
      return total < 1.5;
    case 'ou25:over':
      return total > 2.5;
    case 'ou25:under':
      return total < 2.5;
    case 'ou35:over':
      return total > 3.5;
    case 'ou35:under':
      return total < 3.5;
    case 'btts:yes':
      return home > 0 && away > 0;
    case 'btts:no':
      return home === 0 || away === 0;
  }
}

// ----- Rules --------------------------------------------------------------------------------------------------------

export const BETTING_RULES = {
  /** Real age (from the account's date of birth), not the character's. */
  minAge: 18,
  minStake: 100,
  /** Per slip; the server's BETTING_MAX_STAKE may differ. */
  defaultMaxStake: 1_000_000,
  /** The most one slip can ever pay out (returns above it are capped). */
  maxPayout: 50_000_000,
  maxLegs: 10,
  /** Net losses per game day (stakes placed − winnings paid); the server's BETTING_DAILY_LOSS_LIMIT may differ. */
  defaultDailyLossLimit: 5_000_000,
  /** Raising your own loss limit takes effect after this many real hours (lowering it is immediate). */
  limitRaiseDelayHours: 24,
  /** Self-exclusion lengths in real days. It can't be undone early. */
  selfExclusionDays: [1, 7, 30],
  /** Reality-check reminder intervals (real minutes in the app). */
  realityCheckMinutes: [15, 30, 60],
  defaultRealityCheckMinutes: 30,
  /** The house keeps this share of every stake on average (before odds are rounded down to 0.01). */
  houseEdge: 0.07,
  /** Selections the model rates this likely or more are taken off the board (odds would be under 1.01 or unfair). */
  maxSelectionProbability: 0.92,
  minOdds: 1.01,
  maxOdds: 250,
} as const;

export type SelfExclusionDays = (typeof BETTING_RULES.selfExclusionDays)[number];

/** Odds are whole hundredths: 2.35 → 235. */
export const ODDS_SCALE = 100;

/**
 * Exact returns for `stake` (whole naira) on odds in hundredths, multiplied leg by leg (an accumulator) and rounded
 * down to the naira, capped at `maxPayout`. BigInt so ten legs of long odds can't lose precision.
 */
export function slipReturns(stake: number, oddsHundredths: readonly number[], maxPayout: number = BETTING_RULES.maxPayout): { readonly returns: number; readonly capped: boolean } {
  let numerator = BigInt(Math.max(0, Math.floor(stake)));
  let denominator = 1n;
  for (const odds of oddsHundredths) {
    numerator *= BigInt(Math.max(0, Math.floor(odds)));
    denominator *= BigInt(ODDS_SCALE);
  }
  const exact = numerator / denominator;
  const cap = BigInt(maxPayout);
  return exact > cap ? { returns: maxPayout, capped: true } : { returns: Number(exact), capped: false };
}

/** Combined odds of an accumulator, rounded down to 0.01 (what the slip shows). */
export function combinedOdds(oddsHundredths: readonly number[]): number {
  let numerator = 1n;
  let denominator = 1n;
  for (const odds of oddsHundredths) {
    numerator *= BigInt(Math.max(0, Math.floor(odds)));
    denominator *= BigInt(ODDS_SCALE);
  }
  // Keep two decimals: floor(product × 100) / 100.
  return Number((numerator * BigInt(ODDS_SCALE)) / denominator) / ODDS_SCALE;
}

/** Shown wherever money is staked. */
export const BETTING_DISCLAIMER = 'Game naira only. No cash value: nothing here can be withdrawn, sold or paid out in real money. 18+.';
