import {
  FOBES_MOVERS_WINDOW_DAYS,
  FOBES_UNDER_AGE,
  FOBES_WEALTH_SOURCE_LABELS,
  MINUTES_PER_YEAR,
  formatNairaCompact,
  selfMadeNetWorthOf,
  wealthBandLabel,
  yearsBetween,
  type FobesAmountDto,
  type FobesEntryDto,
  type FobesListId,
  type FobesMoveDto,
  type FobesWealthMixDto,
  type FobesWealthSource,
  type GameMinute,
} from '@insidelife/shared';
import { statusTierDto } from './profile.rules.js';
import { SELF_MADE_SQL } from './leaderboard.rules.js';

export type FobesRankedList = Extract<FobesListId, 'rich-list' | 'self-made' | 'under-30'>;

/** Who can be ranked at all: living and not hidden (a deleted account's character). */
export const FOBES_RANKABLE_SQL = 'c.alive AND c.hidden_at IS NULL';

/** First game minute of birth that is still under 30 at `now`: under 30 ⇔ bornAt > cutoff. */
export function under30Cutoff(now: GameMinute): GameMinute {
  return now - FOBES_UNDER_AGE * MINUTES_PER_YEAR;
}

export function isUnder30(bornAt: GameMinute, now: GameMinute): boolean {
  return bornAt > under30Cutoff(now);
}

/**
 * What a ranked list sorts by and who is on it, over `characters c`. `qualifies` may use `$1` (the under-30 cutoff,
 * the first entry of `params`). Self-made reuses the leaderboards' `SELF_MADE_SQL`.
 */
export function rankedListSql(list: FobesRankedList, now: GameMinute): { readonly value: string; readonly qualifies: string; readonly params: readonly number[] } {
  switch (list) {
    case 'rich-list':
      return { value: 'c.net_worth', qualifies: 'c.net_worth > 0', params: [] };
    case 'self-made':
      return { value: SELF_MADE_SQL, qualifies: `${SELF_MADE_SQL} > 0`, params: [] };
    case 'under-30':
      return { value: 'c.net_worth', qualifies: 'c.net_worth > 0 AND c.born_at > $1', params: [under30Cutoff(now)] };
  }
}

/** The list's figure for one character (mirrors `rankedListSql`). */
export function listValueOf(list: FobesRankedList, character: { readonly netWorth: number; readonly unearnedTotal: number }): number {
  return list === 'self-made' ? selfMadeNetWorthOf(character.netWorth, character.unearnedTotal) : Math.round(character.netWorth);
}

/** First game day the movers compare with ("this game week"). */
export function moversWindowStart(today: number): number {
  return today - FOBES_MOVERS_WINDOW_DAYS;
}

/** Whole percents that add up to 100 (largest remainder), in the order given. */
export function wholePercents(parts: readonly number[]): number[] {
  const total = parts.reduce((sum, part) => sum + Math.max(0, part), 0);
  if (total <= 0) return parts.map(() => 0);
  const raw = parts.map((part) => (Math.max(0, part) / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, rest: value - Math.floor(value) })).toSorted((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] = (floors[index] ?? 0) + 1;
    left--;
  }
  return floors;
}

/**
 * How today's net worth was made. Self-made is net worth minus everything unearned (the shared formula); the unearned
 * part still in it splits into bought (real-money top-ups, a subset of unearned) and given (family money, starter fund,
 * gifts, sprays, inheritance) in the proportion they arrived.
 */
export function wealthMix(netWorth: number, unearnedTotal: number, purchasedTotal: number, generation: number): FobesWealthMixDto {
  const worth = Math.max(0, Math.round(netWorth));
  if (worth === 0) return mix(0, 0, 0, 'none');
  const selfMade = selfMadeNetWorthOf(worth, unearnedTotal);
  const unearned = worth - selfMade;
  const boughtShare = unearnedTotal > 0 ? Math.min(1, Math.max(0, purchasedTotal) / unearnedTotal) : 0;
  const bought = unearned * boughtShare;
  const [selfMadePct = 0, givenPct = 0, boughtPct = 0] = wholePercents([selfMade, unearned - bought, bought]);
  let source: FobesWealthSource = 'mixed';
  if (selfMadePct >= 90) source = 'self-made';
  else if (selfMadePct >= 60) source = 'mostly-self-made';
  else if (boughtPct >= 50) source = 'topped-up';
  else if (givenPct >= 50) source = generation > 1 ? 'inherited' : 'family-money';
  return mix(selfMadePct, givenPct, boughtPct, source);
}

const mix = (selfMadePct: number, givenPct: number, boughtPct: number, source: FobesWealthSource): FobesWealthMixDto => ({
  selfMadePct,
  givenPct,
  boughtPct,
  source,
  label: FOBES_WEALTH_SOURCE_LABELS[source],
});

/** An exact figure only when allowed (opted in, or your own); a band ("₦1B+") otherwise. */
export function presentAmount(amount: number, exact: boolean): FobesAmountDto {
  return exact ? { exact: Math.round(amount), display: formatNairaCompact(amount) } : { exact: null, display: wealthBandLabel(amount) };
}

/** A week's movement as one viewer may see it. */
export interface FobesMoveRow {
  /** Net worth at the start of the week (for a new entry: the best estimate, used only to order the list). */
  readonly before: number;
  readonly rankBefore: number | null;
  readonly newEntry: boolean;
}

export function presentMove(now: number, move: FobesMoveRow, exact: boolean): FobesMoveDto {
  if (move.newEntry) return { change: null, pct: null, display: 'New entry', rankBefore: null, newEntry: true };
  const change = Math.round(now - move.before);
  const pct = move.before > 0 ? Math.round((change / move.before) * 1000) / 10 : null;
  const sign = change >= 0 ? '+' : '-';
  let display: string;
  if (exact) display = `${sign}${formatNairaCompact(Math.abs(change))}`;
  else if (pct !== null) display = `${sign}${Math.abs(pct)}%`;
  else display = `${sign}${wealthBandLabel(Math.abs(change))}`;
  return { change: exact ? change : null, pct, display, rankBefore: move.rankBefore, newEntry: false };
}

/** One row as read from SQL (and cached), before privacy decides what a viewer sees. */
export interface FobesRow {
  readonly rank: number;
  readonly characterId: string;
  readonly handle: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly bornAt: number;
  readonly status: number;
  readonly title: string | null;
  readonly generation: number;
  readonly netWorth: number;
  readonly unearnedTotal: number;
  readonly purchasedTotal: number;
  readonly showExactWealth: boolean;
  /** The list's figure. */
  readonly value: number;
  readonly move: FobesMoveRow | null;
}

/** Privacy for Fobes, like the leaderboards: exact figures for players who opted in and for yourself, bands otherwise. */
export function presentEntry(row: FobesRow, viewerId: string | null, now: GameMinute): FobesEntryDto {
  const isYou = row.characterId === viewerId;
  const exact = isYou || row.showExactWealth;
  return {
    rank: row.rank,
    characterId: row.characterId,
    handle: row.handle,
    firstName: row.firstName,
    lastName: row.lastName,
    age: yearsBetween(row.bornAt, now),
    title: row.title,
    statusTier: statusTierDto(row.status),
    worth: presentAmount(row.value, exact),
    mix: wealthMix(row.netWorth, row.unearnedTotal, row.purchasedTotal, row.generation),
    exact,
    isYou,
    move: row.move ? presentMove(row.value, row.move, exact) : null,
  };
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
