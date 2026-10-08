import { STARTER_FUND, selfMadeNetWorthOf, wealthBandLabel } from '@insidelife/shared';
import { SELF_MADE_SQL, familyLabel, presentLeaderboardValue, type LeaderboardRow } from './leaderboard.rules.js';

const row = (overrides: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
  characterId: 'id-1',
  handle: 'tolu',
  firstName: 'Tolu',
  lastName: 'Adeyemi',
  status: 300,
  value: 12_500_000,
  showExactWealth: false,
  degreeLabel: null,
  married: false,
  children: 0,
  generations: 1,
  ...overrides,
});

describe('self-made net worth', () => {
  it('excludes unearned money (starter fund, allowance, gifts, sprays, inheritance)', () => {
    // Fresh character: ₦5M from Uncle Tunde + ₦25k birth-lottery cash, nothing earned yet.
    const unearned = STARTER_FUND + 25_000;
    expect(selfMadeNetWorthOf(unearned, unearned)).toBe(0);
    // Earned ₦3M in salary on top.
    expect(selfMadeNetWorthOf(unearned + 3_000_000, unearned)).toBe(3_000_000);
  });

  it('excludes purchased top-ups (they are counted in unearnedTotal)', () => {
    const topUp = 5_000_000;
    expect(selfMadeNetWorthOf(2_000_000 + topUp, topUp)).toBe(2_000_000);
  });

  it('never goes negative when unearned money was spent', () => {
    expect(selfMadeNetWorthOf(1_000_000, STARTER_FUND)).toBe(0);
  });

  it('a spray received never lifts the recipient’s self-made worth', () => {
    const before = selfMadeNetWorthOf(10_000_000, 5_000_000);
    expect(selfMadeNetWorthOf(10_000_000 + 250_000, 5_000_000 + 250_000)).toBe(before);
  });

  it('the SQL expression mirrors the shared formula', () => {
    expect(SELF_MADE_SQL).toBe('GREATEST(0, c.net_worth - c.unearned_total)');
  });
});

describe('leaderboard privacy', () => {
  it('shows money as a band unless the player opted in', () => {
    expect(presentLeaderboardValue('self-made', row(), false)).toEqual({ value: null, display: '₦10M+', detail: null });
    expect(presentLeaderboardValue('self-made', row({ showExactWealth: true }), false)).toMatchObject({ value: 12_500_000, display: '₦12.5M' });
    expect(presentLeaderboardValue('self-made', row(), true)).toMatchObject({ value: 12_500_000 });
    expect(presentLeaderboardValue('earners', row({ value: 650_000 }), false)).toEqual({ value: null, display: '₦500k+/month', detail: null });
  });

  it('bands dynasty totals for everyone but the family itself', () => {
    expect(presentLeaderboardValue('dynasties', row({ value: 2_000_000_000, generations: 3 }), false)).toEqual({
      value: null,
      display: '₦1B+',
      detail: '3 generations · The Adeyemi dynasty',
    });
  });

  it('shows public facts exactly', () => {
    expect(presentLeaderboardValue('scholars', row({ value: 4.87, degreeLabel: 'B.Sc, First Class' }), false)).toEqual({
      value: 4.87,
      display: '4.87',
      detail: 'B.Sc, First Class',
    });
    expect(presentLeaderboardValue('influence', row({ value: 512 }), false)).toMatchObject({ value: 512, detail: 'Big Man / Big Woman' });
    expect(presentLeaderboardValue('families', row({ value: 4, married: true, children: 3 }), false)).toMatchObject({ display: 'Married · 3 kids' });
  });

  it('labels bands and families', () => {
    expect(wealthBandLabel(0)).toBe('Under ₦100k');
    expect(wealthBandLabel(99_999)).toBe('Under ₦100k');
    expect(wealthBandLabel(1_000_000)).toBe('₦1M+');
    expect(wealthBandLabel(7_400_000_000)).toBe('₦5B+');
    expect(familyLabel(false, 0)).toBe('Single');
    expect(familyLabel(true, 1)).toBe('Married · 1 kid');
  });
});
