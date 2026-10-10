import { MINUTES_PER_YEAR, STARTER_FUND } from '@insidelife/shared';
import { SELF_MADE_SQL } from './leaderboard.rules.js';
import {
  isUnder30,
  listValueOf,
  moversWindowStart,
  pageCount,
  presentAmount,
  presentEntry,
  presentMove,
  rankedListSql,
  under30Cutoff,
  wealthMix,
  wholePercents,
  type FobesRow,
} from './fobes.rules.js';

const NOW = 40 * MINUTES_PER_YEAR;

const row = (overrides: Partial<FobesRow> = {}): FobesRow => ({
  rank: 3,
  characterId: 'id-ada',
  handle: 'ada',
  firstName: 'Ada',
  lastName: 'Okafor',
  bornAt: NOW - 27 * MINUTES_PER_YEAR - 10,
  status: 480,
  title: 'CEO at Okafor Foods',
  generation: 1,
  netWorth: 2_400_000_000,
  unearnedTotal: STARTER_FUND,
  purchasedTotal: 0,
  showExactWealth: false,
  value: 2_400_000_000,
  move: null,
  ...overrides,
});

describe('Fobes lists', () => {
  it('ranks self-made with the leaderboards’ expression and under 30 by birth date', () => {
    expect(rankedListSql('self-made', NOW)).toEqual({ value: SELF_MADE_SQL, qualifies: `${SELF_MADE_SQL} > 0`, params: [] });
    expect(rankedListSql('rich-list', NOW).value).toBe('c.net_worth');
    expect(rankedListSql('under-30', NOW)).toMatchObject({ qualifies: 'c.net_worth > 0 AND c.born_at > $1', params: [NOW - 30 * MINUTES_PER_YEAR] });
  });

  it('is under 30 until the 30th birthday, in game years', () => {
    expect(under30Cutoff(NOW)).toBe(NOW - 30 * MINUTES_PER_YEAR);
    expect(isUnder30(NOW - 30 * MINUTES_PER_YEAR + 1, NOW)).toBe(true);
    expect(isUnder30(NOW - 30 * MINUTES_PER_YEAR, NOW)).toBe(false);
  });

  it('uses self-made worth on the self-made list and total net worth elsewhere', () => {
    const character = { netWorth: 9_000_000, unearnedTotal: 5_000_000 };
    expect(listValueOf('self-made', character)).toBe(4_000_000);
    expect(listValueOf('rich-list', character)).toBe(9_000_000);
    expect(listValueOf('self-made', { netWorth: 1_000_000, unearnedTotal: 5_000_000 })).toBe(0);
  });

  it('measures the week from seven game days back, and pages the top 100 in fives', () => {
    expect(moversWindowStart(400)).toBe(393);
    expect(pageCount(100, 20)).toBe(5);
    expect(pageCount(21, 20)).toBe(2);
    expect(pageCount(0, 20)).toBe(1);
  });
});

describe('how they made it', () => {
  it('splits the fortune into earned, given and bought shares that add up to 100', () => {
    // ₦100M net worth; ₦20M arrived unearned, ₦5M of it top-ups.
    expect(wealthMix(100_000_000, 20_000_000, 5_000_000, 1)).toEqual({ selfMadePct: 80, givenPct: 15, boughtPct: 5, source: 'mostly-self-made', label: 'Mostly self-made' });
    expect(wealthMix(100_000_000, 5_000_000, 0, 1)).toMatchObject({ selfMadePct: 95, source: 'self-made' });
  });

  it('calls a fortune inherited for heirs, family money for founders, bought when top-ups dominate', () => {
    expect(wealthMix(500_000_000, 450_000_000, 0, 2)).toMatchObject({ selfMadePct: 10, givenPct: 90, source: 'inherited', label: 'Inherited' });
    expect(wealthMix(6_000_000, STARTER_FUND, 0, 1)).toMatchObject({ source: 'family-money' });
    expect(wealthMix(10_000_000, 10_000_000, 8_000_000, 1)).toMatchObject({ selfMadePct: 0, givenPct: 20, boughtPct: 80, source: 'topped-up' });
    expect(wealthMix(10_000_000, 6_000_000, 2_000_000, 1)).toMatchObject({ selfMadePct: 40, givenPct: 40, boughtPct: 20, source: 'mixed' });
  });

  it('only counts unearned money still in the fortune (spent gifts don’t shrink the self-made share below 0)', () => {
    expect(wealthMix(1_000_000, STARTER_FUND, 0, 1)).toMatchObject({ selfMadePct: 0, givenPct: 100 });
    expect(wealthMix(0, STARTER_FUND, 0, 1)).toMatchObject({ selfMadePct: 0, givenPct: 0, boughtPct: 0, source: 'none' });
  });

  it('rounds shares by largest remainder', () => {
    expect(wholePercents([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholePercents([0, 0])).toEqual([0, 0]);
  });
});

describe('Fobes privacy', () => {
  it('shows a band unless the player opted in to exact figures, or it’s you', () => {
    expect(presentEntry(row(), 'someone-else', NOW)).toMatchObject({ worth: { exact: null, display: '₦1B+' }, exact: false, isYou: false, age: 27 });
    expect(presentEntry(row({ showExactWealth: true }), 'someone-else', NOW)).toMatchObject({ worth: { exact: 2_400_000_000, display: '₦2.4B' }, exact: true });
    expect(presentEntry(row(), 'id-ada', NOW)).toMatchObject({ worth: { exact: 2_400_000_000 }, exact: true, isYou: true });
    expect(presentEntry(row(), null, NOW).statusTier).toEqual({ id: 'big-man', label: 'Big Man / Big Woman' });
  });

  it('shows a private mover’s week as a percentage, never in naira', () => {
    const move = { before: 100_000_000, rankBefore: 12, newEntry: false };
    expect(presentMove(134_000_000, move, false)).toEqual({ change: null, pct: 34, display: '+34%', rankBefore: 12, newEntry: false });
    expect(presentMove(134_000_000, move, true)).toEqual({ change: 34_000_000, pct: 34, display: '+₦34M', rankBefore: 12, newEntry: false });
    expect(presentMove(87_500_000, move, false)).toMatchObject({ display: '-12.5%', pct: -12.5 });
    expect(presentMove(5_000_000_000, { before: 0, rankBefore: null, newEntry: true }, true)).toEqual({ change: null, pct: null, display: 'New entry', rankBefore: null, newEntry: true });
  });

  it('bands a gap unless the player ahead shows their figure', () => {
    expect(presentAmount(1_234_000_000, true)).toEqual({ exact: 1_234_000_000, display: '₦1.23B' });
    expect(presentAmount(1_234_000_000, false)).toEqual({ exact: null, display: '₦1B+' });
  });
});
